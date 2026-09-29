// Ritual completion state — storage keys and the manual AM/PM override.
//
// Both are per-day, and "day" is the user's LOCAL calendar date
// (localDateKey in ./journal.js), so nothing resets before local
// midnight. They used the UTC date, which flips at 8pm US Eastern: a PM
// ritual finished after 8pm was saved under tomorrow's date, an unfinished
// evening lost its checkmarks at 8pm, and last night's PM steps showed up
// as done again the next evening until 8pm.

// localStorage key holding the checked step ids for one day's AM or PM ritual.
export const ritualCompleteKey = (dayKey, period) => `ritual_complete_${dayKey}_${period}`;

// The manual "switch to AM/PM" override is stored as JSON { value, date }.
// It only applies on the day it was set.
export function readManualOverride(raw, dayKey) {
  try {
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data?.date === dayKey ? (data.value ?? null) : null;
  } catch {
    return null;
  }
}

// True when a stored override should be cleared: it is from an earlier day
// or can't be read.
export function isManualOverrideStale(raw, dayKey) {
  if (!raw) return false;
  try {
    return JSON.parse(raw)?.date !== dayKey;
  } catch {
    return true;
  }
}
