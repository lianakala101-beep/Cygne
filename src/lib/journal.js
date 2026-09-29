// Journal date keys. An entry's `date` is the user's LOCAL calendar date
// ("YYYY-MM-DD") — the day they think of it as — not the UTC date.
//
// Entries used to be keyed with new Date().toISOString().split("T")[0],
// which is the UTC date. For anyone west of UTC, an evening entry (after
// about 8pm US Eastern) got tomorrow's date, so the next morning's entry
// carried the same key and replaced it (the save de-dupes by date).
// Existing entries keep whatever key they were saved with;
// withLegacyTodayTolerance below keeps them counting as "today" while
// that mismatch is visible.

// Local "YYYY-MM-DD" for a Date (defaults to now).
export function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Add or replace the entry for entry.date, keeping the list sorted by date.
export function upsertJournalEntry(journals, entry) {
  const filtered = (Array.isArray(journals) ? journals : []).filter(j => j?.date !== entry.date);
  return [...filtered, entry].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

// Legacy tolerance. An entry saved this evening under the old UTC key is
// dated with tomorrow's date whenever `today`'s UTC date is ahead of its
// local date. When no entry exists under today's local key, re-date such
// an entry to today so "logged today?" and the ring still see it.
// Returns the entries unchanged when there is nothing to fix.
export function withLegacyTodayTolerance(entries, today = new Date()) {
  const list = Array.isArray(entries) ? entries : [];
  if (!(today instanceof Date) || Number.isNaN(today.getTime())) return list;
  const localKey = localDateKey(today);
  const utcKey = today.toISOString().split("T")[0];
  // Only when UTC is ahead of local (west of UTC, in the evening); east of
  // UTC a UTC-dated entry is genuinely yesterday's.
  if (utcKey <= localKey) return list;
  if (list.some(e => e?.date === localKey)) return list;
  if (!list.some(e => e?.date === utcKey)) return list;
  return list.map(e => (e?.date === utcKey ? { ...e, date: localKey } : e));
}
