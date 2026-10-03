import { useState, useEffect, useRef } from "react";
import { Icon } from "./components.jsx";
import { detectActives } from "./engine.js";
import { daysBetweenLocal, toLocalMidnight } from "./utils.jsx";


const RAMP_SCHEDULES = {
  retinol: {
    label: "Retinol",
    color: "#8b7355",
    colorBg: "rgba(var(--rgb-bronze), 0.08)",
    colorBorder: "rgba(var(--rgb-bronze), 0.16)",
    phases: [
      {
        name: "Patch",
        weeks: [1],
        frequency: "1× this week",
        instruction: "Apply a small amount to your jawline or behind one ear for 2 nights. Watch for redness, stinging, or flaking.",
        onTrack: "No reaction — you're clear to begin.",
        backOff: "Redness or burning — wait another week before starting.",
      },
      {
        name: "Introduce",
        weeks: [2, 3, 4],
        frequency: "1–2× per week",
        instruction: "Apply every 3–4 days on clean, dry skin. Use a gentle moisturizer after.",
        onTrack: "Mild dryness or flaking is normal. Stay the course.",
        backOff: "Stinging or peeling — drop back to once a week for two more weeks.",
      },
      {
        name: "Build",
        weeks: [5, 6, 7, 8],
        frequency: "3× per week",
        instruction: "Increase to every other day. Avoid mixing with AHA/BHA on the same night.",
        onTrack: "Skin is tolerating well. Texture improvement starts around now.",
        backOff: "Persistent irritation — return to Introduce phase for 2 weeks.",
      },
      {
        name: "Maintain",
        weeks: [9, 10, 11, 12],
        frequency: "4–5× per week",
        instruction: "Evening use most nights. You can now layer with hyaluronic acid underneath.",
        onTrack: "Full tolerance reached. Compounding benefits continue for months.",
        backOff: "If skin flares with weather changes, back off to 3× and hold.",
      },
    ],
  },
  AHA: {
    label: "AHA Exfoliant",
    color: "#8b7355",
    colorBg: "rgba(var(--rgb-bronze), 0.08)",
    colorBorder: "rgba(var(--rgb-bronze), 0.16)",
    phases: [
      {
        name: "Patch",
        weeks: [1],
        frequency: "1× this week",
        instruction: "Apply to your jawline or behind one ear for one night. AHAs can cause stinging — check your baseline before going all over.",
        onTrack: "No reaction — proceed to introduce.",
        backOff: "Burning beyond a mild tingle — try a lower-concentration formula first.",
      },
      {
        name: "Introduce",
        weeks: [2, 3, 4],
        frequency: "1× per week",
        instruction: "Use once weekly in the evening. Rinse off if it's a leave-on and your skin is new to acids.",
        onTrack: "Smooth texture after 2–3 days. Some flaking is normal.",
        backOff: "Redness lasting more than a day — wait another week and try again.",
      },
      {
        name: "Build",
        weeks: [5, 6, 7, 8],
        frequency: "2× per week",
        instruction: "Space at least 3 days apart. Do not layer with retinol on the same night.",
        onTrack: "Brighter skin, smoother texture. You're building a rhythm.",
        backOff: "Sensitivity increasing — hold at 1× per week for two more weeks.",
      },
      {
        name: "Maintain",
        weeks: [9, 10, 11, 12],
        frequency: "2–3× per week",
        instruction: "Consistent exfoliation at this frequency drives sustained results. SPF is non-negotiable.",
        onTrack: "Texture and tone should show clear improvement by now.",
        backOff: "Reduce frequency in summer or when using other active treatments.",
      },
    ],
  },
  BHA: {
    label: "BHA Exfoliant",
    // Moss accent instead of ivory — the ivory value was invisible on
    // the ivory Progress band. Moss reads on both surfaces (dark green
    // on ivory, dark green on the dark-canvas card's ivory-tinted wash).
    color: "#2d3d2b",
    colorBg: "rgba(var(--rgb-moss), 0.08)",
    colorBorder: "rgba(var(--rgb-moss), 0.16)",
    phases: [
      {
        name: "Patch",
        weeks: [1],
        frequency: "1× this week",
        instruction: "Apply a small amount to your chin or jaw for one night. BHA is generally well-tolerated.",
        onTrack: "No reaction — begin introducing.",
        backOff: "Unusual dryness or peeling — hold another week.",
      },
      {
        name: "Introduce",
        weeks: [2, 3, 4],
        frequency: "2× per week",
        instruction: "Apply on cleansed skin, let it absorb before moisturizer. Great for congestion and pores.",
        onTrack: "Blackheads loosening, pores looking smaller — it's working.",
        backOff: "Over-drying — reduce to once weekly and add more moisturizer.",
      },
      {
        name: "Build",
        weeks: [5, 6, 7, 8],
        frequency: "3–4× per week",
        instruction: "Can increase to every other day if skin is tolerating well. Don't mix with AHA same night.",
        onTrack: "Skin staying clear. This is the maintenance sweet spot for most people.",
        backOff: "Dryness or breakout flare — ease back to 2× and hold.",
      },
      {
        name: "Maintain",
        weeks: [9, 10, 11, 12],
        frequency: "Daily or as needed",
        instruction: "Some people use BHA daily long-term. Read your skin week to week.",
        onTrack: "Pores, clarity, and texture should be noticeably improved.",
        backOff: "Reduce in winter or if barrier feels compromised.",
      },
    ],
  },
  "vitamin C": {
    label: "Vitamin C",
    color: "#8b7355",
    colorBg: "rgba(var(--rgb-bronze), 0.08)",
    colorBorder: "rgba(var(--rgb-bronze), 0.16)",
    phases: [
      {
        name: "Patch",
        weeks: [1],
        frequency: "1× this week",
        instruction: "Apply a few drops to your jawline for two mornings. Vitamin C oxidises quickly — if it stings or turns skin orange, the formula has degraded.",
        onTrack: "No reaction — proceed. Apply in the morning before SPF.",
        backOff: "Stinging or redness — try a lower percentage (5–10%) first.",
      },
      {
        name: "Introduce",
        weeks: [2, 3, 4],
        frequency: "Every other morning",
        instruction: "Apply after cleansing, before moisturizer. Always follow with SPF — Vitamin C amplifies photosensitivity.",
        onTrack: "Skin looks brighter after 2–3 weeks. That's the antioxidant working.",
        backOff: "Tingling beyond the first minute — dilute with moisturizer until tolerance builds.",
      },
      {
        name: "Build",
        weeks: [5, 6, 7, 8],
        frequency: "Every morning",
        instruction: "Daily morning use. Store in a cool, dark place to prevent oxidation.",
        onTrack: "Pigmentation fading, overall tone evening out.",
        backOff: "If you're using retinol at night, space by at least 8 hours.",
      },
      {
        name: "Maintain",
        weeks: [9, 10, 11, 12],
        frequency: "Daily — morning routine",
        instruction: "Vitamin C is a long-term investment. Results compound over months, not days.",
        onTrack: "Sustained brightness and antioxidant protection. Don't skip SPF.",
        backOff: "If the formula has oxidised (turned orange/brown), replace it.",
      },
    ],
  },
  "azelaic acid": {
    label: "Azelaic Acid",
    color: "#8b7355",
    colorBg: "rgba(var(--rgb-bronze), 0.08)",
    colorBorder: "rgba(var(--rgb-bronze), 0.16)",
    phases: [
      {
        name: "Patch",
        weeks: [1],
        frequency: "1× this week",
        instruction: "Apply a small amount to your jawline or behind one ear for 2 nights. Mild tingling that fades within a minute is common.",
        onTrack: "No reaction beyond brief tingling — you're clear to begin.",
        backOff: "Burning or flushing that lingers — wait another week before starting. Hives or swelling — stop and check with a doctor.",
      },
      {
        name: "Introduce",
        weeks: [2, 3],
        frequency: "Every other evening",
        instruction: "Apply every other evening on clean, dry skin. A light tingle or itch in the first minute is common and should fade quickly.",
        onTrack: "Mild, short-lived tingling is normal. Stay the course.",
        backOff: "Tingling that lingers or visible redness — drop back to twice a week for another week.",
      },
      {
        name: "Build",
        weeks: [4, 5, 6],
        frequency: "Nightly",
        instruction: "Increase to every evening, after cleansing and before moisturizer. If you also use an AHA or BHA, keep them on separate nights for now.",
        onTrack: "Skin is tolerating well. Results from azelaic acid are gradual — think weeks, not days.",
        backOff: "Persistent irritation — return to Introduce phase for 1–2 weeks.",
      },
      {
        name: "Maintain",
        weeks: [7, 8, 9, 10, 11, 12],
        frequency: "Nightly or AM+PM if tolerated",
        instruction: "Most people settle at nightly use. If your skin handles it well, you can add a morning application, following your product's directions and finishing with SPF.",
        onTrack: "Full tolerance reached. Benefits build gradually with consistent use.",
        backOff: "If skin flares with weather changes or other actives, back off to nightly only and hold.",
      },
    ],
  },
  "toning pad": {
    label: "Toning Pad (BHA/AHA)",
    color: "#8b7355",
    colorBg: "rgba(var(--rgb-bronze), 0.08)",
    colorBorder: "rgba(var(--rgb-bronze), 0.16)",
    phases: [
      { name: "Patch", weeks: [1], frequency: "Patch test first", instruction: "Apply to your jawline or cheek for 2 nights before using all over. Daily-dose actives are gentler but still worth checking.", onTrack: "No reaction — you're clear to start daily use.", backOff: "Any irritation — give skin 3 days rest before trying again." },
      { name: "Introduce", weeks: [2, 3], frequency: "Daily — PM only", instruction: "Use once daily in the evening. Apply after cleansing, before serum. BHA pads can be used AM too once tolerated.", onTrack: "Skin feels smooth, no flaking or redness.", backOff: "Stinging or peeling — drop to every other night for a week." },
      { name: "Build", weeks: [4, 5, 6], frequency: "Daily — AM + PM", instruction: "If BHA, you can now use AM and PM. If AHA, keep to PM. Let the pad sit for 30–60 seconds before next step.", onTrack: "Pores look refined, texture improving.", backOff: "Any sensitivity flare — return to PM only for a week." },
      { name: "Maintain", weeks: [7], frequency: "Daily as tolerated", instruction: "This is your long-term rhythm. BHA pads work best as a consistent daily habit rather than spot treatment.", onTrack: "Consistent use is the goal — no need to push further.", backOff: "If skin feels stripped, add a hydrating toner after the pad." },
    ],
  }
};

const RAMP_ACTIVES = ["retinol", "AHA", "BHA", "vitamin C", "azelaic acid"];

// Concern-aware pacing. Users who state Rosacea or Cystic/hormonal
// acne in their skin profile get a more conservative Introduce Slowly
// schedule: Patch and Introduce each run one week longer, everything
// after shifts to make room, and the Maintain-phase frequency is
// capped one step lower than the default cadence. Everyone else gets
// the standard schedule unchanged.
//
// Applied per schedule type (retinol / AHA / BHA / vitamin C / azelaic
// acid / toning pad) — never a blanket app-wide change. When concerns is empty or
// undefined we return the base schedule reference, so downstream
// referential-equality checks stay identity-stable for standard-pace
// users.
const SENSITIVITY_CONCERNS = new Set(["Rosacea", "Cystic/hormonal acne"]);

const SENSITIVE_MAINTAIN_FREQUENCY = {
  retinol:      "3× per week",
  AHA:          "1–2× per week",
  BHA:          "3–4× per week",
  "vitamin C":  "Every other morning",
  "toning pad": "Daily — PM only",
  // One notch down from the default Maintain frequency ("Nightly or
  // AM+PM if tolerated"), same pattern every other active uses — drops
  // the AM+PM escalation rather than reducing below nightly, since
  // azelaic acid is already one of the gentler Maintain-phase cadences.
  "azelaic acid": "Nightly",
};

function isSensitivityConcern(concerns) {
  if (!Array.isArray(concerns) || concerns.length === 0) return false;
  return concerns.some(c => SENSITIVITY_CONCERNS.has(c));
}

// Transform a base schedule into its paced variant. Patch grows by 1
// week (extend from the end). Introduce shifts forward 1 (accounting
// for the extra Patch week) and also grows by 1. Build and Maintain
// shift forward by 2 (Patch + Introduce each added a week). Maintain
// frequency is overridden with the sensitivity-tier cadence when one
// is defined for the schedule. Everything else — instructions,
// on-track / back-off copy, colors — comes through from the base
// unchanged so a single source of truth for the standard schedule
// remains in RAMP_SCHEDULES.
function paceScheduleForSensitivity(baseSchedule, activeKey) {
  const sensitiveMaint = SENSITIVE_MAINTAIN_FREQUENCY[activeKey];
  const phases = baseSchedule.phases.map(p => {
    let weeks;
    if (p.name === "Patch") {
      const last = p.weeks[p.weeks.length - 1];
      weeks = [...p.weeks, last + 1];
    } else if (p.name === "Introduce") {
      const shifted = p.weeks.map(w => w + 1);
      const last = shifted[shifted.length - 1];
      weeks = [...shifted, last + 1];
    } else {
      // Build, Maintain, and any future phases shift by 2 weeks total.
      weeks = p.weeks.map(w => w + 2);
    }
    const frequency = p.name === "Maintain" && sensitiveMaint ? sensitiveMaint : p.frequency;
    return { ...p, weeks, frequency };
  });
  return { ...baseSchedule, phases };
}

// Public accessor used by every consumer that previously read
// RAMP_SCHEDULES[activeKey] directly. concerns is optional; when
// omitted or without a sensitivity flag the base schedule is
// returned by reference.
function getRampSchedule(activeKey, concerns) {
  const base = RAMP_SCHEDULES[activeKey];
  if (!base) return null;
  if (!isSensitivityConcern(concerns)) return base;
  return paceScheduleForSensitivity(base, activeKey);
}

// Small helper the card + any future consumer can use to know whether
// a paced schedule is in effect for the current user, without having
// to compare the schedule object to the base itself.
function isSchedulePaced(concerns) {
  return isSensitivityConcern(concerns);
}

// True when the product's ingredient list specifies azelaic acid above
// 10% — 10% and below are the common gentler OTC concentrations;
// anything stronger (15%, 20%, or an in-between compounded strength
// like 14.5% or 18%) is typically prescribed. This only drives a
// one-line reminder on the card — the prescribed strength still
// follows the same Introduce Slowly pacing; the note just points the
// user to their prescriber's own directions when they conflict with
// the in-app schedule.
function isHighStrengthAzelaic(ingredients) {
  const ing = Array.isArray(ingredients) ? ingredients.join(" ") : String(ingredients || "");
  const match = ing.toLowerCase().match(/azelaic acid\s*(\d+(?:\.\d+)?)\s*%/);
  if (!match) return false;
  const pct = parseFloat(match[1]);
  return pct > 10;
}

function getRampPhase(schedule, week) {
  for (const phase of schedule.phases) {
    if (phase.weeks.includes(week)) return phase;
  }
  return schedule.phases[schedule.phases.length - 1]; // Maintain forever
}

// Compute the current Introduce Slowly week from the product's
// routineStartDate. Week 1 starts on the start date; each subsequent week
// begins exactly 7 local days later. Falls back to stored rampWeek only
// when no start date is set.
function getRampWeek(product, today = new Date()) {
  if (!product) return 1;
  if (product.routineStartDate) {
    const days = daysBetweenLocal(product.routineStartDate, today);
    return Math.max(1, Math.floor(days / 7) + 1);
  }
  return product.rampWeek || 1;
}

// Derive per-product suggestion signals from the ramp_checkins history.
// This is the read-side counterpart to saveRampCheckin — the system
// listens to what the user reports each week and surfaces a hint
// rather than auto-changing pacing.
//
//   suggestHold — true when the most recent check-in FOR THE CURRENT
//     WEEK reported irritation (mild_irritation) or a breakout. Only
//     the current week is checked; older weeks are past guidance.
//
//   recentTrend — { consecutivePositive: N } — walk back from the
//     current week counting how many consecutive weeks had a positive
//     most-recent response (no_reaction or loving_it). Breaks on the
//     first week with no entry or a non-positive entry. Not surfaced
//     visually yet; kept accessible for future "safe to progress
//     faster" logic.
const NEGATIVE_RESPONSE_STATES = new Set(["breakout", "mild_irritation"]);
const POSITIVE_RESPONSE_STATES = new Set(["no_reaction", "loving_it"]);

function deriveRampSignals(rampCheckins, productId, currentWeek) {
  const empty = { suggestHold: false, recentTrend: { consecutivePositive: 0 } };
  if (!Array.isArray(rampCheckins) || !productId || !currentWeek) return empty;
  const forProduct = rampCheckins.filter(c => c && c.product_id === productId);
  if (forProduct.length === 0) return empty;
  const sortDesc = (a, b) => String(b?.created_at || "").localeCompare(String(a?.created_at || ""));

  const mostRecentThisWeek = forProduct
    .filter(c => c.week_number === currentWeek)
    .sort(sortDesc)[0] || null;
  const suggestHold = !!mostRecentThisWeek && NEGATIVE_RESPONSE_STATES.has(mostRecentThisWeek.response_state);

  let consecutivePositive = 0;
  for (let w = currentWeek; w >= 1; w--) {
    const latest = forProduct.filter(c => c.week_number === w).sort(sortDesc)[0];
    if (latest && POSITIVE_RESPONSE_STATES.has(latest.response_state)) {
      consecutivePositive++;
    } else {
      break;
    }
  }

  return { suggestHold, recentTrend: { consecutivePositive } };
}

// Days the product has been on its current ramp week, counting today
// (day 1 of a week is the day it starts, day 7 the last day before the
// calendar rolls it into the next). null without a usable start date, or
// before the start.
function getRampDaysAtWeek(product, today = new Date()) {
  if (!product?.routineStartDate) return null;
  const days = daysBetweenLocal(product.routineStartDate, today);
  if (days < 0) return null;
  return days - 7 * Math.floor(days / 7) + 1;
}

// Whether a product's skin has handled its current week well enough to
// advance. `checkIns` are the ramp_checkins rows ({ product_id,
// week_number, response_state, created_at }). Ready only when ALL hold:
//   1. at least 5 days at the current week (today counts, so this holds
//      on days 5–7 of a week; weeks are calendar-driven and roll over
//      after day 7);
//   2. at least one of this product's check-ins during that stretch;
//   3. none of the check-ins in the stretch reported irritation
//      (mild_irritation);
//   4. deriveRampSignals' suggestHold is false (the most recent check-in
//      for the current week isn't a breakout or irritation).
const READY_MIN_DAYS_AT_WEEK = 5;

function isReadyToAdvance(product, checkIns, today = new Date()) {
  if (!product?.id) return false;
  const daysAtWeek = getRampDaysAtWeek(product, today);
  if (daysAtWeek == null || daysAtWeek < READY_MIN_DAYS_AT_WEEK) return false;

  // The stretch: from local midnight of the current week's first day.
  const weekStart = new Date(toLocalMidnight(today));
  weekStart.setDate(weekStart.getDate() - (daysAtWeek - 1));
  const stretchStartMs = weekStart.getTime();

  const inStretch = (Array.isArray(checkIns) ? checkIns : []).filter(c =>
    c?.product_id === product.id && Date.parse(c.created_at) >= stretchStartMs
  );
  if (inStretch.length === 0) return false;
  if (inStretch.some(c => c.response_state === "mild_irritation")) return false;

  return !deriveRampSignals(checkIns, product.id, getRampWeek(product, today)).suggestHold;
}

function formatStartedLabel(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return `Started ${dt.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`;
}

// Introduce Slowly card — combined routine info + weekly check-in in
// one card per product. Was previously two stacked cards (RampCheckinCard
// on top, IntroduceSlowlyCard below). The check-in state + submit flow
// is folded in here; RampCheckinCard the component is kept for the
// push-notification deep-link modal but no longer rendered on the
// Progress screen.
//
// Visual base is the moss-tinted RampCheckinCard treatment
// (rgba(45,61,43,0.06) bg + 22% moss border, 14px radius) — chosen
// over the schedule's warm-tan tint so every ramp card looks the same
// regardless of ingredient. Ingredient identity still comes through
// via the category chip and the phase-dot color.
const RESPONSE_OPTIONS = [
  { key: "no_reaction",     label: "No reaction"     },
  { key: "loving_it",       label: "Loving it"       },
  { key: "mild_irritation", label: "Mild irritation" },
  { key: "breakout",        label: "Breakout"        },
];

const CHECKIN_SUCCESS_HOLD_MS = 900;

function IntroduceSlowlyCard({
  product,
  schedule,
  weekNumber: weekNumberProp,
  onResetStart,
  onAdvance,
  onHold,
  checkinDue = false,
  onCheckinSave,
  onCheckinDone,
  isLast = false,
  // Read-only combined hold-suggestion object: { active, message }.
  // Progress computes this per card by merging the check-in signal
  // (irritation reported for the current week) with the global
  // cycle-phase signal (in / entering luteal). The card points the
  // user at the Advance/Hold controls behind the expand toggle when
  // active — never auto-applies a hold. recentTrend is accepted but
  // not yet surfaced — future pacing logic will read
  // consecutivePositive to decide when a faster progression is safe
  // to offer.
  holdSuggestion = { active: false, message: null },
  // eslint-disable-next-line no-unused-vars
  recentTrend = { consecutivePositive: 0 },
  // True when the schedule was pre-paced for a sensitivity concern
  // (Rosacea / Cystic-hormonal acne). Surfaces a soft caption so the
  // user understands why their timeline looks different from the
  // standard one — without naming their specific concern back to them.
  schedulePaced = false,
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pickedDate, setPickedDate] = useState("");

  const holdSuggestionActive = !!holdSuggestion?.active;

  // Auto-expand the card the FIRST time a suggestion becomes active
  // so the user sees the Advance/Hold controls without hunting for
  // them. If the user then manually collapses (or the suggestion
  // stays active across renders), we don't re-expand — the effect
  // only fires when active flips false → true.
  const prevHoldActiveRef = useRef(false);
  useEffect(() => {
    if (holdSuggestionActive && !prevHoldActiveRef.current) {
      setExpanded(true);
    }
    prevHoldActiveRef.current = holdSuggestionActive;
  }, [holdSuggestionActive]);
  // Check-in local state (was in the separate RampCheckinCard before the
  // two cards were combined). Reset to idle after a successful save so
  // next week's check-in starts fresh.
  const [picked, setPicked] = useState(null);
  const [note, setNote] = useState("");
  const [checkinStatus, setCheckinStatus] = useState("idle"); // "idle" | "saving" | "saved" | "error"
  const [checkinError, setCheckinError] = useState(null);

  const weekNumber = weekNumberProp ?? getRampWeek(product);
  const phase = getRampPhase(schedule, weekNumber);
  const phaseIndex = schedule.phases.findIndex(p => p.weeks.includes(Math.min(weekNumber, 12)));
  const isHeld = product.rampHeld === true;
  const clampedPhaseIndex = Math.min(phaseIndex, schedule.phases.length - 1);
  const startedLabel = formatStartedLabel(product.routineStartDate);
  const maxWeek = Math.max(...schedule.phases[schedule.phases.length - 1].weeks);
  // schedule.label survives the sensitivity-pacing transform unchanged
  // (paceScheduleForSensitivity only rewrites phases), so this check
  // holds for both the base and paced azelaic acid schedule.
  const showHighStrengthNote = schedule.label === "Azelaic Acid" && isHighStrengthAzelaic(product.ingredients);

  const saving = checkinStatus === "saving";
  const saved  = checkinStatus === "saved";
  const showCheckin = checkinDue;

  const submitCheckin = async () => {
    if (!picked || saving || saved) return;
    setCheckinStatus("saving");
    setCheckinError(null);
    try {
      await onCheckinSave?.(picked, note.trim() || null);
      setCheckinStatus("saved");
      await new Promise(r => setTimeout(r, CHECKIN_SUCCESS_HOLD_MS));
      onCheckinDone?.();
      // Local reset so when this week's checkinDue flips to false and a
      // future week re-enables it, the pill grid starts empty again.
      setPicked(null);
      setNote("");
      setCheckinStatus("idle");
    } catch (e) {
      setCheckinStatus("error");
      setCheckinError(e?.message || "Couldn't save your check-in. Please try again.");
    }
  };

  return (
    // Editorial flat container — no border/bg/radius. Each product reads
    // as its own section separated from neighbours by hair rules.
    // Matches the dashboard's editorial line-item treatment inverted for
    // the ivory band.
    <div style={{
      padding: "var(--space-4) 0",
      borderTop: "1px solid rgba(var(--rgb-ivory), 0.32)",
      borderBottom: isLast ? "1px solid rgba(var(--rgb-ivory), 0.32)" : "none",
    }}>
      {/* Header row: week badge (when check-in due) + expand chevron */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", minWidth: 0, flexWrap: "wrap" }}>
          {showCheckin ? (
            <>
              <span style={{
                display: "inline-flex", alignItems: "center",
                padding: "var(--space-1) var(--space-3)",
                border: "1px solid rgba(var(--rgb-moss), 0.32)",
                borderRadius: "var(--radius-pill)",
                fontFamily: "var(--font-display)",
                fontSize: "var(--text-xs)", fontWeight: 700, letterSpacing: "var(--tracking-display)",
                color: "var(--sage, #2d3d2b)",
                whiteSpace: "nowrap", lineHeight: 1,
              }}>Week {weekNumber}</span>
              <span style={{
                fontFamily: "var(--font-display)", fontSize: "var(--text-xs)", fontWeight: 700,
                letterSpacing: "var(--tracking-display)", textTransform: "uppercase",
                color: "var(--sage, #2d3d2b)", opacity: 0.75,
              }}>Check-in</span>
            </>
          ) : (
            <span style={{
              fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 400,
              letterSpacing: "var(--tracking-label)", textTransform: "uppercase",
              color: schedule.color, background: `${schedule.color}18`,
              padding: "2px var(--space-2)", borderRadius: "var(--radius-pill)",
              whiteSpace: "nowrap",
            }}>{schedule.label}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          aria-expanded={expanded}
          aria-label={expanded ? "Hide phase details" : "Show phase details"}
          style={{
            background: "none", border: "none", padding: "var(--space-1)", cursor: "pointer",
            color: "var(--clay)", opacity: 0.65,
            transform: expanded ? "rotate(90deg)" : "none",
            transition: "transform 0.2s, opacity 0.2s",
            display: "inline-flex", flexShrink: 0,
            WebkitAppearance: "none", appearance: "none",
            WebkitTapHighlightColor: "transparent",
          }}>
          <Icon name="chevron" size={13} />
        </button>
      </div>

      {/* Product name — visual anchor */}
      <p style={{
        fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", fontWeight: 400,
        color: "var(--parchment)", margin: "0 0 var(--space-2)",
        lineHeight: 1.35,
      }}>{product.name}</p>

      {/* Routine metadata */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap", marginBottom: "var(--space-2)" }}>
        {showCheckin && (
          <span style={{
            fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 400,
            letterSpacing: "var(--tracking-label)", textTransform: "uppercase",
            color: schedule.color, background: `${schedule.color}18`,
            padding: "2px var(--space-2)", borderRadius: "var(--radius-pill)",
          }}>{schedule.label}</span>
        )}
        <span style={{
          fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)",
          textTransform: "uppercase",
          color: isHeld ? "var(--color-bronze)" : "var(--clay)", opacity: 0.85,
        }}>Week {Math.min(weekNumber, maxWeek)} of {maxWeek} · {isHeld ? "Holding" : phase.name}</span>
      </div>

      <p style={{
        fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: schedule.color,
        margin: 0, letterSpacing: "0.04em",
      }}>{phase.frequency}</p>
      {startedLabel && (
        <p style={{
          fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)",
          margin: "var(--space-1) 0 0", opacity: 0.7, letterSpacing: "0.04em",
        }}>{startedLabel}</p>
      )}
      {schedulePaced && (
        <p style={{
          fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontStyle: "italic",
          color: "var(--clay)", opacity: 0.75,
          margin: "var(--space-2) 0 0", letterSpacing: "0.02em", lineHeight: 1.5,
        }}>
          Paced more gradually based on your skin profile.
        </p>
      )}
      {showHighStrengthNote && (
        <p style={{
          fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontStyle: "italic",
          color: "var(--clay)", opacity: 0.75,
          margin: "var(--space-2) 0 0", letterSpacing: "0.02em", lineHeight: 1.5,
        }}>
          If this was prescribed, follow your prescriber's directions first.
        </p>
      )}

      {/* Phase progress dots — small horizontal strip, one per phase */}
      <div style={{ display: "flex", gap: "var(--space-1)", marginTop: "var(--space-3)" }}>
        {schedule.phases.map((p, i) => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: "50%",
            background: i <= clampedPhaseIndex ? schedule.color : "var(--border)",
            transition: "background 0.3s",
          }} />
        ))}
      </div>

      {/* Held indicator — inline italic caption; no bordered chip so it
          reads as running commentary on the ivory band. */}
      {isHeld && (
        <p style={{
          fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 400,
          fontStyle: "italic",
          color: "var(--color-bronze)", margin: "var(--space-3) 0 0",
          letterSpacing: "0.02em",
        }}>
          Paused — repeat this week
        </p>
      )}

      {/* Suggestion nudge — surfaces the combined hold suggestion
          (check-in irritation, luteal-phase sensitivity, or both).
          Points at the Advance/Hold controls behind the expand
          toggle: the whole line is a tap target that opens the
          expanded section, and the useEffect above auto-expands on
          first appearance. Never auto-applies a hold; the user still
          confirms via the Hold button in the expanded controls. */}
      {holdSuggestionActive && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label={`${holdSuggestion.message} Open pacing controls.`}
          style={{
            display: "block", width: "100%", textAlign: "left",
            background: "none", border: "none", padding: 0,
            margin: "var(--space-3) 0 0",
            cursor: "pointer",
            WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
          }}
        >
          <span style={{
            fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 400,
            fontStyle: "italic",
            color: "var(--color-bronze)",
            letterSpacing: "0.02em", lineHeight: 1.55,
          }}>
            {holdSuggestion.message}
          </span>
        </button>
      )}

      {/* Check-in section — inline when a new ramp week is due */}
      {showCheckin && (
        <div style={{ marginTop: "var(--space-4)", paddingTop: "var(--space-4)", borderTop: "1px solid rgba(var(--rgb-ivory), 0.16)" }}>
          <p style={{
            fontFamily: "var(--font-body)", fontSize: "var(--text-xs)",
            color: "var(--clay, var(--color-stone))", margin: "0 0 var(--space-3)",
            lineHeight: 1.55, opacity: 0.85,
          }}>How did your skin respond this week?</p>

          {/* Response grid — same ivory-pill treatment used by the
              standalone RampCheckinCard so the modal + inline check-ins
              stay visually consistent. */}
          <div
            aria-disabled={saving || saved}
            style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)", marginBottom: "var(--space-3)",
              opacity: (saving || saved) ? 0.55 : 1,
              pointerEvents: (saving || saved) ? "none" : "auto",
              transition: "opacity 0.18s",
            }}
          >
            {RESPONSE_OPTIONS.map(r => {
              const isSelected = picked === r.key;
              return (
                <button
                  key={r.key}
                  onClick={() => setPicked(r.key)}
                  disabled={saving || saved}
                  style={{
                    padding: "var(--space-3) var(--space-2)",
                    background: "rgba(var(--rgb-ivory), 0.82)",
                    border: isSelected
                      ? "1px solid rgba(var(--rgb-ink), 0.82)"
                      : "1px solid rgba(var(--rgb-ink), 0.16)",
                    borderRadius: "var(--radius)",
                    fontFamily: "var(--font-body)",
                    fontSize: "var(--text-xs)", fontWeight: 400,
                    letterSpacing: "var(--tracking-label)", textTransform: "uppercase",
                    color: "var(--color-ink)",
                    cursor: (saving || saved) ? "default" : "pointer",
                    transition: "border-color 0.18s",
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>

          {picked && (
            <>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value.slice(0, 500))}
                placeholder="Optional note — anything you want to remember about this week."
                rows={2}
                disabled={saving || saved}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "var(--space-2) var(--space-3)",
                  background: "rgba(var(--rgb-ivory), 0.08)",
                  border: "1px solid rgba(var(--rgb-moss), 0.16)",
                  borderRadius: "var(--radius)",
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--text-xs)",
                  color: "var(--parchment, var(--color-ivory))",
                  resize: "none",
                  outline: "none",
                  marginBottom: "var(--space-3)",
                  opacity: (saving || saved) ? 0.55 : 1,
                  transition: "opacity 0.18s",
                }}
              />

              {checkinStatus === "error" && checkinError && (
                <p role="alert" style={{
                  fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--color-bronze)",
                  margin: "0 0 var(--space-3)", lineHeight: 1.5, letterSpacing: "0.01em",
                }}>{checkinError}</p>
              )}

              <button
                onClick={submitCheckin}
                disabled={saving || saved}
                aria-live="polite"
                style={{
                  width: "100%",
                  padding: "var(--space-3) 0",
                  background: saved ? "rgba(var(--rgb-ivory), 0.82)" : "rgba(var(--rgb-moss), 0.08)",
                  border: saved ? "1px solid rgba(var(--rgb-ink), 0.82)" : "1px solid rgba(var(--rgb-moss), 0.32)",
                  borderRadius: "var(--radius)",
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--text-xs)", fontWeight: 400,
                  letterSpacing: "var(--tracking-label)", textTransform: "uppercase",
                  color: saved ? "var(--color-ink)" : "var(--sage, #2d3d2b)",
                  cursor: (saving || saved) ? "default" : "pointer",
                  opacity: saving ? 0.7 : 1,
                  transition: "background 0.18s, border-color 0.18s, color 0.18s, opacity 0.18s",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {saving ? "Saving…" : saved ? "Saved" : checkinStatus === "error" ? "Try again" : "Save check-in"}
                {saved && (
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" style={{ display: "inline-block", verticalAlign: "middle", marginLeft: "var(--space-2)" }}>
                    <path d="M2 7.5 L5.5 11 L12 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </>
          )}
        </div>
      )}

      {/* Expanded phase detail — chevron-toggled, so the always-visible
          card stays compact until the user opts in. */}
      {expanded && (
        <div style={{ marginTop: "var(--space-4)", paddingTop: "var(--space-4)", borderTop: "1px solid rgba(var(--rgb-ivory), 0.16)" }}>
          <p style={{
            fontFamily: "var(--font-body)", fontSize: "var(--text-xs)",
            color: "var(--clay)", margin: "0 0 var(--space-4)", lineHeight: 1.7,
          }}>{phase.instruction}</p>

          {/* On track / Back off — informational; flat two-column with
              colored eyebrow, no bordered box on the ivory band. */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)", marginBottom: "var(--space-4)" }}>
            <div>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 400, letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--sage)", margin: "0 0 var(--space-1)" }}>On track</p>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: 0, lineHeight: 1.55 }}>{phase.onTrack}</p>
            </div>
            <div>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 400, letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--color-bronze)", margin: "0 0 var(--space-1)" }}>Back off</p>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: 0, lineHeight: 1.55 }}>{phase.backOff}</p>
            </div>
          </div>

          {/* Manual pacing controls — user-driven Advance / Hold.
              These are the target the irritation suggestion points at.
              Held products only get the Advance button (Hold isn't
              meaningful when already paused). The final week is handled
              by App.jsx's auto-graduation safety net, so no separate
              graduation flow is needed here. */}
          {(onAdvance || onHold) && (
            isHeld ? (
              <button
                type="button"
                onClick={() => onAdvance?.(product.id)}
                style={{
                  width: "100%", padding: "var(--space-3) 0",
                  background: "rgba(var(--rgb-moss), 0.08)",
                  border: "1px solid rgba(var(--rgb-moss), 0.32)",
                  borderRadius: "var(--radius)",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "var(--space-2)",
                  fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 400,
                  letterSpacing: "var(--tracking-label)", textTransform: "uppercase",
                  color: "var(--sage, #2d3d2b)", cursor: "pointer",
                  marginBottom: "var(--space-4)",
                  WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
                  transition: "background 0.18s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(var(--rgb-moss), 0.16)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(var(--rgb-moss), 0.08)"; }}
              >
                Skin handled it — advance <Icon name="check" size={10} />
              </button>
            ) : (
              <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}>
                <button
                  type="button"
                  onClick={() => onAdvance?.(product.id)}
                  style={{
                    flex: 1, padding: "var(--space-3) 0",
                    background: "rgba(var(--rgb-moss), 0.08)",
                    border: "1px solid rgba(var(--rgb-moss), 0.32)",
                    borderRadius: "var(--radius)",
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "var(--space-2)",
                    fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 400,
                    letterSpacing: "var(--tracking-label)", textTransform: "uppercase",
                    color: "var(--sage, #2d3d2b)", cursor: "pointer",
                    WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
                    transition: "background 0.18s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(var(--rgb-moss), 0.16)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(var(--rgb-moss), 0.08)"; }}
                >
                  Skin handled it <Icon name="check" size={10} />
                </button>
                <button
                  type="button"
                  onClick={() => onHold?.(product.id)}
                  style={{
                    flex: 1, padding: "var(--space-3) 0",
                    background: "rgba(var(--rgb-bronze), 0.08)",
                    border: "1px solid rgba(var(--rgb-bronze), 0.32)",
                    borderRadius: "var(--radius)",
                    fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 400,
                    letterSpacing: "var(--tracking-label)", textTransform: "uppercase",
                    color: "var(--color-bronze)", cursor: "pointer",
                    WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
                    transition: "background 0.18s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(var(--rgb-bronze), 0.16)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(var(--rgb-bronze), 0.08)"; }}
                >
                  Backing off
                </button>
              </div>
            )
          )}

          {/* Reset start date — pick any past date */}
          <div style={{ paddingTop: "var(--space-3)", borderTop: "1px dashed var(--border)" }}>
            {confirmReset ? (
              <div>
                <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: "0 0 var(--space-2)", opacity: 0.8 }}>Pick the date you actually started this product — the week will recalculate from there.</p>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                  <input
                    type="date"
                    value={pickedDate}
                    max={(() => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; })()}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setPickedDate(e.target.value)}
                    style={{ flex: 1, minWidth: 140, padding: "var(--space-2) var(--space-3)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--parchment)", cursor: "pointer" }}
                  />
                  <button
                    disabled={!pickedDate}
                    onClick={(e) => { e.stopPropagation(); if (!pickedDate) return; onResetStart?.(product.id, pickedDate); setConfirmReset(false); setPickedDate(""); }}
                    style={{ padding: "var(--space-2) var(--space-3)", background: pickedDate ? "rgba(var(--rgb-bronze), 0.08)" : "transparent", border: `1px solid ${pickedDate ? "rgba(var(--rgb-bronze), 0.32)" : "var(--border)"}`, borderRadius: "var(--radius)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 400, letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: pickedDate ? "var(--color-bronze)" : "var(--clay)", cursor: pickedDate ? "pointer" : "not-allowed", opacity: pickedDate ? 1 : 0.5 }}>
                    Save
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setConfirmReset(false); setPickedDate(""); }}
                    style={{ padding: "var(--space-2) var(--space-3)", background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-pill)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--clay)", cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={(e) => { e.stopPropagation(); setConfirmReset(true); }}
                style={{ background: "none", border: "none", padding: 0, fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", opacity: 0.6, cursor: "pointer", letterSpacing: "0.06em", textDecoration: "underline" }}>
                Reset start date
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- WEEKLY RITUAL CALENDAR --------------------------------------------------

function WeeklyRitualCalendar({ rampProducts, products }) {
  const [selectedDay, setSelectedDay] = useState(null);
  const today = new Date();
  const todayIndex = today.getDay(); // 0=Sun,1=Mon,...6=Sat

  // We show Mon–Sun. Map day label to getDay() value
  const DAYS = [
    { label: "M", full: "Monday",    dow: 1 },
    { label: "T", full: "Tuesday",   dow: 2 },
    { label: "W", full: "Wednesday", dow: 3 },
    { label: "T", full: "Thursday",  dow: 4 },
    { label: "F", full: "Friday",    dow: 5 },
    { label: "S", full: "Saturday",  dow: 6 },
    { label: "S", full: "Sunday",    dow: 0 },
  ];

  // For each ramp product, figure out which days of the week it's scheduled
  // based on frequency + routineStartDate
  const getScheduledDows = (product) => {
    const freq = product.frequency || "daily";
    if (freq === "daily") return [0,1,2,3,4,5,6];
    if (freq === "as-needed") return [];
    if (freq === "weekly") {
      const start = product.routineStartDate ? new Date(product.routineStartDate) : new Date();
      // Find which day of week is the weekly day
      return [start.getDay()];
    }
    if (freq === "alternating") {
      const start = product.routineStartDate ? new Date(product.routineStartDate) : new Date();
      // Walk Mon-Sun and check parity
      const scheduled = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        // go to Monday of current week
        const monday = new Date(today);
        const diffToMon = (today.getDay() + 6) % 7;
        monday.setDate(today.getDate() - diffToMon + i);
        const dayDiff = Math.floor((monday - start) / 86400000);
        if (dayDiff % 2 === 0) scheduled.push(monday.getDay());
      }
      return scheduled;
    }
    if (freq === "2-3x") {
      // Mon, Wed, Fri → dow 1, 3, 5
      return [1, 3, 5];
    }
    return [0,1,2,3,4,5,6];
  };

  // Determine AM vs PM per product
  const getSession = (product) => {
    if (product.session === "am") return "am";
    if (product.session === "pm") return "pm";
    if (product.session === "both") return "both";
    // auto-detect
    const actives = Object.keys(detectActives(product.ingredients || []));
    const hasRetinol = actives.includes("retinol") || actives.includes("bakuchiol");
    const hasAHA = actives.includes("AHA");
    const hasBHA = actives.includes("BHA");
    const hasVitC = actives.includes("vitamin C");
    const hasBenzoyl = actives.includes("benzoyl peroxide");
    const hasPeptides = actives.includes("peptides");
    if (product.category === "SPF") return "am";
    if (hasVitC || hasBenzoyl) return "am";
    if (hasRetinol || hasAHA || hasPeptides) return "pm";
    if (hasBHA) return "pm";
    return "both";
  };

  // Get color for a product (from RAMP_SCHEDULES if available, else sage)
  const getColor = (product) => {
    const activeKey = product.category === "Toning Pad"
      ? "toning pad"
      : RAMP_ACTIVES.find(a => detectActives(product.ingredients || [])[a]);
    return RAMP_SCHEDULES[activeKey]?.color || "var(--sage)";
  };

  // Build per-day product lists { am: [...], pm: [...] }
  const getDayProducts = (dow) => {
    const am = [], pm = [];
    rampProducts.forEach(p => {
      const dows = getScheduledDows(p);
      if (!dows.includes(dow)) return;
      const sess = getSession(p);
      if (sess === "am" || sess === "both") am.push(p);
      if (sess === "pm" || sess === "both") pm.push(p);
    });
    return { am, pm };
  };

  const isToday = (dow) => dow === todayIndex;
  const selectedDayObj = selectedDay !== null ? DAYS[selectedDay] : null;
  const selectedProducts = selectedDayObj ? getDayProducts(selectedDayObj.dow) : null;

  return (
    <div style={{ marginBottom: "calc(var(--space-1) * 7)" }}>

      {/* 7-day strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "var(--space-1)", marginBottom: "var(--space-4)" }}>
        {DAYS.map((day, i) => {
          const { am, pm } = getDayProducts(day.dow);
          const total = new Set([...am, ...pm]).size;
          const active = isToday(day.dow);
          const selected = selectedDay === i;

          return (
            <button
              key={i}
              onClick={() => setSelectedDay(selected ? null : i)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                padding: "var(--space-3) var(--space-1) var(--space-3)",
                background: selected
                  ? "rgba(var(--rgb-moss), 0.16)"
                  : active
                  ? "rgba(var(--rgb-moss), 0.08)"
                  : "var(--surface)",
                border: selected
                  ? "1px solid rgba(var(--rgb-moss), 0.56)"
                  : active
                  ? "1px solid rgba(var(--rgb-moss), 0.32)"
                  : "1px solid var(--border)",
                borderRadius: "var(--radius)",
                cursor: "pointer",
                transition: "all 0.15s",
                gap: "var(--space-2)",
              }}>

              {/* Day label */}
              <span style={{
                fontFamily: "var(--font-body)",
                fontSize: "var(--text-xs)",
                fontWeight: 400,
                letterSpacing: "var(--tracking-label)",
                color: active ? "var(--parchment)" : "var(--clay)",
              }}>{day.label}</span>

              {/* AM dots */}
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", minHeight: 36, justifyContent: "flex-start", alignItems: "center", width: "100%" }}>
                {am.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)", justifyContent: "center" }}>
                    {am.map((p, j) => (
                      <div key={j} style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: getColor(p),
                        opacity: 0.9,
                      }} />
                    ))}
                  </div>
                )}
                {/* divider */}
                {(am.length > 0 || pm.length > 0) && (
                  <div style={{ width: "60%", height: 1, background: "var(--border)", opacity: 0.6 }} />
                )}
                {pm.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)", justifyContent: "center" }}>
                    {pm.map((p, j) => (
                      <div key={j} style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: getColor(p),
                        opacity: 0.55,
                      }} />
                    ))}
                  </div>
                )}
                {total === 0 && (
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--border)", opacity: 0.4 }} />
                )}
              </div>

              {/* Today pip */}
              {active && (
                <div style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--sage)" }} />
              )}
            </button>
          );
        })}
      </div>

      {/* AM / PM legend */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", marginBottom: selectedDay !== null ? "var(--space-4)" : 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--clay)", opacity: 0.9 }} />
          <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--clay)", opacity: 0.6 }}>AM</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--clay)", opacity: 0.45 }} />
          <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--clay)", opacity: 0.6 }}>PM</span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", opacity: 0.4, letterSpacing: "0.06em" }}>Tap a day to expand</span>
      </div>

      {/* Expanded day detail */}
      {selectedDay !== null && selectedProducts && (
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          overflow: "hidden",
          marginTop: "var(--space-1)",
        }}>
          <div style={{ padding: "var(--space-4) var(--space-4) var(--space-3)", borderBottom: "1px solid var(--border)" }}>
            <p style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-md)", fontWeight: 400, letterSpacing: "var(--tracking-label)", color: "var(--parchment)", margin: 0 }}>
              {selectedDayObj.full}
            </p>
          </div>

          {selectedProducts.am.length === 0 && selectedProducts.pm.length === 0 ? (
            <div style={{ padding: "var(--space-5) var(--space-4)" }}>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: 0, opacity: 0.6 }}>Rest day — no actives scheduled.</p>
            </div>
          ) : (
            <div>
              {["am", "pm"].map(slot => {
                const slotProducts = selectedProducts[slot];
                if (slotProducts.length === 0) return null;
                return (
                  <div key={slot} style={{ padding: "var(--space-3) var(--space-4)", borderBottom: "1px solid var(--border)" }}>
                    <p style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 400, letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 var(--space-3)", opacity: 0.55 }}>
                      <Icon name={slot === "am" ? "sun" : "moon"} size={10} /> {slot === "am" ? "Morning" : "Evening"}
                    </p>
                    {slotProducts.map((p, i) => {
                      const color = getColor(p);
                      const activeKey = p.category === "Toning Pad"
                        ? "toning pad"
                        : RAMP_ACTIVES.find(a => detectActives(p.ingredients || [])[a]);
                      const schedule = RAMP_SCHEDULES[activeKey];
                      const phase = schedule ? getRampPhase(schedule, getRampWeek(p)) : null;
                      return (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: i < slotProducts.length - 1 ? "var(--space-3)" : 0 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 400, color: "var(--parchment)", margin: "0 0 1px" }}>{p.name}</p>
                            {phase && (
                              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color, margin: 0, letterSpacing: "0.04em" }}>
                                Week {getRampWeek(p)} · {phase.frequency}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- PROGRESS ----------------------------------------------------------------

export { RAMP_SCHEDULES, RAMP_ACTIVES, IntroduceSlowlyCard, WeeklyRitualCalendar, getRampWeek, getRampPhase, getRampSchedule, isSchedulePaced, isHighStrengthAzelaic, deriveRampSignals, getRampDaysAtWeek, isReadyToAdvance };