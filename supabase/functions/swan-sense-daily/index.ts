// Supabase Edge Function: swan-sense-daily
//
// Produces one short, plain, factual Swan Sense line per user per day,
// driven by Claude with the user's actual context (products / journals /
// check-ins / skinProfile / cycle). Cached server-side in ask_cygne_cache
// with a per-day question key so repeat dashboard mounts within the same
// day short-circuit to the cached line instead of re-calling Claude.
//
// Voice: flat and concrete — cycle day/phase stated plainly, the real
// mechanism behind today's guidance, one direct recommendation. Same
// register as the Daily Skin Index and Cycle Pattern card — see
// SYSTEM_PROMPT below. (Superseded in practice by api/swan-sense-daily.js,
// the Vercel port the client actually calls — kept in sync here in case
// this copy is ever redeployed.)
//
// Body shape:
//   {
//     userId:    string  (required)
//     products:  Product[]
//     journals:  JournalEntry[]
//     checkIns:  CheckIn[]
//     skinProfile: object
//     skinType:  string
//     concerns:  string[]
//     cycleDay:  number   (optional — current cycle day, derived client-side)
//   }
//
// Response:
//   { line: string, cached: boolean }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Fitzpatrick self-report → LLM guidance line. Mirrors the helper in
// api/monthly-recap.js, api/swan-sense-daily.js, api/ask-cygne.js, and
// supabase/functions/ask-cygne/index.ts. Returns null when the user
// skipped the question (null / undefined / out-of-range); missing =
// no reference at all, no fallback assumption. Types IV-VI get a
// PIH-awareness clause gated on "only when relevant."
function fitzpatrickContextLine(fitzpatrickType: unknown): string | null {
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

function buildContext(body: any): string {
  const parts: string[] = [];
  if (body.skinType) parts.push(`Skin type: ${body.skinType}.`);
  if (Array.isArray(body.concerns) && body.concerns.length) {
    parts.push(`Concerns: ${body.concerns.join(", ")}.`);
  }
  if (Number.isFinite(body.cycleDay)) {
    parts.push(`Cycle day: ${body.cycleDay}.`);
  }
  const profile = body.skinProfile;
  if (profile) {
    if (profile.skinGoals?.length) parts.push(`Goals: ${profile.skinGoals.join(", ")}.`);
    if (profile.routinePhilosophy)  parts.push(`Routine philosophy: ${profile.routinePhilosophy}.`);
    if (profile.consistency)        parts.push(`Adherence: ${profile.consistency}.`);
    if (profile.climate)            parts.push(`Climate: ${profile.climate}.`);
    if (profile.environment)        parts.push(`Environment: ${profile.environment}.`);
    // "Just For Me" and legacy "Not Right Now" are explicit non-events —
    // never echo them into the prompt verbatim. Render as plain context.
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
  if (Array.isArray(body.products) && body.products.length) {
    const inRoutine = body.products.filter((p: any) => p?.inRoutine !== false);
    const list = inRoutine.slice(0, 10)
      .map((p: any) => [p.brand, p.name].filter(Boolean).join(" "))
      .filter(Boolean);
    if (list.length) parts.push(`In routine: ${list.join("; ")}.`);
  }
  if (Array.isArray(body.journals) && body.journals.length) {
    const recent = body.journals.slice(-5);
    const conditions = recent.map((j: any) => j.condition).filter(Boolean);
    const sleepPoor = recent.filter((j: any) => j.sleep === "poor").length;
    const stressHigh = recent.filter((j: any) => j.stress === "high").length;
    const bits: string[] = [];
    if (conditions.length) bits.push(`recent skin: ${conditions.join(", ")}`);
    if (sleepPoor)         bits.push(`${sleepPoor} poor-sleep night${sleepPoor === 1 ? "" : "s"}`);
    if (stressHigh)        bits.push(`${stressHigh} high-stress day${stressHigh === 1 ? "" : "s"}`);
    if (bits.length) parts.push(`Last week — ${bits.join("; ")}.`);
  }
  if (Array.isArray(body.checkIns) && body.checkIns.length) {
    const recent = body.checkIns.slice(-5);
    const irr = recent.filter((c: any) => c.irritation && c.irritation !== "none").length;
    const brk = recent.filter((c: any) => c.breakout).length;
    // Breakout locations live on the check-in (breakoutZones), not the journal.
    const zones = [...new Set(recent.flatMap((c: any) => c.breakoutZones || []))];
    const bits: string[] = [];
    if (irr) bits.push(`${irr} irritation flag${irr === 1 ? "" : "s"}`);
    if (brk) bits.push(`${brk} breakout day${brk === 1 ? "" : "s"}`);
    if (zones.length) bits.push(`zones flagged: ${zones.join(", ")}`);
    if (bits.length) parts.push(`Recent check-ins — ${bits.join(", ")}.`);
  }
  if (Array.isArray(body.triggerLog) && body.triggerLog.length) {
    const recent = body.triggerLog.slice(-7);
    const triggers: Record<string, number> = {};
    const symptoms: Record<string, number> = {};
    recent.forEach((e: any) => {
      (e?.triggers || []).forEach((t: string) => { triggers[t] = (triggers[t] || 0) + 1; });
      (e?.symptoms || []).forEach((s: string) => { symptoms[s] = (symptoms[s] || 0) + 1; });
    });
    const topTriggers = Object.entries(triggers).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);
    const topSymptoms = Object.entries(symptoms).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);
    const bits: string[] = [];
    if (topTriggers.length) bits.push(`triggers: ${topTriggers.join(", ")}`);
    if (topSymptoms.length) bits.push(`symptoms: ${topSymptoms.join(", ")}`);
    if (bits.length) parts.push(`Recent body log — ${bits.join("; ")}.`);
  }
  return parts.join(" ") || "No context recorded yet.";
}

const SYSTEM_PROMPT = `You are Cygne, writing one short, plain, factual line that opens the user's day on the home dashboard.

WRITE: one to two sentences total, roughly half the length you'd otherwise default to. The same flat, direct, factual register already used by the app's Daily Skin Index and Cycle Pattern card — not editorial, not atmospheric, not luxurious. Every sentence must convey a specific fact or action, never just a feeling or mood.

STRUCTURE:
1. If a cycle day is in context, state the day and phase plainly, upfront — e.g. "Day 16, follicular phase." Skip this opener entirely if there's no cycle day in context; don't work it into a sentence some other way.
2. Name the one or two real mechanisms driving today's guidance, pulled from the user's actual context (cycle phase, a recent journal note, a climate signal, an active streak, a return gap) — e.g. "Estrogen is rising and cell turnover is faster right now." State the mechanism directly. No decorative wrapping language around it.
3. End with one direct, concrete recommendation — a specific action, not a poetic closing line. e.g. "A good window for your full routine, actives included."

AVOID — none of these convey a fact or action, so none of them belong in the line:
- Vague sensory/luxury phrasing: "peak radiance potential," "primed to drink in," "earns its place," "quiet steadiness," or anything in that register.
- Decorative wrapping around a fact instead of stating it directly.
- A feeling-based or poetic closing line — the last sentence must be a concrete recommendation.
- Don't open with "Your skin…" — start with the day/phase or the mechanism instead.
- No bullets, no lists, no markdown, no quotation marks around the line.
- No disclaimers, no medical advice, no "consult a dermatologist".
- Do not surface in-clinic treatment timing (peels, lasers, injectables, facials, professional treatments) — including phrasing like "not the right week for in-clinic treatments" — unless the user's context explicitly shows a scheduled treatment or an upcoming event with a date. If neither is present, never mention treatment timing at all.
- If context is thin, write a short, plain seasonal or cycle-aware line — stay concrete, don't get vaguer to compensate.
- Match the user's adherence tone in directness, not in flourish: "Daily, Without Fail" can be most direct; "A Few Times a Week" stays plain and even-keeled; "When I Remember" should be warm but never scold or guilt — celebrate small motion, still in one concrete sentence, not a bigger feeling.

EXAMPLES — match this length and register exactly:
- "Day 16, follicular phase. Estrogen is rising and cell turnover is faster right now — a good window for your full routine, actives included."
- "Two poor-sleep nights in a row. Cortisol weakens the barrier when sleep is short — keep tonight's ritual gentle and skip actives."
- "Luteal phase, day 24. Sebum production is peaking this week — your BHA step matters most right now."

OUTPUT only the line itself. Nothing before or after.`;

function todayKey(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "Server misconfigured: missing API key" }, 500);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { userId } = body;
    if (!userId) return json({ error: "Missing userId" }, 400);

    const cacheKey = `__swan_sense_daily_${todayKey()}`;
    console.log(
      "[swan-sense-daily] received | userId:", userId,
      "| cacheKey:", cacheKey,
      "| products:", Array.isArray(body.products) ? body.products.length : 0,
      "| journals:", Array.isArray(body.journals) ? body.journals.length : 0,
    );

    // ── A. CACHE CHECK — serve today's cached line, regardless of age ────────
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { data: cached } = await db
      .from("ask_cygne_cache")
      .select("response")
      .eq("user_id", userId)
      .eq("question", cacheKey)
      .gte("created_at", todayStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached?.response) {
      console.log("[swan-sense-daily] cache hit");
      return json({ line: cached.response, cached: true });
    }

    // ── B. CALL CLAUDE ───────────────────────────────────────────────────────
    const context = buildContext(body);
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
        max_tokens: 70, // one short, plain line — was 120 for the old, longer editorial style
        stream: true,
        system,
        messages: [{ role: "user", content: "Compose today's Swan Sense line." }],
      }),
    });

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text();
      console.error("[swan-sense-daily] Claude error:", claudeRes.status, errBody.slice(0, 400));
      return json({ error: "AI request failed", status: claudeRes.status }, 502);
    }

    let line = "";
    const reader = claudeRes.body!.getReader();
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
            line += evt.delta.text;
          }
        } catch { /* ignore malformed lines */ }
      }
    }

    line = line.trim().replace(/^["']|["']$/g, "");
    if (!line) return json({ error: "Empty response from AI" }, 502);

    // ── C. PERSIST CACHE (best-effort) ───────────────────────────────────────
    db.from("ask_cygne_cache").insert({
      user_id: userId,
      question: cacheKey,
      response: line,
      created_at: new Date().toISOString(),
    }).then(({ error }) => {
      if (error) console.error("[swan-sense-daily] cache insert failed:", error.message);
    });

    console.log("[swan-sense-daily] done — chars:", line.length);
    return json({ line, cached: false });

  } catch (err) {
    console.error("[swan-sense-daily] exception:", err);
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
