// Supabase Edge Function: ask-cygne
// Accepts a skincare question, checks cache + daily usage limit, fetches
// user context, calls Claude, and returns a personalised response.

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

    const { userId, question, sessionId } = await req.json();
    if (!userId || !question?.trim()) {
      return json({ error: "Missing userId or question" }, 400);
    }
    const q = question.trim();

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
      return json({
        error: "limit_reached",
        message:
          "You have used your 3 deep reflections for today. Return tomorrow for fresh insight.",
      }, 429);
    }

    // ── C. FETCH USER CONTEXT ─────────────────────────────────────────────────
    const sevenDaysAgo   = new Date(Date.now() - 7  * 86_400_000).toISOString();
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();

    const [
      { data: ritualLogs },
      { data: vanityProducts },
      { data: journalEntries },
      { data: skinProfile },
    ] = await Promise.all([
      db.from("ritual_logs")
        .select("product_name, step_category, used_date, completed")
        .eq("user_id", userId)
        .gte("used_date", sevenDaysAgo),
      db.from("vanity_products")
        .select("product_name, brand, category, key_ingredients")
        .eq("user_id", userId),
      db.from("skin_journal")
        .select("note, skin_feel, logged_date")
        .eq("user_id", userId)
        .gte("logged_date", fourteenDaysAgo),
      db.from("skin_profiles")
        .select("skin_goals, skin_frustration, climate, stress_level, sleep_hours")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    // ── D. SUMMARISE CONTEXT ──────────────────────────────────────────────────
    let ritualSummary = "No ritual log data available for this user.";
    if (ritualLogs?.length) {
      const completed   = ritualLogs.filter((r) => r.completed).length;
      const productNames = [...new Set(ritualLogs.map((r) => r.product_name).filter(Boolean))];
      ritualSummary =
        `User has completed ${completed} ritual steps in the last 7 days. ` +
        `Products used include: ${productNames.join(", ") || "none recorded"}.`;
    }

    let vanitySummary = "No vanity product data available.";
    if (vanityProducts?.length) {
      const list = vanityProducts
        .map((p) => [p.brand, p.product_name].filter(Boolean).join(" "))
        .filter(Boolean);
      vanitySummary =
        `Current vanity contains ${vanityProducts.length} product(s): ${list.join(", ")}.`;
    }

    let journalSummary = "No recent skin journal entries.";
    if (journalEntries?.length) {
      const notes    = journalEntries.map((j) => j.note).filter(Boolean);
      const feelings = journalEntries.map((j) => j.skin_feel).filter(Boolean);
      journalSummary =
        "User has noted the following skin observations: " +
        (notes.length ? notes.join("; ") : "no text notes") +
        `. Skin feel logged: ${feelings.join(", ") || "not recorded"}.`;
    }

    let profileSummary = "No skin profile data available.";
    if (skinProfile) {
      const parts: string[] = [];
      if (skinProfile.skin_goals)       parts.push(`Goals: ${skinProfile.skin_goals}`);
      if (skinProfile.skin_frustration) parts.push(`Frustrations: ${skinProfile.skin_frustration}`);
      if (skinProfile.climate)          parts.push(`Climate: ${skinProfile.climate}`);
      if (skinProfile.stress_level)     parts.push(`Stress level: ${skinProfile.stress_level}`);
      if (skinProfile.sleep_hours)      parts.push(`Sleep: ${skinProfile.sleep_hours} hours`);
      if (parts.length) profileSummary = parts.join(". ") + ".";
    }

    // ── E. SYSTEM PROMPT ──────────────────────────────────────────────────────
    const systemPrompt = `You are Cygne, a luxury skincare expert and the user's personal skin ritual guide.

USER CONTEXT:
${ritualSummary}
${vanitySummary}
${journalSummary}
${profileSummary}

YOUR RULES:
- Respond in 3-5 sentences maximum. Be concise.
- Be empathetic, warm, and clinical — like a knowledgeable friend who is also an expert
- Reference the user's SPECIFIC products and patterns from their context — never give generic advice
- If you identify a potential ingredient conflict, name the specific products involved
- Always end with one concrete, actionable next step
- Never diagnose medical conditions
- Always include this exact line at the end: "Note: Cygne provides skincare guidance, not medical advice. For persistent concerns, consult a dermatologist."
- Tone: editorial, never clinical or chatbot-like
- Never use bullet points — write in flowing prose only`;

    // ── F. CALL CLAUDE (streaming to avoid idle-timeout on the TCP connection) ──
    console.log("[ask-cygne] calling Claude for user", userId, "session", sessionId);
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        stream: true,
        system: systemPrompt,
        messages: [{ role: "user", content: q }],
      }),
    });

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text();
      console.error("[ask-cygne] Claude error:", claudeRes.status, errBody.slice(0, 400));
      return json({ error: "AI request failed" }, 502);
    }

    // Read the SSE stream and collect all text_delta chunks into a single string.
    let responseText = "";
    const reader = claudeRes.body!.getReader();
    const decoder = new TextDecoder();
    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") break outer;
        try {
          const evt = JSON.parse(payload);
          if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
            responseText += evt.delta.text;
          }
        } catch { /* ignore malformed lines */ }
      }
    }

    if (!responseText) return json({ error: "Empty response from AI" }, 502);

    // ── G. SAVE CACHE + USAGE ─────────────────────────────────────────────────
    const now = new Date().toISOString();
    await Promise.all([
      db.from("ask_cygne_cache").insert({
        user_id: userId, question: q, response: responseText, created_at: now,
      }),
      db.from("ask_cygne_usage").insert({ user_id: userId, created_at: now }),
    ]);

    console.log("[ask-cygne] done for user", userId);
    return json({ response: responseText, cached: false });

  } catch (err) {
    console.error("[ask-cygne] exception:", err);
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
