// Supabase Edge Function: ask-cygne
//
// Accepts a skincare question + the user's context, checks a 60-minute
// response cache, enforces a 3/day per-user limit, and proxies to Claude.
//
// Context comes FROM THE CLIENT in the request body — the Cygne app stores
// products / journals / skinProfile in auth.user_metadata, not in tables, so
// the function doesn't query Postgres for those fields. Two cache + usage
// tables (ask_cygne_cache, ask_cygne_usage) are persisted server-side via
// the service role key.
//
// Body shape:
//   {
//     userId:    string         (required — auth user id)
//     question:  string         (required)
//     sessionId: string         (optional — for log correlation)
//     context:   string         (optional — pre-built context paragraph)
//     products:  Product[]      (optional — vanity products)
//     journals:  JournalEntry[] (optional — recent skin journal entries)
//     checkIns:  CheckIn[]      (optional — ritual check-ins)
//     skinProfile: object       (optional — onboarding profile)
//     skinType:  string         (optional)
//     concerns:  string[]       (optional)
//   }

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

// Convert client-side state into a single context paragraph for the prompt.
// All inputs are optional — return what we can describe, fall back politely.
function buildContextFromBody(body: any): string {
  if (typeof body.context === "string" && body.context.trim()) {
    return body.context.trim();
  }

  const parts: string[] = [];
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
    const inRoutine = body.products.filter((p: any) => p?.inRoutine !== false);
    const list = inRoutine.slice(0, 12)
      .map((p: any) => [p.brand, p.name].filter(Boolean).join(" "))
      .filter(Boolean);
    if (list.length) {
      parts.push(`In routine (${inRoutine.length} product${inRoutine.length === 1 ? "" : "s"}): ${list.join("; ")}.`);
    }
  }

  if (Array.isArray(body.journals) && body.journals.length) {
    const recent = body.journals.slice(-7);
    const conditions = recent.map((j: any) => j.condition).filter(Boolean);
    const sleepPoor = recent.filter((j: any) => j.sleep === "poor").length;
    const stressHigh = recent.filter((j: any) => j.stress === "high").length;
    const journalBits: string[] = [];
    if (conditions.length) journalBits.push(`recent skin: ${conditions.join(", ")}`);
    if (sleepPoor)         journalBits.push(`${sleepPoor} poor-sleep night${sleepPoor === 1 ? "" : "s"}`);
    if (stressHigh)        journalBits.push(`${stressHigh} high-stress day${stressHigh === 1 ? "" : "s"}`);
    if (journalBits.length) parts.push(`Last week — ${journalBits.join("; ")}.`);
  }

  if (Array.isArray(body.checkIns) && body.checkIns.length) {
    const recent = body.checkIns.slice(-5);
    const irritated = recent.filter((c: any) => c.irritation && c.irritation !== "none").length;
    const breakouts = recent.filter((c: any) => c.breakout).length;
    // Breakout locations live on the check-in (breakoutZones), not the journal.
    const zones = [...new Set(recent.flatMap((c: any) => c.breakoutZones || []))];
    const checkBits: string[] = [];
    if (irritated) checkBits.push(`${irritated} irritation flag${irritated === 1 ? "" : "s"}`);
    if (breakouts) checkBits.push(`${breakouts} breakout day${breakouts === 1 ? "" : "s"}`);
    if (zones.length) checkBits.push(`zones logged: ${zones.join(", ")}`);
    if (checkBits.length) parts.push(`Recent check-ins — ${checkBits.join(", ")}.`);
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
    const bodyBits: string[] = [];
    if (topTriggers.length) bodyBits.push(`triggers: ${topTriggers.join(", ")}`);
    if (topSymptoms.length) bodyBits.push(`symptoms: ${topSymptoms.join(", ")}`);
    if (bodyBits.length) parts.push(`Recent body log — ${bodyBits.join("; ")}.`);
  }

  return parts.join(" ") || "No detailed context provided.";
}

const SYSTEM_PROMPT_BASE = `You are Cygne, a luxury skincare expert and the user's personal skin ritual guide.

YOUR RULES:
- Respond in 3-5 sentences maximum. Be concise.
- Be empathetic, warm, and clinical — like a knowledgeable friend who is also an expert.
- Reference the user's SPECIFIC products and patterns from their context whenever relevant — never give generic advice if context is available.
- If you identify a potential ingredient conflict, name the specific products involved.
- Always end with one concrete, actionable next step.
- Never diagnose medical conditions.
- Always include this exact line at the end: "Note: Cygne provides skincare guidance, not medical advice. For persistent concerns, consult a dermatologist."
- Tone: editorial, never clinical or chatbot-like.
- Never use bullet points — write in flowing prose only.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      console.error("[ask-cygne] ANTHROPIC_API_KEY not set");
      return json({ error: "Server misconfigured: missing API key" }, 500);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { userId, question, sessionId } = body;
    if (!userId || !question?.trim()) {
      return json({ error: "Missing userId or question" }, 400);
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
      return json({ response: cached.response, cached: true });
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
      // Return 200 with a soft-error payload so supabase-js surfaces the
      // body to the client. (Functions invoke() drops the body on non-2xx.)
      return json({
        error: "limit_reached",
        message:
          "You have used your 3 deep reflections for today. Return tomorrow for fresh insight.",
      }, 200);
    }

    // ── C. BUILD CONTEXT ──────────────────────────────────────────────────────
    const contextSummary = buildContextFromBody(body);
    const systemPrompt = `${SYSTEM_PROMPT_BASE}\n\nUSER CONTEXT:\n${contextSummary}`;

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
      return json({ error: "AI request failed", status: claudeRes.status, body: errBody.slice(0, 400) }, 502);
    }

    let responseText = "";
    const reader = claudeRes.body!.getReader();
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
      return json({ error: "Empty response from AI" }, 502);
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
    return json({ response: responseText, cached: false });

  } catch (err) {
    console.error("[ask-cygne] exception:", err);
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
