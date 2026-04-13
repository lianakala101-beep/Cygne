import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://mxcefgbaaylddnyxrnao.supabase.co";
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14Y2VmZ2JhYXlsZGRueXhybmFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMzY5NzIsImV4cCI6MjA4OTYxMjk3Mn0.OlxfQmisO9qwde7hbp7-R5pfO8ZJ0cak4s7kw06Sqlk";

console.log("[Cygne] Supabase URL:", supabaseUrl);
console.log("[Cygne] Supabase key prefix:", supabaseAnonKey.substring(0, 20) + "...");

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/** Call a Supabase edge function via direct fetch — gives full error visibility */
export async function invokeEdgeFunction(functionName, body) {
  const url = supabaseUrl + "/functions/v1/" + functionName;
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  console.log("[Cygne edge] POST", url);
  console.log("[Cygne edge] auth:", token ? "session token" : "NO TOKEN");
  console.log("[Cygne edge] payload size:", JSON.stringify(body).length, "bytes");

  if (!token) {
    throw new Error("Not signed in. Please log out and sign in again.");
  }

  // Try without apikey header first (works if edge function has --no-verify-jwt)
  // The sb_publishable_ key format is not a valid JWT and gets rejected by the gateway
  let response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token,
    },
    body: JSON.stringify(body),
  });

  console.log("[Cygne edge] response (no apikey):", response.status, response.statusText);

  // If 401 without apikey, try with apikey — maybe the gateway requires it
  if (response.status === 401) {
    console.log("[Cygne edge] retrying with apikey header...");
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
        "apikey": supabaseAnonKey,
      },
      body: JSON.stringify(body),
    });
    console.log("[Cygne edge] response (with apikey):", response.status, response.statusText);
  }

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("[Cygne edge] ERROR " + response.status + ":", errorBody);

    // If still 401, the session token is likely expired/invalid
    if (response.status === 401) {
      console.error("[Cygne edge] JWT invalid — session may be expired. Try signing out and back in.");
      // Try to refresh the session
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.error("[Cygne edge] session refresh failed:", refreshError.message);
        throw new Error("Session expired. Please sign out and sign in again, then retry the scan.");
      }
      // Retry once with the refreshed token
      const { data: { session: newSession } } = await supabase.auth.getSession();
      if (newSession?.access_token) {
        console.log("[Cygne edge] retrying with refreshed token...");
        const retryResponse = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + newSession.access_token,
          },
          body: JSON.stringify(body),
        });
        console.log("[Cygne edge] retry response:", retryResponse.status);
        if (retryResponse.ok) {
          return await retryResponse.json();
        }
        const retryBody = await retryResponse.text();
        console.error("[Cygne edge] retry ERROR:", retryBody);
        throw new Error("Scan failed after token refresh (" + retryResponse.status + "): " + retryBody.slice(0, 200));
      }
      throw new Error("Session expired. Please sign out and sign in again.");
    }

    throw new Error("Edge function " + response.status + ": " + (errorBody || response.statusText).slice(0, 300));
  }

  const data = await response.json();
  return data;
}
