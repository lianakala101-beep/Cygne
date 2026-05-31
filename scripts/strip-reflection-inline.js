#!/usr/bin/env node
// scripts/strip-reflection-inline.js
//
// One-time cleanup: strip the `inline` base64 field from every entry in a
// user's `user_metadata.reflections` array.
//
// Why:
//   Pre-PR-#40 code stored inline base64 carriers in `user_metadata`, which
//   Supabase embeds into the issued JWT as a custom claim. A bloated
//   user_metadata makes the access_token grow to hundreds of KB, which then
//   exceeds Vercel/proxy request-header size limits and surfaces in the
//   browser as `TypeError: Load failed` with no HTTP status. PR #40 stopped
//   new writes; this script cleans up records already in the database.
//
// Usage:
//   SUPABASE_URL=https://<project>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
//   node scripts/strip-reflection-inline.js <userId>
//
// IMPORTANT:
//   The service role key bypasses ALL row-level security. Never commit it,
//   never paste it into a chat or PR, and never use it in any client-side
//   code. Run this script locally with the env vars exported in your shell
//   (or pulled from a .env file that is gitignored).

import { createClient } from "@supabase/supabase-js";

const userId = process.argv[2];
if (!userId) {
  console.error("Usage: node scripts/strip-reflection-inline.js <userId>");
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error(
    "Missing required env vars. Export SUPABASE_URL and " +
    "SUPABASE_SERVICE_ROLE_KEY before running.",
  );
  process.exit(1);
}

const db = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log("[strip-inline] userId :", userId);
console.log("[strip-inline] project:", supabaseUrl);

// ── 1. Fetch the user (admin API needs the service role key) ──────────────
const { data: getRes, error: getErr } = await db.auth.admin.getUserById(userId);
if (getErr || !getRes?.user) {
  console.error("[strip-inline] getUserById failed:", getErr?.message || "no user returned");
  process.exit(1);
}

const meta = getRes.user.user_metadata || {};
const reflections = Array.isArray(meta.reflections) ? meta.reflections : [];
const inlineCount = reflections.filter((r) => r && r.inline).length;

// Bytes for context: log both the reflections-only count (the field we're
// editing) and the full user_metadata count (the actual JWT-claim payload).
const reflectionsBeforeBytes = JSON.stringify(reflections).length;
const metaBeforeBytes = JSON.stringify(meta).length;

console.log("[strip-inline] reflections count       :", reflections.length);
console.log("[strip-inline] entries with `inline`    :", inlineCount);
console.log("[strip-inline] reflections bytes BEFORE :", reflectionsBeforeBytes);
console.log("[strip-inline] user_metadata bytes BEFORE:", metaBeforeBytes);

if (inlineCount === 0) {
  console.log("[strip-inline] nothing to do — no `inline` fields present. Exiting.");
  process.exit(0);
}

// ── 2. Build the cleaned reflections array ─────────────────────────────────
const cleaned = reflections.map((r) => {
  if (!r) return r;
  const { inline: _drop, ...rest } = r;
  return rest;
});

const reflectionsAfterBytes = JSON.stringify(cleaned).length;

// ── 3. Save back ──────────────────────────────────────────────────────────
// IMPORTANT: admin.updateUserById's `user_metadata` field REPLACES the entire
// user_metadata object (it does NOT deep-merge — that's distinct from the
// client-side auth.updateUser({data}) call). Sending only { reflections }
// would wipe products / journals / checkIns / treatments / triggerLog / etc.
// We send the full existing metadata with only the reflections key swapped.
const nextMeta = { ...meta, reflections: cleaned };
const metaAfterBytes = JSON.stringify(nextMeta).length;

console.log("[strip-inline] reflections bytes AFTER  :", reflectionsAfterBytes);
console.log("[strip-inline] user_metadata bytes AFTER :", metaAfterBytes);
console.log("[strip-inline] freed                     :", metaBeforeBytes - metaAfterBytes, "bytes");

const { error: updErr } = await db.auth.admin.updateUserById(userId, {
  user_metadata: nextMeta,
});
if (updErr) {
  console.error("[strip-inline] updateUserById failed:", updErr.message || updErr);
  process.exit(1);
}

console.log("[strip-inline] done — user_metadata updated.");
console.log("[strip-inline] tell the user to sign out and back in so a fresh JWT (without the inline payload) is issued.");
