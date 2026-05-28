// Vercel serverless function: swan-sense-daily
//
// Ported from supabase/functions/swan-sense-daily. Produces one short editorial
// Swan Sense line per user per day, driven by Claude with the user's actual
// context (products / journals / check-ins / skinProfile / cycle). Cached
// server-side in ask_cygne_cache with a per-day question key so repeat
// dashboard mounts within the same day short-circuit to the cached line.

import { createClient } from "@supabase/supabase-js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, x-client-info, apikey, content-type",
  );
}

function buildContext(body) {
  const parts = [];
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
  }
  if (Array.isArray(body.products) && body.products.length) {
    const inRoutine = body.products.filter((p) => p?.inRoutine !== false);
    const list = inRoutine.slice(0, 10)
      .map((p) => [p.brand, p.name].filter(Boolean).join(" "))
      .filter(Boolean);
    if (list.length) parts.push(`In routine: ${list.join("; ")}.`);
  }
  if (Array.isArray(body.journals) && body.journals.length) {
    const recent = body.journals.slice(-5);
    const conditions = recent.map((j) => j.condition).filter(Boolean);
    const sleepPoor = recent.filter((j) => j.sleep === "poor").length;
    const stressHigh = recent.filter((j) => j.stress === "high").length;
    const bits = [];
    if (conditions.length) bits.push(`recent skin: ${conditions.join(", ")}`);
    if (sleepPoor)         bits.push(`${sleepPoor} poor-sleep night${sleepPoor === 1 ? "" : "s"}`);
    if (stressHigh)        bits.push(`${stressHigh} high-stress day${stressHigh === 1 ? "" : "s"}`);
    if (bits.length) parts.push(`Last week — ${bits.join("; ")}.`);
  }
  if (Array.isArray(body.checkIns) && body.checkIns.length) {
    const recent = body.checkIns.slice(-5);
    const irr = recent.filter((c) => c.irritation && c.irritation !== "none").length;
    const brk = recent.filter((c) => c.breakout).length;
    // Breakout locations live on the check-in (breakoutZones), not the journal.
    const zones = [...new Set(recent.flatMap((c) => c.breakoutZones || []))];
    const bits = [];
    if (irr) bits.push(`${irr} irritation flag${irr === 1 ? "" : "s"}`);
    if (brk) bits.push(`${brk} breakout day${brk === 1 ? "" : "s"}`);
    if (zones.length) bits.push(`zones flagged: ${zones.join(", ")}`);
    if (bits.length) parts.push(`Recent check-ins — ${bits.join(", ")}.`);
  }
  if (Array.isArray(body.triggerLog) && body.triggerLog.length) {
    const recent = body.triggerLog.slice(-7);
    const triggers = {};
    const symptoms = {};
    recent.forEach((e) => {
      (e?.triggers || []).forEach((t) => { triggers[t] = (triggers[t] || 0) + 1; });
      (e?.symptoms || []).forEach((s) => { symptoms[s] = (symptoms[s] || 0) + 1; });
    });
    const topTriggers = Object.entries(triggers).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);
    const topSymptoms = Object.entries(symptoms).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);
    const bits = [];
    if (topTriggers.length) bits.push(`triggers: ${topTriggers.join(", ")}`);
    if (topSymptoms.length) bits.push(`symptoms: ${topSymptoms.join(", ")}`);
    if (bits.length) parts.push(`Recent body log — ${bits.join("; ")}.`);
  }
  return parts.join(" ") || "No context recorded yet.";
}

// Reflections are not in a table — they live on auth user_metadata.reflections
// (the photo files live in the private `reflections` storage bucket). Read them
// server-side with the service-role admin API, newest first.
async function fetchRecentReflections(db, userId, n = 5) {
  try {
    const { data, error } = await db.auth.admin.getUserById(userId);
    if (error || !data?.user) return [];
    const reflections = data.user.user_metadata?.reflections;
    if (!Array.isArray(reflections) || !reflections.length) return [];
    return reflections
      .filter((r) => r?.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, n);
  } catch (e) {
    console.error("[swan-sense-daily] reflections fetch failed:", e?.message ?? e);
    return [];
  }
}

// Render the recent reflections as a clear prompt block — date + the weekly
// Swan Sense insight (headline/detail) only. Photo paths/URLs are intentionally
// omitted: they're not useful to a text model.
function formatReflections(reflections) {
  if (!reflections.length) return "";
  const lines = reflections.map((r) => {
    const date = (r.date || "").split("T")[0];
    const note = r.insight
      ? [r.insight.headline, r.insight.detail].filter(Boolean).join(" — ")
      : "(no insight recorded)";
    return `- ${date}: ${note}`;
  });
  return `Recent reflections (last ${reflections.length}):\n${lines.join("\n")}`;
}

const SYSTEM_PROMPT = `You are Cygne — a luxury skincare guide writing one short editorial line that opens the user's day on the home dashboard.

WRITE: one to two sentences total. Editorial. Observational. Never clinical, never a chatbot.
- Pull from the user's actual context — a real pattern, a cycle phase, a recent journal note, an active streak risk, a climate signal.
- Don't open with "Your skin…" — start anywhere else.
- No bullets, no lists, no markdown, no quotation marks around the line.
- No disclaimers, no medical advice, no "consult a dermatologist".
- Do not surface in-clinic treatment timing (peels, lasers, injectables, facials, professional treatments) — including phrasing like "not the right week for in-clinic treatments" — unless the user's context explicitly shows a scheduled treatment or an upcoming event with a date. If neither is present, never mention treatment timing at all.
- If context is thin, write a soft seasonal or cycle-aware line.
- Match the user's adherence tone: "Daily, Without Fail" can be direct and observational; "A Few Times a Week" stays gentle; "When I Remember" should be warm and never scold or guilt — celebrate small motion.

OUTPUT only the line itself. Nothing before or after.`;

function todayKey() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Server misconfigured: missing API key" });

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const db = createClient(supabaseUrl, serviceKey);

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { userId } = body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

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
      return res.status(200).json({ line: cached.response, cached: true });
    }

    // ── B. CALL CLAUDE ───────────────────────────────────────────────────────
    const context = buildContext(body);
    const recentReflections = await fetchRecentReflections(db, userId, 5);
    const reflectionsBlock = formatReflections(recentReflections);
    const system = `${SYSTEM_PROMPT}\n\nUSER CONTEXT:\n${context}${reflectionsBlock ? `\n\n${reflectionsBlock}` : ""}`;

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
        messages: [{ role: "user", content: "Compose today's Swan Sense line." }],
      }),
    });

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text();
      console.error("[swan-sense-daily] Claude error:", claudeRes.status, errBody.slice(0, 400));
      return res.status(502).json({ error: "AI request failed", status: claudeRes.status });
    }

    let line = "";
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
            line += evt.delta.text;
          }
        } catch { /* ignore malformed lines */ }
      }
    }

    line = line.trim().replace(/^["']|["']$/g, "");
    if (!line) return res.status(502).json({ error: "Empty response from AI" });

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
    return res.status(200).json({ line, cached: false });

  } catch (err) {
    console.error("[swan-sense-daily] exception:", err);
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
}
