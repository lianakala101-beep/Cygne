// Single source of truth for ritual time-of-day period.
// Import from here; never call getHours() for ritual logic elsewhere.

export const getRitualPeriod = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'AM';
  if (hour >= 12 && hour < 20) return 'PM';
  return 'PM'; // late night 20:00–04:59 → PM
};

export const getRitualLabel = () => {
  return getRitualPeriod() === 'AM' ? 'MORNING RITUAL' : 'EVENING RITUAL';
};

// Contextual time-of-day label used in ritual card headers and guidance text.
export const getRitualTimeLabel = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'THIS MORNING';
  if (hour >= 12 && hour < 17) return 'THIS AFTERNOON';
  return 'TONIGHT';
};
