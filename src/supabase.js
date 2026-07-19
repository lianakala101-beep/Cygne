import { createClient } from "@supabase/supabase-js";
import { API_BASE_URL } from "./config.js";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://mxcefgbaaylddnyxrnao.supabase.co";
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14Y2VmZ2JhYXlsZGRueXhybmFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMzY5NzIsImV4cCI6MjA4OTYxMjk3Mn0.OlxfQmisO9qwde7hbp7-R5pfO8ZJ0cak4s7kw06Sqlk";

console.log("[Cygne] Supabase URL:", supabaseUrl);
console.log("[Cygne] Supabase key prefix:", supabaseAnonKey.substring(0, 20) + "...");

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ---------------------------------------------------------------------------
// Client-side debug event logger
//
// Fire-and-forget writer to the debug_logs Supabase table. Complements
// console.log() at diagnostic sites when a device console isn't
// reachable (Safari Web Inspector unreliable on iOS; TestFlight builds
// don't always attach). All errors are swallowed — a failed debug
// write must never affect the caller's control flow. The user_id
// column is looked up freshly from the current session rather than
// captured from any outer scope, so a signed-out event lands with
// user_id: null instead of trying to attribute it to whoever was last
// signed in on this device.
//
// Usage:
//   logDebugEvent("paywall.getOfferings.start");
//   logDebugEvent("paywall.getOfferings.result", { current: "...", … });
//   logDebugEvent("paywall.getOfferings.error", { message, code, … });
//
// Query in the SQL editor:
//   select created_at, user_id, event, payload
//   from debug_logs
//   where event like 'paywall.%'
//   order by created_at desc
//   limit 100;
export async function logDebugEvent(event, payload = null) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from("debug_logs").insert({
      user_id: session?.user?.id ?? null,
      event: String(event).slice(0, 200),
      payload: payload == null ? null : payload,
    });
  } catch (e) {
    // Swallow. Emitting a console.error here would risk drowning out
    // the diagnostic we're trying to capture in the first place; the
    // caller has already logged the same info to the console.
  }
}

// ---------------------------------------------------------------------------
// Per-function daily call cap (client-side, per device).
//
// rapid-action is a thin pass-through to Anthropic's Messages API with
// image payloads (vision-token billing). It has no JWT verification and
// no server-side per-user cap, so a single user could spam dozens of
// scans in minutes. Cap at 20/day per device — enough for a first-vanity
// setup (5-10 products) plus shop-scans, blocks abuse.
//
// Keyed on the local date so the count resets automatically at midnight.
// Stale keys for prior days are pruned on every read so localStorage
// doesn't grow unbounded.
// ---------------------------------------------------------------------------
const DAILY_LIMITS = {
  "rapid-action": 20,
};

function rateLimitKey(functionName) {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `cygne_edge_count_${functionName}_${y}-${m}-${day}`;
}

function readEdgeCount(functionName) {
  try {
    const today = rateLimitKey(functionName);
    const prefix = `cygne_edge_count_${functionName}_`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix) && k !== today) {
        try { localStorage.removeItem(k); } catch { /* ignore */ }
      }
    }
    const v = localStorage.getItem(today);
    const n = v ? parseInt(v, 10) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch { return 0; }
}

function bumpEdgeCount(functionName) {
  try {
    const next = readEdgeCount(functionName) + 1;
    localStorage.setItem(rateLimitKey(functionName), String(next));
    return next;
  } catch { return 0; }
}

/** Call a Supabase edge function with a fresh session token */
export async function invokeEdgeFunction(functionName, body) {
  // --- Daily call cap ------------------------------------------------------
  // Refuse to fire if the function is rate-limited and the cap is already
  // reached. Error message flows through each caller's existing try/catch
  // and surfaces in their error-state UI ("Scan failed: …").
  const limit = DAILY_LIMITS[functionName];
  if (limit && readEdgeCount(functionName) >= limit) {
    const err = new Error(
      `Daily scan limit reached (${limit} per day). Come back tomorrow.`
    );
    err.code = "daily_limit_reached";
    console.warn("[Cygne edge]", functionName, "blocked by daily cap");
    throw err;
  }

  const { data: { session } } = await supabase.auth.getSession();
  console.log("[Cygne auth] session:", session ? "present" : "NULL", "token length:", session?.access_token?.length);
  console.log("[Cygne auth] token preview:", session?.access_token?.substring(0, 100));
  if (!session) {
    console.error("[Cygne edge] no session — user is not signed in");
    throw new Error("Not signed in. Please log in and try again.");
  }
  console.log("[Cygne edge] calling", functionName, "| payload:", JSON.stringify(body).length, "bytes");

  // Vercel serverless functions live under /api/<functionName> (same origin as
  // the app). They read userId from the body and handle auth themselves; we
  // still forward the session token for parity / future use.
  let res;
  try {
    res = await fetch(`${API_BASE_URL}/api/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error("[Cygne API] network error /api/" + functionName, e);
    throw new Error(e?.message || "Edge function call failed");
  }

  // Read the raw body as text first so we ALWAYS capture the underlying server
  // response — Vercel error pages are HTML, and res.json() would silently throw
  // and leave us with null instead of the real failure message. Parse to JSON
  // optionally; the raw text is what gets logged on failure.
  const rawText = await res.text().catch(() => "");
  let data = null;
  if (rawText) {
    try { data = JSON.parse(rawText); } catch { /* response wasn't JSON — keep rawText */ }
  }

  if (!res.ok) {
    // Surface the actual HTTP status + URL + raw body BEFORE Chrome can
    // relabel the failure as "Load failed" / "bad URL". This is the line that
    // tells you whether it's 401 (auth), 404 (not deployed), 500 (function
    // crash), 504 (timeout), 413 (payload too large), or something else.
    console.error("[Cygne API] HTTP", res.status, `/api/${functionName}`, rawText || "(empty body)");
    const message = data?.error || rawText || `Edge function returned ${res.status}`;
    throw new Error(message);
  }

  // Bump count only on success so a network/Anthropic failure doesn't burn
  // a credit. Limit-bypass risk is bounded because the cap is checked
  // before each call.
  if (limit) bumpEdgeCount(functionName);

  console.log("[Cygne edge] success, response type:", typeof data);
  return data;
}
