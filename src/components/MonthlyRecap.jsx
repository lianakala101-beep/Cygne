import { useEffect, useState } from "react";
import { invokeEdgeFunction, supabase } from "../supabase.js";
import { SkinGoalsSection } from "./SkinGoalsSection.jsx";
import { getCyclePhaseNameForDate } from "../lib/cycle.js";

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
  skinGoals = [],
  onMarkSkinGoalMet,
  onAddSkinGoal,
  onRemoveSkinGoal,
  reflections = [],
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

  // ─── Cycle-pattern insight ────────────────────────────────────────────────
  //
  // Optional second AI call — fires only when the user has enough
  // tracked history for a cycle-phase pattern to be meaningful. The
  // codebase has no cycle-history table (raw_user_meta_data holds
  // only the *current* cycleStartDate + cycleLength), so "3 full
  // tracked cycles" is proxied as:
  //   1. Total tracked items (ramp_checkins + reflections) >= 10.
  //      Without volume the LLM can't spot anything real.
  //   2. Span from the earliest tracked item to now >= 3 * cycleLength.
  //      Ensures temporal coverage across at least three phase
  //      rotations.
  // If either gate fails, the section is skipped entirely — no
  // "not enough data yet" placeholder per spec.
  const [insight, setInsight] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setInsight(null);
    (async () => {
      const userId = user?.id;
      const cycleStartDate = user?.cycleStartDate;
      const cycleLength = Math.max(21, Math.min(45, parseInt(user?.cycleLength, 10) || 28));
      if (!userId || !cycleStartDate) return;

      // Fetch every ramp_checkin for this user — small table, RLS
      // scopes to the caller. All history is needed because the gate
      // measures span from the earliest signal.
      const { data: rows, error } = await supabase
        .from("ramp_checkins")
        .select("response_state, created_at")
        .eq("user_id", userId);
      if (cancelled) return;
      if (error) {
        console.warn("[MonthlyRecap] ramp_checkins fetch failed:", error.message);
        return;
      }
      const checkins = rows || [];
      const reflectionList = Array.isArray(reflections) ? reflections : [];

      // Gate 1: minimum volume.
      const totalItems = checkins.length + reflectionList.length;
      if (totalItems < 10) return;

      // Gate 2: minimum temporal span. Earliest across both sources.
      const timestamps = [
        ...checkins.map(c => c.created_at).filter(Boolean),
        ...reflectionList.map(r => r?.date).filter(Boolean),
      ];
      if (timestamps.length === 0) return;
      const earliestMs = timestamps.reduce((min, iso) => {
        const t = new Date(iso).getTime();
        return Number.isFinite(t) && t < min ? t : min;
      }, Infinity);
      if (!Number.isFinite(earliestMs)) return;
      const spanDays = Math.floor((Date.now() - earliestMs) / 86400000);
      if (spanDays < 3 * cycleLength) return;

      // Group into per-phase counts. Any item whose phase can't be
      // computed (bad timestamp, event before cycleStartDate) is
      // silently dropped — those are noise for pattern-spotting.
      const phaseCounts = {};
      const bump = (phaseName, mutator) => {
        if (!phaseCounts[phaseName]) {
          phaseCounts[phaseName] = { rampStates: {}, reflections: 0 };
        }
        mutator(phaseCounts[phaseName]);
      };
      for (const c of checkins) {
        const phase = getCyclePhaseNameForDate(cycleStartDate, cycleLength, c.created_at);
        if (!phase || !c.response_state) continue;
        bump(phase, (b) => { b.rampStates[c.response_state] = (b.rampStates[c.response_state] || 0) + 1; });
      }
      for (const r of reflectionList) {
        const phase = getCyclePhaseNameForDate(cycleStartDate, cycleLength, r?.date);
        if (!phase) continue;
        bump(phase, (b) => { b.reflections++; });
      }

      // Hand aggregated counts to the LLM endpoint. Empty response
      // (endpoint 502 / network error) leaves insight = null so the
      // section stays hidden — matches the "surface only when the
      // model returns a non-empty insight" branch of the spec.
      try {
        const data = await invokeEdgeFunction("cycle-pattern-insight", {
          userId,
          offset,
          cycleLength,
          cycleSpanDays: spanDays,
          phaseCounts,
        });
        if (cancelled) return;
        if (data?.insight) setInsight(data.insight);
      } catch (e) {
        console.warn("[MonthlyRecap] cycle-pattern-insight failed:", e?.message ?? e);
      }
    })();
    return () => { cancelled = true; };
  }, [offset, user?.id, user?.cycleStartDate, user?.cycleLength, reflections]); // eslint-disable-line react-hooks/exhaustive-deps

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
      {/* Close × — top-right per brief, helper-alpha ivory */}
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          position: "fixed", top: 18, right: 22, zIndex: 1,
          background: "none", border: "none", cursor: "pointer",
          color: "rgba(255,255,255,0.6)", fontSize: 22, lineHeight: 1, padding: 6,
          fontFamily: "var(--font-display)",
        }}
      >×</button>

      <div style={{ maxWidth: 540, margin: "0 auto", padding: "60px 28px 60px", textAlign: "center" }}>

        {/* Header — "[MONTH] IN REVIEW" in uppercase Fungis Heavy at 0.15em
            tracking. Single line, ivory on the inky-moss canvas. The
            previous version used the signature script for the month name
            plus a tiny "{year} · IN REVIEW" eyebrow; the brief asks for
            the header itself to carry the "IN REVIEW" treatment. */}
        <h1 style={{
          fontFamily: "var(--font-display)",
          fontSize: 20, fontWeight: 700, letterSpacing: "0.15em",
          textTransform: "uppercase", color: IVORY,
          margin: 0, lineHeight: 1.2,
        }}>
          {monthLabel} in Review
        </h1>
        <p style={{
          fontFamily: "var(--font-body)",
          fontSize: 10, fontWeight: 400, letterSpacing: "0.22em",
          textTransform: "uppercase", color: "rgba(255,255,255,0.4)",
          margin: "6px 0 0",
        }}>
          {year}
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
              color: "rgba(255,255,255,0.6)", margin: 0,
            }}>
              Gathering your month…
            </p>
          )}

          {!loading && failed && (
            <p style={{
              fontFamily: "var(--font-body)",
              fontSize: 14, color: "rgba(255,255,255,0.6)",
              margin: 0, lineHeight: 1.7,
            }}>
              Your recap will be ready soon.
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

        {/* Cycle-pattern insight — LLM-generated single-sentence
            observation of any notable phase-correlated pattern in
            the user's tracked reactions + reflections. Renders only
            when the 3-cycle gate passed AND the endpoint returned
            a non-empty insight. */}
        {insight && (
          <div style={{
            margin: "0 auto 40px",
            maxWidth: 420,
            padding: "18px 20px",
            background: "rgba(250,249,244,0.05)",
            border: "1px solid rgba(250,249,244,0.16)",
            borderRadius: 12,
            textAlign: "center",
          }}>
            <p style={{
              fontFamily: "var(--font-display)",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.18em",
              textTransform: "uppercase", color: "rgba(255,255,255,0.55)",
              margin: "0 0 10px",
            }}>
              Cycle Pattern
            </p>
            <p style={{
              fontFamily: "var(--font-body)",
              fontSize: 14, fontWeight: 400,
              lineHeight: 1.6, letterSpacing: "0.01em",
              color: IVORY,
              margin: 0,
            }}>
              {insight}
            </p>
          </div>
        )}

        {/* Skin-goal tracker — returns null if the user has no
            active goals, so the recap reads unchanged for anyone
            not tracking. */}
        <SkinGoalsSection
          goals={skinGoals}
          onMarkMet={onMarkSkinGoalMet}
          onAdd={onAddSkinGoal}
          onRemove={onRemoveSkinGoal}
        />

        {/* Silver divider before signoff */}
        <div style={{
          width: 80, height: 1,
          margin: "0 auto 30px",
          background: "linear-gradient(90deg, transparent 0%, rgba(192,192,192,0.55) 50%, transparent 100%)",
        }} />

        {/* Closing signature */}
        <p style={{
          fontFamily: "var(--font-display)",
          fontSize: 11, fontWeight: 700, letterSpacing: "0.15em",
          textTransform: "uppercase", color: IVORY,
          margin: "0 0 18px", opacity: 0.8,
        }}>
          Built around you.
        </p>

        {/* Cygne logo as the closing element — moved here from the top per
            the brief. Forced white via brightness(0) invert(1) so the PNG
            paints against the dark canvas. */}
        <img
          src="/cygne-logo.png"
          alt="Cygne"
          style={{
            width: 60, height: "auto",
            margin: "0 auto", display: "block",
            filter: "brightness(0) invert(1)",
            opacity: 0.85,
          }}
        />
      </div>
    </div>
  );
}
