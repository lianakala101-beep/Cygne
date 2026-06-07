// Vercel serverless function: delete-account
//
// Permanently deletes a user and ALL their data. Steps run in order:
//
//   1. Delete rows from `check_ins` and `journals` where user_id = userId
//      (Phase 1 of the metadata migration moved these out of user_metadata
//      into proper tables — see migration 20260605...)
//   2. List + delete every file under reflections/<userId>/ in storage.
//   3. Call db.auth.admin.deleteUser(userId).
//      The auth row's ON DELETE CASCADE on user_id FKs would clean up the
//      tables in step 1 automatically, but we do them explicitly first so
//      partial failures still strip the data even if the admin call goes
//      sideways.
//
// Security:
//   We do NOT trust the userId from the body alone. The Authorization
//   Bearer token is validated via supabase.auth.getUser(token), and the
//   resulting `sub` claim must match the body's userId. Any mismatch
//   returns 403. This prevents a malicious caller from passing someone
//   else's userId with their own token.
//
// Body:
//   { userId: string }
//
// Response:
//   200: { success: true, deleted: { check_ins, journals, storage } }
//   4xx/5xx: { error: string, detail?: string }

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

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey     = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !serviceKey) {
      console.error("[delete-account] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return res.status(500).json({ error: "Server misconfigured: missing Supabase env vars" });
    }

    // ── 1. Extract the bearer token ────────────────────────────────────────
    const auth = req.headers.authorization || req.headers.Authorization || "";
    const m = /^Bearer\s+(\S+)$/i.exec(auth);
    if (!m) {
      return res.status(401).json({ error: "Missing or malformed Authorization header" });
    }
    const token = m[1];

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { userId } = body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    // ── 2. Validate the token and confirm sub === userId ──────────────────
    // Use the anon-key client + getUser(token) so Supabase validates the
    // JWT server-side. The returned user's id is the authoritative sub
    // claim — never trust the body's userId until it matches this.
    if (!anonKey) {
      console.error("[delete-account] missing SUPABASE_ANON_KEY for token validation");
      return res.status(500).json({ error: "Server misconfigured: missing anon key" });
    }
    const validator = createClient(supabaseUrl, anonKey);
    const { data: tokenUser, error: validateErr } = await validator.auth.getUser(token);
    if (validateErr || !tokenUser?.user?.id) {
      console.error("[delete-account] token validation failed:", validateErr?.message ?? "no user");
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    if (tokenUser.user.id !== userId) {
      console.error(
        "[delete-account] token/userId mismatch — token.sub:", tokenUser.user.id,
        "vs body.userId:", userId,
      );
      return res.status(403).json({ error: "Token does not match the userId being deleted" });
    }

    // ── 3. Service-role client for the actual deletes ─────────────────────
    const db = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    console.log("[delete-account] starting deletion for userId:", userId);

    // ── 4. Delete check_ins rows ──────────────────────────────────────────
    let checkInsDeleted = 0;
    {
      const { count, error } = await db
        .from("check_ins")
        .delete({ count: "exact" })
        .eq("user_id", userId);
      if (error) {
        console.error("[delete-account] check_ins delete failed:", error.message);
      } else {
        checkInsDeleted = count ?? 0;
        console.log("[delete-account] deleted", checkInsDeleted, "check_ins rows");
      }
    }

    // ── 5. Delete journals rows ───────────────────────────────────────────
    let journalsDeleted = 0;
    {
      const { count, error } = await db
        .from("journals")
        .delete({ count: "exact" })
        .eq("user_id", userId);
      if (error) {
        console.error("[delete-account] journals delete failed:", error.message);
      } else {
        journalsDeleted = count ?? 0;
        console.log("[delete-account] deleted", journalsDeleted, "journals rows");
      }
    }

    // ── 5b. Delete products rows (Phase 2 migration) ──────────────────────
    let productsDeleted = 0;
    {
      const { count, error } = await db
        .from("products")
        .delete({ count: "exact" })
        .eq("user_id", userId);
      if (error) {
        console.error("[delete-account] products delete failed:", error.message);
      } else {
        productsDeleted = count ?? 0;
        console.log("[delete-account] deleted", productsDeleted, "products rows");
      }
    }

    // ── 5c. Delete ramp_log rows (Phase 2 migration) ──────────────────────
    let rampLogDeleted = 0;
    {
      const { count, error } = await db
        .from("ramp_log")
        .delete({ count: "exact" })
        .eq("user_id", userId);
      if (error) {
        console.error("[delete-account] ramp_log delete failed:", error.message);
      } else {
        rampLogDeleted = count ?? 0;
        console.log("[delete-account] deleted", rampLogDeleted, "ramp_log rows");
      }
    }

    // ── 6. Delete every file under reflections/<userId>/ ──────────────────
    // Pagination: Supabase storage list() caps at ~1000 per call. A user
    // could in principle have more reflections, so loop until we get a
    // partial page back. Even at 52 reflections/year, the realistic
    // user takes years to exceed one page; this is mostly defensive.
    let storageDeleted = 0;
    try {
      const pageSize = 1000;
      let offset = 0;
      const allPaths = [];
      while (true) {
        const { data, error } = await db.storage.from("reflections").list(userId, {
          limit: pageSize,
          offset,
        });
        if (error) {
          console.error("[delete-account] storage list failed:", error.message);
          break;
        }
        if (!data || data.length === 0) break;
        for (const file of data) {
          if (file?.name) allPaths.push(`${userId}/${file.name}`);
        }
        if (data.length < pageSize) break;
        offset += pageSize;
      }
      if (allPaths.length > 0) {
        const { error: rmErr } = await db.storage.from("reflections").remove(allPaths);
        if (rmErr) {
          console.error("[delete-account] storage remove failed:", rmErr.message);
        } else {
          storageDeleted = allPaths.length;
          console.log("[delete-account] deleted", storageDeleted, "storage objects");
        }
      } else {
        console.log("[delete-account] no storage objects to delete");
      }
    } catch (e) {
      console.error("[delete-account] storage cleanup threw:", e?.message ?? e);
    }

    // ── 7. Delete the auth user ───────────────────────────────────────────
    // This is the irrevocable step. If it fails after the earlier deletes,
    // the user has lost their data but still owns the auth account — which
    // is worse than the inverse. Surface the error explicitly so the
    // client can show "deletion failed, contact support" and we get a
    // server-log line to follow up on.
    const { error: deleteErr } = await db.auth.admin.deleteUser(userId);
    if (deleteErr) {
      console.error("[delete-account] admin.deleteUser failed:", deleteErr.message);
      return res.status(502).json({
        error: "Account deletion failed at the final step",
        detail: deleteErr.message,
        partial: { check_ins: checkInsDeleted, journals: journalsDeleted, products: productsDeleted, ramp_log: rampLogDeleted, storage: storageDeleted },
      });
    }

    console.log(
      "[delete-account] complete | userId:", userId,
      "| check_ins:", checkInsDeleted,
      "| journals:", journalsDeleted,
      "| products:", productsDeleted,
      "| ramp_log:", rampLogDeleted,
      "| storage:", storageDeleted,
    );

    return res.status(200).json({
      success: true,
      deleted: { check_ins: checkInsDeleted, journals: journalsDeleted, products: productsDeleted, ramp_log: rampLogDeleted, storage: storageDeleted },
    });

  } catch (err) {
    console.error("[delete-account] handler threw:", err?.message ?? err);
    return res.status(500).json({ error: err?.message || "Internal error" });
  }
}
