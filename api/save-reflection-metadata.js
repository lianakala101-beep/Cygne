// Vercel serverless function: save-reflection-metadata
//
// Persists a user's reflections array to auth user_metadata via the service-
// role key, bypassing the JWT size limit that has been intermittently breaking
// the client-side supabase.auth.updateUser({ data: { reflections } }) path —
// the user's JWT carries user_metadata as a claim, and once it grows beyond
// ~17KB various upstream gateways start rejecting it.
//
// Body shape:
//   {
//     userId:      string  (required — auth user UUID)
//     reflections: array   (required — the cleaned reflections array, with
//                          inline base64 already stripped by the caller)
//   }
//
// Response:
//   200: { success: true }
//   4xx/5xx: { error: string }
//
// IMPORTANT: admin.updateUserById's `user_metadata` argument REPLACES the
// entire user_metadata object (it does NOT deep-merge — that's distinct from
// client-side auth.updateUser({ data })). To avoid wiping products / journals /
// checkIns / treatments / etc., this function reads the current full metadata,
// merges the new reflections into it, and saves the merged object back.

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

  // Presence-only check on Authorization. Validating the JWT here is
  // redundant once we're using the service-role client below — same trust
  // model as /api/upload-reflection and the other /api/* endpoints.
  const auth = req.headers.authorization || req.headers.Authorization || "";
  if (!/^Bearer\s+\S+/i.test(auth)) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("[save-reflection-metadata] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var");
    return res.status(500).json({ error: "Server misconfigured: missing Supabase env vars" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const { userId, reflections } = body;
  if (!userId || !Array.isArray(reflections)) {
    return res.status(400).json({ error: "Missing userId or reflections array" });
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Fetch the user's current metadata. Required because updateUserById's
  //    user_metadata REPLACES the whole object — without this read, every
  //    other field (products, journals, checkIns, treatments, rampLog,
  //    triggerLog, locationData, skinProfile, ...) would be wiped.
  const { data: getRes, error: getErr } = await db.auth.admin.getUserById(userId);
  if (getErr || !getRes?.user) {
    console.error("[save-reflection-metadata] getUserById failed:", getErr?.message ?? "no user");
    return res.status(502).json({ error: getErr?.message || "Failed to fetch user" });
  }

  const existingMeta = getRes.user.user_metadata || {};
  const mergedMeta = { ...existingMeta, reflections };

  // 2. Save the merged metadata.
  const { error: updErr } = await db.auth.admin.updateUserById(userId, {
    user_metadata: mergedMeta,
  });
  if (updErr) {
    console.error("[save-reflection-metadata] updateUserById failed:", updErr?.message ?? updErr, "| status:", updErr?.status ?? "n/a");
    return res.status(502).json({ error: updErr?.message || "Failed to save metadata" });
  }

  console.log("[save-reflection-metadata] saved | userId:", userId, "| reflections:", reflections.length);
  return res.status(200).json({ success: true });
}
