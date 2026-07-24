-- Server-owned "last known cycle phase" for the cycle-phase-alert
-- push notification.
--
-- The cycle-phase-alert edge function runs daily and computes each
-- user's current cycle phase from their auth.users.raw_user_meta_data
-- (cycleStartDate + cycleLength). It compares that against the phase
-- recorded here. If different, it sends a push and updates this row;
-- if the same, no-op. That comparison IS the dedup — no separate
-- _sent table needed because a phase only transitions ~4 times per
-- cycle, and each transition legitimately deserves one push.
--
-- Why a separate table (not on user_metadata):
--   The client periodically fires supabase.auth.updateUser({data:...})
--   spreading the entire user_metadata jsonb. If the server wrote
--   last_known_phase into user_metadata between two client reads, the
--   client's next spread would clobber the server's write and the
--   push would re-fire on the next cron. This table lives outside
--   user_metadata so the two writers don't race.
--
-- Grain: one row per user (PK on user_id). We overwrite in place on
-- each transition; there's no per-transition history — that would be
-- a separate audit table if we ever need one.
--
-- First-observation semantics: the edge function primes this row
-- SILENTLY on first sighting (no push), so a user who enables cycle
-- tracking and immediately hits the cron doesn't get a mysterious
-- "you've entered a new phase" notification for the phase they were
-- already in. Subsequent actual transitions fire the push normally.

create table if not exists cycle_phase_state (
  user_id           uuid primary key references auth.users on delete cascade,
  last_known_phase  text not null,
  updated_at        timestamptz not null default now()
);

-- RLS is on but no anon/authenticated policies — this table is
-- written and read only by the service role (edge function). Same
-- pattern as swan_sense_sent and ramp_checkin_reminders_sent.
alter table cycle_phase_state enable row level security;
