-- Revoke public EXECUTE access on public.rls_auto_enable()
--
-- The function was flagged as executable by PUBLIC and the `authenticated`
-- role. It is an internal/maintenance routine and should not be callable by
-- anonymous or signed-in users, so we strip both grants.
--
-- REVOKE is idempotent: revoking a privilege that isn't granted is a no-op and
-- does not error, so this migration is safe to re-run.

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;
