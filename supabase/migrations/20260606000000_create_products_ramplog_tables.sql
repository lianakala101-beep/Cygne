-- Phase 2 of moving heavy fields out of raw_user_meta_data.
-- Creates per-collection tables for products (the vanity shelf) and ramp_log
-- (the Skin-Handled-It / Backing-Off audit trail). Same shape as the Phase 1
-- check_ins / journals tables.
--
-- client_id strategy:
--   products  — uses the existing p.id (Date.now() string or uuid). Stable
--               per product across the app, already keyed everywhere
--               consumers use it.
--   ramp_log  — uses `${productId}_${timestamp}`. timestamp alone is NOT
--               unique because auto-graduate / auto-enroll can write
--               many entries in one tick all sharing nowIso; including
--               productId keeps each row addressable.
--
-- RLS: users can only touch their own rows. Service role bypasses RLS, so
-- the /api/* endpoints (which already use the service-role client) keep
-- working unchanged.

create table if not exists products (
  user_id    uuid not null references auth.users on delete cascade,
  client_id  text not null,
  data       jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, client_id)
);
create index if not exists products_user on products (user_id);
alter table products enable row level security;
create policy "Users can select own products" on products for select using (auth.uid() = user_id);
create policy "Users can insert own products" on products for insert with check (auth.uid() = user_id);
create policy "Users can update own products" on products for update using (auth.uid() = user_id);
create policy "Users can delete own products" on products for delete using (auth.uid() = user_id);

create table if not exists ramp_log (
  user_id    uuid not null references auth.users on delete cascade,
  client_id  text not null,
  data       jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, client_id)
);
create index if not exists ramp_log_user on ramp_log (user_id);
alter table ramp_log enable row level security;
create policy "Users can select own ramp_log" on ramp_log for select using (auth.uid() = user_id);
create policy "Users can insert own ramp_log" on ramp_log for insert with check (auth.uid() = user_id);
create policy "Users can update own ramp_log" on ramp_log for update using (auth.uid() = user_id);
create policy "Users can delete own ramp_log" on ramp_log for delete using (auth.uid() = user_id);
