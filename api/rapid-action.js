// Vercel serverless function: rapid-action
//
// Ported from supabase/functions/rapid-action. Forwards an image + prompt
// payload to the Anthropic Messages API and returns the response verbatim.

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, x-client-info, apikey, content-type",
  );
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
