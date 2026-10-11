// Cycle phase math for the cycle-phase-alert edge function.
//
// **KEEP IN SYNC with src/lib/cycle.js.**
//
// Deno edge functions on Supabase only bundle files under
// supabase/functions/**, so we can't import the client-side canonical
// module directly. This file is a verbatim TypeScript mirror. Any
// change to the phase names, day ranges or scaling (scalePhases /
// getPhaseForDay) here must be mirrored in src/lib/cycle.js — and vice
// versa; src/lib/cycleParity.test.js checks they agree. The alert relies on the phase
// name string matching what the client would compute + display.

export interface CyclePhase {
  name: string;
  days: [number, number];
}

export interface ScaledPhase {
  name: string;
  startDay: number;
  endDay: number;
}

export const MAX_CYCLE_DAY = 45;

// Day ranges for a 28-day cycle. Never read directly: getPhaseForDay
// scales them to the user's cycle length.
export const CYCLE_PHASES: CyclePhase[] = [
  { name: "Menstrual",  days: [1, 5]   },
  { name: "Follicular", days: [6, 13]  },
  { name: "Ovulatory",  days: [14, 16] },
  { name: "Luteal",     days: [17, 35] },
];

export const DEFAULT_CYCLE_LENGTH = 28;

export function normalizeCycleLength(cycleLength: unknown): number {
  return Math.max(21, Math.min(MAX_CYCLE_DAY, parseInt(String(cycleLength), 10) || DEFAULT_CYCLE_LENGTH));
}

export function scalePhases(cycleLength: number): ScaledPhase[] {
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

// Phase for cycle day N in a cycle of length L (28 when missing). Days
// past the cycle length read as the last phase, Luteal.
export function getPhaseForDay(day: number, cycleLength?: unknown): ScaledPhase {
  const phases = scalePhases(normalizeCycleLength(cycleLength));
  return phases.find((p) => day >= p.startDay && day <= p.endDay) ?? phases[phases.length - 1];
}

// Compute the user's current cycle day from a start date. Same rule as
// src/lib/cycle.js computeCycleDay, ported to UTC because edge functions
// have no user-local timezone. UTC vs local slop at midnight boundaries
// is fine — the alert fires at 15:00 UTC, well clear of most timezones'
// midnight.
//
// Cycle day is 1-indexed and never wraps: past the cycle length it keeps
// counting (day 30 of a 28-day cycle is day 30, Luteal) up to
// MAX_CYCLE_DAY. cycleLength is accepted for signature compatibility but
// no longer changes the result.
//
// Returns null if the inputs are unusable (missing / malformed), the
// start is in the future, or the start is more than MAX_CYCLE_DAY days
// ago (stale — the caller skips the user).

export function computeCycleDay(cycleStartDate: string | null | undefined, _cycleLength?: number): number | null {
  if (!cycleStartDate || typeof cycleStartDate !== "string") return null;
  const parsed = new Date(cycleStartDate);
  if (Number.isNaN(parsed.getTime())) return null;
  const startUtc = Date.UTC(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate(),
  );
  const now = Date.now();
  const daysSince = Math.floor((now - startUtc) / 86400000);
  if (daysSince < 0) return null;
  const day = daysSince + 1;
  return day > MAX_CYCLE_DAY ? null : day;
}
