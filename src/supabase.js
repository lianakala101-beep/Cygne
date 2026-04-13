import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://mxcefgbaaylddnyxrnao.supabase.co";
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_6kUbORFpskKo-zg6r0MZtA_x5ppPvin";

console.log("[Cygne] Supabase URL:", supabaseUrl);
console.log("[Cygne] Supabase key prefix:", supabaseAnonKey.substring(0, 20) + "...");

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/** Call a Supabase edge function via direct fetch — gives full error visibility */
export async function invokeEdgeFunction(functionName, body) {
  const url = supabaseUrl + "/functions/v1/" + functionName;
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || supabaseAnonKey;

  console.log("[Cygne edge] POST", url);
  console.log("[Cygne edge] auth:", session ? "session token" : "anon key only");
  console.log("[Cygne edge] payload size:", JSON.stringify(body).length, "bytes");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token,
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
