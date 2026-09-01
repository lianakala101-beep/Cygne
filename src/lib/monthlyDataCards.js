// Monthly Recap — concrete, rule-based data cards computed directly from
// the user's own logged records for the target month. No LLM call, no
// guessing — same pattern as src/lib/skinIndex.js: plain conditionals
// over real data, each card independently gated on having enough of
// that data type to say something meaningful. A month with sparse
// logging simply produces fewer cards (0-4) rather than padding with
// a vague or unsupported one.
//
// Each candidate below reads a DIFFERENT logged source so the recap
// draws on the app's actual tracked signals rather than one table
// answering every question:
//   - Best Days           <- daily Skin Journal entries (condition)
//   - What's Working      <- per-product ramp_checkins (response_state)
//   - Check-In Clarity    <- weekly Ritual Check-ins (irritation)
//   - What Changed        <- daily Skin Journal entries, first vs second half

const CONDITION_SCORE = { rough: 0, dull: 1, okay: 2, good: 3, glowing: 4 };
const SCORE_LABEL = ["Rough", "Dull", "Okay", "Good", "Glowing"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const POSITIVE_RESPONSE_STATES = new Set(["no_reaction", "loving_it"]);

function scoreToLabel(score) {
  const idx = Math.max(0, Math.min(4, Math.round(score)));
  return SCORE_LABEL[idx];
}

function inMonth(dateLike, year, month) {
  if (!dateLike) return false;
  // Journal dates are plain "YYYY-MM-DD" strings; appending a time
  // avoids the UTC-midnight/local-timezone-rollback that can shift a
  // bare date string into the wrong day.
  const iso = typeof dateLike === "string" && dateLike.length === 10 ? `${dateLike}T00:00:00` : dateLike;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return false;
  return d.getFullYear() === year && d.getMonth() === month;
}

// Best Days — which weekday reads best across the month's Skin Journal
// entries, compared to the month's overall average. Needs real volume
// and spread (>= 8 entries across >= 3 different weekdays) so one lucky
// Tuesday can't masquerade as a pattern, and the gap over the overall
// average has to be big enough (>= 0.6 on the 0-4 scale) to be worth
// naming rather than noise.
function buildBestDaysCard(monthJournals) {
  if (monthJournals.length < 8) return null;
  const byWeekday = {};
  let total = 0;
  for (const j of monthJournals) {
    const score = CONDITION_SCORE[j?.condition];
    if (score === undefined) continue;
    const d = new Date(`${j.date}T00:00:00`);
    if (!Number.isFinite(d.getTime())) continue;
    const wd = d.getDay();
    if (!byWeekday[wd]) byWeekday[wd] = [];
    byWeekday[wd].push(score);
    total += 1;
  }
  const weekdays = Object.keys(byWeekday);
  if (weekdays.length < 3 || total < 8) return null;

  const overallAvg = weekdays.reduce((sum, wd) => sum + byWeekday[wd].reduce((a, b) => a + b, 0), 0) / total;
  let best = null;
  for (const wd of weekdays) {
    const scores = byWeekday[wd];
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (!best || avg > best.avg) best = { wd: Number(wd), avg };
  }
  if (!best || best.avg - overallAvg < 0.6) return null;

  return {
    key: "bestDays",
    label: "Best Days",
    body: `${WEEKDAY_NAMES[best.wd]}s were your best skin days this month, trending toward ${scoreToLabel(best.avg)}.`,
  };
}

// What's Working — a product with a clean run of ramp check-ins this
// month (>= 2 logged, none of them negative). Picks the one with the
// most check-ins among qualifiers. Skipped entirely if no product has
// enough clean history yet, rather than naming one from a single
// lucky check-in.
function buildWhatsWorkingCard(monthRampCheckins, products) {
  const byProduct = {};
  for (const c of monthRampCheckins) {
    const pid = c?.product_id;
    if (!pid || !c?.response_state) continue;
    if (!byProduct[pid]) byProduct[pid] = [];
    byProduct[pid].push(c.response_state);
  }
  let bestProductId = null;
  let bestCount = 0;
  for (const [pid, states] of Object.entries(byProduct)) {
    if (states.length < 2) continue;
    const allPositive = states.every(s => POSITIVE_RESPONSE_STATES.has(s));
    if (!allPositive) continue;
    if (states.length > bestCount) {
      bestCount = states.length;
      bestProductId = pid;
    }
  }
  if (!bestProductId) return null;
  const product = (products || []).find(p => String(p.id) === String(bestProductId));
  if (!product?.name) return null;

  return {
    key: "whatsWorking",
    label: "What's Working",
    body: `${product.name} had a clean track record this month — ${bestCount} check-in${bestCount !== 1 ? "s" : ""}, no irritation reported.`,
  };
}

// Check-In Clarity — a plain count from this month's weekly Ritual
// Check-ins: how many reported no irritation at all, out of however
// many were logged. Always factual regardless of direction (doesn't
// spin a rough month positively) — needs at least 2 check-ins to be
// worth stating as a fraction.
function buildCheckInClarityCard(monthCheckIns) {
  if (monthCheckIns.length < 2) return null;
  const clearCount = monthCheckIns.filter(c => c?.irritation === "none").length;
  return {
    key: "checkInClarity",
    label: "Check-In Clarity",
    body: `${clearCount} of ${monthCheckIns.length} check-ins this month reported no irritation.`,
  };
}

// What Changed — a real before/after: average Skin Journal condition
// in the first half of the month vs the second half. Needs at least 3
// entries on each side, and the gap has to clear 0.75 (0-4 scale) to
// count as an actual shift rather than day-to-day noise.
function buildWhatChangedCard(monthJournals) {
  const withDay = monthJournals
    .map(j => {
      const score = CONDITION_SCORE[j?.condition];
      const d = new Date(`${j.date}T00:00:00`);
      if (score === undefined || !Number.isFinite(d.getTime())) return null;
      return { score, day: d.getDate() };
    })
    .filter(Boolean);
  if (withDay.length < 6) return null;

  const maxDay = withDay.reduce((m, e) => Math.max(m, e.day), 0);
  const midpoint = Math.ceil(maxDay / 2);
  const firstHalf = withDay.filter(e => e.day <= midpoint);
  const secondHalf = withDay.filter(e => e.day > midpoint);
  if (firstHalf.length < 3 || secondHalf.length < 3) return null;

  const avg = (arr) => arr.reduce((a, b) => a + b.score, 0) / arr.length;
  const firstAvg = avg(firstHalf);
  const secondAvg = avg(secondHalf);
  const diff = secondAvg - firstAvg;
  if (Math.abs(diff) < 0.75) return null;

  const direction = diff > 0 ? "improved" : "declined";
  return {
    key: "whatChanged",
    label: "What Changed",
    body: `Skin condition ${direction} through the month — from mostly ${scoreToLabel(firstAvg)} early on to ${scoreToLabel(secondAvg)} by the end.`,
  };
}

// Builds 0-4 data cards for the given month. year/month follow JS Date
// conventions (month is 0-indexed). rampCheckins should include
// product_id, response_state, and created_at (same shape already
// fetched for the Cycle Pattern insight, extended with product_id).
function buildMonthlyDataCards({ journals = [], checkIns = [], rampCheckins = [], products = [], year, month }) {
  if (!Number.isFinite(year) || !Number.isFinite(month)) return [];

  const monthJournals = (journals || []).filter(j => inMonth(j?.date, year, month));
  const monthCheckIns = (checkIns || []).filter(c => inMonth(c?.date, year, month));
  const monthRampCheckins = (rampCheckins || []).filter(c => inMonth(c?.created_at, year, month));

  const candidates = [
    buildBestDaysCard(monthJournals),
    buildWhatsWorkingCard(monthRampCheckins, products),
    buildCheckInClarityCard(monthCheckIns),
    buildWhatChangedCard(monthJournals),
  ];

  return candidates.filter(Boolean).slice(0, 4);
}

export { buildMonthlyDataCards };
