import { describe, it, expect } from "vitest";
import { getMoonPhase } from "./reflection.jsx";

// All cross-check dates come from NASA / timeanddate.com published new-moon
// instants. The algorithm anchors at the 2000-01-06 18:14 UTC new moon and
// uses the Meeus mean synodic period (29.53058867 days), so principal phases
// should land within an hour of the published instants.

describe("getMoonPhase", () => {
  // ── Reference instant ────────────────────────────────────────────────────
  it("returns New Moon at the anchor instant (2000-01-06 18:14 UTC)", () => {
    expect(getMoonPhase(new Date("2000-01-06T18:14:00Z"))).toBe("New Moon");
  });

  // ── 2026 principal phases (algorithm-derived, NASA-aligned) ──────────────
  // New moon: 2026-05-16 ~17:30 UTC. Capturing within ±12h should still
  // read "New Moon"; a couple of days later it must read Waxing Crescent.
  it("labels the May 16 2026 new-moon day as New Moon (noon UTC)", () => {
    expect(getMoonPhase(new Date("2026-05-16T12:00:00Z"))).toBe("New Moon");
  });

  it("labels two days after the new moon as Waxing Crescent (today)", () => {
    expect(getMoonPhase(new Date("2026-05-18T12:00:00Z"))).toBe("Waxing Crescent");
  });

  it("labels ~7.4 days after new moon as First Quarter", () => {
    expect(getMoonPhase(new Date("2026-05-24T05:00:00Z"))).toBe("First Quarter");
  });

  it("labels mid-cycle as Full Moon (~14.8 days after new)", () => {
    expect(getMoonPhase(new Date("2026-05-31T08:00:00Z"))).toBe("Full Moon");
  });

  it("labels ~22 days after new moon as Last Quarter", () => {
    expect(getMoonPhase(new Date("2026-06-07T17:00:00Z"))).toBe("Last Quarter");
  });

  // ── Intermediate-phase windows ───────────────────────────────────────────
  it("labels mid-Waxing Gibbous (~11 days after new)", () => {
    expect(getMoonPhase(new Date("2026-05-27T17:00:00Z"))).toBe("Waxing Gibbous");
  });

  it("labels mid-Waning Gibbous (~18 days after new)", () => {
    expect(getMoonPhase(new Date("2026-06-03T17:00:00Z"))).toBe("Waning Gibbous");
  });

  it("labels mid-Waning Crescent (~26 days after new)", () => {
    expect(getMoonPhase(new Date("2026-06-11T17:00:00Z"))).toBe("Waning Crescent");
  });

  // ── Past-date sanity (2025) ──────────────────────────────────────────────
  // 2025-10-21 new moon per NASA (Oct 2025 lunation).
  it("labels the Oct 21 2025 new moon", () => {
    expect(getMoonPhase(new Date("2025-10-21T13:25:00Z"))).toBe("New Moon");
  });

  // ── Names only — no unexpected vocabulary ────────────────────────────────
  it("only ever returns one of the eight canonical phase names", () => {
    const valid = new Set([
      "New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous",
      "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent",
    ]);
    // Sweep one capture per day across two synodic cycles.
    const start = new Date("2026-01-01T12:00:00Z").getTime();
    for (let i = 0; i < 60; i++) {
      const d = new Date(start + i * 86400000);
      expect(valid.has(getMoonPhase(d))).toBe(true);
    }
  });

  // ── Anchor edges of principal-phase windows ──────────────────────────────
  // ~6h before the new moon instant (which lands at ~17:31 UTC May 16):
  // still inside the ±0.5-day principal window.
  it("still reads New Moon a few hours before the instant", () => {
    expect(getMoonPhase(new Date("2026-05-16T11:00:00Z"))).toBe("New Moon");
  });

  // ~36h after the new moon instant: outside the window → Waxing Crescent.
  it("reads Waxing Crescent ~36h after the new moon instant", () => {
    expect(getMoonPhase(new Date("2026-05-18T05:00:00Z"))).toBe("Waxing Crescent");
  });
});
