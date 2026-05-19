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
 * Returns { line, loading, failed } for today's Swan Sense headline.
 *
 * - Pulls from localStorage immediately so the dashboard mounts with
 *   yesterday's text invisible (no flash).
 * - Fetches a fresh line from the swan-sense-daily edge function on mount.
 *   The edge function caches per (userId, UTC date) so multiple devices
 *   converge on the same line for the day. invokeEdgeFunction always sends
 *   Authorization: Bearer ${session.access_token} — never the anon key.
 * - The hook is idempotent within a session — once we've fetched (or
 *   short-circuited from cache) we don't refetch on prop changes.
 *
 * `failed` is true when the edge call threw and we have no cached line.
 * The card consumer uses it to switch to a generic editorial fallback
 * instead of the "no data" hint.
 */
export function useSwanSenseDaily({ user, products, journals, checkIns, cycleDay }) {
  const [line, setLine] = useState(() => readLocal(user?.id));
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
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
    setFailed(false);
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          if (!cancelled) setLoading(false);
          return;
        }
        // Sanitize the special-occasion field before it reaches the LLM.
        // "Just For Me" (and legacy "Not Right Now") are explicit non-events
        // — passing them to the prompt verbatim produces awkward lines like
        // "Upcoming: Just For Me." Translate to plain context so the model
        // reads the intent without parroting the option label, and drop any
        // stale occasionDate that may still be paired with it.
        const sanitizedSkinProfile = (() => {
          const sp = user?.skinProfile || null;
          if (!sp) return sp;
          const occ = sp.specialOccasion;
          if (occ === "Just For Me" || occ === "Not Right Now") {
            const { specialOccasion: _so, occasionDate: _od, ...rest } = sp;
            return { ...rest, focus: "general skin health" };
          }
          return sp;
        })();

        const data = await invokeEdgeFunction("swan-sense-daily", {
          userId: session.user.id,
          products,
          journals,
          checkIns,
          skinType: user?.skinType,
          concerns: user?.concerns,
          skinProfile: sanitizedSkinProfile,
          cycleDay,
        });
        if (cancelled) return;
        if (data?.line) {
          writeLocal(session.user.id, data.line);
          setLine(data.line);
        } else {
          // Empty response counts as a soft failure — flip the flag so the
          // consumer renders the generic fallback instead of "no data yet".
          setFailed(true);
        }
      } catch (e) {
        console.warn("[swan-sense-daily] fetch failed:", e?.message || e);
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return { line, loading, failed };
}
