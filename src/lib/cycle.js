// Canonical menstrual-cycle phase definitions for Cygne.
//
// Domain shape only — name + inclusive day range for a 28-day cycle.
// Never read these ranges directly: getPhaseForDay(day, cycleLength)
// scales them to the user's cycle length. Presentation
// styling (colors, descriptions, per-phase active-advice copy)
// lives in src/progress.jsx PHASE_META because it's UI-shaped and
// doesn't belong in a shared runtime-neutral module.
//
// The edge function `cycle-phase-alert` has a mirror copy in
// supabase/functions/_shared/cycle.ts because Deno edge functions
// can't import from src/. Any change to CYCLE_PHASES below MUST be
// reflected in that mirror — the alert relies on the phase names
// matching what's stored in cycle_phase_state.last_known_phase.

export const MAX_CYCLE_DAY = 45;

export const CYCLE_PHASES = [
  { name: "Menstrual",  days: [1, 5]   },
  { name: "Follicular", days: [6, 13]  },
  { name: "Ovulatory",  days: [14, 16] },
  { name: "Luteal",     days: [17, 35] },
];

// Parse a stored cycle length (user_metadata may hold a number or a
// numeric string). Returns the length clamped to [21, 45], or null when
// nothing usable is stored so callers keep their 28-day default.
export function parseCycleLength(value) {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(21, Math.min(45, Math.round(n)));
}

// Normalize a stored cycle length the way the Cycle Ring does: integer,
// clamped to [21, 45], 28 when nothing usable is stored.
export const DEFAULT_CYCLE_LENGTH = 28;

export function normalizeCycleLength(cycleLength) {
  return Math.max(21, Math.min(MAX_CYCLE_DAY, parseInt(cycleLength, 10) || DEFAULT_CYCLE_LENGTH));
}

// CYCLE_PHASES describes a 28-day cycle (Luteal's 35 is the long-cycle
// fallback). Scale each phase end proportionally to the user's length,
// keeping phases contiguous, at least one day each, and ending exactly
// on cycleLength.
export function scalePhases(cycleLength) {
  const len = Math.max(21, Math.min(MAX_CYCLE_DAY, cycleLength || DEFAULT_CYCLE_LENGTH));
  let start = 1;
  return CYCLE_PHASES.map((phase, i) => {
    const isLast = i === CYCLE_PHASES.length - 1;
    const remaining = CYCLE_PHASES.length - 1 - i;
    const baseEnd = Math.min(phase.days[1], DEFAULT_CYCLE_LENGTH);
    const scaledEnd = isLast ? len : Math.round((baseEnd / DEFAULT_CYCLE_LENGTH) * len);
    const endDay = Math.min(Math.max(scaledEnd, start), len - remaining);
    const out = { name: phase.name, startDay: start, endDay };
    start = endDay + 1;
    return out;
  });
}

// The single answer to "which phase is day N in a cycle of length L".
// Uses the same scalePhases windows as the Cycle Ring and the Next pill.
// cycleLength may be a number, a numeric string, or missing (28). Days
// past the cycle length (running long) read as the last phase, Luteal.
// Returns { name, startDay, endDay }.
export function getPhaseForDay(day, cycleLength) {
  const phases = scalePhases(normalizeCycleLength(cycleLength));
  return phases.find(p => day >= p.startDay && day <= p.endDay) || phases[phases.length - 1];
}

// Compute the user's cycle day at a specific point in time. When
// eventIso is omitted, defaults to "now" — matching the 2-arg
// signature of supabase/functions/_shared/cycle.ts computeCycleDay
// (which is only ever called for "today" from the edge function).
//
// UTC-normalized on both endpoints so the result is deterministic.
//
// Cycle day is 1-indexed and never wraps: a cycle only restarts when
// the user logs a new cycleStartDate. Past the cycle length it keeps
// counting (day 30 of a 28-day cycle is day 30, Luteal), up to
// MAX_CYCLE_DAY — the same "running long" rule as getCurrentCycleDay in
// utils.jsx. cycleLength is accepted for signature compatibility but no
// longer changes the result.
//
// Returns null on unusable inputs (missing / malformed dates), for an
// event before the recorded start, and for an event more than
// MAX_CYCLE_DAY days after it — the start date is stale at that point,
// and callers treat null as "no usable cycle day".
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
  const day = daysSince + 1;
  return day > MAX_CYCLE_DAY ? null : day;
}

// Cycle day for any past date (e.g. a check-in). On or after the current cycleStartDate this
// is the app-wide rule (computeCycleDay: no wrapping, null past day 45).
// Before it, there's no recorded start for the previous cycle, so the day
// is estimated by counting back in cycleLength steps from the current one.
//
// Both inputs are cut to "YYYY-MM-DD": cycleStartDate is stored as a full
// ISO timestamp when set from the Progress CycleTracker.
export function estimateCycleDayForDate(dateStr, cycleStartDate, cycleLength = 28) {
  const startKey = cycleStartDate ? String(cycleStartDate).split("T")[0] : null;
  const dateKey = dateStr ? String(dateStr).split("T")[0] : null;
  if (!startKey || !dateKey) return null;
  const start = new Date(startKey + "T00:00:00").getTime();
  const target = new Date(dateKey + "T00:00:00").getTime();
  const diff = Math.floor((target - start) / 86400000);
  if (Number.isNaN(diff)) return null;
  if (diff >= 0) return computeCycleDay(startKey, cycleLength, dateKey);
  const mod = ((diff % cycleLength) + cycleLength) % cycleLength;
  return mod + 1;
}

// Convenience: compose computeCycleDay + getPhaseForDay. Returns the
// phase name or null if the inputs were unusable. Used by any caller
// that needs a phase-per-event mapping (Monthly Recap cycle-pattern
// aggregation, future correlation surfaces).
export function getCyclePhaseNameForDate(cycleStartDateIso, cycleLength, eventIso) {
  const day = computeCycleDay(cycleStartDateIso, cycleLength, eventIso);
  if (day == null) return null;
  return getPhaseForDay(day, cycleLength).name;
}
