-- Weekly check-ins for products on the Introduce Slowly ramp.
--
-- One row per (user, product, week). Captures the user's qualitative
-- response to that week ("no reaction" / "mild irritation" / "breakout"
-- / "loving it") plus an optional free-text note. Independent of the
-- existing ramp_log audit trail — ramp_log records the on-track /
-- back-off *actions* the user takes, this table records how the week
-- *felt*. Both feed into the ramp UI, but with different grains.
--
-- Key model:
--   (user_id, product_id, week_number)
-- where product_id is the client-side product identifier — matches
-- products.client_id (see 20260606000000_create_products_ramplog_tables).
-- Composite FK to products enforces that a check-in can only exist for
-- a product on the user's own shelf; a delete of the product cascades
-- the check-ins away.
--
-- Ramp "week" is derived client-side from product.routineStartDate, so
-- there is no ramp_id foreign key — the (product_id, week_number) pair
-- IS the ramp identity for a given user's product.

create table if not exists ramp_checkins (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  product_id     text not null,
  week_number    int  not null check (week_number > 0),
  response_state text not null check (response_state in (
    'no_reaction',
    'mild_irritation',
    'breakout',
    'loving_it'
  )),
  note           text,
  created_at     timestamptz not null default now(),
  unique (user_id, product_id, week_number),
  foreign key (user_id, product_id)
    references products (user_id, client_id)
    on delete cascade
);

-- Two indexes covering the read patterns:
--   1. All check-ins for a user (progress-screen queries)
--   2. All check-ins for a specific product (per-card nudge lookup)
-- A separate index on user_id alone lets us skip the composite when
-- product_id isn't part of the filter.
create index if not exists ramp_checkins_user
  on ramp_checkins (user_id);
create index if not exists ramp_checkins_user_product
  on ramp_checkins (user_id, product_id);

alter table ramp_checkins enable row level security;

-- Idempotent policy pattern used elsewhere in this project.
drop policy if exists "Users can select own ramp_checkins" on ramp_checkins;
drop policy if exists "Users can insert own ramp_checkins" on ramp_checkins;
drop policy if exists "Users can update own ramp_checkins" on ramp_checkins;
drop policy if exists "Users can delete own ramp_checkins" on ramp_checkins;

create policy "Users can select own ramp_checkins"
  on ramp_checkins for select using (auth.uid() = user_id);
create policy "Users can insert own ramp_checkins"
  on ramp_checkins for insert with check (auth.uid() = user_id);
create policy "Users can update own ramp_checkins"
  on ramp_checkins for update using (auth.uid() = user_id);
create policy "Users can delete own ramp_checkins"
  on ramp_checkins for delete using (auth.uid() = user_id);
