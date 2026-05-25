import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getRitualPeriod } from "./ritualPeriod.js";

// getRitualPeriod uses new Date().getHours() internally. Lock the clock so
// the noon-cutoff behavior is testable.
function atHour(hour) {
  const d = new Date(2026, 4, 17, hour, 0, 0); // May 17 2026, local
  vi.setSystemTime(d);
}

describe("getRitualPeriod", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("returns AM strictly before noon", () => {
    [0, 5, 8, 11].forEach((h) => {
      atHour(h);
      expect(getRitualPeriod()).toBe("AM");
    });
  });

  it("returns PM from noon onwards", () => {
    [12, 13, 17, 23].forEach((h) => {
      atHour(h);
      expect(getRitualPeriod()).toBe("PM");
    });
  });

  it("auto-switches to PM when the AM ritual is already completed", () => {
    atHour(8); // morning, but AM is done
    expect(getRitualPeriod(true)).toBe("PM");
  });

  it("amCompleted=false does not affect the time-based result", () => {
    atHour(8);
    expect(getRitualPeriod(false)).toBe("AM");
    atHour(14);
    expect(getRitualPeriod(false)).toBe("PM");
  });
});
