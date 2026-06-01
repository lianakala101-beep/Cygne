// Vercel serverless function: sign-reflection
//
// Returns a fresh signed READ URL for a reflection triptych at a given storage
// path, generated server-side with the service-role key. The on-load refresh
// in the gallery has been failing with HTTP 400 because the client's bloated
// JWT exceeds the Storage gateway's Authorization-header limit; routing through
// here uses the small service-role credential instead so the gateway is happy.
//
// Body shape:
//   {
//     userId: string  (required — auth user UUID)
//     path:   string  (required — storage path, e.g. "<uid>/<entryId>.jpg")
//   }
//
// Response:
//   200: { url: string }   (7-day signed URL)
//   4xx/5xx: { error: string }
//
// Safety: even though the service-role client could sign any path, we verify
// the requested path's first folder segment equals the caller-supplied userId.
// That mirrors the RLS rule on the reflections bucket (`(storage.foldername
// (name))[1] = auth.uid()::text`) and prevents the endpoint from being abused
// to sign URLs into another user's folder.

import { createClient } from "@supabase/supabase-js";

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

  // Presence-only check on Authorization — same trust model as the rest of
  // /api/*. We don't validate the JWT itself; the path-vs-userId check below
  // is what scopes signed URLs to the caller.
  const auth = req.headers.authorization || req.headers.Authorization || "";
  if (!/^Bearer\s+\S+/i.test(auth)) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("[sign-reflection] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var");
    return res.status(500).json({ error: "Server misconfigured: missing Supabase env vars" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const { userId, path } = body;
  if (!userId || !path) {
    return res.status(400).json({ error: "Missing userId or path" });
  }

  // Defense in depth: the service-role client bypasses RLS, so without this
  // guard a caller could ask for a signed URL into someone else's folder.
  if (!String(path).startsWith(`${userId}/`)) {
    return res.status(403).json({ error: "Path does not belong to userId" });
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await db.storage
    .from("reflections")
    .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 days

  if (error || !data?.signedUrl) {
    console.error("[sign-reflection] createSignedUrl failed:", error?.message ?? "no url", "| status:", error?.status ?? "n/a", "| path:", path);
    return res.status(502).json({ error: error?.message || "Failed to sign URL" });
  }

  console.log("[sign-reflection] signed | path:", path);
  return res.status(200).json({ url: data.signedUrl });
}
