// Vercel serverless function: ask-cygne
//
// Ported from supabase/functions/ask-cygne. Accepts a skincare question + the
// user's context, checks a 60-minute response cache, enforces a 3/day per-user
// limit, and proxies to Claude.
//
// Context comes FROM THE CLIENT in the request body — the Cygne app stores
// products / journals / skinProfile in auth.user_metadata, not in tables, so
// the function doesn't query Postgres for those fields. Two cache + usage
// tables (ask_cygne_cache, ask_cygne_usage) are persisted server-side via the
// service role key.

import { createClient } from "@supabase/supabase-js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, x-client-info, apikey, content-type",
  );
}

// Convert client-side state into a single context paragraph for the prompt.
// All inputs are optional — return what we can describe, fall back politely.
function buildContextFromBody(body) {
  if (typeof body.context === "string" && body.context.trim()) {
    return body.context.trim();
  }

  const parts = [];
  const skinType = body.skinType || body.user?.skinType;
  const concerns = body.concerns || body.user?.concerns;
  if (skinType) parts.push(`Skin type: ${skinType}.`);
  if (Array.isArray(concerns) && concerns.length) {
    parts.push(`Concerns: ${concerns.join(", ")}.`);
  }

  const profile = body.skinProfile || body.user?.skinProfile;
  if (profile) {
    if (profile.skinGoals?.length) parts.push(`Goals: ${profile.skinGoals.join(", ")}.`);
    if (profile.routinePhilosophy)  parts.push(`Routine philosophy: ${profile.routinePhilosophy}.`);
    if (profile.climate)            parts.push(`Climate: ${profile.climate}.`);
    if (profile.environment)        parts.push(`Environment: ${profile.environment}.`);
    if (profile.fragrance)          parts.push(`Fragrance preference: ${profile.fragrance}.`);
    if (profile.specialOccasion)    parts.push(`Upcoming occasion: ${profile.specialOccasion}.`);
    if (profile.ingredientsToAvoid) parts.push(`Ingredients to avoid: ${profile.ingredientsToAvoid}.`);
  }

  if (Array.isArray(body.products) && body.products.length) {
    const inRoutine = body.products.filter((p) => p?.inRoutine !== false);
    const list = inRoutine.slice(0, 12)
      .map((p) => [p.brand, p.name].filter(Boolean).join(" "))
      .filter(Boolean);
    if (list.length) {
      parts.push(`In routine (${inRoutine.length} product${inRoutine.length === 1 ? "" : "s"}): ${list.join("; ")}.`);
    }
  }

  if (Array.isArray(body.journals) && body.journals.length) {
    const recent = body.journals.slice(-7);
    const conditions = recent.map((j) => j.condition).filter(Boolean);
    const sleepPoor = recent.filter((j) => j.sleep === "poor").length;
    const stressHigh = recent.filter((j) => j.stress === "high").length;
    const journalBits = [];
    if (conditions.length) journalBits.push(`recent skin: ${conditions.join(", ")}`);
    if (sleepPoor)         journalBits.push(`${sleepPoor} poor-sleep night${sleepPoor === 1 ? "" : "s"}`);
    if (stressHigh)        journalBits.push(`${stressHigh} high-stress day${stressHigh === 1 ? "" : "s"}`);
    if (journalBits.length) parts.push(`Last week — ${journalBits.join("; ")}.`);
  }

  if (Array.isArray(body.checkIns) && body.checkIns.length) {
    const recent = body.checkIns.slice(-5);
    const irritated = recent.filter((c) => c.irritation && c.irritation !== "none").length;
    const breakouts = recent.filter((c) => c.breakout).length;
    // Breakout locations live on the check-in (breakoutZones), not the journal.
    const zones = [...new Set(recent.flatMap((c) => c.breakoutZones || []))];
    const checkBits = [];
    if (irritated) checkBits.push(`${irritated} irritation flag${irritated === 1 ? "" : "s"}`);
    if (breakouts) checkBits.push(`${breakouts} breakout day${breakouts === 1 ? "" : "s"}`);
    if (zones.length) checkBits.push(`zones logged: ${zones.join(", ")}`);
    if (checkBits.length) parts.push(`Recent check-ins — ${checkBits.join(", ")}.`);
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
    const bodyBits = [];
    if (topTriggers.length) bodyBits.push(`triggers: ${topTriggers.join(", ")}`);
    if (topSymptoms.length) bodyBits.push(`symptoms: ${topSymptoms.join(", ")}`);
    if (bodyBits.length) parts.push(`Recent body log — ${bodyBits.join("; ")}.`);
  }

  return parts.join(" ") || "No detailed context provided.";
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
    console.error("[ask-cygne] reflections fetch failed:", e?.message ?? e);
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

// Introduce Slowly schedules live in src/ramp.jsx — these are inlined here so
// the API can render the prompt block without importing the React module. Keys
// match RAMP_ACTIVES (+ the "toning pad" category special case). Maximum week
// per active is the highest weeks[] value in the schedule's final phase.
const RAMP_MAX_WEEKS = {
  "retinol": 12,
  "AHA": 12,
  "BHA": 12,
  "vitamin C": 12,
  "toning pad": 7,
};

// Lightweight client-of-engine.detectActives — substring match on ingredients
// plus the Toning Pad category. Mirrors the four RAMP_ACTIVES the UI uses to
// decide whether to surface IntroduceSlowlyCard for a product.
function detectRampActive(product) {
  if (!product) return null;
  if (product.category === "Toning Pad") return "toning pad";
  const ing = Array.isArray(product.ingredients)
    ? product.ingredients.join(" ").toLowerCase()
    : String(product.ingredients || "").toLowerCase();
  if (!ing) return null;
  if (/retin(ol|oid|al|yl)|tretinoin|adapalene/.test(ing)) return "retinol";
  if (/glycolic|lactic|mandelic|\baha\b/.test(ing)) return "AHA";
  if (/salicylic|\bbha\b/.test(ing)) return "BHA";
  if (/ascorbic|\bvitamin\s*c\b|ascorbyl/.test(ing)) return "vitamin C";
  return null;
}

// Compute the current ramp week from routineStartDate. Mirrors getRampWeek in
// src/ramp.jsx (Math.max(1, floor(days/7) + 1)).
function computeRampWeek(routineStartDate) {
  if (!routineStartDate) return 1;
  const start = new Date(String(routineStartDate).split("T")[0] + "T00:00:00").getTime();
  if (Number.isNaN(start)) return 1;
  const days = Math.floor((Date.now() - start) / 86400000);
  return Math.max(1, Math.floor(days / 7) + 1);
}

// Pull the user's rampLog (audit trail of ramp actions) from auth user_metadata
// via the service-role admin API. Same pattern as fetchRecentReflections.
async function fetchRampLog(db, userId) {
  try {
    const { data, error } = await db.auth.admin.getUserById(userId);
    if (error || !data?.user) return [];
    const log = data.user.user_metadata?.rampLog;
    return Array.isArray(log) ? log : [];
  } catch (e) {
    console.error("[ask-cygne] rampLog fetch failed:", e?.message ?? e);
    return [];
  }
}

// Render the user's in-flight Introduce Slowly products as a prompt block.
// Lists every in-routine product with a routineStartDate and a detectable ramp
// active, with current week / total weeks, hold status, start date, and the
// most recent rampLog action when present. Returns "" when nothing is ramping.
function formatIntroduceSlowly(products, rampLog) {
  if (!Array.isArray(products) || !products.length) return "";
  const log = Array.isArray(rampLog) ? rampLog : [];
  const ramping = [];
  for (const p of products) {
    if (!p || p.inRoutine === false || !p.routineStartDate) continue;
    const activeKey = detectRampActive(p);
    if (!activeKey) continue;
    const maxWeeks = RAMP_MAX_WEEKS[activeKey];
    const currentWeek = computeRampWeek(p.routineStartDate);
    const last = log
      .filter(e => e?.productId === p.id && e?.timestamp)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0] || null;
    ramping.push({ p, maxWeeks, currentWeek, last });
  }
  if (!ramping.length) return "";
  const lines = ramping.map(({ p, maxWeeks, currentWeek, last }) => {
    const name = p.name || "(unnamed)";
    const brandPart = p.brand ? ` (${p.brand})` : "";
    const totalPart = maxWeeks ? ` of ${maxWeeks}` : "";
    const held = p.rampHeld ? "yes" : "no";
    const started = String(p.routineStartDate).split("T")[0];
    const lastPart = last
      ? ` Last action: ${last.status || "unknown"}, ${String(last.timestamp).split("T")[0]}.`
      : "";
    return `- ${name}${brandPart}: Week ${currentWeek}${totalPart}. Held: ${held}. Started ${started}.${lastPart}`;
  });
  return `Introduce Slowly products:\n${lines.join("\n")}`;
}

const SYSTEM_PROMPT_BASE = `You are Cygne, a luxury skincare expert and the user's personal skin ritual guide.

YOUR RULES:
- Respond in 3-5 sentences maximum. Be concise.
- Be empathetic, warm, and clinical — like a knowledgeable friend who is also an expert.
- Reference the user's SPECIFIC products and patterns from their context whenever relevant — never give generic advice if context is available.
- If you identify a potential ingredient conflict, name the specific products involved.
Important: you can see which products the user owns and has in their routine, but you do NOT know which specific nights or sessions each product was used. Do not assume any two products are layered on the same night. If you identify a potential active conflict, acknowledge that the user may already be alternating these products intentionally, and frame your observation as something to verify rather than a confirmed problem.
- Always end with one concrete, actionable next step.
- Never diagnose medical conditions.
- Always include this exact line at the end: "Note: Cygne provides skincare guidance, not medical advice. For persistent concerns, consult a dermatologist."
- Tone: editorial, never clinical or chatbot-like.
- Never use bullet points — write in flowing prose only.`;

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("[ask-cygne] ANTHROPIC_API_KEY not set");
      return res.status(500).json({ error: "Server misconfigured: missing API key" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const db = createClient(supabaseUrl, serviceKey);

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { userId, question, sessionId } = body;
    if (!userId || !question?.trim()) {
      return res.status(400).json({ error: "Missing userId or question" });
    }
    const q = question.trim();
    console.log(
      "[ask-cygne] received | userId:", userId,
      "| sessionId:", sessionId,
      "| question chars:", q.length,
      "| products:", Array.isArray(body.products) ? body.products.length : 0,
      "| journals:", Array.isArray(body.journals) ? body.journals.length : 0,
    );

    // ── A. CACHE CHECK ────────────────────────────────────────────────────────
    const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: cached } = await db
      .from("ask_cygne_cache")
      .select("response")
      .eq("user_id", userId)
      .eq("question", q)
      .gte("created_at", sixtyMinutesAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached?.response) {
      console.log("[ask-cygne] cache hit for user", userId);
      return res.status(200).json({ response: cached.response, cached: true });
    }

    // ── B. USAGE LIMIT CHECK ──────────────────────────────────────────────────
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count } = await db
      .from("ask_cygne_usage")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", todayStart.toISOString());

    if ((count ?? 0) >= 3) {
      // Return 200 with a soft-error payload so the client surfaces the body.
      return res.status(200).json({
        error: "limit_reached",
        message:
          "You have used your 3 deep reflections for today. Return tomorrow for fresh insight.",
      });
    }

    // ── C. BUILD CONTEXT ──────────────────────────────────────────────────────
    const contextSummary = buildContextFromBody(body);
    const [recentReflections, rampLog] = await Promise.all([
      fetchRecentReflections(db, userId, 5),
      fetchRampLog(db, userId),
    ]);
    const reflectionsBlock = formatReflections(recentReflections);
    const introduceSlowlyBlock = formatIntroduceSlowly(body.products, rampLog);
    const systemPrompt = `${SYSTEM_PROMPT_BASE}\n\nUSER CONTEXT:\n${contextSummary}${reflectionsBlock ? `\n\n${reflectionsBlock}` : ""}${introduceSlowlyBlock ? `\n\n${introduceSlowlyBlock}` : ""}`;

    // ── D. CALL CLAUDE (streaming SSE; we collect into one string) ────────────
    console.log("[ask-cygne] calling Claude for user", userId);
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        stream: true,
        system: systemPrompt,
        messages: [{ role: "user", content: q }],
      }),
    });

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text();
      console.error("[ask-cygne] Claude error:", claudeRes.status, errBody.slice(0, 400));
      return res.status(502).json({ error: "AI request failed", status: claudeRes.status, body: errBody.slice(0, 400) });
    }

    let responseText = "";
    const reader = claudeRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") break outer;
        try {
          const evt = JSON.parse(payload);
          if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
            responseText += evt.delta.text;
          }
        } catch {
          /* ignore malformed lines */
        }
      }
    }

    if (!responseText.trim()) {
      console.error("[ask-cygne] empty response from Claude");
      return res.status(502).json({ error: "Empty response from AI" });
    }

    // ── E. SAVE CACHE + USAGE (best-effort; failures don't block response) ────
    const now = new Date().toISOString();
    const writes = await Promise.allSettled([
      db.from("ask_cygne_cache").insert({
        user_id: userId, question: q, response: responseText, created_at: now,
      }),
      db.from("ask_cygne_usage").insert({ user_id: userId, created_at: now }),
    ]);
    writes.forEach((w, i) => {
      if (w.status === "rejected") {
        console.error("[ask-cygne] persist failed", i, w.reason);
      }
    });

    console.log("[ask-cygne] done for user", userId, "chars:", responseText.length);
    return res.status(200).json({ response: responseText, cached: false });

  } catch (err) {
    console.error("[ask-cygne] exception:", err);
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
}
