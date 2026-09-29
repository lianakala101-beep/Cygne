import { describe, it, expect } from "vitest";
import { buildTrackerAttention } from "./trackerAttention.js";

// Mirrors the isReadyToAdvance fixtures in src/ramp.test.js: a product
// started 2026-09-07, today 2026-09-20 (day 7 of week 2), a calm
// check-in inside the current stretch.
const TODAY = "2026-09-20";
const at = (day, hour = 12, minute = 0) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, hour, minute).toISOString();
};
const checkIn = (productId, state, day, extra = {}) => ({ product_id: productId, week_number: 2, response_state: state, created_at: at(day), ...extra });

const readyProduct = { id: "p1", name: "Adapalene Gel", routineStartDate: "2026-09-07" };
const calmForP1 = [checkIn("p1", "no_reaction", "2026-09-16")];

describe("buildTrackerAttention", () => {
  it("defaults every dot off except journal (not logged today) when nothing is passed", () => {
    expect(buildTrackerAttention()).toEqual({ journal: true, introduce: false, treatments: false });
  });

  describe("journal", () => {
    it("is on when today isn't logged", () => {
      expect(buildTrackerAttention({ journalLoggedToday: false }).journal).toBe(true);
    });
    it("is off when today is already logged", () => {
      expect(buildTrackerAttention({ journalLoggedToday: true }).journal).toBe(false);
    });
  });

  describe("introduce", () => {
    it("is on when at least one ramp product is ready to advance", () => {
      const result = buildTrackerAttention({ rampProducts: [readyProduct], rampCheckins: calmForP1, today: TODAY });
      expect(result.introduce).toBe(true);
    });

    it("is off when no ramp product is ready yet", () => {
      const notReady = { id: "p2", name: "Fresh Retinol", routineStartDate: "2026-09-19" }; // day 2
      const result = buildTrackerAttention({ rampProducts: [notReady], rampCheckins: [], today: TODAY });
      expect(result.introduce).toBe(false);
    });

    it("is on if any one of several products qualifies, not just the first", () => {
      const notReady = { id: "p2", name: "Fresh Retinol", routineStartDate: "2026-09-19" };
      const result = buildTrackerAttention({ rampProducts: [notReady, readyProduct], rampCheckins: calmForP1, today: TODAY });
      expect(result.introduce).toBe(true);
    });

    it("is off with an empty or missing ramp product list", () => {
      expect(buildTrackerAttention({ rampProducts: [], today: TODAY }).introduce).toBe(false);
      expect(buildTrackerAttention({ today: TODAY }).introduce).toBe(false);
    });

    it("respects the same irritation gate isReadyToAdvance already enforces", () => {
      const irritated = [checkIn("p1", "mild_irritation", "2026-09-16")];
      const result = buildTrackerAttention({ rampProducts: [readyProduct], rampCheckins: irritated, today: TODAY });
      expect(result.introduce).toBe(false);
    });
  });

  describe("treatments", () => {
    it("is on when the caller reports an active treatment", () => {
      expect(buildTrackerAttention({ treatmentActive: true }).treatments).toBe(true);
    });
    it("is off when there is none", () => {
      expect(buildTrackerAttention({ treatmentActive: false }).treatments).toBe(false);
    });
  });

  it("computes all three independently in one call", () => {
    const result = buildTrackerAttention({
      journalLoggedToday: true,
      rampProducts: [readyProduct],
      rampCheckins: calmForP1,
      treatmentActive: true,
      today: TODAY,
    });
    expect(result).toEqual({ journal: false, introduce: true, treatments: true });
  });
});
