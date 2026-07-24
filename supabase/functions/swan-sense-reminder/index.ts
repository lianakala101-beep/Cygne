// Supabase Edge Function: swan-sense-reminder
//
// Daily push notification prompting users to open the app and see
// today's Swan Sense insight. Fired once per UTC day by the same
// GitHub Actions workflow that fires ramp-checkin-reminder
// (.github/workflows/daily-notifications.yml — renamed from the
// original ramp-only workflow when this function landed).
//
// Independent of swan-sense-daily's generation logic: swan-sense-daily
// still fires on dashboard mount and caches the day's insight in
// ask_cygne_cache. This function's push is purely a nudge to open the
// app; when the user taps it, the dashboard mounts as usual and the
// cached (or freshly generated) insight is what they see.
//
// Guards against duplicate sends via swan_sense_sent — grain
// (user_id, date). A re-fire on the same day (manual workflow_dispatch,
// transient failure retry) skips users already pushed.
//
// Active-user definition: any user with a registered iOS device token.
// If they've registered for push, they've been in the app recently
// enough to warrant a reminder. Web / Android tokens are ignored (no
// APNS delivery path for them).
//
// Body:
//   POST /functions/v1/swan-sense-reminder
//     (no body — the scheduler just triggers)
//   Requires Authorization: Bearer <CRON_SECRET>.
//
// Response:
//   { candidates: N, sent: M, failed: K, dead_tokens_purged: J }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendApnsBatch, isDeadToken, type ApnsPayload } from "../_shared/apns.ts";

interface DeviceTokenRow {
  id: number;
  user_id: string;
  token: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// YYYY-MM-DD in UTC. Same date the swan-sense-daily cache-key path
// uses (todayKey() in that function), so the "date" column here
// aligns with the day the insight was cached for.
function todayIsoDate(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

  const today = todayIsoDate();

  // 1. All iOS device tokens — one row per (user, device). A user with
  //    multiple devices has multiple rows; we group below so each user
  //    gets exactly one dedup entry regardless of how many devices
  //    they own.
  const { data: tokens, error: tokErr } = await db
    .from("device_tokens")
    .select("id, user_id, token")
    .eq("platform", "ios")
    .returns<DeviceTokenRow[]>();
  if (tokErr) {
    console.error("[swan-sense-reminder] tokens query failed:", tokErr);
    return json({ error: tokErr.message }, 500);
  }

  if (!tokens || tokens.length === 0) {
    return json({ candidates: 0, sent: 0, failed: 0, dead_tokens_purged: 0 });
  }

  // 2. Group tokens by user. tokenIdByValue lets the dead-token purge
  //    below map an APNS 410-Gone response back to a device_tokens row.
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

  // 3. Batch-check which of these users have already been sent
  //    today's push. One round trip regardless of how many candidates.
  const { data: sentToday } = await db
    .from("swan_sense_sent")
    .select("user_id")
    .eq("date", today)
    .in("user_id", userIds);
  const sentUserIds = new Set((sentToday ?? []).map((r) => r.user_id));

  const toSend = userIds.filter((uid) => !sentUserIds.has(uid));
  if (toSend.length === 0) {
    return json({ candidates: userIds.length, sent: 0, failed: 0, dead_tokens_purged: 0 });
  }

  // 4. Send. Same payload for every user — the deep-link handler in
  //    App.jsx routes on type alone; no per-user data needed.
  const payload: ApnsPayload = {
    aps: {
      alert: {
        title: "Cygne",
        body: "Your Swan Sense is ready.",
      },
      sound: "default",
      "thread-id": "swan-sense",
    },
    type: "swan_sense",
  };

  let sent = 0;
  let failed = 0;
  let deadTokensPurged = 0;

  for (const userId of toSend) {
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
          "[swan-sense-reminder] apns error | user:", userId,
          "| status:", r.status, "| reason:", r.reason,
        );
      }
    }

    // Only log as sent if at least one device accepted the push.
    // Matches the ramp-checkin-reminder pattern — a run where every
    // token is dead is effectively a no-op, so leave the row absent
    // and let tomorrow's run retry once the client has re-registered.
    if (anyDelivered) {
      const { error: insertErr } = await db
        .from("swan_sense_sent")
        .insert({ user_id: userId, date: today });
      if (insertErr && insertErr.code !== "23505") {
        console.error("[swan-sense-reminder] sent log insert failed:", insertErr);
      }
      sent++;
    } else {
      failed++;
    }
  }

  return json({
    candidates: toSend.length,
    sent,
    failed,
    dead_tokens_purged: deadTokensPurged,
  });
});
