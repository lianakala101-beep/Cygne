// Vercel serverless function: monthly-recap
//
// Produces ONE short sentence of light editorial framing for the top of the
// Monthly Recap, driven by Claude with the user's actual logged context for
// that month. The recap itself now leads with concrete, rule-based data
// cards computed client-side (see src/lib/monthlyDataCards.js) — this
// endpoint no longer writes the bulk of the recap, just a brief warm line
// above those cards. Previously wrote 3-4 full paragraphs; kept as an AI
// call (rather than a static line) so it can still ground itself in real,
// specific context when there's any to pull from.
//
// Body shape:
//   {
//     userId:       string  (required)
//     offset:       number  (0 = current month, -1 = previous month, …)
//     products:     array
//     journals:     array
//     checkIns:     array
//     treatments:   array
//     skinProfile:  object  (from user.skinProfile)
//     skinType:     string
//     concerns:     array
//     cycleDay:     number
//   }
//
// rampLog is fetched server-side via service role (same pattern as
// swan-sense-daily) — we don't trust client-side rampLog since it can be
// stripped from props on certain screens.
//
// Response:
//   200: { narrative: string, cached: boolean }  — narrative is now one sentence
//   4xx/5xx: { error: string }

import { createClient } from "@supabase/supabase-js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, x-client-info, apikey, content-type",
  );
}

// Race a promise against a deadline. On timeout resolves with `fallback` so
// the function can keep going without that piece of context — mirrors the
// same withTimeout helper in swan-sense-daily.js so a slow admin API can't
// blow past Vercel Hobby's 10-second limit.
function withTimeout(promise, timeoutMs, fallback, label) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[monthly-recap] ${label} timed out after ${timeoutMs}ms — continuing without it`);
      resolve(fallback);
    }, timeoutMs);
  });
  return Promise.race([
    promise.then((value) => { clearTimeout(timer); return value; })
           .catch((e) => { clearTimeout(timer); console.warn(`[monthly-recap] ${label} threw — continuing without it:`, e?.message ?? e); return fallback; }),
    timeout,
  ]);
}

async function fetchRampLog(db, userId) {
  // Phase 2 metadata migration: rampLog now lives in the ramp_log table
  // (see supabase/migrations/20260606000000_*). Service role bypasses RLS,
  // so this select works without any auth.uid() context.
  try {
    const { data, error } = await db
      .from("ramp_log").select("data").eq("user_id", userId);
    if (error) {
      console.error("[monthly-recap] ramp_log fetch failed:", error.message);
      return [];
    }
    return (data || []).map(r => r.data).filter(Boolean);
  } catch (e) {
    console.error("[monthly-recap] rampLog fetch threw:", e?.message ?? e);
    return [];
  }
}

// Resolve target month from offset, then filter every collection down to
// items dated within that month. Defensive: each collection is coerced to
// an array before filter; each item's date is read via optional chaining.
function buildMonthSlice(body) {
  const today = new Date();
  const offset = Number.isFinite(body.offset) ? body.offset : 0;
  const target = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const year = target.getFullYear();
  const month = target.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const start = new Date(year, month, 1).getTime();
  const end   = new Date(year, month, daysInMonth, 23, 59, 59, 999).getTime();
  const inMonth = (iso) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) && t >= start && t <= end;
  };
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    year, month,
    monthName: ["January","February","March","April","May","June","July","August","September","October","November","December"][month],
    journalsM:   arr(body.journals).filter(j => inMonth(j?.date)),
    checkInsM:   arr(body.checkIns).filter(c => inMonth(c?.date)),
    treatmentsM: arr(body.treatments).filter(t => inMonth(t?.date)),
  };
}

// Fitzpatrick self-report → LLM guidance line. Returns null when the
// user skipped the question (null / undefined / out-of-range). Never
// stamps a fallback assumption when unset — spec is explicit that
// missing = no reference at all.
//
// Types I-III (fair): brief SPF-prioritization line, still soft-framed.
// Types IV-VI (more pigment): PIH-awareness line — the LLM is told to
// reference it ONLY when the user's context is relevant (visible
// breakouts, dark spots, scarring, or a direct question), and always
// with "may be more prone to" hedged framing, never diagnostic.
//
// Kept as a small file-local helper so this endpoint stays self-
// contained; the same shape is mirrored inline in api/swan-sense-daily,
// api/ask-cygne, and the two Supabase edge-function equivalents.
function fitzpatrickContextLine(fitzpatrickType) {
  const n = Number(fitzpatrickType);
  if (!Number.isInteger(n) || n < 1 || n > 6) return null;
  const roman = ["I", "II", "III", "IV", "V", "VI"][n - 1];
  const label = [
    "Always burns, rarely tans",
    "Burns easily, tans minimally",
    "Sometimes burns, tans gradually",
    "Rarely burns, tans easily",
    "Very rarely burns, tans deeply",
    "Never burns, always tans deeply",
  ][n - 1];
  if (n >= 4) {
    return (
      `Fitzpatrick self-report: ${roman} (${label}). Skin has more natural ` +
      `pigment — may be more prone to post-inflammatory hyperpigmentation ` +
      `(PIH) after breakouts, irritation, or aggressive actives. Reference ` +
      `this ONLY if the user's context is relevant (visible breakouts, dark ` +
      `spots, scarring, or a direct question); otherwise do not mention it. ` +
      `When relevant, lean conservative on inflammation-prone actives ` +
      `(retinoids, exfoliating acids) and use "may be more prone to" ` +
      `framing — never absolute or diagnostic.`
    );
  }
  return (
    `Fitzpatrick self-report: ${roman} (${label}). Skin burns more easily ` +
    `under sun exposure. When relevant to the user's context (SPF, outdoor ` +
    `activity, sun damage), you may lean into daily SPF as high-priority. ` +
    `Use "may be more prone to" framing — never absolute or diagnostic.`
  );
}

function buildContext(body, slice, rampLog) {
  const parts = [];
  parts.push(`Month under review: ${slice.monthName} ${slice.year}.`);
  if (body.skinType) parts.push(`Skin type: ${body.skinType}.`);
  if (Array.isArray(body.concerns) && body.concerns.length) {
    parts.push(`Concerns: ${body.concerns.join(", ")}.`);
  }
  if (Number.isFinite(body.cycleDay)) {
    parts.push(`Current cycle day: ${body.cycleDay}.`);
  }
  const profile = body.skinProfile || null;
  if (profile) {
    if (profile.skinGoals?.length)  parts.push(`Goals: ${profile.skinGoals.join(", ")}.`);
    if (profile.routinePhilosophy)  parts.push(`Routine philosophy: ${profile.routinePhilosophy}.`);
    if (profile.consistency)        parts.push(`Adherence: ${profile.consistency}.`);
    if (profile.climate)            parts.push(`Climate: ${profile.climate}.`);
    if (profile.environment)        parts.push(`Environment: ${profile.environment}.`);
    const occ = profile.specialOccasion;
    const isNonEvent = occ === "Just For Me" || occ === "Not Right Now";
    if (occ && profile.occasionDate && !isNonEvent) {
      parts.push(`Upcoming: ${occ} on ${profile.occasionDate}.`);
    } else if (profile.focus) {
      parts.push(`Focus: ${profile.focus}.`);
    } else if (isNonEvent) {
      parts.push(`Focus: general skin health.`);
    }
    const fitzLine = fitzpatrickContextLine(profile.fitzpatrick_type);
    if (fitzLine) parts.push(fitzLine);
  }

  // In-routine products (cap at 10 to keep the prompt lean).
  if (Array.isArray(body.products) && body.products.length) {
    const inRoutine = body.products.filter(p => p?.inRoutine !== false);
    const list = inRoutine.slice(0, 10)
      .map(p => [p?.brand, p?.name].filter(Boolean).join(" ")).filter(Boolean);
    if (list.length) parts.push(`In routine: ${list.join("; ")}.`);
  }

  // Journal aggregate for the month.
  if (slice.journalsM.length) {
    const conds = slice.journalsM.reduce((acc, j) => {
      if (j?.condition) acc[j.condition] = (acc[j.condition] || 0) + 1;
      return acc;
    }, {});
    const condParts = Object.entries(conds).map(([k, v]) => `${k} ×${v}`).join(", ");
    const sleepPoor = slice.journalsM.filter(j => j?.sleep === "poor").length;
    const stressHi  = slice.journalsM.filter(j => j?.stress === "high").length;
    const bits = [`${slice.journalsM.length} journal entries`];
    if (condParts) bits.push(`conditions: ${condParts}`);
    if (sleepPoor) bits.push(`${sleepPoor} poor-sleep nights`);
    if (stressHi)  bits.push(`${stressHi} high-stress days`);
    parts.push(`Journal: ${bits.join("; ")}.`);
  }

  // Check-in aggregate.
  if (slice.checkInsM.length) {
    const irritation = slice.checkInsM.filter(c => c?.irritation && c.irritation !== "none").length;
    const breakouts  = slice.checkInsM.filter(c => c?.breakout).length;
    const zoneCounts = {};
    slice.checkInsM.forEach(c => {
      const zones = Array.isArray(c?.breakoutZones) ? c.breakoutZones : [];
      zones.forEach(z => { if (z) zoneCounts[z] = (zoneCounts[z] || 0) + 1; });
    });
    const topZones = Object.entries(zoneCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const bits = [`${slice.checkInsM.length} check-ins`];
    if (irritation) bits.push(`irritation flagged ×${irritation}`);
    if (breakouts)  bits.push(`breakouts on ${breakouts} days`);
    if (topZones.length) bits.push(`top zones: ${topZones.map(([z, n]) => `${z} ×${n}`).join(", ")}`);
    parts.push(`Check-ins: ${bits.join("; ")}.`);
  }

  // Treatments this month.
  if (slice.treatmentsM.length) {
    const labels = slice.treatmentsM.map(t => t?.label || t?.typeId).filter(Boolean);
    parts.push(`Treatments logged: ${labels.join(", ")}.`);
  }

  // Ramp progression summary — uses the rampLog fetched server-side, scoped
  // to this month. Lists the count of advance / backing-off / auto-events.
  if (Array.isArray(rampLog) && rampLog.length) {
    const inMonth = (ts) => {
      if (!ts) return false;
      const d = new Date(ts).getTime();
      const startMs = new Date(slice.year, slice.month, 1).getTime();
      const endMs   = new Date(slice.year, slice.month + 1, 0, 23, 59, 59, 999).getTime();
      return Number.isFinite(d) && d >= startMs && d <= endMs;
    };
    const monthLog = rampLog.filter(e => inMonth(e?.timestamp));
    if (monthLog.length) {
      const byStatus = monthLog.reduce((acc, e) => {
        const s = e?.status || "unknown";
        acc[s] = (acc[s] || 0) + 1;
        return acc;
      }, {});
      const summary = Object.entries(byStatus).map(([s, n]) => `${s} ×${n}`).join(", ");
      parts.push(`Introduce Slowly actions: ${summary}.`);
    }
  }

  return parts.join(" ");
}

const SYSTEM_PROMPT = `You are Cygne — a luxury skincare guide writing the opening line of a monthly skin recap for the user. The recap itself is a set of concrete data cards further down the screen; this is just one short line of light, warm framing before them — not a report, not a narrative, not a summary of the cards.

WRITE: exactly ONE sentence, roughly 60-110 characters. Editorial, warm, calm. Never clinical, never a chatbot. No bullet points, no lists, no headings or labels — just the one sentence.

Pull a real, specific signal from their context if one stands out — a recurring skin condition, irritation cluster, a product or ramp they're working through, a cycle phase, an upcoming event from skinProfile. If context is thin, write a plain, steady-as-you-go line grounded in something concrete and real about them (a goal, a product in routine, their skin type) rather than a generic platitude — but keep it to one line regardless.

VOICE:
- Warm, observational.
- "You" not "the user". Past tense for what happened, present for now.
- No medical advice, no "consult a dermatologist", no disclaimers.
- No emojis, no markdown, no quotes around the line.
- No salutation, no signoff — just the one sentence.

Never invent activity, conditions, or events that weren't provided in context.

OUTPUT only the single sentence. Nothing before or after.`;

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
    const { userId } = body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const slice = buildMonthSlice(body);
    // Cache key includes the resolved year-month so opening the same month
    // twice within the cache window is a hit; opening a different month is
    // a miss. Distinct from swan-sense-daily's per-day key.
    const cacheKey = `__monthly_recap_${slice.year}_${String(slice.month + 1).padStart(2, "0")}`;
    console.log(
      "[monthly-recap] received | userId:", userId,
      "| cacheKey:", cacheKey,
      "| journalsM:", slice.journalsM.length,
      "| checkInsM:", slice.checkInsM.length,
      "| treatmentsM:", slice.treatmentsM.length,
    );

    // ── A. CACHE CHECK ───────────────────────────────────────────────────────
    // 12-hour window so a user opening the recap multiple times the same day
    // hits cache, but a return tomorrow regenerates with that day's new logs
    // for the current month. Past months stabilize naturally.
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
      console.log("[monthly-recap] cache hit");
      return res.status(200).json({ narrative: cached.response, cached: true });
    }

    // ── B. CALL CLAUDE ───────────────────────────────────────────────────────
    const rampLog = await withTimeout(fetchRampLog(db, userId), 3000, [], "rampLog fetch");
    const context = buildContext(body, slice, rampLog);
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
        max_tokens: 80, // one short sentence — was 400 for the old 3-paragraph narrative
        stream: true,
        system,
        messages: [{ role: "user", content: `Write the opening line for the ${slice.monthName} ${slice.year} recap.` }],
      }),
    });

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text();
      console.error("[monthly-recap] Claude error:", claudeRes.status, errBody.slice(0, 400));
      return res.status(502).json({ error: "AI request failed", status: claudeRes.status });
    }

    let narrative = "";
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
            narrative += evt.delta.text;
          }
        } catch { /* ignore malformed lines */ }
      }
    }

    narrative = narrative.trim().replace(/^["']|["']$/g, "");
    if (!narrative) return res.status(502).json({ error: "Empty response from AI" });

    // ── C. PERSIST CACHE (best-effort) ───────────────────────────────────────
    db.from("ask_cygne_cache").insert({
      user_id: userId,
      question: cacheKey,
      response: narrative,
      created_at: new Date().toISOString(),
    }).then(({ error }) => {
      if (error) console.error("[monthly-recap] cache insert failed:", error.message);
    });

    console.log("[monthly-recap] done — chars:", narrative.length);
    return res.status(200).json({ narrative, cached: false });

  } catch (err) {
    console.error("[monthly-recap] handler threw:", err?.message ?? err);
    return res.status(500).json({ error: err?.message || "Internal error" });
  }
}
