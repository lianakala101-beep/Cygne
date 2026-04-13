import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://mxcefgbaaylddnyxrnao.supabase.co";
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14Y2VmZ2JhYXlsZGRueXhybmFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMzY5NzIsImV4cCI6MjA4OTYxMjk3Mn0.OlxfQmisO9qwde7hbp7-R5pfO8ZJ0cak4s7kw06Sqlk";

console.log("[Cygne] Supabase URL:", supabaseUrl);
console.log("[Cygne] Supabase key prefix:", supabaseAnonKey.substring(0, 20) + "...");

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/** Call a Supabase edge function with a fresh session token */
export async function invokeEdgeFunction(functionName, body) {
  const { data: { session } } = await supabase.auth.getSession();
  console.log("[Cygne edge] calling", functionName, "| auth:", session ? "session" : "anon-only", "| payload:", JSON.stringify(body).length, "bytes");

  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {},
  });

  if (error) {
    console.error("[Cygne edge] error:", error);
    throw new Error(error.message || "Edge function call failed");
  }

  console.log("[Cygne edge] success, response type:", typeof data);
  return data;
}
