import { describe, it, expect } from "vitest";
import { buildMonthlyDataCards } from "./monthlyDataCards.js";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekdayOf = (dateStr) => WEEKDAY_NAMES[new Date(`${dateStr}T00:00:00`).getDay()];

// All fixtures use January 2026 (year=2026, month=0) unless noted.
const YEAR = 2026;
const MONTH = 0;

describe("buildMonthlyDataCards", () => {
  it("returns no cards when nothing is logged", () => {
    expect(buildMonthlyDataCards({ year: YEAR, month: MONTH })).toEqual([]);
  });

  it("returns no cards when year/month aren't provided", () => {
    expect(buildMonthlyDataCards({ journals: [{ date: "2026-01-05", condition: "good" }] })).toEqual([]);
  });

  it("ignores entries outside the target month", () => {
    const journals = Array.from({ length: 10 }, (_, i) => ({ date: `2025-12-${String(i + 1).padStart(2, "0")}`, condition: "glowing" }));
    expect(buildMonthlyDataCards({ journals, year: YEAR, month: MONTH })).toEqual([]);
  });

  describe("Best Days", () => {
    it("surfaces the weekday with a clearly better average than the month overall", () => {
      // Four glowing entries on the same weekday (Jan 1, 8, 15, 22 — all
      // 7 days apart, so same weekday), plus a spread of low-scoring
      // entries on three other weekdays to establish a lower overall
      // average and satisfy the >=3-weekday-spread gate.
      const journals = [
        { date: "2026-01-01", condition: "glowing" },
        { date: "2026-01-08", condition: "glowing" },
        { date: "2026-01-15", condition: "glowing" },
        { date: "2026-01-22", condition: "glowing" },
        { date: "2026-01-02", condition: "rough" },
        { date: "2026-01-03", condition: "rough" },
        { date: "2026-01-04", condition: "dull" },
        { date: "2026-01-05", condition: "dull" },
      ];
      const cards = buildMonthlyDataCards({ journals, year: YEAR, month: MONTH });
      const card = cards.find(c => c.key === "bestDays");
      expect(card).toBeDefined();
      expect(card.label).toBe("Best Days");
      expect(card.body).toContain(`${weekdayOf("2026-01-01")}s`);
      expect(card.body).toContain("Glowing");
    });

    it("is absent with fewer than 8 entries", () => {
      const journals = Array.from({ length: 7 }, (_, i) => ({ date: `2026-01-0${i + 1}`, condition: "glowing" }));
      const cards = buildMonthlyDataCards({ journals, year: YEAR, month: MONTH });
      expect(cards.find(c => c.key === "bestDays")).toBeUndefined();
    });

    it("is absent when entries only span fewer than 3 distinct weekdays", () => {
      // 8 entries but only 2 distinct weekdays (every 7th day repeats
      // the same weekday, every 7th+1 day the next).
      const journals = [
        { date: "2026-01-01", condition: "good" }, { date: "2026-01-08", condition: "good" },
        { date: "2026-01-15", condition: "good" }, { date: "2026-01-22", condition: "good" },
        { date: "2026-01-02", condition: "okay" }, { date: "2026-01-09", condition: "okay" },
        { date: "2026-01-16", condition: "okay" }, { date: "2026-01-23", condition: "okay" },
      ];
      const cards = buildMonthlyDataCards({ journals, year: YEAR, month: MONTH });
      expect(cards.find(c => c.key === "bestDays")).toBeUndefined();
    });

    it("is absent when no weekday clears the overall average by enough margin", () => {
      // Every entry is "okay" — no spread at all, gap is exactly 0.
      const journals = [
        { date: "2026-01-01", condition: "okay" }, { date: "2026-01-02", condition: "okay" },
        { date: "2026-01-03", condition: "okay" }, { date: "2026-01-08", condition: "okay" },
        { date: "2026-01-09", condition: "okay" }, { date: "2026-01-10", condition: "okay" },
        { date: "2026-01-15", condition: "okay" }, { date: "2026-01-16", condition: "okay" },
      ];
      const cards = buildMonthlyDataCards({ journals, year: YEAR, month: MONTH });
      expect(cards.find(c => c.key === "bestDays")).toBeUndefined();
    });
  });

  describe("What's Working", () => {
    it("names the product with a clean, multi-check-in run this month", () => {
      const products = [{ id: "p1", name: "Vitamin C Serum" }];
      const rampCheckins = [
        { product_id: "p1", response_state: "loving_it", created_at: "2026-01-05T00:00:00Z" },
        { product_id: "p1", response_state: "no_reaction", created_at: "2026-01-12T00:00:00Z" },
        { product_id: "p1", response_state: "loving_it", created_at: "2026-01-19T00:00:00Z" },
      ];
      const cards = buildMonthlyDataCards({ rampCheckins, products, year: YEAR, month: MONTH });
      const card = cards.find(c => c.key === "whatsWorking");
      expect(card).toBeDefined();
      expect(card.body).toContain("Vitamin C Serum");
      expect(card.body).toContain("3 check-ins");
    });

    it("is absent when any check-in for the product was negative", () => {
      const products = [{ id: "p1", name: "Retinol Serum" }];
      const rampCheckins = [
        { product_id: "p1", response_state: "loving_it", created_at: "2026-01-05T00:00:00Z" },
        { product_id: "p1", response_state: "mild_irritation", created_at: "2026-01-12T00:00:00Z" },
      ];
      const cards = buildMonthlyDataCards({ rampCheckins, products, year: YEAR, month: MONTH });
      expect(cards.find(c => c.key === "whatsWorking")).toBeUndefined();
    });

    it("is absent with only a single check-in for a product", () => {
      const products = [{ id: "p1", name: "Niacinamide" }];
      const rampCheckins = [{ product_id: "p1", response_state: "loving_it", created_at: "2026-01-05T00:00:00Z" }];
      const cards = buildMonthlyDataCards({ rampCheckins, products, year: YEAR, month: MONTH });
      expect(cards.find(c => c.key === "whatsWorking")).toBeUndefined();
    });

    it("is absent if the qualifying product can't be resolved from the vanity list", () => {
      const rampCheckins = [
        { product_id: "gone", response_state: "loving_it", created_at: "2026-01-05T00:00:00Z" },
        { product_id: "gone", response_state: "loving_it", created_at: "2026-01-12T00:00:00Z" },
      ];
      const cards = buildMonthlyDataCards({ rampCheckins, products: [], year: YEAR, month: MONTH });
      expect(cards.find(c => c.key === "whatsWorking")).toBeUndefined();
    });
  });

  describe("Check-In Clarity", () => {
    it("reports a plain fraction of irritation-free check-ins", () => {
      const checkIns = [
        { date: "2026-01-05T00:00:00Z", irritation: "none" },
        { date: "2026-01-12T00:00:00Z", irritation: "none" },
        { date: "2026-01-19T00:00:00Z", irritation: "mild" },
      ];
      const cards = buildMonthlyDataCards({ checkIns, year: YEAR, month: MONTH });
      const card = cards.find(c => c.key === "checkInClarity");
      expect(card).toBeDefined();
      expect(card.body).toBe("2 of 3 check-ins this month reported no irritation.");
    });

    it("is absent with fewer than 2 check-ins", () => {
      const checkIns = [{ date: "2026-01-05T00:00:00Z", irritation: "none" }];
      const cards = buildMonthlyDataCards({ checkIns, year: YEAR, month: MONTH });
      expect(cards.find(c => c.key === "checkInClarity")).toBeUndefined();
    });
  });

  describe("What Changed", () => {
    it("reports an improvement from a clear first-half to second-half gap", () => {
      const journals = [
        { date: "2026-01-01", condition: "rough" },
        { date: "2026-01-02", condition: "rough" },
        { date: "2026-01-03", condition: "dull" },
        { date: "2026-01-25", condition: "glowing" },
        { date: "2026-01-26", condition: "glowing" },
        { date: "2026-01-27", condition: "good" },
      ];
      const cards = buildMonthlyDataCards({ journals, year: YEAR, month: MONTH });
      const card = cards.find(c => c.key === "whatChanged");
      expect(card).toBeDefined();
      expect(card.body).toContain("improved");
    });

    it("reports a decline the same way in the other direction", () => {
      const journals = [
        { date: "2026-01-01", condition: "glowing" },
        { date: "2026-01-02", condition: "glowing" },
        { date: "2026-01-03", condition: "good" },
        { date: "2026-01-25", condition: "rough" },
        { date: "2026-01-26", condition: "rough" },
        { date: "2026-01-27", condition: "dull" },
      ];
      const cards = buildMonthlyDataCards({ journals, year: YEAR, month: MONTH });
      const card = cards.find(c => c.key === "whatChanged");
      expect(card).toBeDefined();
      expect(card.body).toContain("declined");
    });

    it("is absent when one half has fewer than 3 entries", () => {
      const journals = [
        { date: "2026-01-01", condition: "rough" },
        { date: "2026-01-02", condition: "rough" },
        { date: "2026-01-25", condition: "glowing" },
        { date: "2026-01-26", condition: "glowing" },
        { date: "2026-01-27", condition: "glowing" },
      ];
      const cards = buildMonthlyDataCards({ journals, year: YEAR, month: MONTH });
      expect(cards.find(c => c.key === "whatChanged")).toBeUndefined();
    });

    it("is absent when the gap between halves is too small to be meaningful", () => {
      const journals = [
        { date: "2026-01-01", condition: "okay" },
        { date: "2026-01-02", condition: "okay" },
        { date: "2026-01-03", condition: "okay" },
        { date: "2026-01-25", condition: "okay" },
        { date: "2026-01-26", condition: "okay" },
        { date: "2026-01-27", condition: "okay" },
      ];
      const cards = buildMonthlyDataCards({ journals, year: YEAR, month: MONTH });
      expect(cards.find(c => c.key === "whatChanged")).toBeUndefined();
    });
  });

  it("caps at 4 cards even when every signal qualifies", () => {
    const journals = [
      { date: "2026-01-01", condition: "glowing" }, { date: "2026-01-08", condition: "glowing" },
      { date: "2026-01-15", condition: "glowing" }, { date: "2026-01-22", condition: "glowing" },
      { date: "2026-01-02", condition: "rough" }, { date: "2026-01-03", condition: "rough" },
      { date: "2026-01-04", condition: "dull" }, { date: "2026-01-05", condition: "dull" },
      { date: "2026-01-25", condition: "glowing" }, { date: "2026-01-26", condition: "glowing" }, { date: "2026-01-27", condition: "glowing" },
    ];
    const checkIns = [
      { date: "2026-01-05T00:00:00Z", irritation: "none" },
      { date: "2026-01-12T00:00:00Z", irritation: "none" },
    ];
    const products = [{ id: "p1", name: "Vitamin C Serum" }];
    const rampCheckins = [
      { product_id: "p1", response_state: "loving_it", created_at: "2026-01-05T00:00:00Z" },
      { product_id: "p1", response_state: "loving_it", created_at: "2026-01-12T00:00:00Z" },
    ];
    const cards = buildMonthlyDataCards({ journals, checkIns, rampCheckins, products, year: YEAR, month: MONTH });
    expect(cards.length).toBeLessThanOrEqual(4);
  });
});
