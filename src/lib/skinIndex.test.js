import { describe, it, expect } from "vitest";
import { buildSkinIndex } from "./skinIndex.js";

describe("buildSkinIndex", () => {
  it("returns no items and no actions when nothing resolves", () => {
    const result = buildSkinIndex({ cyclePhaseName: null, weather: null });
    expect(result.items).toEqual([]);
    expect(result.actions).toEqual([]);
  });

  it("computes sebum trend from cycle phase alone, no weather needed", () => {
    const result = buildSkinIndex({ cyclePhaseName: "Follicular", weather: null });
    const sebum = result.items.find(i => i.key === "sebum");
    expect(sebum.value).toBe("Escalating");
    // No weather at all — UV and humidity items must be absent.
    expect(result.items.find(i => i.key === "uv")).toBeUndefined();
    expect(result.items.find(i => i.key === "humidity")).toBeUndefined();
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

  it("shows the humidity item only when weather provides it, rounded to a whole percent", () => {
    const withHumidity = buildSkinIndex({ weather: { humidity: 42.6 } });
    const humidity = withHumidity.items.find(i => i.key === "humidity");
    expect(humidity.value).toBe("43%");

    const withoutHumidity = buildSkinIndex({ weather: { uvIndex: 4, humidity: null } });
    expect(withoutHumidity.items.find(i => i.key === "humidity")).toBeUndefined();
  });

  it("tones humidity independently: dry is caution, comfortable is neutral, humid is positive", () => {
    expect(buildSkinIndex({ weather: { humidity: 15 } }).items.find(i => i.key === "humidity").tone).toBe("caution");
    expect(buildSkinIndex({ weather: { humidity: 45 } }).items.find(i => i.key === "humidity").tone).toBe("neutral");
    expect(buildSkinIndex({ weather: { humidity: 75 } }).items.find(i => i.key === "humidity").tone).toBe("positive");
  });

  it("combines cycle + humidity into a higher barrier risk than either alone", () => {
    const cycleOnly = buildSkinIndex({ cyclePhaseName: "Luteal", weather: null });
    const combined = buildSkinIndex({ cyclePhaseName: "Luteal", weather: { humidity: 25 } });
    expect(cycleOnly.items.find(i => i.key === "barrier").value).toBe("Medium");
    expect(combined.items.find(i => i.key === "barrier").value).toBe("High");
  });

  it("produces up to 3 guidance bullets, most-severe combo first, when everything is elevated", () => {
    const result = buildSkinIndex({ cyclePhaseName: "Luteal", weather: { humidity: 60, uvIndex: 8 } });
    expect(result.actions.length).toBeLessThanOrEqual(3);
    expect(result.actions.some(a => /gel moisturizer/i.test(a))).toBe(true);
    expect(result.actions.some(a => /exfoliating acids/i.test(a))).toBe(true);
    expect(result.actions.some(a => /spf/i.test(a))).toBe(true);
    // High barrier risk means the "add a BHA" oil-trend bullet must
    // NOT also appear — never suggest adding an active in the same
    // breath as backing off actives.
    expect(result.actions.some(a => /bha/i.test(a))).toBe(false);
  });

  it("suggests holding off on actives, not adding one, when barrier risk is High", () => {
    const result = buildSkinIndex({ cyclePhaseName: "Luteal", weather: { humidity: 15, uvIndex: null } });
    expect(result.actions.some(a => /exfoliating acids/i.test(a) && /barrier sensitivity/i.test(a))).toBe(true);
    // No UV signal — SPF bullet must not appear.
    expect(result.actions.some(a => /spf/i.test(a))).toBe(false);
  });

  it("suggests an active step (not a caution) when oil is rising and barrier risk isn't High", () => {
    const result = buildSkinIndex({ cyclePhaseName: "Ovulatory", weather: { humidity: 70, uvIndex: 2 } });
    // Ovulatory + comfortable humidity + low UV → barrier risk Low,
    // sebum Escalating. Should get the oil-trend suggestion, not the
    // barrier-caution one, and no SPF bullet.
    expect(result.actions.some(a => /bha or clay/i.test(a))).toBe(true);
    expect(result.actions.some(a => /exfoliating acids/i.test(a))).toBe(false);
    expect(result.actions.some(a => /spf/i.test(a))).toBe(false);
  });

  it("gives a calm fallback bullet only when nothing else triggered", () => {
    const result = buildSkinIndex({ cyclePhaseName: "Ovulatory", weather: { humidity: 70, uvIndex: 2 } });
    // The oil-trend bullet fires here (previous test), so the calm
    // fallback must NOT also appear alongside it.
    expect(result.actions.some(a => /nothing unusual/i.test(a))).toBe(false);

    // Menstrual (sebum "Low", not rising) + comfortable weather has
    // no trigger at all — this is the one case the calm fallback
    // should show up in.
    const calm = buildSkinIndex({ cyclePhaseName: "Menstrual", weather: { humidity: 70, uvIndex: 1 } });
    expect(calm.actions).toEqual(["Nothing unusual in today's pattern — your usual ritual should serve you well."]);
  });

  it("never assumes a concern-adjacent tone when only Low/neutral values are present", () => {
    const result = buildSkinIndex({ cyclePhaseName: "Menstrual", weather: { humidity: 70, uvIndex: 1 } });
    const sebum = result.items.find(i => i.key === "sebum");
    expect(sebum.tone).toBe("positive");
    const barrier = result.items.find(i => i.key === "barrier");
    expect(barrier.value).toBe("Medium"); // menstrual baseline alone
  });
});
