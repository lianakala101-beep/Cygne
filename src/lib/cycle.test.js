import { describe, it, expect } from "vitest";
import { parseCycleLength, computeCycleDay, getCyclePhaseNameForDate, MAX_CYCLE_DAY } from "./cycle.js";

describe("parseCycleLength", () => {
  it("reads back a stored number", () => {
    expect(parseCycleLength(45)).toBe(45);
    expect(parseCycleLength(31)).toBe(31);
  });

  it("reads back a numeric string", () => {
    expect(parseCycleLength("33")).toBe(33);
  });

  it("clamps to the 21–45 slider range", () => {
    expect(parseCycleLength(14)).toBe(21);
    expect(parseCycleLength(60)).toBe(45);
  });

  it("returns null when nothing usable is stored", () => {
    expect(parseCycleLength(undefined)).toBeNull();
    expect(parseCycleLength(null)).toBeNull();
    expect(parseCycleLength("")).toBeNull();
    expect(parseCycleLength("abc")).toBeNull();
    expect(parseCycleLength(0)).toBeNull();
  });
});

describe("computeCycleDay", () => {
  const START = "2026-09-01";

  it("counts day 1 on the start date", () => {
    expect(computeCycleDay(START, 28, "2026-09-01")).toBe(1);
    expect(computeCycleDay(START, 28, "2026-09-13")).toBe(13);
  });

  it("keeps counting past the cycle length instead of wrapping", () => {
    // Day 30 of a 28-day cycle stays day 30 (previously wrapped to day 2).
    expect(computeCycleDay(START, 28, "2026-09-30")).toBe(30);
    expect(getCyclePhaseNameForDate(START, 28, "2026-09-30")).toBe("Luteal");
  });

  it("ignores cycleLength for the day itself", () => {
    expect(computeCycleDay(START, 21, "2026-09-30")).toBe(30);
    expect(computeCycleDay(START, 45, "2026-09-30")).toBe(30);
  });

  it("returns day 45 at the cap and null after it", () => {
    expect(MAX_CYCLE_DAY).toBe(45);
    expect(computeCycleDay(START, 28, "2026-10-15")).toBe(45);
    expect(computeCycleDay(START, 28, "2026-10-16")).toBeNull();
    expect(getCyclePhaseNameForDate(START, 28, "2026-10-16")).toBeNull();
  });

  it("returns null before the start date and for unusable inputs", () => {
    expect(computeCycleDay(START, 28, "2026-08-31")).toBeNull();
    expect(computeCycleDay(null, 28, "2026-09-05")).toBeNull();
    expect(computeCycleDay("not-a-date", 28, "2026-09-05")).toBeNull();
    expect(computeCycleDay(START, 28, "not-a-date")).toBeNull();
  });
});
