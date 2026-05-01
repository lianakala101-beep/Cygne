// Single source of truth for ritual time-of-day period.
// Import from here; never call getHours() for ritual logic elsewhere.

// Behavior-based: AM until 2pm (or until AM ritual is completed),
// PM from 2pm onwards and overnight.
export const getRitualPeriod = (amCompleted = false) => {
  const hour = new Date().getHours();
  if (amCompleted) return 'PM';
  if (hour < 5) return 'PM';          // late night → PM
  if (hour >= 5 && hour < 14) return 'AM'; // 5am–1:59pm → AM
  return 'PM';                        // 2pm onwards → PM
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
