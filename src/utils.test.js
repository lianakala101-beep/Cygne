import { describe, it, expect } from "vitest";
import { isoWeekNumber, isoWeekYear } from "./utils.jsx";

describe("isoWeekNumber", () => {
  it("returns 1 for a Thursday in early January", () => {
    expect(isoWeekNumber(new Date(2026, 0, 1))).toBe(1); // Thu Jan 1 2026
  });

  it("handles the last week of the year that rolls into ISO week 1 of the next year", () => {
    // Sat Jan 1 2022 is ISO week 52 of 2021
    expect(isoWeekNumber(new Date(2022, 0, 1))).toBe(52);
  });

  it("returns 52 or 53 in late December as appropriate", () => {
    // Mon Dec 28 2026 — final ISO week 53 of 2026
    expect(isoWeekNumber(new Date(2026, 11, 28))).toBe(53);
  });

  it("defaults to today when called with no args", () => {
    const value = isoWeekNumber();
    expect(value).toBeGreaterThanOrEqual(1);
    expect(value).toBeLessThanOrEqual(53);
  });
});

describe("isoWeekYear", () => {
  it("returns the calendar year for mid-year dates", () => {
    expect(isoWeekYear(new Date(2026, 5, 15))).toBe(2026);
  });

  it("returns the previous calendar year for a Saturday Jan 1 (ISO week belongs to prior year)", () => {
    expect(isoWeekYear(new Date(2022, 0, 1))).toBe(2021);
  });

  it("returns the next calendar year for late December that rolls into ISO week 1", () => {
    // Mon Dec 30 2024 → ISO week 1 of 2025
    expect(isoWeekYear(new Date(2024, 11, 30))).toBe(2025);
  });
});
