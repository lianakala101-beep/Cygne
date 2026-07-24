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
