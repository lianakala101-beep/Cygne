import { useEffect, useState } from "react";
import { invokeEdgeFunction } from "../supabase.js";

// Linen / paper noise — matches the rest of the app's editorial surfaces.
const GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='250' height='250'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='250' height='250' filter='url(%23g)' opacity='0.045'/%3E%3C/svg%3E\")";

const INKY  = "var(--color-inky-moss, #2d3d2b)";
const IVORY = "var(--color-ivory, #faf9f4)";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// Format the onboarding-captured occasion as an editorial line. Skips the
// explicit non-events ("Just For Me" and the legacy "Not Right Now") so the
// header doesn't read "Reading toward Just For Me on …". Format-only — the
// API receives the raw fields and decides whether to weave the occasion into
// the narrative itself.
function occasionLine(skinProfile) {
  if (!skinProfile) return null;
  const occ = skinProfile.specialOccasion;
  if (!occ || occ === "Just For Me" || occ === "Not Right Now") return null;
  const date = skinProfile.occasionDate;
  if (!date) return `Reading toward ${occ}`;
  const parsed = new Date(`${date}T00:00:00`);
  if (!Number.isFinite(parsed.getTime())) return `Reading toward ${occ}`;
  return `Reading toward ${occ} on ${parsed.toLocaleDateString(undefined, { month: "long", day: "numeric" })}`;
}

// Sanitize the "Just For Me" / "Not Right Now" non-events out of skinProfile
// before sending to the API — matches what useSwanSenseDaily does so the LLM
// doesn't echo the option label back into the recap verbatim.
function sanitizeSkinProfile(skinProfile) {
  if (!skinProfile) return skinProfile;
  const occ = skinProfile.specialOccasion;
  if (occ === "Just For Me" || occ === "Not Right Now") {
    const { specialOccasion: _so, occasionDate: _od, ...rest } = skinProfile;
    return { ...rest, focus: "general skin health" };
  }
  return skinProfile;
}

// Resolve the month being recapped (matches /api/monthly-recap's logic) so
// the header reads the same month the AI is writing about.
function resolveMonth(offset) {
  const today = new Date();
  const off = Number.isFinite(offset) ? offset : 0;
  const target = new Date(today.getFullYear(), today.getMonth() + off, 1);
  return { year: target.getFullYear(), monthLabel: MONTHS[target.getMonth()] };
}

// ─── MonthlyRecap overlay ─────────────────────────────────────────────────────
//
// Editorial monthly recap. Replaces the previous calendar / stats / hand-
// written narrate* layout with a single AI-generated narrative pulled from
// /api/monthly-recap. The endpoint receives the user's products, journals,
// check-ins, treatments, cycleDay, and skin profile for the target month
// (offset 0 = current, -1 = previous) and returns 3 short paragraphs of
// editorial prose. We render those centered, ivory-on-inky-moss, in the
// Swan Sense reading style.
//
// Every array prop defaults to []. Non-array values are coerced so a half-
// loaded auth state can't crash the component.
export function MonthlyRecap({
  offset = 0,
  journals = [],
  checkIns = [],
  treatments = [],
  products = [],
  user = {},
  cycleDay = null,
  onClose,
}) {
  const { year, monthLabel } = resolveMonth(offset);
  const occLine = occasionLine(user?.skinProfile);

  const [narrative, setNarrative] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // Fetch once on open. Re-fetch if the offset (and therefore the target
  // month) changes — opening the auto-show recap for the previous month
  // and then opening the current-month recap should hit a different cache key.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setNarrative(null);
    (async () => {
      if (!user?.id) {
        // No signed-in user, no userId to scope cache to — fall back to a
        // quiet message rather than fetching.
        if (!cancelled) { setFailed(true); setLoading(false); }
        return;
      }
      try {
        const data = await invokeEdgeFunction("monthly-recap", {
          userId: user.id,
          offset,
          products: Array.isArray(products) ? products : [],
          journals: Array.isArray(journals) ? journals : [],
          checkIns: Array.isArray(checkIns) ? checkIns : [],
          treatments: Array.isArray(treatments) ? treatments : [],
          skinType: user?.skinType,
          concerns: user?.concerns,
          skinProfile: sanitizeSkinProfile(user?.skinProfile),
          cycleDay: Number.isFinite(cycleDay) ? cycleDay : null,
        });
        if (cancelled) return;
        if (data?.narrative) {
          setNarrative(data.narrative);
        } else {
          setFailed(true);
        }
      } catch (e) {
        console.warn("[MonthlyRecap] fetch failed:", e?.message ?? e);
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [offset, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ESC closes the overlay.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && onClose) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Split narrative on blank lines into paragraphs. The system prompt asks
  // for 3 paragraphs separated by \n\n; we render each as its own <p>.
  const paragraphs = narrative
    ? narrative.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)
    : [];

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: INKY,
        backgroundImage: GRAIN,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        color: IVORY,
      }}
    >
      {/* Close × */}
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          position: "fixed", top: 18, left: 22, zIndex: 1,
          background: "none", border: "none", cursor: "pointer",
          color: IVORY, fontSize: 22, lineHeight: 1, padding: 6,
          fontFamily: "var(--font-display)",
          opacity: 0.75,
        }}
      >×</button>

      <div style={{ maxWidth: 540, margin: "0 auto", padding: "60px 28px 60px", textAlign: "center" }}>

        {/* Cygne logo (top) */}
        <img
          src="/cygne-logo.png"
          alt="Cygne"
          style={{
            width: 60, height: "auto",
            margin: "0 auto 18px", display: "block",
            filter: "brightness(0) invert(1)",
            opacity: 0.85,
          }}
        />

        {/* Header — month + year, signature script */}
        <h1 style={{
          fontFamily: "var(--font-signature)",
          fontSize: 42, fontWeight: 400, letterSpacing: "0.01em",
          color: IVORY, margin: 0, lineHeight: 1.05,
        }}>
          {monthLabel}
        </h1>
        <p style={{
          fontFamily: "var(--font-body)",
          fontSize: 11, fontWeight: 400, letterSpacing: "0.22em",
          textTransform: "uppercase", color: IVORY,
          margin: "8px 0 0", opacity: 0.65,
        }}>
          {year} · In Review
        </p>

        {/* Occasion line — only when the user has set a real upcoming event */}
        {occLine && (
          <p style={{
            fontFamily: "var(--font-body)",
            fontSize: 11, fontWeight: 400, letterSpacing: "0.18em",
            textTransform: "uppercase", color: IVORY,
            margin: "14px 0 0", opacity: 0.55,
          }}>
            {occLine}
          </p>
        )}

        {/* Silver divider */}
        <div style={{
          width: 80, height: 1,
          margin: "30px auto 0",
          background: "linear-gradient(90deg, transparent 0%, rgba(192,192,192,0.55) 50%, transparent 100%)",
        }} />

        {/* Narrative — paragraphs, or loading / failed state */}
        <div style={{ marginTop: 36, marginBottom: 48, minHeight: 200 }}>
          {loading && (
            <p style={{
              fontFamily: "var(--font-body)",
              fontSize: 12, letterSpacing: "0.22em", textTransform: "uppercase",
              color: IVORY, opacity: 0.55, margin: 0,
            }}>
              Composing your month…
            </p>
          )}

          {!loading && failed && (
            <p style={{
              fontFamily: "var(--font-body)",
              fontSize: 14, color: IVORY, opacity: 0.7,
              margin: 0, lineHeight: 1.7,
            }}>
              The recap couldn't load just now. Check back in a moment.
            </p>
          )}

          {!loading && !failed && paragraphs.map((p, i) => (
            <p key={i} style={{
              fontFamily: "var(--font-body)",
              fontSize: 16, fontWeight: 400,
              lineHeight: 1.7, letterSpacing: "0.01em",
              color: IVORY,
              margin: i === 0 ? "0" : "22px 0 0",
            }}>
              {p}
            </p>
          ))}
        </div>

        {/* Silver divider before signoff */}
        <div style={{
          width: 80, height: 1,
          margin: "0 auto 30px",
          background: "linear-gradient(90deg, transparent 0%, rgba(192,192,192,0.55) 50%, transparent 100%)",
        }} />

        {/* Closing signature */}
        <p style={{
          fontFamily: "var(--font-body)",
          fontSize: 11, fontWeight: 400, letterSpacing: "0.22em",
          textTransform: "uppercase", color: IVORY,
          margin: "0 0 12px", opacity: 0.7,
        }}>
          Built around you.
        </p>
      </div>
    </div>
  );
}
