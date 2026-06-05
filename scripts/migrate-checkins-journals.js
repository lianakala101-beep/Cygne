#!/usr/bin/env node
// scripts/migrate-checkins-journals.js
//
// Phase 1 backfill: move a single user's `user_metadata.checkIns` and
// `user_metadata.journals` arrays into the per-collection check_ins and
// journals tables (created by the matching SQL migration), then strip
// those keys from user_metadata so the JWT stops carrying them.
//
// What it does, in order:
//   1. Reads `user_metadata` for the given userId via admin.getUserById.
//   2. Logs the pre-migration byte counts for visibility.
//   3. Upserts every check-in into the `check_ins` table, keyed by
//      (user_id, client_id) where client_id is the row's `date` field
//      (a full ISO timestamp — unique per check-in by construction).
//   4. Upserts every journal into the `journals` table, keyed by
//      (user_id, client_id) where client_id is the row's `date` field
//      (a YYYY-MM-DD string — one journal per day by app convention,
//      so this is already unique).
//   5. Removes `checkIns` and `journals` from `user_metadata` via
//      admin.updateUserById (READ-MERGE-WRITE — admin.updateUserById's
//      `user_metadata` argument REPLACES the entire object, so we have
//      to merge it with the rest of the existing metadata to avoid
//      wiping unrelated fields like products / treatments / skinProfile).
//   6. Logs the post-migration byte counts.
//
// Usage:
//   SUPABASE_URL=https://<project>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
//   node scripts/migrate-checkins-journals.js <userId>
//
// IMPORTANT:
//   The service role key bypasses ALL row-level security. Never commit it,
//   never paste it into a chat or PR, and never use it in any client-side
//   code. Run this script locally with env vars exported in your shell
//   (or pulled from a .env file that is gitignored).
//
//   The script is idempotent: re-running it after a partial migration will
//   re-upsert (same client_ids) and re-strip (no-op if the keys are
//   already absent), so it's safe to retry on partial failure.

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
if (!userId) bail("Usage: node scripts/migrate-checkins-journals.js <userId>");

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
  const checkIns = Array.isArray(existingMeta.checkIns) ? existingMeta.checkIns : [];
  const journals = Array.isArray(existingMeta.journals) ? existingMeta.journals : [];

  const beforeMetaBytes = bytes(existingMeta);
  const checkInsBytes   = bytes(checkIns);
  const journalsBytes   = bytes(journals);

  console.log("[migrate] userId:", userId);
  console.log("[migrate] pre  user_metadata bytes:", beforeMetaBytes);
  console.log("[migrate] pre  checkIns count / bytes:", checkIns.length, "/", checkInsBytes);
  console.log("[migrate] pre  journals count / bytes:", journals.length, "/", journalsBytes);

  // ── 2. Upsert check_ins ──────────────────────────────────────────────────
  if (checkIns.length > 0) {
    const rows = checkIns
      .filter(c => c && c.date)
      .map(c => ({ user_id: userId, client_id: String(c.date), data: c }));
    const skipped = checkIns.length - rows.length;
    if (skipped > 0) {
      console.warn("[migrate] WARN skipped", skipped, "check-ins missing a `date` field — no stable client_id");
    }
    if (rows.length > 0) {
      const { error: upErr } = await db.from("check_ins").upsert(rows, {
        onConflict: "user_id,client_id",
      });
      if (upErr) bail(`check_ins upsert failed: ${upErr.message}`);
      console.log("[migrate] upserted", rows.length, "check_ins rows");
    }
  } else {
    console.log("[migrate] no check-ins to migrate");
  }

  // ── 3. Upsert journals ───────────────────────────────────────────────────
  if (journals.length > 0) {
    const rows = journals
      .filter(j => j && j.date)
      .map(j => ({ user_id: userId, client_id: String(j.date), data: j }));
    const skipped = journals.length - rows.length;
    if (skipped > 0) {
      console.warn("[migrate] WARN skipped", skipped, "journals missing a `date` field — no stable client_id");
    }
    if (rows.length > 0) {
      const { error: upErr } = await db.from("journals").upsert(rows, {
        onConflict: "user_id,client_id",
      });
      if (upErr) bail(`journals upsert failed: ${upErr.message}`);
      console.log("[migrate] upserted", rows.length, "journals rows");
    }
  } else {
    console.log("[migrate] no journals to migrate");
  }

  // ── 4. Strip checkIns + journals from user_metadata (read-merge-write) ──
  // admin.updateUserById REPLACES user_metadata; the rest of the metadata
  // (products, treatments, skinProfile, etc.) must be preserved.
  const { checkIns: _drop1, journals: _drop2, ...kept } = existingMeta;
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
  console.log("[migrate] stripped from metadata:  ", stripped, "bytes (", checkInsBytes + journalsBytes, "expected)");
  console.log("[migrate] checkIns key present after:", "checkIns" in afterMeta);
  console.log("[migrate] journals key present after:", "journals" in afterMeta);
  console.log("[migrate] done.");
}

main().catch(e => {
  console.error("[migrate] threw:", e?.message ?? e);
  process.exit(1);
});
