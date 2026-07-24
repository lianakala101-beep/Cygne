// Supabase Edge Function: cycle-phase-alert
//
// Daily push notification when a user's cycle phase changes. Fired
// by the same GitHub Actions workflow that fires ramp-checkin-reminder
// and swan-sense-reminder (.github/workflows/daily-notifications.yml)
// at 15:00 UTC.
//
// Copy is deliberately ambiguous — "You've entered a new phase" —
// with no phase name in the notification body. The reveal happens
// inside the app on the dashboard.
//
// Dedup model: the cycle_phase_state row IS the guard. First cron
// fire after a user enables tracking primes the row silently (no
// push — otherwise they'd get a "new phase" alert for the phase
// they were already in when tracking started). Subsequent runs only
// fire a push when the computed phase differs from the stored one.
// That means at most ~4 pushes per cycle per user, and re-runs on
// the same day are natural no-ops.
//
// Body:
//   POST /functions/v1/cycle-phase-alert
//     (no body — the scheduler just triggers)
//   Requires Authorization: Bearer <CRON_SECRET>.
//
// Response:
//   { candidates, primed, sent, unchanged, failed, dead_tokens_purged }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendApnsBatch, isDeadToken, type ApnsPayload } from "../_shared/apns.ts";
import { getCyclePhase, computeCycleDay } from "../_shared/cycle.ts";

interface DeviceTokenRow {
  id: number;
  user_id: string;
  token: string;
}

interface PhaseStateRow {
  user_id: string;
  last_known_phase: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return json({ error: "Unauthorized" }, 401);
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceKey);

  // 1. iOS device tokens — same active-user proxy as the other two
  //    daily notifications. Grouping by user so each user gets one
  //    phase computation regardless of how many devices they own.
  const { data: tokens, error: tokErr } = await db
    .from("device_tokens")
    .select("id, user_id, token")
    .eq("platform", "ios")
    .returns<DeviceTokenRow[]>();
  if (tokErr) {
    console.error("[cycle-phase-alert] tokens query failed:", tokErr);
    return json({ error: tokErr.message }, 500);
  }
  if (!tokens || tokens.length === 0) {
    return json({ candidates: 0, primed: 0, sent: 0, unchanged: 0, failed: 0, dead_tokens_purged: 0 });
  }

  const tokensByUser = new Map<string, { tokens: string[]; tokenIdByValue: Map<string, number> }>();
  for (const t of tokens) {
    let entry = tokensByUser.get(t.user_id);
    if (!entry) {
      entry = { tokens: [], tokenIdByValue: new Map() };
      tokensByUser.set(t.user_id, entry);
    }
    entry.tokens.push(t.token);
    entry.tokenIdByValue.set(t.token, t.id);
  }
  const userIds = [...tokensByUser.keys()];

  // 2. Fetch cycle_phase_state rows for these users in one round trip.
  //    Absent row = never observed; the first observation for a user
  //    primes the row silently (see "First-observation" note in the
  //    migration).
  const { data: phaseRows } = await db
    .from("cycle_phase_state")
    .select("user_id, last_known_phase")
    .in("user_id", userIds)
    .returns<PhaseStateRow[]>();
  const knownPhaseByUser = new Map<string, string>();
  for (const r of phaseRows ?? []) knownPhaseByUser.set(r.user_id, r.last_known_phase);

  // 3. Fetch each user's cycle inputs from auth.users.raw_user_meta_data.
  //    listUsers batches in one call up to 1000 users — fine at MVP
  //    scale. Filter to only the iOS-tokened set to keep the loop tight.
  const { data: usersPage, error: usersErr } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (usersErr) {
    console.error("[cycle-phase-alert] listUsers failed:", usersErr);
    return json({ error: usersErr.message }, 500);
  }
  const userIdSet = new Set(userIds);
  const cycleInputsByUser = new Map<string, { start: string; length: number }>();
  for (const u of usersPage?.users ?? []) {
    if (!userIdSet.has(u.id)) continue;
    const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
    if (meta.cycleTrackingEnabled !== true) continue;
    const start = meta.cycleStartDate;
    if (typeof start !== "string" || !start) continue;
    const length = typeof meta.cycleLength === "number"
      ? meta.cycleLength
      : parseInt(String(meta.cycleLength ?? "28"), 10) || 28;
    cycleInputsByUser.set(u.id, { start, length });
  }

  if (cycleInputsByUser.size === 0) {
    return json({ candidates: 0, primed: 0, sent: 0, unchanged: 0, failed: 0, dead_tokens_purged: 0 });
  }

  // 4. Compute + compare + act.
  const payload: ApnsPayload = {
    aps: {
      alert: {
        title: "Cygne",
        body: "You've entered a new phase.",
      },
      sound: "default",
      "thread-id": "cycle-phase",
    },
    type: "cycle_phase",
  };

  let primed = 0;
  let sent = 0;
  let unchanged = 0;
  let failed = 0;
  let deadTokensPurged = 0;

  for (const [userId, inputs] of cycleInputsByUser) {
    const day = computeCycleDay(inputs.start, inputs.length);
    if (day == null) continue;
    const phase = getCyclePhase(day);
    const known = knownPhaseByUser.get(userId);

    // First observation: prime the row, don't push.
    if (known === undefined) {
      const { error: upErr } = await db
        .from("cycle_phase_state")
        .upsert({ user_id: userId, last_known_phase: phase.name, updated_at: new Date().toISOString() });
      if (upErr) {
        console.error("[cycle-phase-alert] prime upsert failed:", { userId, err: upErr });
        continue;
      }
      primed++;
      continue;
    }

    if (known === phase.name) {
      unchanged++;
      continue;
    }

    // Phase transition — send push, then update. Order matters: if
    // the push fails to any device we still want the row updated
    // (otherwise we'd re-send at every subsequent daily fire until
    // the next natural transition), so we update regardless.
    const entry = tokensByUser.get(userId)!;
    const results = await sendApnsBatch(entry.tokens, payload);

    let anyDelivered = false;
    for (const r of results) {
      if (r.status >= 200 && r.status < 300) {
        anyDelivered = true;
      } else if (isDeadToken(r)) {
        const id = entry.tokenIdByValue.get(r.token);
        if (id) {
          await db.from("device_tokens").delete().eq("id", id);
          deadTokensPurged++;
        }
      } else {
        console.warn(
          "[cycle-phase-alert] apns error | user:", userId,
          "| status:", r.status, "| reason:", r.reason,
        );
      }
    }

    // Update the state row unconditionally. If every device was dead,
    // the row still moves forward — the user will re-register on next
    // app open and catch the next transition. Leaving the row at the
    // old phase would spam a "you've entered a new phase" push every
    // day for the same transition once tokens come back.
    const { error: upErr } = await db
      .from("cycle_phase_state")
      .upsert({ user_id: userId, last_known_phase: phase.name, updated_at: new Date().toISOString() });
    if (upErr) {
      console.error("[cycle-phase-alert] transition upsert failed:", { userId, err: upErr });
    }

    if (anyDelivered) {
      sent++;
    } else {
      failed++;
    }
  }

  return json({
    candidates: cycleInputsByUser.size,
    primed,
    sent,
    unchanged,
    failed,
    dead_tokens_purged: deadTokensPurged,
  });
});
