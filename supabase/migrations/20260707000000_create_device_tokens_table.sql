-- Device push-notification tokens
--
-- One row per (user_id, platform) — Capacitor's PushNotifications plugin
-- can re-emit the "registration" event with a rotated token, so the
-- application upserts on the (user_id, platform) conflict target rather
-- than accumulating stale rows. Server-side push senders read the latest
-- row per user via ORDER BY updated_at DESC.

create table if not exists public.device_tokens (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  token        text not null,
  platform     text not null check (platform in ('ios', 'android', 'web')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, platform)
);

-- Common lookup: "give me every token for user X" — used both by the
-- client (to display / delete their own tokens) and by service-role
-- senders that fan out to a user's devices.
create index if not exists device_tokens_user_id_idx
  on public.device_tokens (user_id);

alter table public.device_tokens enable row level security;

-- Idempotent drop-then-create for the RLS policies. Same pattern as
-- other migrations in this project.
drop policy if exists "Users read own device tokens"   on public.device_tokens;
drop policy if exists "Users insert own device tokens" on public.device_tokens;
drop policy if exists "Users update own device tokens" on public.device_tokens;
drop policy if exists "Users delete own device tokens" on public.device_tokens;

-- SELECT: a user can read only their own token rows. The service-role
-- key bypasses RLS entirely, so a serverless push sender can still fan
-- out across users.
create policy "Users read own device tokens"
  on public.device_tokens for select
  using (auth.uid() = user_id);

-- INSERT: bind the row to the authenticated user. Prevents anyone from
-- inserting a token under another user's id.
create policy "Users insert own device tokens"
  on public.device_tokens for insert
  with check (auth.uid() = user_id);

-- UPDATE: same — the row and the update payload must both be owned by
-- the authenticated user. Required because upsert-on-conflict runs
-- through the UPDATE path when the row already exists.
create policy "Users update own device tokens"
  on public.device_tokens for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- DELETE: users can unregister their own devices (a future "sign out
-- everywhere" or "remove this device" flow will lean on this).
create policy "Users delete own device tokens"
  on public.device_tokens for delete
  using (auth.uid() = user_id);
