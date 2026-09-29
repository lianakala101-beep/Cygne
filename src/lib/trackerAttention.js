// Attention-dot logic for the Progress tracker grid — a small gold dot on
// a tracker circle when that area has something worth a look. Pure so
// it's testable without mounting React.
//
// journalLoggedToday and treatmentActive are booleans progress.jsx already
// has (loggedToday from buildProgressIndex; treatmentActive from
// getActivePauseState's `treatment` field — a non-null treatment there
// already means "most recent non-cleared treatment", i.e. active
// recovery). Only the "introduce" dot needs real aggregation here: any
// one of the user's ramp products being ready to advance.

import { isReadyToAdvance } from "../ramp.jsx";

export function buildTrackerAttention({
  journalLoggedToday = false,
  rampProducts = [],
  rampCheckins = [],
  treatmentActive = false,
  today = new Date(),
} = {}) {
  const products = Array.isArray(rampProducts) ? rampProducts : [];
  const introduce = products.some(p => isReadyToAdvance(p, rampCheckins, today));

  return {
    journal: !journalLoggedToday,
    introduce,
    treatments: !!treatmentActive,
  };
}
