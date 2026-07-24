-- Skin-goal tracker with a lifecycle (active → met).
--
-- Distinct from the existing aspirational `skinGoals` array on
-- user_metadata.skinProfile.skinGoals (5 Title-Case options like
-- "Hydrated & Plump", set during onboarding and consumed by the
-- intelligence engine + LLM payloads). That field stays untouched.
--
-- This table serves a different purpose: month-to-month tracking of
-- what the user is actively working on. Values are snake_case and
-- more clinical/problem-focused than the aspirational set — a user
-- can want to be "Hydrated & Plump" (aspiration → recs) AND have
-- 'reduce_breakouts' as this month's active tracker goal.
--
-- Lifecycle:
--   status='active'  — currently being worked on. The Monthly Recap
--                      surface prompts against these rows.
--   status='met'     — the user marked it complete in a recap.
--                      met_at is stamped at the mark-met moment.
--
-- Uniqueness: at most one ACTIVE row per (user, goal). Historic 'met'
-- rows for the same (user, goal) don't block a re-start — the user
-- can complete plump_skin, then later start it again for a new
-- month. Enforced via a partial unique index on active rows only.

create table if not exists skin_goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  goal        text not null check (goal in (
    'plump_skin',
    'even_tone',
    'reduce_texture',
    'reduce_breakouts',
    'reduce_pores',
    'hydration'
  )),
  status      text not null check (status in ('active', 'met')),
  started_at  timestamptz not null default now(),
  met_at      timestamptz
);

create index if not exists skin_goals_user
  on skin_goals (user_id);
create unique index if not exists skin_goals_user_goal_active
  on skin_goals (user_id, goal) where status = 'active';

alter table skin_goals enable row level security;

-- Standard user-scoped 4-policy set. Idempotent drop-then-create so
-- the migration re-applies cleanly, matching the pattern in
-- 20260723000000_create_ramp_checkins_table.
drop policy if exists "Users can select own skin_goals" on skin_goals;
drop policy if exists "Users can insert own skin_goals" on skin_goals;
drop policy if exists "Users can update own skin_goals" on skin_goals;
drop policy if exists "Users can delete own skin_goals" on skin_goals;

create policy "Users can select own skin_goals"
  on skin_goals for select using (auth.uid() = user_id);
create policy "Users can insert own skin_goals"
  on skin_goals for insert with check (auth.uid() = user_id);
create policy "Users can update own skin_goals"
  on skin_goals for update using (auth.uid() = user_id);
create policy "Users can delete own skin_goals"
  on skin_goals for delete using (auth.uid() = user_id);
