import { describe, it, expect } from "vitest";
import { shouldOfferFirstCheckIn } from "./firstCheckIn.js";

describe("shouldOfferFirstCheckIn", () => {
  it("offers when there are no journal entries and it hasn't been offered yet", () => {
    expect(shouldOfferFirstCheckIn({ journals: [], offered: false })).toBe(true);
  });

  it("never offers when the user already has a journal entry", () => {
    expect(shouldOfferFirstCheckIn({ journals: [{ date: "2026-09-01", condition: "okay" }], offered: false })).toBe(false);
  });

  it("never offers a second time, even with no journal entries", () => {
    expect(shouldOfferFirstCheckIn({ journals: [], offered: true })).toBe(false);
  });

  it("does not offer when both already-offered and an entry exist", () => {
    expect(shouldOfferFirstCheckIn({ journals: [{ date: "2026-09-01", condition: "good" }], offered: true })).toBe(false);
  });

  it("defaults to offering when called with no arguments", () => {
    expect(shouldOfferFirstCheckIn()).toBe(true);
  });

  it("treats a non-array journals value as empty rather than throwing", () => {
    expect(shouldOfferFirstCheckIn({ journals: null, offered: false })).toBe(true);
    expect(shouldOfferFirstCheckIn({ journals: undefined, offered: false })).toBe(true);
  });
});
