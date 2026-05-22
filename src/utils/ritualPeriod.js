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

// Contextual time-of-day label used in ritual card headers and guidance text.
export const getRitualTimeLabel = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'THIS MORNING';
  if (hour >= 12 && hour < 17) return 'THIS AFTERNOON';
  return 'TONIGHT';
};
