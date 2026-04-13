import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://mxcefgbaaylddnyxrnao.supabase.co";
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14Y2VmZ2JhYXlsZGRueXhybmFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMzY5NzIsImV4cCI6MjA4OTYxMjk3Mn0.OlxfQmisO9qwde7hbp7-R5pfO8ZJ0cak4s7kw06Sqlk";

console.log("[Cygne] Supabase URL:", supabaseUrl);
console.log("[Cygne] Supabase key prefix:", supabaseAnonKey.substring(0, 20) + "...");

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/** Call a Supabase edge function via direct fetch — gives full error visibility */
export async function invokeEdgeFunction(functionName, body) {
  const url = supabaseUrl + "/functions/v1/" + functionName;

  console.log("[Cygne edge] POST", url);
  console.log("[Cygne edge] payload size:", JSON.stringify(body).length, "bytes");

  // Use the anon key as both apikey and Authorization bearer token.
  // The anon key is a valid JWT that the gateway accepts.
  // The edge function is an Anthropic proxy — it doesn't need user identity.
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + supabaseAnonKey,
      "apikey": supabaseAnonKey,
    },
    body: JSON.stringify(body),
  });

  console.log("[Cygne edge] response:", response.status, response.statusText);

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("[Cygne edge] ERROR " + response.status + ":", errorBody);
    throw new Error("Edge function " + response.status + ": " + (errorBody || response.statusText).slice(0, 300));
  }

  const data = await response.json();
  return data;
}
