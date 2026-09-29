import { describe, it, expect } from "vitest";
import { buildProgressIndex } from "./progressIndex.js";

// All fixtures anchor "today" to 2026-09-20 (a Sunday) unless noted.
const TODAY = "2026-09-20";

const dayOffset = (from, n) => {
  const [y, m, d] = from.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().split("T")[0];
};

// Journal entries for `count` consecutive days ending `endOffset` days before today.
const entries = (condition, count, endOffset = 0) =>
  Array.from({ length: count }, (_, i) => ({ date: dayOffset(TODAY, -(endOffset + i)), condition }));

const checkIn = (offset, extra = {}) => ({
  date: `${dayOffset(TODAY, offset)}T09:00:00.000Z`, irritation: "none", tight: false, breakout: false, breakoutZones: [], ...extra,
});

const pill = (index, key) => index.pills.find(p => p.key === key);

describe("buildProgressIndex", () => {
  describe("skin trend pill", () => {
    it("reads Improving when the last 7 days beat the 7 before by 0.5+", () => {
      const journalEntries = [...entries("glowing", 4, 0), ...entries("okay", 4, 7)];
      expect(pill(buildProgressIndex({ journalEntries, today: TODAY }), "trend")).toEqual({ key: "trend", label: "Skin trend", value: "Improving" });
    });

    it("reads Dipping when the last 7 days fall 0.5+ below the 7 before", () => {
      const journalEntries = [...entries("dull", 3, 0), ...entries("good", 3, 7)];
      expect(pill(buildProgressIndex({ journalEntries, today: TODAY }), "trend").value).toBe("Dipping");
    });

    it("reads Steady inside the ±0.5 band", () => {
      const journalEntries = [...entries("good", 3, 0), ...entries("good", 2, 7), ...entries("okay", 1, 9)];
      // recent 1.0 vs previous 0.67 → +0.33
      expect(pill(buildProgressIndex({ journalEntries, today: TODAY }), "trend").value).toBe("Steady");
    });

    it("is omitted without 3 entries in each window", () => {
      const journalEntries = [...entries("glowing", 5, 0), ...entries("rough", 2, 7)];
      expect(pill(buildProgressIndex({ journalEntries, today: TODAY }), "trend")).toBeUndefined();
    });

    it("uses the latest entry when a date has two", () => {
      const journalEntries = [
        ...entries("okay", 3, 7),
        { date: TODAY, condition: "rough" }, { date: TODAY, condition: "glowing" },
        ...entries("glowing", 2, 1),
      ];
      expect(pill(buildProgressIndex({ journalEntries, today: TODAY }), "trend").value).toBe("Improving");
    });
  });

  describe("next pill — cycle mode", () => {
    const cycle = (startOffset, extra = {}) => ({
      cycleTrackingOn: true, cycleStartDate: dayOffset(TODAY, startOffset), cycleLength: 28, today: TODAY, ...extra,
    });

    it("says tomorrow when the next phase is 1 day away", () => {
      // Day 13 → Ovulatory starts day 14.
      expect(pill(buildProgressIndex(cycle(-12)), "next")).toEqual({ key: "next", label: "Next", value: "Ovulation · tomorrow" });
    });

    it("counts several days to the next phase", () => {
      // Day 8 → Ovulatory starts day 14.
      expect(pill(buildProgressIndex(cycle(-7)), "next").value).toBe("Ovulation · 6 days");
    });

    it("points to the next period from the last phase", () => {
      // Day 20 of 28 → new cycle on day 29.
      expect(pill(buildProgressIndex(cycle(-19)), "next").value).toBe("Period · 9 days");
    });

    it("scales phases to the cycle length", () => {
      // 45-day cycle, day 20 → Ovulatory starts day 22.
      expect(pill(buildProgressIndex(cycle(-19, { cycleLength: 45 })), "next").value).toBe("Ovulation · 2 days");
    });

    it("says any day when the cycle is running long", () => {
      expect(pill(buildProgressIndex(cycle(-31)), "next").value).toBe("Period · any day");
    });
  });

  describe("next pill — check-in", () => {
    it("shows the weekday of the next weekly check-in in calendar mode", () => {
      // Last check-in Wednesday 09-16 → next Wednesday 09-23.
      const index = buildProgressIndex({ checkIns: [checkIn(-4)], today: TODAY });
      expect(pill(index, "next").value).toBe("Check-in · Wednesday");
    });

    it("says due when the last check-in was 7+ days ago", () => {
      const index = buildProgressIndex({ checkIns: [checkIn(-7)], today: TODAY });
      expect(pill(index, "next").value).toBe("Check-in · due");
    });

    it("says due when there has never been a check-in", () => {
      expect(pill(buildProgressIndex({ today: TODAY }), "next").value).toBe("Check-in · due");
    });

    it("falls back to the check-in when tracking is on but the cycle day is null", () => {
      const index = buildProgressIndex({ cycleTrackingOn: true, cycleStartDate: "2026-07-01", checkIns: [checkIn(-2)], today: TODAY });
      expect(pill(index, "next").value).toBe("Check-in · Friday");
    });

    it("ignores the cycle when tracking is off", () => {
      const index = buildProgressIndex({ cycleTrackingOn: false, cycleStartDate: dayOffset(TODAY, -7), checkIns: [checkIn(-1)], today: TODAY });
      expect(pill(index, "next").value).toBe("Check-in · Saturday");
    });
  });

  describe("next pill dedupe against the Now card", () => {
    // Today logged, last check-in 8 days ago → Now is the weekly check-in.
    const checkInIsNow = { journalEntries: entries("good", 1, 0), checkIns: [checkIn(-8)], today: TODAY };

    it("omits the check-in Next pill when Now is the weekly check-in", () => {
      const index = buildProgressIndex(checkInIsNow);
      expect(index.now.kind).toBe("checkin");
      expect(pill(index, "next")).toBeUndefined();
    });

    it("keeps the cycle-phase pill when Now is the weekly check-in", () => {
      const index = buildProgressIndex({ ...checkInIsNow, cycleTrackingOn: true, cycleStartDate: dayOffset(TODAY, -7), cycleLength: 28 });
      expect(index.now.kind).toBe("checkin");
      expect(pill(index, "next").value).toBe("Ovulation · 6 days");
    });

    it("keeps the check-in pill when Now is something else", () => {
      const index = buildProgressIndex({ checkIns: [checkIn(-8)], today: TODAY });
      expect(index.now.kind).toBe("journal");
      expect(pill(index, "next").value).toBe("Check-in · due");
    });

    it("keeps the check-in pill when Now is empty", () => {
      const index = buildProgressIndex({ journalEntries: entries("good", 1, 0), checkIns: [checkIn(-2)], today: TODAY });
      expect(index.now).toBeNull();
      expect(pill(index, "next").value).toBe("Check-in · Friday");
    });

    it("leaves only the trend pill when it is the sole survivor", () => {
      const journalEntries = [...entries("glowing", 4, 0), ...entries("okay", 4, 7)];
      const index = buildProgressIndex({ journalEntries, checkIns: [checkIn(-9)], today: TODAY });
      expect(index.now.kind).toBe("checkin");
      expect(index.pills).toEqual([{ key: "trend", label: "Skin trend", value: "Improving" }]);
    });

    it("can leave no pills at all", () => {
      expect(buildProgressIndex(checkInIsNow).pills).toEqual([]);
    });
  });

  describe("breakout pattern insight", () => {
    // Cycle started 2026-09-08 (today is day 13); luteal in the previous
    // 28-day cycle ran 2026-08-27 → 2026-09-07.
    const base = { cycleTrackingOn: true, cycleStartDate: "2026-09-08", cycleLength: 28, today: TODAY };
    const luteal = ["2026-08-28", "2026-09-01", "2026-09-05", "2026-07-31"]; // last is luteal two cycles back
    const toOffset = (d) => (Date.parse(d) - Date.parse(TODAY)) / 86400000;

    it("names the phase when 60%+ of breakouts fall in it", () => {
      const checkIns = [
        ...luteal.slice(0, 3).map((d, i) => checkIn(toOffset(d), { breakout: true, breakoutZones: [["Forehead"], ["Nose"], ["Left cheek"]][i] })),
        checkIn(-3, { breakout: true, breakoutZones: ["Chin"] }),
      ];
      expect(buildProgressIndex({ ...base, checkIns }).insights).toEqual(["Breakouts clustered in your luteal phase lately."]);
    });

    it("names the zone when one zone covers 50%+ of those breakouts", () => {
      const checkIns = luteal.map((d, i) => checkIn(toOffset(d), { breakout: true, breakoutZones: i < 2 ? ["Chin", "Chin"] : ["Nose"] }));
      expect(buildProgressIndex({ ...base, checkIns }).insights).toEqual(["Chin breakouts clustered in your luteal phase lately."]);
    });

    it("stays quiet below the 60% phase share", () => {
      const checkIns = [
        ...luteal.slice(0, 2).map(d => checkIn(toOffset(d), { breakout: true })),
        checkIn(-3, { breakout: true }), checkIn(-10, { breakout: true }),
      ];
      expect(buildProgressIndex({ ...base, checkIns }).insights).toEqual([]);
    });

    it("stays quiet with fewer than 3 breakouts", () => {
      const checkIns = luteal.slice(0, 2).map(d => checkIn(toOffset(d), { breakout: true }));
      expect(buildProgressIndex({ ...base, checkIns }).insights).toEqual([]);
    });

    it("ignores breakouts older than 90 days and check-ins without a breakout", () => {
      const checkIns = [
        ...luteal.slice(0, 2).map(d => checkIn(toOffset(d), { breakout: true })),
        checkIn(-95, { breakout: true }), checkIn(-5), checkIn(-6),
      ];
      expect(buildProgressIndex({ ...base, checkIns }).insights).toEqual([]);
    });

    it("needs cycle mode", () => {
      const checkIns = luteal.map(d => checkIn(toOffset(d), { breakout: true }));
      expect(buildProgressIndex({ ...base, cycleTrackingOn: false, checkIns }).insights).toEqual([]);
    });

    it("keeps every sentence under ~70 characters", () => {
      const checkIns = luteal.map(d => checkIn(toOffset(d), { breakout: true, breakoutZones: ["Scalp/hairline"] }));
      const [sentence] = buildProgressIndex({ ...base, checkIns }).insights;
      expect(sentence.length).toBeLessThanOrEqual(70);
    });
  });

  describe("now item", () => {
    it("asks to log today's skin first", () => {
      const index = buildProgressIndex({ journalEntries: entries("good", 3, 1), checkIns: [], today: TODAY });
      expect(index.now).toEqual({ kind: "journal", text: "Log today's skin" });
    });

    it("moves to the weekly check-in once today is logged", () => {
      const index = buildProgressIndex({ journalEntries: entries("good", 1, 0), checkIns: [checkIn(-8)], today: TODAY });
      expect(index.now).toEqual({ kind: "checkin", text: "Weekly check-in due" });
    });

    it("treats no check-in yet as due", () => {
      const index = buildProgressIndex({ journalEntries: entries("good", 1, 0), today: TODAY });
      expect(index.now.kind).toBe("checkin");
    });

    it("is null when everything is up to date", () => {
      const index = buildProgressIndex({ journalEntries: entries("good", 1, 0), checkIns: [checkIn(-2)], today: TODAY });
      expect(index.now).toBeNull();
    });

    it("counts a journal entry dated by UTC as today", () => {
      // 11pm on the 20th in UTC-4 is already the 21st in UTC.
      const today = new Date("2026-09-21T03:00:00.000Z");
      const localKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const index = buildProgressIndex({ journalEntries: [{ date: "2026-09-21", condition: "good" }, { date: localKey, condition: "good" }], checkIns: [checkIn(-1)], today });
      expect(index.now).toBeNull();
    });
  });

  describe("ramp readiness", () => {
    it("produces no ramp insight or ramp Now item (no readiness rule exists yet)", () => {
      const rampProducts = [{ id: "p1", name: "Adapalene Gel", routineStartDate: "2026-08-01", rampWeek: 5, rampHeld: true }];
      const index = buildProgressIndex({ journalEntries: entries("good", 1, 0), checkIns: [checkIn(-1)], rampProducts, today: TODAY });
      expect(index.now).toBeNull();
      expect(index.insights).toEqual([]);
    });
  });

  describe("new user", () => {
    it("returns mostly empty output without crashing", () => {
      expect(buildProgressIndex({ today: TODAY })).toEqual({
        pills: [{ key: "next", label: "Next", value: "Check-in · due" }],
        insights: [],
        now: { kind: "journal", text: "Log today's skin" },
      });
    });

    it("tolerates missing and malformed inputs", () => {
      const index = buildProgressIndex({ journalEntries: null, checkIns: [null, { date: "bad" }], cycleStartDate: "nope", cycleTrackingOn: true, today: TODAY });
      expect(index.insights).toEqual([]);
      expect(index.pills).toHaveLength(1);
    });

    it("works with no arguments at all", () => {
      expect(() => buildProgressIndex()).not.toThrow();
    });
  });
});
