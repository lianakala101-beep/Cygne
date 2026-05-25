import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getRampWeek, getRampPhase, RAMP_SCHEDULES } from "./ramp.jsx";

// Force "today" to a fixed local date so daysBetweenLocal is deterministic.
function setToday(year, monthIndex, day) {
  vi.setSystemTime(new Date(year, monthIndex, day, 12, 0, 0));
}

// Build a YYYY-MM-DD string for the given local date.
function iso(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

describe("getRampWeek", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("returns 1 when there is no product", () => {
    expect(getRampWeek(undefined)).toBe(1);
    expect(getRampWeek(null)).toBe(1);
  });

  it("returns 1 on the start date", () => {
    setToday(2026, 4, 17);
    expect(getRampWeek({ routineStartDate: iso(2026, 4, 17) })).toBe(1);
  });

  it("stays in week 1 for the first six days", () => {
    setToday(2026, 4, 23); // 6 days after May 17
    expect(getRampWeek({ routineStartDate: iso(2026, 4, 17) })).toBe(1);
  });

  it("advances to week 2 exactly seven days after start", () => {
    setToday(2026, 4, 24); // 7 days after May 17
    expect(getRampWeek({ routineStartDate: iso(2026, 4, 17) })).toBe(2);
  });

  it("advances to week 5 after 28 days", () => {
    setToday(2026, 5, 14); // 28 days after May 17
    expect(getRampWeek({ routineStartDate: iso(2026, 4, 17) })).toBe(5);
  });

  it("falls back to stored rampWeek when no routineStartDate", () => {
    expect(getRampWeek({ rampWeek: 3 })).toBe(3);
  });

  it("never returns less than 1 even for a future start date", () => {
    setToday(2026, 4, 17);
    expect(getRampWeek({ routineStartDate: iso(2026, 5, 1) })).toBe(1);
  });
});

describe("getRampPhase", () => {
  const retinol = RAMP_SCHEDULES.retinol;

  it("returns the Patch phase for week 1", () => {
    expect(getRampPhase(retinol, 1).name).toBe("Patch");
  });

  it("returns the Introduce phase for weeks 2-4", () => {
    [2, 3, 4].forEach((w) => expect(getRampPhase(retinol, w).name).toBe("Introduce"));
  });

  it("returns the Build phase for weeks 5-8", () => {
    [5, 6, 7, 8].forEach((w) => expect(getRampPhase(retinol, w).name).toBe("Build"));
  });

  it("returns the Maintain phase for weeks 9-12", () => {
    [9, 10, 11, 12].forEach((w) => expect(getRampPhase(retinol, w).name).toBe("Maintain"));
  });

  it("clamps weeks beyond the schedule to the final phase (Maintain forever)", () => {
    expect(getRampPhase(retinol, 99).name).toBe("Maintain");
  });
});
