import { describe, it, expect } from "vitest";
import { buildCycleRing, scalePhases } from "./cycleRing.js";

// All fixtures anchor "today" to 2026-09-20 unless noted.
const TODAY = "2026-09-20";

// "YYYY-MM-DD" n days from `from`.
const dayOffset = (from, n) => {
  const [y, m, d] = from.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().split("T")[0];
};

// One entry per day from `from` for `count` days, cycling conditions.
const dailyEntries = (from, count, conditions = ["good"]) =>
  Array.from({ length: count }, (_, i) => ({ date: dayOffset(from, i), condition: conditions[i % conditions.length] }));

describe("buildCycleRing", () => {
  describe("28-day cycle", () => {
    // Cycle started 2026-09-08, so today (09-20) is day 13.
    const START = "2026-09-08";
    const journalEntries = dailyEntries(START, 13, ["glowing", "good", "okay", "dull", "rough"]);
    const ring = buildCycleRing({ journalEntries, cycleStartDate: START, cycleLength: 28, today: TODAY });

    it("is in cycle mode with one dot per cycle day", () => {
      expect(ring.mode).toBe("cycle");
      expect(ring.days).toHaveLength(28);
      expect(ring.days[0]).toEqual({ day: 1, date: START, state: "glowing" });
      expect(ring.days[27].day).toBe(28);
    });

    it("places today on day 13", () => {
      expect(ring.todayIndex).toBe(12);
      expect(ring.days[ring.todayIndex].date).toBe(TODAY);
    });

    it("maps conditions to states (dull and rough both read as low)", () => {
      expect(ring.days.slice(0, 5).map(d => d.state)).toEqual(["glowing", "good", "okay", "low", "low"]);
    });

    it("marks days after today as future", () => {
      expect(ring.days.slice(13).every(d => d.state === "future")).toBe(true);
    });

    it("uses the canonical phase windows at 28 days", () => {
      expect(ring.phases).toEqual([
        { name: "Menstrual", startDay: 1, endDay: 5 },
        { name: "Follicular", startDay: 6, endDay: 13 },
        { name: "Ovulatory", startDay: 14, endDay: 16 },
        { name: "Luteal", startDay: 17, endDay: 28 },
      ]);
    });

    it("shows journal consistency once there are 5+ entries", () => {
      // Logged every day from day 1 through today: 13 of 13.
      expect(ring.center).toEqual({ value: "100%", label: "Consistency" });
    });
  });

  describe("45-day cycle", () => {
    const START = "2026-09-01";
    const ring = buildCycleRing({ journalEntries: dailyEntries(START, 20), cycleStartDate: START, cycleLength: 45, today: TODAY });

    it("has 45 dots with today on day 20", () => {
      expect(ring.days).toHaveLength(45);
      expect(ring.todayIndex).toBe(19);
      expect(ring.runningLong).toBe(false);
    });

    it("scales phases contiguously to 45 days", () => {
      expect(ring.phases).toEqual([
        { name: "Menstrual", startDay: 1, endDay: 8 },
        { name: "Follicular", startDay: 9, endDay: 21 },
        { name: "Ovulatory", startDay: 22, endDay: 26 },
        { name: "Luteal", startDay: 27, endDay: 45 },
      ]);
    });
  });

  describe("calendar mode", () => {
    const journalEntries = dailyEntries(dayOffset(TODAY, -9), 10);
    const ring = buildCycleRing({ journalEntries, cycleStartDate: null, today: TODAY });

    it("shows the last 28 calendar days ending today, without phases", () => {
      expect(ring.mode).toBe("calendar");
      expect(ring.days).toHaveLength(28);
      expect(ring.days[0].date).toBe(dayOffset(TODAY, -27));
      expect(ring.days[27].date).toBe(TODAY);
      expect(ring.todayIndex).toBe(27);
      expect(ring.phases).toEqual([]);
      expect(ring.cycleLength).toBeNull();
    });

    it("marks days before the first entry as before-start", () => {
      expect(ring.days.slice(0, 18).every(d => d.state === "before-start")).toBe(true);
      expect(ring.days[18].state).toBe("good");
    });

    it("falls back to calendar mode when the cycle start is in the future", () => {
      expect(buildCycleRing({ cycleStartDate: "2026-10-01", today: TODAY }).mode).toBe("calendar");
    });

    it("falls back to calendar mode when the cycle start is older than 45 days", () => {
      expect(buildCycleRing({ cycleStartDate: "2026-07-01", today: TODAY }).mode).toBe("calendar");
    });
  });

  describe("new user with 2 entries", () => {
    const journalEntries = [
      { date: dayOffset(TODAY, -1), condition: "okay" },
      { date: TODAY, condition: "good" },
    ];
    const ring = buildCycleRing({ journalEntries, cycleStartDate: "2026-09-08", cycleLength: 28, today: TODAY });

    it("counts toward the first pattern instead of showing consistency", () => {
      expect(ring.center).toEqual({ value: "2 of 5", label: "Days to your first pattern" });
    });

    it("never marks days before the first entry as missed", () => {
      expect(ring.days.slice(0, 11).every(d => d.state === "before-start")).toBe(true);
      expect(ring.days.some(d => d.state === "missed")).toBe(false);
    });

    it("counts 0 of 5 with no entries at all", () => {
      expect(buildCycleRing({ today: TODAY }).center.value).toBe("0 of 5");
    });
  });

  describe("missed day", () => {
    const START = "2026-09-08";
    const journalEntries = dailyEntries(START, 13).filter(e => e.date !== "2026-09-15");
    const ring = buildCycleRing({ journalEntries, cycleStartDate: START, cycleLength: 28, today: TODAY });

    it("marks a past day with no entry (after the first entry) as missed", () => {
      expect(ring.days[7]).toEqual({ day: 8, date: "2026-09-15", state: "missed" });
      expect(ring.days.filter(d => d.state === "missed")).toHaveLength(1);
    });

    it("leaves today open rather than missed when it isn't logged yet", () => {
      const unloggedToday = journalEntries.filter(e => e.date !== TODAY);
      const r = buildCycleRing({ journalEntries: unloggedToday, cycleStartDate: START, cycleLength: 28, today: TODAY });
      expect(r.days[r.todayIndex].state).toBe("future");
    });

    it("counts the missed day against consistency", () => {
      // 12 logged of 13 elapsed days (day 1 through today).
      expect(ring.center).toEqual({ value: "92%", label: "Consistency" });
    });
  });

  describe("cycle running long (day 30 of 28)", () => {
    const START = dayOffset(TODAY, -29);
    const ring = buildCycleRing({ journalEntries: dailyEntries(START, 30), cycleStartDate: START, cycleLength: 28, today: TODAY });

    it("extends the ring to today instead of wrapping to day 2", () => {
      expect(ring.mode).toBe("cycle");
      expect(ring.days).toHaveLength(30);
      expect(ring.todayIndex).toBe(29);
      expect(ring.days[29]).toMatchObject({ day: 30, date: TODAY });
      expect(ring.runningLong).toBe(true);
    });

    it("keeps phases ending at the configured cycle length", () => {
      expect(ring.phases[ring.phases.length - 1]).toEqual({ name: "Luteal", startDay: 17, endDay: 28 });
    });
  });

  describe("multiple entries on one date", () => {
    it("uses the later entry in array order when there are no timestamps", () => {
      const journalEntries = [
        { date: "2026-09-18", condition: "rough" },
        { date: "2026-09-18", condition: "glowing" },
      ];
      const ring = buildCycleRing({ journalEntries, cycleStartDate: "2026-09-08", cycleLength: 28, today: TODAY });
      expect(ring.days[10]).toMatchObject({ date: "2026-09-18", state: "glowing" });
    });

    it("uses the most recent timestamp when entries carry one", () => {
      const journalEntries = [
        { date: "2026-09-18", condition: "good", updatedAt: "2026-09-18T21:00:00Z" },
        { date: "2026-09-18", condition: "dull", updatedAt: "2026-09-18T08:00:00Z" },
      ];
      const ring = buildCycleRing({ journalEntries, cycleStartDate: "2026-09-08", cycleLength: 28, today: TODAY });
      expect(ring.days[10].state).toBe("good");
    });

    it("counts a date once toward the first pattern", () => {
      const journalEntries = [
        { date: "2026-09-18", condition: "good" },
        { date: "2026-09-18", condition: "okay" },
        { date: "2026-09-19", condition: "good" },
      ];
      expect(buildCycleRing({ journalEntries, today: TODAY }).center.value).toBe("2 of 5");
    });
  });
});

describe("journal consistency", () => {
  const START = "2026-09-08"; // today (09-20) is day 13

  it("doesn't count today as missed when it isn't logged yet", () => {
    // Logged day 1 through yesterday: 12 of 12 elapsed.
    const journalEntries = dailyEntries(START, 12);
    const ring = buildCycleRing({ journalEntries, cycleStartDate: START, cycleLength: 28, today: TODAY });
    expect(ring.center).toEqual({ value: "100%", label: "Consistency" });
  });

  it("measures from cycle day 1 in cycle mode, even if logging started later", () => {
    // Logged 09-14 through today (7 days) of 13 elapsed since day 1.
    const journalEntries = dailyEntries("2026-09-14", 7);
    const ring = buildCycleRing({ journalEntries, cycleStartDate: START, cycleLength: 28, today: TODAY });
    expect(ring.center.value).toBe("54%");
  });

  it("ignores entries from before the current cycle", () => {
    // 10 entries last cycle, then 6 of this cycle's 13 days.
    const journalEntries = [...dailyEntries("2026-08-20", 10), ...dailyEntries("2026-09-15", 6)];
    const ring = buildCycleRing({ journalEntries, cycleStartDate: START, cycleLength: 28, today: TODAY });
    expect(ring.center.value).toBe("46%");
  });

  it("measures from the first entry in calendar mode when it's inside the window", () => {
    // First entry 09-11; 9 of the 10 days to today logged (09-15 missed).
    const journalEntries = dailyEntries("2026-09-11", 10).filter(e => e.date !== "2026-09-15");
    const ring = buildCycleRing({ journalEntries, today: TODAY });
    expect(ring.center.value).toBe("90%");
  });

  it("measures from the window start in calendar mode when entries predate it", () => {
    // Every other day from 60 days back: 14 of the 28 window days logged.
    const journalEntries = Array.from({ length: 31 }, (_, i) => ({ date: dayOffset(TODAY, -60 + i * 2), condition: "good" }));
    const ring = buildCycleRing({ journalEntries, today: TODAY });
    expect(ring.center.value).toBe("50%");
  });

  it("shows \"New cycle\" with no value on cycle day 1 before today is logged", () => {
    const journalEntries = dailyEntries("2026-09-10", 10);
    const ring = buildCycleRing({ journalEntries, cycleStartDate: TODAY, cycleLength: 28, today: TODAY });
    expect(ring.center).toEqual({ value: null, label: "New cycle" });
  });

  it("switches to consistency once cycle day 1 is logged", () => {
    const journalEntries = dailyEntries("2026-09-10", 11); // through today
    const ring = buildCycleRing({ journalEntries, cycleStartDate: TODAY, cycleLength: 28, today: TODAY });
    expect(ring.center).toEqual({ value: "100%", label: "Consistency" });
  });
});

describe("scalePhases", () => {
  it("keeps every phase at least one day and ends on the cycle length at 21 days", () => {
    const phases = scalePhases(21);
    expect(phases[0].startDay).toBe(1);
    expect(phases[phases.length - 1].endDay).toBe(21);
    phases.forEach((p, i) => {
      expect(p.endDay).toBeGreaterThanOrEqual(p.startDay);
      if (i > 0) expect(p.startDay).toBe(phases[i - 1].endDay + 1);
    });
  });
});
