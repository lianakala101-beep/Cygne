-- Reflections storage bucket
--
-- Creates the private 'reflections' bucket plus RLS policies that let each
-- authenticated user read / write only their own objects, scoped by the
-- top-level folder of the path matching their auth uid. Matches how
-- src/reflection.jsx uploadTriptych writes:
--   path = `${userId}/${entryId}.jpg`
-- and how createSignedUrl reads it back.
--
-- This script is idempotent — safe to re-run from the SQL editor whenever
-- the bucket loses its policies (e.g. after a bucket recreate). Every
-- policy is dropped-if-exists before being created, and the bucket insert
-- is gated on conflict.

-- ── 1. Bucket ─────────────────────────────────────────────────────────────
-- Private bucket (public = false). The client retrieves images via signed
-- URLs generated at read time; no anonymous read is allowed.
insert into storage.buckets (id, name, public)
values ('reflections', 'reflections', false)
on conflict (id) do nothing;

-- ── 2. RLS on storage.objects ─────────────────────────────────────────────
-- Supabase enables RLS on storage.objects by default, but be explicit so a
-- re-run of this script always lands in the same known-good state.
alter table storage.objects enable row level security;

-- Drop any prior policies of these names so the migration is re-runnable.
-- Postgres has no `create policy if not exists`, so we drop-then-create.
drop policy if exists "Users read own reflection objects"   on storage.objects;
drop policy if exists "Users insert own reflection objects" on storage.objects;
drop policy if exists "Users update own reflection objects" on storage.objects;
drop policy if exists "Users delete own reflection objects" on storage.objects;

-- ── 3. Per-action policies ────────────────────────────────────────────────
-- (storage.foldername(name))[1] is the top-level folder. We require it to
-- equal the calling user's uid stringified, which gives us per-user
-- isolation without needing a separate ownership column.

-- SELECT: a user can read their own objects (createSignedUrl requires this).
create policy "Users read own reflection objects"
  on storage.objects for select
  using (
    bucket_id = 'reflections'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- INSERT: a user can upload into their own folder. Required for the
-- triptych upload on every reflection capture.
create policy "Users insert own reflection objects"
  on storage.objects for insert
  with check (
    bucket_id = 'reflections'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE: required because uploadTriptych calls upload(..., { upsert: true }),
-- which translates to an UPDATE when the same path is rewritten (e.g. when a
-- user re-captures the same week and the triptych is overwritten at the same
-- entryId path).
create policy "Users update own reflection objects"
  on storage.objects for update
  using (
    bucket_id = 'reflections'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'reflections'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE: not used by the client today (entries are kept indefinitely), but
-- we add it so future cleanup flows don't get stuck against RLS.
create policy "Users delete own reflection objects"
  on storage.objects for delete
  using (
    bucket_id = 'reflections'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
