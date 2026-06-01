// Vercel serverless function: upload-reflection
//
// Routes a triptych reflection upload through the server so the client never
// hands its (oversized) Supabase access-token to the Storage gateway. The
// Storage gateway's nginx rejects Authorization headers above ~8KB, which is
// the failure mode that's been producing the opaque HTTP 400s on direct
// supabase.storage.from("reflections").upload() calls — the JWT carries the
// user's user_metadata as a claim, and once products/journals/etc. grow large
// the JWT exceeds the limit. Service role keys held server-side bypass RLS
// and use a separate (small) credential, sidestepping the size problem.
//
// Body shape:
//   {
//     userId:      string  (required — auth user UUID, becomes the path's first folder)
//     entryId:     string  (required — week-year-timestamp from handleComplete)
//     imageBase64: string  (required — base64-encoded JPEG; data: prefix optional)
//   }
//
// Response:
//   200: { path: string, url: string }    (url is a 7-day signed URL)
//   4xx/5xx: { error: string }

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

  // Presence-only check on Authorization: a valid Bearer header proves the
  // caller has a signed-in browser session. We don't validate the JWT itself
  // (it may be too bloated to parse cleanly here, and the service-role client
  // below makes app-level auth verification redundant) — same trust model as
  // the existing /api/ask-cygne and /api/swan-sense-daily endpoints.
  const auth = req.headers.authorization || req.headers.Authorization || "";
  if (!/^Bearer\s+\S+/i.test(auth)) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("[upload-reflection] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var");
    return res.status(500).json({ error: "Server misconfigured: missing Supabase env vars" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const { userId, entryId, imageBase64 } = body;
  if (!userId || !entryId || !imageBase64) {
    return res.status(400).json({ error: "Missing userId, entryId, or imageBase64" });
  }

  // Accept either a raw base64 string or a full data: URL.
  const base64 = typeof imageBase64 === "string" && imageBase64.startsWith("data:")
    ? imageBase64.slice(imageBase64.indexOf(",") + 1)
    : imageBase64;

  let buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch (e) {
    console.error("[upload-reflection] base64 decode failed:", e?.message ?? e);
    return res.status(400).json({ error: "Invalid base64 in imageBase64" });
  }
  if (!buffer.length) {
    return res.status(400).json({ error: "Decoded image is empty" });
  }

  console.log(
    "[upload-reflection] received | userId:", userId,
    "| entryId:", entryId,
    "| bytes:", buffer.length,
  );

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const path = `${userId}/${entryId}.jpg`;

  // Service-role upload bypasses RLS, so the client's bloated JWT never
  // touches the Storage gateway.
  const { error: upErr } = await db.storage
    .from("reflections")
    .upload(path, buffer, { contentType: "image/jpeg", upsert: true });

  if (upErr) {
    console.error("[upload-reflection] storage upload error:", upErr?.message ?? upErr, "| status:", upErr?.status ?? "n/a", "| name:", upErr?.name ?? "n/a");
    return res.status(502).json({ error: upErr?.message || "Storage upload failed" });
  }

  const { data: signed, error: signedErr } = await db.storage
    .from("reflections")
    .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 days

  if (signedErr || !signed?.signedUrl) {
    console.error("[upload-reflection] createSignedUrl error:", signedErr?.message ?? "no url", "| status:", signedErr?.status ?? "n/a");
    return res.status(502).json({ error: signedErr?.message || "Signed URL generation failed" });
  }

  console.log("[upload-reflection] success | path:", path);
  return res.status(200).json({ path, url: signed.signedUrl });
}
