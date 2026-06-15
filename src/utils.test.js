import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isoWeekNumber, isoWeekYear, getAskCygneAccess } from "./utils.jsx";

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

describe("getAskCygneAccess", () => {
  // Pin "today" so the calculated age is deterministic regardless of when
  // the test suite runs. Today = June 15, 2026.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'unknown' for null user", () => {
    expect(getAskCygneAccess(null)).toBe("unknown");
  });

  it("returns 'unknown' for user without birthYear", () => {
    expect(getAskCygneAccess({})).toBe("unknown");
    expect(getAskCygneAccess({ birthYear: null })).toBe("unknown");
    expect(getAskCygneAccess({ birthYear: "" })).toBe("unknown");
  });

  it("returns 'unknown' for malformed birthYear", () => {
    expect(getAskCygneAccess({ birthYear: "abc" })).toBe("unknown");
    expect(getAskCygneAccess({ birthYear: "12" })).toBe("unknown"); // < 1900
    expect(getAskCygneAccess({ birthYear: "20260" })).toBe("unknown"); // > 9999
  });

  it("returns 'available' for an adult born well in the past", () => {
    expect(getAskCygneAccess({ birthYear: "1990" })).toBe("available");
  });

  it("returns 'underage' for a child born this year", () => {
    expect(getAskCygneAccess({ birthYear: "2025" })).toBe("underage");
  });

  it("returns 'available' exactly at the 17-year threshold", () => {
    // Born June 15, 2009 → turning 17 on June 15, 2026 → 17 exactly today
    expect(getAskCygneAccess({ birthYear: "2009", birthMonth: "6", birthDay: "15" })).toBe("available");
  });

  it("returns 'underage' the day before turning 17", () => {
    // Born June 16, 2009 → still 16 on June 15, 2026 (birthday is tomorrow)
    expect(getAskCygneAccess({ birthYear: "2009", birthMonth: "6", birthDay: "16" })).toBe("underage");
  });

  it("returns 'available' the day after turning 17", () => {
    // Born June 14, 2009 → turned 17 yesterday
    expect(getAskCygneAccess({ birthYear: "2009", birthMonth: "6", birthDay: "14" })).toBe("available");
  });

  it("uses Jan 1 as conservative-estimate fallback when month/day are missing", () => {
    // Year-only 2009: assumed Jan 1, 2009. On June 15, 2026, the assumed
    // birthday (Jan 1) has already passed, so age = 17. Available.
    expect(getAskCygneAccess({ birthYear: "2009" })).toBe("available");
    // Year-only 2010: assumed Jan 1, 2010. Age = 16. Underage.
    expect(getAskCygneAccess({ birthYear: "2010" })).toBe("underage");
  });

  it("recomputes dynamically — no caching from a previous call", () => {
    // Same user object, time advances by one day → flips from underage
    // to available exactly on their birthday.
    const user = { birthYear: "2009", birthMonth: "6", birthDay: "16" };
    expect(getAskCygneAccess(user)).toBe("underage"); // June 15 = day before
    vi.setSystemTime(new Date(2026, 5, 16));
    expect(getAskCygneAccess(user)).toBe("available"); // June 16 = birthday
  });
});
