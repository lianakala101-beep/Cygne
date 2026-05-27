// Vercel serverless function: rapid-action
//
// Ported from supabase/functions/rapid-action. Forwards an image + prompt
// payload to the Anthropic Messages API and returns the response verbatim.
//
// Personalization: before forwarding, we resolve the caller from the
// Authorization header and prepend a "skin baseline" block (skin profile,
// recent check-ins, recent reflections) to the payload's system prompt so the
// model interprets the image with the user's history in mind. This is
// best-effort — any failure leaves the original payload untouched so image
// analysis still runs.

import { createClient } from "@supabase/supabase-js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, x-client-info, apikey, content-type",
  );
}

// rapid-action's body is a raw Anthropic payload with no userId, so identity
// comes from the Authorization header. db.auth.getUser(token) validates the
// JWT with the service-role client and returns the user incl. user_metadata.
async function getUserFromAuthHeader(db, req) {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return null;
    const { data, error } = await db.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
  } catch (e) {
    console.error("[rapid-action] auth lookup failed:", e?.message ?? e);
    return null;
  }
}

// Build the skin-baseline block from auth user_metadata. Keys are camelCase as
// stored by the app (skinType, concerns, skinProfile, checkIns, reflections).
function buildSkinContext(user) {
  const meta = user?.user_metadata || {};
  const parts = [];

  // ── Skin profile: type, concerns, goals ──────────────────────────────────
  const skinType = meta.skinType || meta.skinProfile?.skinType;
  if (skinType) parts.push(`Skin type: ${skinType}.`);
  const concerns = meta.concerns || meta.skinProfile?.concerns;
  if (Array.isArray(concerns) && concerns.length) {
    parts.push(`Concerns: ${concerns.join(", ")}.`);
  }
  const goals = meta.skinProfile?.skinGoals;
  if (Array.isArray(goals) && goals.length) {
    parts.push(`Goals: ${goals.join(", ")}.`);
  }

  // ── Last 7 days of check-ins: breakout zones, irritation, breakout ───────
  if (Array.isArray(meta.checkIns) && meta.checkIns.length) {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = meta.checkIns.filter(
      (c) => c?.date && new Date(c.date).getTime() >= weekAgo,
    );
    if (recent.length) {
      const irr = recent.filter((c) => c.irritation && c.irritation !== "none").length;
      const brk = recent.filter((c) => c.breakout).length;
      const zones = [...new Set(recent.flatMap((c) => c.breakoutZones || []))];
      const bits = [];
      if (irr) bits.push(`${irr} irritation flag${irr === 1 ? "" : "s"}`);
      if (brk) bits.push(`${brk} breakout day${brk === 1 ? "" : "s"}`);
      if (zones.length) bits.push(`breakout zones: ${zones.join(", ")}`);
      if (bits.length) parts.push(`Last 7 days of check-ins — ${bits.join(", ")}.`);
    }
  }

  // ── Last 3 reflections, insight text only ────────────────────────────────
  if (Array.isArray(meta.reflections) && meta.reflections.length) {
    const recent = meta.reflections
      .filter((r) => r?.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 3);
    const lines = recent.map((r) => {
      const date = (r.date || "").split("T")[0];
      const note = r.insight
        ? [r.insight.headline, r.insight.detail].filter(Boolean).join(" — ")
        : "(no insight recorded)";
      return `- ${date}: ${note}`;
    });
    if (lines.length) parts.push(`Recent reflections (last ${lines.length}):\n${lines.join("\n")}`);
  }

  if (!parts.length) return "";
  return `USER SKIN BASELINE (the caller's logged history and current skin state — use it when interpreting the image):\n${parts.join("\n")}`;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("[rapid-action] ANTHROPIC_API_KEY is not set");
      return res.status(500).json({ error: "Server misconfigured: missing API key" });
    }

    const payload = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    console.log(
      "[rapid-action] payload received | model:",
      payload?.model,
      "| max_tokens:",
      payload?.max_tokens,
      "| messages:",
      Array.isArray(payload?.messages) ? payload.messages.length : 0,
    );

    // ── Personalize: prepend the user's skin baseline to the system prompt ───
    // Best-effort — never let this block image analysis.
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supabaseUrl && serviceKey) {
        const db = createClient(supabaseUrl, serviceKey);
        const user = await getUserFromAuthHeader(db, req);
        const skinContext = user ? buildSkinContext(user) : "";
        if (skinContext) {
          payload.system = payload.system
            ? `${skinContext}\n\n${payload.system}`
            : skinContext;
          console.log("[rapid-action] personalized with skin baseline | chars:", skinContext.length);
        }
      }
    } catch (e) {
      console.error("[rapid-action] personalization skipped:", e?.message ?? e);
    }

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });

    const body = await resp.text();
    if (!resp.ok) {
      console.error("[rapid-action] anthropic error:", resp.status, body.slice(0, 500));
      return res.status(resp.status).json({ error: "Anthropic API error", status: resp.status, body });
    }

    res.setHeader("Content-Type", "application/json");
    return res.status(200).send(body);
  } catch (err) {
    console.error("[rapid-action] exception:", err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
