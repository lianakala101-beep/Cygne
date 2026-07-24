-- Dedup guard for the daily Swan Sense reminder push notification.
--
-- The swan-sense-reminder edge function runs once per UTC day via the
-- daily notifications cron and fires a "your Swan Sense is ready"
-- push to every active user (proxy: any user with a registered iOS
-- device token). Without a guard, a re-run of the cron on the same
-- day — a manual workflow_dispatch, a retry after a transient
-- failure, or a duplicate schedule fire — would spam users. This
-- table records "we already sent today's push to this user" so
-- subsequent invocations skip them.
--
-- Grain: (user_id, date). Once sent for a day, never sent again for
-- that day. Independent of whether swan-sense-daily has actually
-- pre-generated the insight — the push is a reminder to open the
-- app; the insight generates on dashboard mount as it does today.
--
-- Same shape and RLS posture as ramp_checkin_reminders_sent — the
-- other daily-notification dedup table this project already ships.

create table if not exists swan_sense_sent (
  id       bigserial primary key,
  user_id  uuid not null references auth.users on delete cascade,
  date     date not null,
  sent_at  timestamptz not null default now(),
  unique (user_id, date)
);

-- RLS is on but no anon/authenticated policies — this table is
-- written and read only by the service role (edge function). Same
-- pattern as ramp_checkin_reminders_sent and debug_logs.
alter table swan_sense_sent enable row level security;
