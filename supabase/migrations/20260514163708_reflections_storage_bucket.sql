-- Reflections storage bucket
--
-- Creates the private 'reflections' bucket plus RLS policies that let each
-- authenticated user read / write only their own objects, scoped by the
-- top-level folder of the path matching their auth uid. Matches how
-- src/reflection.jsx uploadTriptych writes:
--   path = `${userId}/${entryId}.jpg`
-- and how createSignedUrl reads it back.

-- ── 1. Bucket ─────────────────────────────────────────────────────────────
-- Private bucket (public = false). The client retrieves images via signed
-- URLs generated at read time; no anonymous read is allowed.
insert into storage.buckets (id, name, public)
values ('reflections', 'reflections', false)
on conflict (id) do nothing;

-- ── 2. RLS policies on storage.objects ────────────────────────────────────
-- storage.objects already has RLS enabled by default on a Supabase project,
-- but the policy set is empty for a new bucket. We add per-action policies
-- scoped to the bucket and to (path-first-segment == auth.uid()).
--
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
