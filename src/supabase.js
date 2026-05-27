import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://mxcefgbaaylddnyxrnao.supabase.co";
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14Y2VmZ2JhYXlsZGRueXhybmFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMzY5NzIsImV4cCI6MjA4OTYxMjk3Mn0.OlxfQmisO9qwde7hbp7-R5pfO8ZJ0cak4s7kw06Sqlk";

console.log("[Cygne] Supabase URL:", supabaseUrl);
console.log("[Cygne] Supabase key prefix:", supabaseAnonKey.substring(0, 20) + "...");

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
    res = await fetch(`/api/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error("[Cygne edge] network error:", e);
    throw new Error(e?.message || "Edge function call failed");
  }

  let data = null;
  try { data = await res.json(); } catch { /* non-JSON / empty body */ }

  if (!res.ok) {
    const message = data?.error || `Edge function returned ${res.status}`;
    console.error("[Cygne edge] error:", res.status, data);
    throw new Error(message);
  }

  // Bump count only on success so a network/Anthropic failure doesn't burn
  // a credit. Limit-bypass risk is bounded because the cap is checked
  // before each call.
  if (limit) bumpEdgeCount(functionName);

  console.log("[Cygne edge] success, response type:", typeof data);
  return data;
}
