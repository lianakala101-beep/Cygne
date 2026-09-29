// Cycle Ring — pure data builder for the ring at the top of Progress.
//
// Turns journal entries + cycle settings into one dot per day of the
// current cycle (or the last 28 calendar days when cycle tracking isn't
// set up), plus the phase windows and the center readout. No React, no
// Date.now() — `today` is passed in so the output is deterministic.
//
// Dates are compared as "YYYY-MM-DD" strings, the same shape journal
// entries store in `date`.
//
// Running long: cycle days never wrap (see computeCycleDay), so when
// today is past cycleLength the ring grows to today's day. The phase
// windows still end at cycleLength; the extra days sit past them.
//
// The center shows journal consistency (see journalConsistency) once
// the user has 5 logged days, and "N of 5" before that.

import { CYCLE_PHASES, MAX_CYCLE_DAY, computeCycleDay } from "./cycle.js";

const CALENDAR_DAYS = 28;
const BASE_CYCLE_LENGTH = 28;
const PATTERN_THRESHOLD = 5;

const CONDITION_STATE = { glowing: "glowing", good: "good", okay: "okay", dull: "low", rough: "low" };

const toDateKey = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const key = String(value).split("T")[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
};

// "YYYY-MM-DD" + n days, via UTC so DST never shifts the result.
const addDays = (dateKey, n) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().split("T")[0];
};

const entryTime = (entry) => {
  const t = Date.parse(entry?.updatedAt || entry?.createdAt || entry?.timestamp || "");
  return Number.isNaN(t) ? null : t;
};

// Latest entry per date. An explicit timestamp wins; without one, the
// later entry in the array wins (new entries are appended).
function latestEntryByDate(entries) {
  const byDate = new Map();
  entries.forEach((entry, index) => {
    const date = toDateKey(entry?.date);
    if (!date) return;
    const prev = byDate.get(date);
    const time = entryTime(entry);
    const newer = !prev
      || (time != null && prev.time != null ? time >= prev.time : index > prev.index);
    if (newer) byDate.set(date, { entry, index, time });
  });
  return new Map([...byDate].map(([date, { entry }]) => [date, entry]));
}

// CYCLE_PHASES describes a 28-day cycle (Luteal's 35 is the long-cycle
// fallback). Scale each phase end proportionally to the user's length,
// keeping phases contiguous, at least one day each, and ending exactly
// on cycleLength.
export function scalePhases(cycleLength) {
  const len = Math.max(21, Math.min(MAX_CYCLE_DAY, cycleLength || BASE_CYCLE_LENGTH));
  let start = 1;
  return CYCLE_PHASES.map((phase, i) => {
    const isLast = i === CYCLE_PHASES.length - 1;
    const remaining = CYCLE_PHASES.length - 1 - i;
    const baseEnd = Math.min(phase.days[1], BASE_CYCLE_LENGTH);
    const scaledEnd = isLast ? len : Math.round((baseEnd / BASE_CYCLE_LENGTH) * len);
    const endDay = Math.min(Math.max(scaledEnd, start), len - remaining);
    const out = { name: phase.name, startDay: start, endDay };
    start = endDay + 1;
    return out;
  });
}

function stateFor(date, { todayKey, firstEntryDate, byDate }) {
  const entry = byDate.get(date);
  if (date > todayKey) return "future";
  if (entry && CONDITION_STATE[entry.condition]) return CONDITION_STATE[entry.condition];
  if (!firstEntryDate || date < firstEntryDate) return "before-start";
  // Today without an entry isn't missed yet — it's still open.
  if (date === todayKey) return "future";
  return "missed";
}

// Journal consistency: distinct logged dates ÷ days elapsed in the ring
// window (windowStart through today). Today only counts once it's
// logged, so an open day never drags the score down. Returns a rounded
// percentage, or null when no day has elapsed yet (a cycle that started
// today and isn't logged).
function journalConsistency({ windowStart, todayKey, loggedDates }) {
  const logged = loggedDates.filter(d => d >= windowStart && d <= todayKey);
  const loggedToday = logged.includes(todayKey);
  let elapsed = 0;
  for (let d = windowStart; d < todayKey; d = addDays(d, 1)) elapsed++;
  if (loggedToday) elapsed++;
  if (elapsed === 0) return null;
  return Math.round((logged.length / elapsed) * 100);
}

export function buildCycleRing({ journalEntries = [], cycleStartDate = null, cycleLength = BASE_CYCLE_LENGTH, today = new Date() } = {}) {
  const entries = Array.isArray(journalEntries) ? journalEntries : [];
  const todayKey = toDateKey(today) || toDateKey(new Date());
  const byDate = latestEntryByDate(entries);
  const loggedDates = [...byDate.keys()].filter(d => d <= todayKey).sort();
  const firstEntryDate = loggedDates[0] || null;
  const len = Math.max(21, Math.min(MAX_CYCLE_DAY, parseInt(cycleLength, 10) || BASE_CYCLE_LENGTH));

  // Cycle mode needs a usable start date on or before today, within
  // MAX_CYCLE_DAY days. computeCycleDay returns null otherwise (a start
  // older than that is stale — no new period logged), so the ring falls
  // back to calendar mode.
  const startKey = toDateKey(cycleStartDate);
  const todayDay = startKey ? computeCycleDay(startKey, len, todayKey) : null;
  const mode = todayDay != null ? "cycle" : "calendar";

  const ctx = { todayKey, firstEntryDate, byDate };
  let days;
  let todayIndex;
  let phases = [];
  let windowStart;
  if (mode === "cycle") {
    windowStart = startKey;
    const total = Math.max(len, todayDay);
    days = Array.from({ length: total }, (_, i) => {
      const date = addDays(startKey, i);
      return { day: computeCycleDay(startKey, len, date), date, state: stateFor(date, ctx) };
    });
    todayIndex = todayDay - 1;
    phases = scalePhases(len);
  } else {
    const firstDate = addDays(todayKey, -(CALENDAR_DAYS - 1));
    windowStart = firstEntryDate && firstEntryDate > firstDate ? firstEntryDate : firstDate;
    days = Array.from({ length: CALENDAR_DAYS }, (_, i) => {
      const date = addDays(firstDate, i);
      return { day: i + 1, date, state: stateFor(date, ctx) };
    });
    todayIndex = CALENDAR_DAYS - 1;
  }

  const consistency = journalConsistency({ windowStart, todayKey, loggedDates });
  // No elapsed days yet (cycle day 1, today unlogged): nothing to measure,
  // so the center reads "New cycle" with no value.
  const center = loggedDates.length >= PATTERN_THRESHOLD
    ? (consistency == null ? { value: null, label: "New cycle" } : { value: `${consistency}%`, label: "Consistency" })
    : { value: `${loggedDates.length} of ${PATTERN_THRESHOLD}`, label: "Days to your first pattern" };

  return {
    mode,
    days,
    todayIndex,
    phases,
    center,
    cycleLength: mode === "cycle" ? len : null,
    runningLong: mode === "cycle" && todayDay > len,
  };
}
