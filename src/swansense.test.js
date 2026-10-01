import { describe, it, expect } from "vitest";
import { buildNoProductsSwanLine } from "./swansense.jsx";

describe("buildNoProductsSwanLine", () => {
  it("returns a cycle-phase line when a phase is known", () => {
    expect(buildNoProductsSwanLine({ cyclePhaseName: "Luteal", season: "summer" }))
      .toMatch(/Progesterone/);
  });

  it("prefers cycle phase over season when both resolve", () => {
    const line = buildNoProductsSwanLine({ cyclePhaseName: "Follicular", season: "winter" });
    expect(line).toMatch(/Estrogen is climbing/);
  });

  it("falls back to season when no cycle phase is known", () => {
    expect(buildNoProductsSwanLine({ cyclePhaseName: null, season: "winter" }))
      .toMatch(/barrier/i);
  });

  it("returns null when neither cycle phase nor season resolves", () => {
    expect(buildNoProductsSwanLine({ cyclePhaseName: null, season: null })).toBeNull();
    expect(buildNoProductsSwanLine()).toBeNull();
  });

  it("returns null for an unrecognized phase or season name", () => {
    expect(buildNoProductsSwanLine({ cyclePhaseName: "NotAPhase", season: "NotASeason" })).toBeNull();
  });

  it("covers all four cycle phases", () => {
    for (const phase of ["Menstrual", "Follicular", "Ovulatory", "Luteal"]) {
      expect(typeof buildNoProductsSwanLine({ cyclePhaseName: phase })).toBe("string");
    }
  });

  it("covers all four seasons", () => {
    for (const season of ["winter", "spring", "summer", "fall"]) {
      expect(typeof buildNoProductsSwanLine({ season })).toBe("string");
    }
  });
});
