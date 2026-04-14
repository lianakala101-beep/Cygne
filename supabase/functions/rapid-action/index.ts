// Supabase Edge Function: rapid-action
// Forwards image + prompt payload to Anthropic Messages API and returns the response.
// JWT verification is disabled at the gateway (see supabase/config.toml).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // --- CORS preflight -------------------------------------------------------
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      console.error("[rapid-action] ANTHROPIC_API_KEY is not set");
      return new Response(
        JSON.stringify({ error: "Server misconfigured: missing API key" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const payload = await req.json();
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
      return new Response(
        JSON.stringify({ error: "Anthropic API error", status: resp.status, body }),
        {
          status: resp.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(body, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[rapid-action] exception:", err);
    return new Response(
      JSON.stringify({ error: String(err?.message || err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
