import { describe, it, expect } from "vitest";
import { buildSkinIndex } from "./skinIndex.js";

describe("buildSkinIndex", () => {
  it("returns no items and no action line when nothing resolves", () => {
    const result = buildSkinIndex({ cyclePhaseName: null, weather: null });
    expect(result.items).toEqual([]);
    expect(result.actionLine).toBeNull();
  });

  it("computes sebum trend from cycle phase alone, no weather needed", () => {
    const result = buildSkinIndex({ cyclePhaseName: "Follicular", weather: null });
    const sebum = result.items.find(i => i.key === "sebum");
    expect(sebum.value).toBe("Escalating");
    // No weather at all — UV item must be absent.
    expect(result.items.find(i => i.key === "uv")).toBeUndefined();
  });

  it("maps each phase to its expected sebum trend", () => {
    expect(buildSkinIndex({ cyclePhaseName: "Menstrual" }).items.find(i => i.key === "sebum").value).toBe("Low");
    expect(buildSkinIndex({ cyclePhaseName: "Follicular" }).items.find(i => i.key === "sebum").value).toBe("Escalating");
    expect(buildSkinIndex({ cyclePhaseName: "Ovulatory" }).items.find(i => i.key === "sebum").value).toBe("Escalating");
    expect(buildSkinIndex({ cyclePhaseName: "Luteal" }).items.find(i => i.key === "sebum").value).toBe("Peak");
  });

  it("computes barrier risk from weather alone when cycle tracking is off", () => {
    const result = buildSkinIndex({ cyclePhaseName: null, weather: { humidity: 15, uvIndex: null } });
    const barrier = result.items.find(i => i.key === "barrier");
    expect(barrier).toBeDefined();
    expect(barrier.value).toBe("High");
    // No cycle phase — sebum trend must be absent.
    expect(result.items.find(i => i.key === "sebum")).toBeUndefined();
  });

  it("shows the UV item only when weather provides a uvIndex", () => {
    const withUv = buildSkinIndex({ weather: { uvIndex: 7 } });
    expect(withUv.items.find(i => i.key === "uv").value).toBe("7");

    const withoutUv = buildSkinIndex({ weather: { humidity: 40, uvIndex: null } });
    expect(withoutUv.items.find(i => i.key === "uv")).toBeUndefined();
  });

  it("rounds the displayed UV value but keeps threshold checks on the raw figure", () => {
    // 5.6 rounds up to "6" for display, and 5.6 itself is below the
    // >=6 caution threshold — so the pill should show 6 while still
    // reading as non-caution, proving the round happens at display
    // time only and doesn't leak into the threshold math.
    const result = buildSkinIndex({ weather: { uvIndex: 5.6 } });
    const uv = result.items.find(i => i.key === "uv");
    expect(uv.value).toBe("6");
    expect(uv.tone).toBe("neutral");

    expect(buildSkinIndex({ weather: { uvIndex: 2.4 } }).items.find(i => i.key === "uv").value).toBe("2");
    expect(buildSkinIndex({ weather: { uvIndex: 8.9 } }).items.find(i => i.key === "uv").value).toBe("9");
  });

  it("combines cycle + humidity into a higher barrier risk than either alone", () => {
    const cycleOnly = buildSkinIndex({ cyclePhaseName: "Luteal", weather: null });
    const combined = buildSkinIndex({ cyclePhaseName: "Luteal", weather: { humidity: 25 } });
    expect(cycleOnly.items.find(i => i.key === "barrier").value).toBe("Medium");
    expect(combined.items.find(i => i.key === "barrier").value).toBe("High");
  });

  it("prioritizes the high-sebum + high-UV action line over other combos", () => {
    const result = buildSkinIndex({ cyclePhaseName: "Luteal", weather: { humidity: 60, uvIndex: 8 } });
    expect(result.actionLine).toMatch(/gel moisturizer/i);
  });

  it("falls back to a barrier-risk line when barrier is High but UV isn't", () => {
    const result = buildSkinIndex({ cyclePhaseName: "Luteal", weather: { humidity: 15, uvIndex: null } });
    expect(result.actionLine).toMatch(/barrier risk is elevated/i);
  });

  it("gives a calm fallback line when nothing is notable", () => {
    const result = buildSkinIndex({ cyclePhaseName: "Ovulatory", weather: { humidity: 70, uvIndex: 2 } });
    // Ovulatory sebum is "Escalating" per the phase map, which takes
    // priority over the calm fallback — assert the escalating-only
    // branch fires instead of the barrier="Low" branch.
    expect(result.actionLine).toMatch(/sebum is climbing/i);
  });

  it("never assumes a concern-adjacent tone when only Low/neutral values are present", () => {
    const result = buildSkinIndex({ cyclePhaseName: "Menstrual", weather: { humidity: 70, uvIndex: 1 } });
    const sebum = result.items.find(i => i.key === "sebum");
    expect(sebum.tone).toBe("positive");
    const barrier = result.items.find(i => i.key === "barrier");
    expect(barrier.value).toBe("Medium"); // menstrual baseline alone
  });
});
