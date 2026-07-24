// Cycle phase math for the cycle-phase-alert edge function.
//
// **KEEP IN SYNC with src/lib/cycle.js.**
//
// Deno edge functions on Supabase only bundle files under
// supabase/functions/**, so we can't import the client-side canonical
// module directly. This file is a verbatim TypeScript mirror. Any
// change to the phase names or day ranges here must be mirrored in
// src/lib/cycle.js — and vice versa. The alert relies on the phase
// name string matching what the client would compute + display.

export interface CyclePhase {
  name: string;
  days: [number, number];
}

export const CYCLE_PHASES: CyclePhase[] = [
  { name: "Menstrual",  days: [1, 5]   },
  { name: "Follicular", days: [6, 13]  },
  { name: "Ovulatory",  days: [14, 16] },
  { name: "Luteal",     days: [17, 35] },
];

export function getCyclePhase(day: number): CyclePhase {
  return CYCLE_PHASES.find((p) => day >= p.days[0] && day <= p.days[1])
    ?? CYCLE_PHASES[CYCLE_PHASES.length - 1];
}

// Compute the user's current cycle day from a start date + cycle
// length. Same logic as src/utils.jsx getCurrentCycleDay, ported to
// UTC because edge functions have no user-local timezone. UTC vs
// local slop at midnight boundaries is fine — the alert fires at
// 15:00 UTC, well clear of most timezones' midnight.
//
// Returns null if the inputs are unusable (missing / malformed).
export function computeCycleDay(cycleStartDate: string | null | undefined, cycleLength: number): number | null {
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
  const len = Math.max(21, Math.min(45, cycleLength || 28));
  // Cycle day is 1-indexed and wraps within the length. Days past the
  // length (running long) show as > cycleLength so the client's
  // "running long" state applies; here we clamp to 45 for phase
  // lookup since CYCLE_PHASES doesn't extend past that.
  return Math.min(45, (daysSince % len) + 1);
}
