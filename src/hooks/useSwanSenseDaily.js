import { useEffect, useRef, useState } from "react";
import { supabase, invokeEdgeFunction } from "../supabase.js";

// localStorage key for today's cached Swan Sense line. Keyed by userId so a
// device that signs into a different account doesn't inherit the line.
function cacheKey(userId) {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `cygne_swan_daily_${userId || "anon"}_${y}-${m}-${day}`;
}

function readLocal(userId) {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    return raw || null;
  } catch { return null; }
}

function writeLocal(userId, line) {
  try { localStorage.setItem(cacheKey(userId), line); } catch { /* quota */ }
}

/**
 * Returns { line, loading } for today's Swan Sense headline.
 *
 * - Pulls from localStorage immediately so the dashboard mounts with
 *   yesterday's text invisible (no flash).
 * - Fetches a fresh line from the swan-sense-daily edge function on mount.
 *   The edge function caches per (userId, UTC date) so multiple devices
 *   converge on the same line for the day.
 * - The hook is idempotent within a session — once we've fetched (or
 *   short-circuited from cache) we don't refetch on prop changes.
 *
 * Caller is responsible for falling back to the rule-based headline when
 * line is null.
 */
export function useSwanSenseDaily({ user, products, journals, checkIns, cycleDay }) {
  const [line, setLine] = useState(() => readLocal(user?.id));
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    // Already fetched this session — don't churn on prop changes.
    if (fetchedRef.current) return;
    // No signed-in user means no userId to scope the cache to — skip entirely.
    if (!user?.id) return;
    // Already have today's cached line.
    if (readLocal(user.id)) return;

    fetchedRef.current = true;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          if (!cancelled) setLoading(false);
          return;
        }
        const data = await invokeEdgeFunction("swan-sense-daily", {
          userId: session.user.id,
          products,
          journals,
          checkIns,
          skinType: user?.skinType,
          concerns: user?.concerns,
          skinProfile: user?.skinProfile,
          cycleDay,
        });
        if (cancelled) return;
        if (data?.line) {
          writeLocal(session.user.id, data.line);
          setLine(data.line);
        }
      } catch (e) {
        console.warn("[swan-sense-daily] fetch failed:", e?.message || e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return { line, loading };
}
