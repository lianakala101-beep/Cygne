// Progress index layer — pure data for the strip under the Cycle Ring:
// two glanceable pills, up to two plain-sentence insights, and one "Now"
// action. No React, no AI calls, no Date.now(): `today` is passed in.
//
// Dates compare as "YYYY-MM-DD" strings (journal `date`, or the date part
// of a check-in's ISO timestamp).
//
// Ramp readiness is intentionally absent. ramp.jsx / progress.jsx have no
// "ready to advance" rule (advancing is a manual choice; the only derived
// signal is suggestHold), so neither the ramp insight nor the ramp Now
// item is produced. `rampProducts` is accepted for the call signature
// and currently unused.

import { MAX_CYCLE_DAY, computeCycleDay, estimateCycleDayForDate } from "./cycle.js";
import { scalePhases, toDateKey, addDays, latestEntryByDate } from "./cycleRing.js";
import { withLegacyTodayTolerance } from "./journal.js";

const CONDITION_SCORE = { glowing: 2, good: 1, okay: 0, dull: -1, rough: -2 };
const TREND_WINDOW = 7;
const TREND_MIN_ENTRIES = 3;
const TREND_THRESHOLD = 0.5;
const CHECKIN_INTERVAL_DAYS = 7;
const BREAKOUT_WINDOW_DAYS = 90;
const BREAKOUT_MIN = 3;
const PHASE_SHARE = 0.6;
const ZONE_SHARE = 0.5;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Pill wording for the phase that comes next.
const NEXT_PHASE_LABEL = { Menstrual: "Period", Follicular: "Follicular", Ovulatory: "Ovulation", Luteal: "Luteal" };

const daysBetween = (fromKey, toKey) => {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
};

const weekdayOf = (dateKey) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};

// Phase for a cycle day using the ring's scaled windows. Days past the
// cycle length (running long) read as the last phase, Luteal.
const phaseForDay = (day, phases) =>
  phases.find(p => day >= p.startDay && day <= p.endDay) || phases[phases.length - 1];

// --- Pills -----------------------------------------------------------------

function skinTrendPill(byDate, todayKey) {
  const windowAverage = (fromOffset) => {
    const scores = [];
    for (let i = 0; i < TREND_WINDOW; i++) {
      const entry = byDate.get(addDays(todayKey, -(fromOffset + i)));
      const score = CONDITION_SCORE[entry?.condition];
      if (score !== undefined) scores.push(score);
    }
    return scores.length >= TREND_MIN_ENTRIES ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  };
  const recent = windowAverage(0);
  const previous = windowAverage(TREND_WINDOW);
  if (recent == null || previous == null) return null;
  const diff = recent - previous;
  const value = diff >= TREND_THRESHOLD ? "Improving" : diff <= -TREND_THRESHOLD ? "Dipping" : "Steady";
  return { key: "trend", label: "Skin trend", value };
}

function lastCheckInKey(checkIns, todayKey) {
  return checkIns
    .map(c => toDateKey(c?.date))
    .filter(k => k && k <= todayKey)
    .sort()
    .pop() || null;
}

function checkInPill(lastKey, todayKey) {
  if (!lastKey || daysBetween(lastKey, todayKey) >= CHECKIN_INTERVAL_DAYS) {
    return { key: "next", label: "Next", value: "Check-in · due" };
  }
  const nextKey = addDays(lastKey, CHECKIN_INTERVAL_DAYS);
  return { key: "next", label: "Next", value: `Check-in · ${weekdayOf(nextKey)}` };
}

function nextPhasePill(cycleDay, phases, cycleLength) {
  const upcoming = phases.find(p => p.startDay > cycleDay);
  // Past the last phase the next one is a new cycle's period.
  const name = upcoming ? upcoming.name : "Menstrual";
  const daysUntil = upcoming ? upcoming.startDay - cycleDay : cycleLength + 1 - cycleDay;
  const when = daysUntil <= 0 ? "any day" : daysUntil === 1 ? "tomorrow" : `${daysUntil} days`;
  return { key: "next", label: "Next", value: `${NEXT_PHASE_LABEL[name]} · ${when}` };
}

// --- Insights --------------------------------------------------------------

function breakoutPatternInsight({ checkIns, todayKey, cycleStartKey, cycleLength, phases }) {
  const windowStart = addDays(todayKey, -(BREAKOUT_WINDOW_DAYS - 1));
  const breakouts = checkIns
    .map(c => ({ c, key: toDateKey(c?.date) }))
    .filter(({ c, key }) => c?.breakout === true && key && key >= windowStart && key <= todayKey)
    .map(({ c, key }) => {
      const day = estimateCycleDayForDate(key, cycleStartKey, cycleLength);
      return day == null ? null : { phase: phaseForDay(day, phases).name, zones: [...new Set(c.breakoutZones || [])] };
    })
    .filter(Boolean);
  if (breakouts.length < BREAKOUT_MIN) return null;

  const tally = (items) => items.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map());
  const [topPhase, phaseCount] = [...tally(breakouts.map(b => b.phase))].sort((a, b) => b[1] - a[1])[0];
  if (phaseCount / breakouts.length < PHASE_SHARE) return null;

  const zoneCounts = [...tally(breakouts.flatMap(b => b.zones))].sort((a, b) => b[1] - a[1]);
  const topZone = zoneCounts[0] && zoneCounts[0][1] / breakouts.length >= ZONE_SHARE ? zoneCounts[0][0] : null;
  const subject = topZone ? `${topZone} breakouts` : "Breakouts";
  return `${subject} clustered in your ${topPhase.toLowerCase()} phase lately.`;
}

// --- Builder ---------------------------------------------------------------

export function buildProgressIndex({
  journalEntries = [],
  checkIns = [],
  rampProducts = [], // eslint-disable-line no-unused-vars -- see header: no readiness rule exists
  cycleStartDate = null,
  cycleLength = 28,
  cycleTrackingOn = false,
  today = new Date(),
} = {}) {
  const journals = Array.isArray(journalEntries) ? journalEntries : [];
  const checks = Array.isArray(checkIns) ? checkIns : [];
  const todayKey = toDateKey(today) || toDateKey(new Date());
  const len = Math.max(21, Math.min(MAX_CYCLE_DAY, parseInt(cycleLength, 10) || 28));
  // Entries saved this evening under the old UTC key count as today.
  const byDate = latestEntryByDate(withLegacyTodayTolerance(journals, today));

  // Cycle mode: tracking on and today resolves to a cycle day (null when
  // the start is missing, in the future, or stale past day 45).
  const cycleStartKey = cycleTrackingOn ? toDateKey(cycleStartDate) : null;
  const cycleDay = cycleStartKey ? computeCycleDay(cycleStartKey, len, todayKey) : null;
  const phases = scalePhases(len);

  const lastCheckIn = lastCheckInKey(checks, todayKey);
  const checkInDue = !lastCheckIn || daysBetween(lastCheckIn, todayKey) >= CHECKIN_INTERVAL_DAYS;

  const pills = [
    skinTrendPill(byDate, todayKey),
    cycleDay != null ? nextPhasePill(cycleDay, phases, len) : checkInPill(lastCheckIn, todayKey),
  ].filter(Boolean);

  const insights = [
    cycleDay != null ? breakoutPatternInsight({ checkIns: checks, todayKey, cycleStartKey, cycleLength: len, phases }) : null,
  ].filter(Boolean);

  const loggedToday = byDate.has(todayKey);

  const now = !loggedToday
    ? { kind: "journal", text: "Log today's skin" }
    : checkInDue
      ? { kind: "checkin", text: "Weekly check-in due" }
      : null;

  return { pills, insights, now };
}
