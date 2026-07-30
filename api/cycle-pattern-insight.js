// Vercel serverless function: cycle-pattern-insight
//
// Produces a single 1-2 sentence editorial line describing any
// notable menstrual-cycle-phase-correlated pattern in the user's
// tracked reactions + reflections. Rendered as a small card inside
// Monthly Recap when the 3-cycle-span gate passes upstream (client
// enforces the gate; this endpoint just runs the LLM given the
// pre-aggregated phase counts).
//
// Body shape:
//   {
//     userId:        string  (required)
//     offset:        number  (0 = current month, -1 = previous, …)
//     cycleLength:   number  (21-45, user's tracked length)
//     cycleSpanDays: number  (days from earliest tracked signal to now,
//                             used only in the prompt for context)
//     phaseCounts:   {
//       [phaseName]: {
//         rampStates: { no_reaction, mild_irritation, breakout, loving_it }
//         reflections: number
//       }
//     }
//   }
//
// Response:
//   200: { insight: string, cached: boolean }
//   4xx/5xx: { error: string }
//
// Cache: ask_cygne_cache keyed by __cycle_pattern_insight_${year}_${MM}
// with a 12h window — same shape as monthly-recap's cache. Distinct
// key namespace so a re-open of the recap same day serves both from
// cache without either shadowing the other.

import { createClient } from "@supabase/supabase-js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, x-client-info, apikey, content-type",
  );
}

// Resolve the target month from the offset, same shape as
// monthly-recap.js buildMonthSlice. Kept inline here — the two
// endpoints don't share code today and this is a one-liner.
function resolveMonth(offset) {
  const today = new Date();
  const off = Number.isFinite(offset) ? offset : 0;
  const target = new Date(today.getUTCFullYear(), today.getUTCMonth() + off, 1);
  const monthName = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"][target.getMonth()];
  return { year: target.getFullYear(), month: target.getMonth(), monthName };
}

const RAMP_STATES = ["no_reaction", "mild_irritation", "breakout", "loving_it"];
const PHASE_ORDER = ["Menstrual", "Follicular", "Ovulatory", "Luteal"];

// Render the phase-count map into a compact human-readable string
// for the LLM. Skips phases with zero data so the prompt doesn't
// carry noise. Zero-fills the four ramp states within a phase that
// has data so absence-of-reaction is a legible signal (e.g.
// "follicular: 6 total | 5 no_reaction, 1 loving_it, 0 mild, 0 breakout").
function renderPhaseCounts(phaseCounts) {
  if (!phaseCounts || typeof phaseCounts !== "object") return "no phase-counts data";
  const lines = [];
  for (const name of PHASE_ORDER) {
    const bucket = phaseCounts[name];
    if (!bucket) continue;
    const states = bucket.rampStates || {};
    const reflections = Number(bucket.reflections) || 0;
    const stateTotal = RAMP_STATES.reduce((n, k) => n + (Number(states[k]) || 0), 0);
    const total = stateTotal + reflections;
    if (total === 0) continue;
    const parts = RAMP_STATES.map(k => `${Number(states[k]) || 0} ${k}`);
    if (reflections > 0) parts.push(`${reflections} reflection${reflections === 1 ? "" : "s"}`);
    lines.push(`- ${name.toLowerCase()}: ${total} entries — ${parts.join(", ")}`);
  }
  return lines.length ? lines.join("\n") : "no phase-counts data";
}

const SYSTEM_PROMPT = `You are Cygne — a luxury skincare guide writing a single-line pattern observation for a monthly recap. The user has been tracking their skin across their menstrual cycle for at least three cycles.

You will be given aggregated reaction counts per cycle phase. Your job: identify one notable phase-correlated pattern in natural language, or say nothing forced if no clear pattern exists.

WRITE: exactly 1-2 sentences. ~80-160 characters total. Editorial, observational, quiet. "You" not "the user".

RULES:
- If a phase clearly shows more breakouts, more irritation, or more loving-it, name it plainly — e.g. "Your skin reacts more during your luteal phase" or "You tend to feel best in the follicular window."
- If the distribution looks flat or noisy — no phase clearly stands out — say something neutral, honest, and short. Something like "No clear phase pattern this cycle — your skin has felt steady across the month." Never invent a correlation.
- Never quote numbers back at the user. No percentages, no counts, no phase names in isolation. Reference the phase in prose.
- No medical claims, no "consult a", no disclaimers, no emojis, no markdown, no headings, no salutation.
- Never say "insufficient data" or "come back later" — the surface gate has already validated the data is enough. If you truly see nothing, say the neutral line.

OUTPUT only the 1-2 sentences. Nothing before or after.`;

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Server misconfigured: missing API key" });

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: "Server misconfigured: missing Supabase env vars" });
    }
    const db = createClient(supabaseUrl, serviceKey);

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { userId, offset, cycleLength, cycleSpanDays, phaseCounts } = body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const slice = resolveMonth(offset);
    const cacheKey = `__cycle_pattern_insight_${slice.year}_${String(slice.month + 1).padStart(2, "0")}`;
    console.log(
      "[cycle-pattern-insight] received | userId:", userId,
      "| cacheKey:", cacheKey,
      "| cycleLength:", cycleLength,
      "| cycleSpanDays:", cycleSpanDays,
    );

    // ── A. CACHE CHECK — same 12h window as monthly-recap ───────────────────
    const windowStart = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const { data: cached } = await db
      .from("ask_cygne_cache")
      .select("response")
      .eq("user_id", userId)
      .eq("question", cacheKey)
      .gte("created_at", windowStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached?.response) {
      console.log("[cycle-pattern-insight] cache hit");
      return res.status(200).json({ insight: cached.response, cached: true });
    }

    // ── B. CALL CLAUDE ─────────────────────────────────────────────────────
    const context =
      `Cycle length: ${Number(cycleLength) || 28} days\n` +
      `Data span: ${Number(cycleSpanDays) || 0} days (≥ ${(Number(cycleLength) || 28) * 3} required by the upstream gate).\n\n` +
      `Phase counts (from ramp_checkins response_state + reflection captures):\n${renderPhaseCounts(phaseCounts)}`;
    const system = `${SYSTEM_PROMPT}\n\nUSER CONTEXT:\n${context}`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 120,
        stream: true,
        system,
        messages: [{ role: "user", content: `Give the pattern observation for ${slice.monthName} ${slice.year}.` }],
      }),
    });

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text();
      console.error("[cycle-pattern-insight] Claude error:", claudeRes.status, errBody.slice(0, 400));
      return res.status(502).json({ error: "AI request failed", status: claudeRes.status });
    }

    // SSE stream parsing — same shape as monthly-recap.js.
    let insight = "";
    const reader = claudeRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const raw of lines) {
        if (!raw.startsWith("data: ")) continue;
        const payload = raw.slice(6).trim();
        if (payload === "[DONE]") break outer;
        try {
          const evt = JSON.parse(payload);
          if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
            insight += evt.delta.text;
          }
        } catch { /* ignore malformed lines */ }
      }
    }

    insight = insight.trim().replace(/^["']|["']$/g, "");
    if (!insight) return res.status(502).json({ error: "Empty response from AI" });

    // ── C. PERSIST CACHE (best-effort) ─────────────────────────────────────
    db.from("ask_cygne_cache").insert({
      user_id: userId,
      question: cacheKey,
      response: insight,
      created_at: new Date().toISOString(),
    }).then(({ error }) => {
      if (error) console.error("[cycle-pattern-insight] cache insert failed:", error.message);
    });

    console.log("[cycle-pattern-insight] done — chars:", insight.length);
    return res.status(200).json({ insight, cached: false });

  } catch (err) {
    console.error("[cycle-pattern-insight] handler threw:", err?.message ?? err);
    return res.status(500).json({ error: err?.message || "Internal error" });
  }
}
