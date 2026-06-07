#!/usr/bin/env node
// scripts/migrate-products-ramplog.js
//
// Phase 2 backfill: move a single user's `user_metadata.products` and
// `user_metadata.rampLog` into the per-collection products and ramp_log
// tables (created by the matching SQL migration), then strip those keys
// from user_metadata so the JWT stops carrying them.
//
// Mirrors scripts/migrate-checkins-journals.js (Phase 1).
//
// What it does, in order:
//   1. Reads `user_metadata` for the given userId via admin.getUserById.
//   2. Logs the pre-migration byte counts.
//   3. Upserts every product into the `products` table, keyed by
//      (user_id, client_id) where client_id is the row's `id` field.
//   4. Upserts every rampLog entry into the `ramp_log` table, keyed by
//      (user_id, client_id) where client_id is `${productId}_${timestamp}`
//      — timestamp alone isn't unique (auto-graduate / auto-enroll can
//      emit many entries in one tick sharing the same nowIso).
//   5. Removes `products` and `rampLog` from `user_metadata` via a
//      READ-MERGE-WRITE admin.updateUserById (admin.updateUserById's
//      `user_metadata` argument REPLACES the entire object, so the
//      surviving fields — treatments / skinProfile / triggerLog /
//      reflections / waitingRoom / preferences / etc. — must be
//      preserved by spreading them back in).
//   6. Re-fetches and logs the post-migration metadata byte count.
//
// Usage:
//   SUPABASE_URL=https://<project>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
//   node scripts/migrate-products-ramplog.js <userId>
//
// IMPORTANT:
//   The service role key bypasses ALL row-level security. Never commit
//   it, never paste it into a chat or PR, never use it client-side. Run
//   locally with env vars exported in your shell.
//
//   The script is idempotent: re-running it after a partial migration
//   re-upserts (same client_ids) and re-strips (no-op if the keys are
//   already gone), so it's safe to retry.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

function bail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!SUPABASE_URL) bail("Missing SUPABASE_URL env var.");
if (!SERVICE_KEY)  bail("Missing SUPABASE_SERVICE_ROLE_KEY env var.");

const userId = process.argv[2];
if (!userId) bail("Usage: node scripts/migrate-products-ramplog.js <userId>");

const bytes = (v) => JSON.stringify(v ?? "").length;

async function main() {
  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 1. Read current user_metadata ───────────────────────────────────────
  const { data: userRes, error: getErr } = await db.auth.admin.getUserById(userId);
  if (getErr || !userRes?.user) {
    bail(`Failed to fetch user ${userId}: ${getErr?.message ?? "no user"}`);
  }
  const existingMeta = userRes.user.user_metadata || {};
  const products = Array.isArray(existingMeta.products) ? existingMeta.products : [];
  const rampLog  = Array.isArray(existingMeta.rampLog)  ? existingMeta.rampLog  : [];

  const beforeMetaBytes = bytes(existingMeta);
  const productsBytes   = bytes(products);
  const rampLogBytes    = bytes(rampLog);

  console.log("[migrate] userId:", userId);
  console.log("[migrate] pre  user_metadata bytes:", beforeMetaBytes);
  console.log("[migrate] pre  products count / bytes:", products.length, "/", productsBytes);
  console.log("[migrate] pre  rampLog  count / bytes:", rampLog.length,  "/", rampLogBytes);

  // ── 2. Upsert products ───────────────────────────────────────────────────
  if (products.length > 0) {
    const rows = products
      .filter(p => p && p.id != null)
      .map(p => ({ user_id: userId, client_id: String(p.id), data: p }));
    const skipped = products.length - rows.length;
    if (skipped > 0) {
      console.warn("[migrate] WARN skipped", skipped, "products missing an `id` field — no stable client_id");
    }
    if (rows.length > 0) {
      const { error: upErr } = await db.from("products").upsert(rows, {
        onConflict: "user_id,client_id",
      });
      if (upErr) bail(`products upsert failed: ${upErr.message}`);
      console.log("[migrate] upserted", rows.length, "products rows");
    }
  } else {
    console.log("[migrate] no products to migrate");
  }

  // ── 3. Upsert rampLog ────────────────────────────────────────────────────
  if (rampLog.length > 0) {
    const rows = rampLog
      .filter(e => e && e.productId && e.timestamp)
      .map(e => ({ user_id: userId, client_id: `${e.productId}_${e.timestamp}`, data: e }));
    const skipped = rampLog.length - rows.length;
    if (skipped > 0) {
      console.warn("[migrate] WARN skipped", skipped, "rampLog entries missing productId or timestamp — no stable client_id");
    }
    if (rows.length > 0) {
      const { error: upErr } = await db.from("ramp_log").upsert(rows, {
        onConflict: "user_id,client_id",
      });
      if (upErr) bail(`ramp_log upsert failed: ${upErr.message}`);
      console.log("[migrate] upserted", rows.length, "ramp_log rows");
    }
  } else {
    console.log("[migrate] no rampLog entries to migrate");
  }

  // ── 4. Strip products + rampLog from user_metadata (read-merge-write) ──
  const { products: _drop1, rampLog: _drop2, ...kept } = existingMeta;
  const { error: updErr } = await db.auth.admin.updateUserById(userId, {
    user_metadata: kept,
  });
  if (updErr) bail(`updateUserById failed: ${updErr.message}`);

  // ── 5. Verify post-migration metadata size ──────────────────────────────
  const { data: afterRes, error: afterErr } = await db.auth.admin.getUserById(userId);
  if (afterErr || !afterRes?.user) {
    bail(`Failed to re-fetch user ${userId} after migration: ${afterErr?.message ?? "no user"}`);
  }
  const afterMeta = afterRes.user.user_metadata || {};
  const afterMetaBytes = bytes(afterMeta);
  const stripped = beforeMetaBytes - afterMetaBytes;

  console.log("[migrate] post user_metadata bytes:", afterMetaBytes);
  console.log("[migrate] stripped from metadata:  ", stripped, "bytes (", productsBytes + rampLogBytes, "expected)");
  console.log("[migrate] products key present after:", "products" in afterMeta);
  console.log("[migrate] rampLog  key present after:", "rampLog"  in afterMeta);
  console.log("[migrate] done.");
}

main().catch(e => {
  console.error("[migrate] threw:", e?.message ?? e);
  process.exit(1);
});
