// Canonical menstrual-cycle phase definitions for Cygne.
//
// Domain shape only — name + inclusive day range. Presentation
// styling (colors, descriptions, per-phase active-advice copy)
// lives in src/progress.jsx PHASE_META because it's UI-shaped and
// doesn't belong in a shared runtime-neutral module.
//
// The edge function `cycle-phase-alert` has a mirror copy in
// supabase/functions/_shared/cycle.ts because Deno edge functions
// can't import from src/. Any change to CYCLE_PHASES below MUST be
// reflected in that mirror — the alert relies on the phase names
// matching what's stored in cycle_phase_state.last_known_phase.

export const CYCLE_PHASES = [
  { name: "Menstrual",  days: [1, 5]   },
  { name: "Follicular", days: [6, 13]  },
  { name: "Ovulatory",  days: [14, 16] },
  { name: "Luteal",     days: [17, 35] },
];

// Look up the phase for a given cycle day. Days past the last phase
// window (e.g. cycle running long) fall back to Luteal, matching the
// pre-extraction behavior in progress.jsx's original getCyclePhase.
export function getCyclePhase(day) {
  return CYCLE_PHASES.find(p => day >= p.days[0] && day <= p.days[1])
    || CYCLE_PHASES[CYCLE_PHASES.length - 1];
}

// Compute the user's cycle day at a specific point in time. When
// eventIso is omitted, defaults to "now" — matching the 2-arg
// signature of supabase/functions/_shared/cycle.ts computeCycleDay
// (which is only ever called for "today" from the edge function).
//
// UTC-normalized on both endpoints so the result is deterministic.
// Cycle length is clamped to [21, 45] (matches the CycleTracker
// slider bounds in progress.jsx).
//
// Returns null on unusable inputs (missing / malformed start date,
// event before the recorded start). Never wraps into negatives.
//
// Cycle day is 1-indexed and wraps within the length. Days past the
// length (running long) map to (daysSince % length) + 1 so a user
// on day 30 with a 28-day length reads as day 3 — matches how
// getCurrentCycleDay in utils.jsx handles the wrap for the current
// day, only extended to arbitrary event dates.
export function computeCycleDay(cycleStartDateIso, cycleLength, eventIso) {
  if (!cycleStartDateIso || typeof cycleStartDateIso !== "string") return null;
  const startParsed = new Date(cycleStartDateIso);
  if (Number.isNaN(startParsed.getTime())) return null;
  const eventParsed = eventIso ? new Date(eventIso) : new Date();
  if (Number.isNaN(eventParsed.getTime())) return null;
  const startUtc = Date.UTC(startParsed.getUTCFullYear(), startParsed.getUTCMonth(), startParsed.getUTCDate());
  const eventUtc = Date.UTC(eventParsed.getUTCFullYear(), eventParsed.getUTCMonth(), eventParsed.getUTCDate());
  const daysSince = Math.floor((eventUtc - startUtc) / 86400000);
  if (daysSince < 0) return null;
  const len = Math.max(21, Math.min(45, cycleLength || 28));
  return (daysSince % len) + 1;
}

// Convenience: compose computeCycleDay + getCyclePhase. Returns the
// phase name or null if the inputs were unusable. Used by any caller
// that needs a phase-per-event mapping (Monthly Recap cycle-pattern
// aggregation, future correlation surfaces).
export function getCyclePhaseNameForDate(cycleStartDateIso, cycleLength, eventIso) {
  const day = computeCycleDay(cycleStartDateIso, cycleLength, eventIso);
  if (day == null) return null;
  return getCyclePhase(day).name;
}
