// Supabase Edge Function: swan-sense-daily
//
// Produces one short editorial Swan Sense line per user per day, driven by
// Claude with the user's actual context (products / journals / check-ins /
// skinProfile / cycle). Cached server-side in ask_cygne_cache with a
// per-day question key so repeat dashboard mounts within the same day
// short-circuit to the cached line instead of re-calling Claude.
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
    if (profile.climate)            parts.push(`Climate: ${profile.climate}.`);
    if (profile.environment)        parts.push(`Environment: ${profile.environment}.`);
    if (profile.specialOccasion && profile.occasionDate) {
      parts.push(`Upcoming: ${profile.specialOccasion} on ${profile.occasionDate}.`);
    }
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
    const zones = [...new Set(recent.flatMap((j: any) => j.affectedZones || []))];
    const sleepPoor = recent.filter((j: any) => j.sleep === "poor").length;
    const stressHigh = recent.filter((j: any) => j.stress === "high").length;
    const bits: string[] = [];
    if (conditions.length) bits.push(`recent skin: ${conditions.join(", ")}`);
    if (zones.length)      bits.push(`zones flagged: ${zones.join(", ")}`);
    if (sleepPoor)         bits.push(`${sleepPoor} poor-sleep night${sleepPoor === 1 ? "" : "s"}`);
    if (stressHigh)        bits.push(`${stressHigh} high-stress day${stressHigh === 1 ? "" : "s"}`);
    if (bits.length) parts.push(`Last week — ${bits.join("; ")}.`);
  }
  if (Array.isArray(body.checkIns) && body.checkIns.length) {
    const recent = body.checkIns.slice(-5);
    const irr = recent.filter((c: any) => c.irritation && c.irritation !== "none").length;
    const brk = recent.filter((c: any) => c.breakout).length;
    const bits: string[] = [];
    if (irr) bits.push(`${irr} irritation flag${irr === 1 ? "" : "s"}`);
    if (brk) bits.push(`${brk} breakout day${brk === 1 ? "" : "s"}`);
    if (bits.length) parts.push(`Recent check-ins — ${bits.join(", ")}.`);
  }
  return parts.join(" ") || "No context recorded yet.";
}

const SYSTEM_PROMPT = `You are Cygne — a luxury skincare guide writing one short editorial line that opens the user's day on the home dashboard.

WRITE: one to two sentences total. Editorial. Observational. Never clinical, never a chatbot.
- Pull from the user's actual context — a real pattern, a cycle phase, a recent journal note, an active streak risk, a climate signal.
- Don't open with "Your skin…" — start anywhere else.
- No bullets, no lists, no markdown, no quotation marks around the line.
- No disclaimers, no medical advice, no "consult a dermatologist".
- If context is thin, write a soft seasonal or cycle-aware line.

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
        max_tokens: 120,
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
