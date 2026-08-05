// Single source of truth for ritual time-of-day period.
// Import from here; never call getHours() for ritual logic elsewhere.

// Morning before noon, evening from noon onwards. If the AM ritual is
// already fully completed today, surface the PM ritual regardless of hour.
export const getRitualPeriod = (amCompleted = false) => {
  if (amCompleted) return 'PM';
  return new Date().getHours() < 12 ? 'AM' : 'PM';
};

export const getRitualLabel = (amCompleted = false) => {
  return getRitualPeriod(amCompleted) === 'AM' ? 'MORNING RITUAL' : 'EVENING RITUAL';
};

// Contextual time-of-day label used in ritual card headers and guidance
// text. Deliberately derived from getRitualPeriod so it CANNOT disagree
// with the ritual label — previously this returned a 3-way clock split
// ("THIS MORNING" / "THIS AFTERNOON" / "TONIGHT") that could show
// "THIS AFTERNOON" at 2pm while the card underneath read "EVENING
// RITUAL", because getRitualPeriod flips at noon and after amCompleted.
// Now both labels come from the same 2-phase split.
export const getRitualTimeLabel = (amCompleted = false) => {
  return getRitualPeriod(amCompleted) === 'AM' ? 'THIS MORNING' : 'THIS EVENING';
};
