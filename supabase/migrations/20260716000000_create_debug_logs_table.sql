-- Client-side debug event log
--
-- Ad-hoc write-only channel for diagnostic events the client wants to
-- surface without waiting for a device console (Web Inspector is
-- unreliable on iOS; TestFlight builds don't always attach). Currently
-- feeds the paywall RC-getOfferings diagnostic (see PR that adds this
-- migration) but general enough to reuse from any client site that
-- needs "phone home this state so I can query it via SQL."
--
-- Design constraints:
-- - Rows are INSERT-only from the client. No UPDATE / DELETE / SELECT
--   from the anon/authenticated roles — this is a debug write-only
--   channel, not user data. Reads happen from the SQL editor / Studio
--   using the service-role key which bypasses RLS.
-- - user_id is nullable so events fired from paths without an active
--   session (rare here, but the paywall can theoretically render on a
--   fresh install before authSession settles) still land.
-- - payload is unbounded jsonb so callers can toss in whatever they
--   want (RC error codes, offering shapes, environment metadata,
--   etc.) without a schema migration each time.

create table if not exists public.debug_logs (
  id           bigserial primary key,
  user_id      uuid references auth.users(id) on delete set null,
  event        text not null,
  payload      jsonb,
  created_at   timestamptz not null default now()
);

-- Common triage queries: "give me every event of type X in the last
-- hour" and "give me every event for user Y." Two indexes keep both
-- shapes cheap without paying for a composite that neither query would
-- fully use.
create index if not exists debug_logs_event_created_at_idx
  on public.debug_logs (event, created_at desc);
create index if not exists debug_logs_user_id_created_at_idx
  on public.debug_logs (user_id, created_at desc);

alter table public.debug_logs enable row level security;

-- Idempotent drop-then-create for the RLS policies, matching the
-- pattern used elsewhere in this project.
drop policy if exists "Anyone can insert debug logs" on public.debug_logs;

-- INSERT is intentionally permissive — the paywall can fire before
-- authSession settles on a fresh install, so we can't require
-- auth.uid() = user_id. Anonymous events (user_id = null) are
-- explicitly allowed. This is safe because:
--   - Debug logs carry no personal data by design (payloads are
--     diagnostic shapes, not user content).
--   - Reads require the service-role key — no client can read another
--     user's debug entries.
--   - Rate limiting is delegated to Supabase's built-in per-IP limits;
--     if abuse becomes an issue, this policy can be tightened without
--     a data migration.
create policy "Anyone can insert debug logs"
  on public.debug_logs for insert
  with check (true);

-- No SELECT / UPDATE / DELETE policies — the anon and authenticated
-- roles cannot read, modify, or remove rows. Only the service-role
-- key (used from the SQL editor / server-side triage tooling) has
-- access, and it bypasses RLS entirely.
