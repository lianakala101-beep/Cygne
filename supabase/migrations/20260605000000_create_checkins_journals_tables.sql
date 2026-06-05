-- Phase 1 of moving heavy fields out of raw_user_meta_data.
-- Creates per-collection tables for check-ins and journals so each insert no
-- longer bloats the user's JWT (and so server endpoints can query directly
-- instead of going through admin.getUserById just to read these arrays).
--
-- Shared shape across both tables:
--   user_id    — owner; cascade delete with the auth user
--   client_id  — the existing in-app unique key per row (ISO timestamp for
--                check-ins, YYYY-MM-DD for journals), preserved so the
--                client can keep using the same .find / .filter logic
--                without remapping ids
--   data       — full row object as the client persisted it
--   created_at / updated_at — server stamps for cache windows + ordering
--
-- RLS: users can read/write only their own rows. Service role bypasses RLS
-- so the existing /api/* endpoints continue to operate with the service-key
-- client (matches the pattern used for ask_cygne_cache).

create table if not exists check_ins (
  user_id    uuid not null references auth.users on delete cascade,
  client_id  text not null,
  data       jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, client_id)
);
create index if not exists check_ins_user on check_ins (user_id);
alter table check_ins enable row level security;
create policy "Users can select own check_ins" on check_ins for select using (auth.uid() = user_id);
create policy "Users can insert own check_ins" on check_ins for insert with check (auth.uid() = user_id);
create policy "Users can update own check_ins" on check_ins for update using (auth.uid() = user_id);
create policy "Users can delete own check_ins" on check_ins for delete using (auth.uid() = user_id);

create table if not exists journals (
  user_id    uuid not null references auth.users on delete cascade,
  client_id  text not null,
  data       jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, client_id)
);
create index if not exists journals_user on journals (user_id);
alter table journals enable row level security;
create policy "Users can select own journals" on journals for select using (auth.uid() = user_id);
create policy "Users can insert own journals" on journals for insert with check (auth.uid() = user_id);
create policy "Users can update own journals" on journals for update using (auth.uid() = user_id);
create policy "Users can delete own journals" on journals for delete using (auth.uid() = user_id);
