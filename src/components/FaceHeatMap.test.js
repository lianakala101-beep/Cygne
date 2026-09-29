import { describe, it, expect } from "vitest";
import { cycleDayForDate } from "./FaceHeatMap.jsx";

const START = "2026-09-08";

describe("cycleDayForDate", () => {
  describe("on or after the cycle start (computeCycleDay)", () => {
    it("counts day 1 on the start date", () => {
      expect(cycleDayForDate("2026-09-08", START, 28)).toBe(1);
      expect(cycleDayForDate("2026-09-20", START, 28)).toBe(13);
    });

    it("keeps counting past the cycle length instead of wrapping", () => {
      // Day 30 of a 28-day cycle (previously wrapped to day 2).
      expect(cycleDayForDate("2026-10-07", START, 28)).toBe(30);
    });

    it("returns null past day 45", () => {
      expect(cycleDayForDate("2026-10-22", START, 28)).toBe(45);
      expect(cycleDayForDate("2026-10-23", START, 28)).toBeNull();
    });

    it("accepts a full ISO timestamp for the start date", () => {
      expect(cycleDayForDate("2026-09-20T09:30:00.000Z", "2026-09-08T04:00:00.000Z", 28)).toBe(13);
    });
  });

  describe("before the cycle start (backward estimate)", () => {
    it("counts back into the previous cycle by cycle length", () => {
      // One day before the start is the last day of the previous 28-day cycle.
      expect(cycleDayForDate("2026-09-07", START, 28)).toBe(28);
      // 28 days before the start is day 1 of the previous cycle.
      expect(cycleDayForDate("2026-08-11", START, 28)).toBe(1);
    });

    it("uses the user's cycle length for the estimate", () => {
      expect(cycleDayForDate("2026-09-07", START, 35)).toBe(35);
    });
  });

  it("returns null without a start date or a usable date", () => {
    expect(cycleDayForDate("2026-09-20", null, 28)).toBeNull();
    expect(cycleDayForDate("not-a-date", START, 28)).toBeNull();
  });
});
