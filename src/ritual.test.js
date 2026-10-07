import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getSwanSenseLine } from "./ritual.jsx";

const NO_DATA_LINE = "Log your first check-in — Swan Sense activates once Cygne knows your skin.";

describe("getSwanSenseLine", () => {
  describe("hasProducts: true (regression — unchanged precedence)", () => {
    it("prefers the LLM daily line when present", () => {
      const { line } = getSwanSenseLine({ dailyLine: "Day 12, follicular. Good window for actives." });
      expect(line).toBe("Day 12, follicular. Good window for actives.");
    });

    it("shows the loading dash while waiting for the LLM line", () => {
      const { line } = getSwanSenseLine({ dailyLoading: true });
      expect(line).toBe("—");
    });

    it("falls back to a generic line when the LLM call failed and no prediction exists", () => {
      const { line } = getSwanSenseLine({ dailyFailed: true });
      expect(line).not.toBe(NO_DATA_LINE);
      expect(typeof line).toBe("string");
      expect(line.length).toBeGreaterThan(0);
    });

    it("uses a meaningful rule-based prediction when the LLM line is absent", () => {
      const { line } = getSwanSenseLine({
        predictions: [{ id: "sleep_deficit", headline: "Sleep deficit building" }],
      });
      expect(line).toBe("Sleep deficit building");
    });

    it("ignores baseline_-prefixed predictions as non-meaningful", () => {
      const { line, hasMeaningful } = getSwanSenseLine({
        predictions: [{ id: "baseline_checkin", headline: "Log your first check-in to activate predictions." }],
      });
      expect(hasMeaningful).toBe(false);
      expect(line).toBe(NO_DATA_LINE);
    });

    it("falls back to NO_DATA_LINE with nothing else present", () => {
      const { line } = getSwanSenseLine({});
      expect(line).toBe(NO_DATA_LINE);
    });

    it("ignores noProductsLine when hasProducts is true", () => {
      const { line } = getSwanSenseLine({ hasProducts: true, noProductsLine: "Winter is tough on skin barriers." });
      expect(line).toBe(NO_DATA_LINE);
    });
  });

  describe("hasProducts: false (zero-product users skip the LLM line entirely)", () => {
    it("ignores a landed LLM daily line", () => {
      const { line } = getSwanSenseLine({
        hasProducts: false,
        dailyLine: "Your exfoliating and clarifying steps are earning their keep today.",
        noProductsLine: "Estrogen is climbing. Turnover speeds up and your skin gets more resilient by the day.",
      });
      expect(line).toBe("Estrogen is climbing. Turnover speeds up and your skin gets more resilient by the day.");
    });

    it("ignores the LLM loading state — never shows the loading dash", () => {
      const { line } = getSwanSenseLine({
        hasProducts: false,
        dailyLoading: true,
        noProductsLine: "Skin is shifting back toward dry as the season turns.",
      });
      expect(line).toBe("Skin is shifting back toward dry as the season turns.");
    });

    it("ignores the LLM failed state — never calls the generic fallback", () => {
      const { line } = getSwanSenseLine({
        hasProducts: false,
        dailyFailed: true,
        noProductsLine: "UV is climbing as skin recovers from winter. Barrier support matters more than usual.",
      });
      expect(line).toBe("UV is climbing as skin recovers from winter. Barrier support matters more than usual.");
    });

    it("still prefers a meaningful rule-based prediction over the no-products line", () => {
      const { line } = getSwanSenseLine({
        hasProducts: false,
        predictions: [{ id: "sleep_deficit", headline: "Sleep deficit building" }],
        noProductsLine: "Skin is shifting back toward dry as the season turns.",
      });
      expect(line).toBe("Sleep deficit building");
    });

    it("falls back to NO_DATA_LINE when there's no prediction and no no-products line", () => {
      const { line } = getSwanSenseLine({ hasProducts: false, noProductsLine: null });
      expect(line).toBe(NO_DATA_LINE);
    });
  });

  describe("birthday — overrides everything in both modes", () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0)); });
    afterEach(() => { vi.useRealTimers(); });

    it("overrides the LLM line when hasProducts is true", () => {
      const { line, isBirthday } = getSwanSenseLine({
        user: { birthMonth: "6", birthDay: "15" },
        dailyLine: "Day 12, follicular.",
      });
      expect(isBirthday).toBeTruthy();
      expect(line).not.toBe("Day 12, follicular.");
    });

    it("overrides the no-products line when hasProducts is false", () => {
      const { line, isBirthday } = getSwanSenseLine({
        user: { birthMonth: "6", birthDay: "15" },
        hasProducts: false,
        noProductsLine: "Skin is shifting back toward dry as the season turns.",
      });
      expect(isBirthday).toBeTruthy();
      expect(line).not.toBe("Skin is shifting back toward dry as the season turns.");
    });
  });
});
