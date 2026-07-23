// Supabase Edge Function: ramp-checkin-reminder
//
// Daily push notification for Introduce Slowly weekly check-ins.
// Fired once per UTC day by the scheduled GitHub Actions workflow
// (.github/workflows/ramp-checkin-cron.yml). Finds products whose
// current ramp week has passed the user's last logged check-in AND
// hasn't already been reminded this week, then sends one APNS push
// per (user, product, week) with the product_id + week_number in the
// payload for client-side deep-linking into the check-in modal.
//
// Guards against duplicate sends:
//   - `ramp_checkins`               — if a row exists for
//     (user, product, week), the user already answered via the
//     in-app inline nudge, so skip.
//   - `ramp_checkin_reminders_sent` — records every send at grain
//     (user, product, week). Unique constraint means a second daily
//     fire for the same week is a no-op.
//
// Body:
//   POST /functions/v1/ramp-checkin-reminder
//     (no body — the scheduler just triggers)
//   Requires Authorization: Bearer <CRON_SECRET> so the URL isn't
//   world-callable. CRON_SECRET is a Supabase edge-function secret.
//
// Response:
//   { candidates: N, sent: M, failed: K, dead_tokens_purged: J }
//
// Timezones: current-week computation uses UTC (client uses local
// time in getRampWeek). At week boundaries the server can be off by
// up to a day from the client's view — acceptable because the inline
// nudge on the Progress tab is the primary path; this cron is just
// a courtesy prod so users don't have to remember to open the app.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendApnsBatch, isDeadToken, type ApnsPayload } from "../_shared/apns.ts";

interface ProductRow {
  user_id: string;
  client_id: string;
  data: {
    routineStartDate?: string;
    name?: string;
    lastCheckinWeek?: number;
  } | null;
}

interface Candidate {
  user_id: string;
  product_id: string;
  product_name: string;
  week_number: number;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// UTC-day-count from an ISO date string (YYYY-MM-DD) to today. Mirrors
// the client's getRampWeek shape without pulling in a full date lib.
function computeWeek(routineStartDate: string): number {
  const [y, m, d] = routineStartDate.split("-").map(Number);
  if (!y || !m || !d) return 0;
  const start = Date.UTC(y, m - 1, d);
  const now = Date.now();
  const days = Math.floor((now - start) / 86400000);
  return Math.max(1, Math.floor(days / 7) + 1);
}

function keyOf(userId: string, productId: string, week: number): string {
  return `${userId}|${productId}|${week}`;
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

  // 1. Enumerate every product with a routineStartDate. Small scale
  //    for now — filter client-side rather than jsonb-in-postgrest.
  const { data: products, error: prodErr } = await db
    .from("products")
    .select("user_id, client_id, data")
    .returns<ProductRow[]>();
  if (prodErr) {
    console.error("[ramp-checkin-reminder] products query failed:", prodErr);
    return json({ error: prodErr.message }, 500);
  }

  const candidates: Candidate[] = [];
  for (const p of products ?? []) {
    const rd = p.data?.routineStartDate;
    if (!rd || typeof rd !== "string") continue;
    const week = computeWeek(rd);
    if (week < 1) continue;
    const lastCheckin = p.data?.lastCheckinWeek ?? 0;
    if (week <= lastCheckin) continue;
    candidates.push({
      user_id: p.user_id,
      product_id: p.client_id,
      product_name: p.data?.name || "your ramp",
      week_number: week,
    });
  }

  if (candidates.length === 0) {
    return json({ candidates: 0, sent: 0, failed: 0, dead_tokens_purged: 0 });
  }

  // 2. Pull existing checkins + reminder rows for the affected users
  //    in one round-trip each, then intersect in memory.
  const userIds = [...new Set(candidates.map((c) => c.user_id))];

  const { data: existingCheckins } = await db
    .from("ramp_checkins")
    .select("user_id, product_id, week_number")
    .in("user_id", userIds);
  const checkinKeys = new Set(
    (existingCheckins ?? []).map((r) => keyOf(r.user_id, r.product_id, r.week_number)),
  );

  const { data: existingReminders } = await db
    .from("ramp_checkin_reminders_sent")
    .select("user_id, product_id, week_number")
    .in("user_id", userIds);
  const reminderKeys = new Set(
    (existingReminders ?? []).map((r) => keyOf(r.user_id, r.product_id, r.week_number)),
  );

  const toSend = candidates.filter((c) => {
    const k = keyOf(c.user_id, c.product_id, c.week_number);
    return !checkinKeys.has(k) && !reminderKeys.has(k);
  });

  if (toSend.length === 0) {
    return json({ candidates: candidates.length, sent: 0, failed: 0, dead_tokens_purged: 0 });
  }

  // 3. Group by user so we fetch each user's device tokens once even
  //    when the same user has multiple products needing check-ins.
  const byUser = new Map<string, Candidate[]>();
  for (const c of toSend) {
    const arr = byUser.get(c.user_id) ?? [];
    arr.push(c);
    byUser.set(c.user_id, arr);
  }

  let sent = 0;
  let failed = 0;
  let deadTokensPurged = 0;

  for (const [userId, userCandidates] of byUser) {
    const { data: tokens } = await db
      .from("device_tokens")
      .select("id, token")
      .eq("user_id", userId)
      .eq("platform", "ios");
    if (!tokens || tokens.length === 0) {
      // No iOS tokens for this user — nothing to send. Don't insert
      // reminder rows either, so if they register a device tomorrow
      // they'll still get today's overdue check-in prompt.
      continue;
    }
    const tokenValues = tokens.map((t) => t.token);
    const tokenIdsByValue = new Map(tokens.map((t) => [t.token, t.id]));

    for (const c of userCandidates) {
      const payload: ApnsPayload = {
        aps: {
          alert: {
            title: "Weekly check-in",
            body: `How did week ${c.week_number} of ${c.product_name} go?`,
          },
          sound: "default",
          "thread-id": `ramp-checkin-${c.product_id}`,
        },
        type: "ramp_checkin",
        product_id: c.product_id,
        week_number: c.week_number,
      };

      let anyDelivered = false;
      const results = await sendApnsBatch(tokenValues, payload);
      for (const r of results) {
        if (r.status >= 200 && r.status < 300) {
          anyDelivered = true;
        } else if (isDeadToken(r)) {
          const id = tokenIdsByValue.get(r.token);
          if (id) {
            await db.from("device_tokens").delete().eq("id", id);
            deadTokensPurged++;
          }
        } else {
          console.warn(
            "[ramp-checkin-reminder] apns error | user:", userId,
            "| product:", c.product_id, "| week:", c.week_number,
            "| status:", r.status, "| reason:", r.reason,
          );
        }
      }

      // Only record the reminder as sent if at least one device
      // accepted it. A run where every token is dead is effectively
      // a no-op — we let it retry tomorrow (by then the client will
      // have re-registered a fresh token via the "registration"
      // listener in App.jsx).
      if (anyDelivered) {
        const { error: insertErr } = await db
          .from("ramp_checkin_reminders_sent")
          .insert({
            user_id: userId,
            product_id: c.product_id,
            week_number: c.week_number,
          });
        if (insertErr && insertErr.code !== "23505") {
          console.error(
            "[ramp-checkin-reminder] reminder log insert failed:",
            insertErr,
          );
        }
        sent++;
      } else {
        failed++;
      }
    }
  }

  return json({
    candidates: candidates.length,
    sent,
    failed,
    dead_tokens_purged: deadTokensPurged,
  });
});
