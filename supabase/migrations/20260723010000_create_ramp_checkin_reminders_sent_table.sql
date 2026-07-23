-- Dedup guard for the ramp check-in reminder push notification.
--
-- The ramp-checkin-reminder edge function runs daily and looks for
-- product ramps whose current week > lastCheckinWeek. Without a
-- guard it would re-send the same "how did week 3 go?" push every
-- day of week 3 until the user actually checks in — noisy. This
-- table records "we sent (user, product, week) already" so subsequent
-- daily fires skip that (user, product, week) triple.
--
-- Grain: (user_id, product_id, week_number). Once sent for a week,
-- never sent again for that week. If the user misses the notification
-- entirely, the inline nudge on the Introduce Slowly screen (Phase A)
-- still surfaces the check-in whenever they open the app.
--
-- Not a general "notifications_log" table on purpose — we only have
-- one notification type today; keeping the schema specific means the
-- edge function can insert-with-ON-CONFLICT-DO-NOTHING against a
-- meaningful key, not a serialized string.

create table if not exists ramp_checkin_reminders_sent (
  id           bigserial primary key,
  user_id      uuid not null references auth.users on delete cascade,
  product_id   text not null,
  week_number  int  not null check (week_number > 0),
  sent_at      timestamptz not null default now(),
  unique (user_id, product_id, week_number)
);

-- RLS is on but no anon/authenticated policies — this table is
-- written and read only by the service role (edge function). Same
-- pattern as debug_logs.
alter table ramp_checkin_reminders_sent enable row level security;
