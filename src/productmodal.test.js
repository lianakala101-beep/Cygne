import { describe, it, expect } from "vitest";
import { getSuggestedFrequency, getAutoSession, getFormSession, getFormFrequency } from "./productmodal.jsx";
import { CATEGORIES } from "./constants.js";

describe("getSuggestedFrequency", () => {
  it("suggests alternating for an azelaic acid serum", () => {
    const out = getSuggestedFrequency({ category: "Serum", ingredients: ["azelaic acid"] });
    expect(out.id).toBe("alternating");
  });

  it("does not fall through to the generic daily Serum default for azelaic acid", () => {
    const out = getSuggestedFrequency({ category: "Serum", ingredients: ["azelaic acid"] });
    expect(out.id).not.toBe("daily");
  });

  describe("regression: existing active suggestions are unaffected", () => {
    it("still suggests alternating for a plain retinol serum", () => {
      const out = getSuggestedFrequency({ category: "Serum", ingredients: ["retinol"] });
      expect(out.id).toBe("alternating");
    });

    it("still suggests daily for a vitamin C serum", () => {
      const out = getSuggestedFrequency({ category: "Serum", ingredients: ["ascorbic acid"] });
      expect(out.id).toBe("daily");
    });

    it("still suggests 2-3x for an AHA serum", () => {
      const out = getSuggestedFrequency({ category: "Serum", ingredients: ["glycolic acid"] });
      expect(out.id).toBe("2-3x");
    });

    it("still suggests 2-3x for a BHA serum", () => {
      const out = getSuggestedFrequency({ category: "Serum", ingredients: ["salicylic acid"] });
      expect(out.id).toBe("2-3x");
    });

    it("still suggests daily for benzoyl peroxide", () => {
      const out = getSuggestedFrequency({ category: "Serum", ingredients: ["benzoyl peroxide"] });
      expect(out.id).toBe("daily");
    });

    it("still suggests daily AM for SPF regardless of category", () => {
      const out = getSuggestedFrequency({ category: "SPF", ingredients: [] });
      expect(out.id).toBe("daily");
    });

    it("still falls through to the generic daily Serum default with no recognized active", () => {
      const out = getSuggestedFrequency({ category: "Serum", ingredients: ["glycerin"] });
      expect(out.id).toBe("daily");
    });
  });
});

// The add-product form's Session default, Session hint, frequency and
// frequency hint must tell one story for a product with an evening
// ramp (retinol, AHA, BHA, azelaic acid): PM, starting slowly.
describe("form defaults for ramped actives", () => {
  const formState = (product, user = {}) => {
    const { locked, auto } = getFormSession(product);
    const session = locked || auto;
    const freq = getFormFrequency(product, user);
    return { session: session.session, sessionHint: session.reason || "", freq: freq.id, freqHint: freq.reason || "" };
  };
  const MORNING = /\bAM\b|morning|twice/i;
  const expectEveningStory = (state) => {
    expect(state.session).toBe("pm");
    expect(state.sessionHint).not.toMatch(MORNING);
    expect(state.freqHint).not.toMatch(MORNING);
    expect(state.freq).not.toBe("daily");
  };

  it("azelaic acid + hyaluronic acid serum: PM, ramp hint, alternating", () => {
    const product = {
      name: "Azelaic Acid 10 Hyaluron Redness Soothing Serum",
      category: "Serum",
      ingredients: ["Aqua", "Azelaic Acid", "Sodium Hyaluronate", "Glycerin", "Panthenol"],
    };
    const state = formState(product);
    expect(state).toEqual({
      session: "pm",
      sessionHint: "Start with one evening session while your skin adjusts.",
      freq: "alternating",
      freqHint: expect.stringMatching(/every other evening/),
    });
    expect(getFormSession(product).locked).toBeNull();
    expectEveningStory(state);
  });

  it("retinol + hyaluronic acid serum: PM, alternating", () => {
    const state = formState({ category: "Serum", ingredients: ["Aqua", "Retinol", "Sodium Hyaluronate"] });
    expect(state.freq).toBe("alternating");
    expectEveningStory(state);
  });

  it("BHA + glycerin serum: PM, 2-3x", () => {
    const state = formState({ category: "Serum", ingredients: ["Aqua", "Salicylic Acid", "Glycerin"] });
    expect(state.freq).toBe("2-3x");
    expectEveningStory(state);
  });

  it("holds for every category, ramped active, hydrator and skin profile", () => {
    const ramped = ["Azelaic Acid", "Retinol", "Retinal", "Bakuchiol", "Glycolic Acid", "Lactic Acid", "Salicylic Acid"];
    const hydrators = ["Sodium Hyaluronate", "Glycerin", "Niacinamide", "Ceramide NP", "Squalane"];
    const users = [{}, { skinType: "Sensitive" }, { medicalHistory: { onTretinoin: true } }];
    // Sunscreens keep their AM rule; they never get an evening ramp.
    for (const category of CATEGORIES.filter(c => c !== "SPF")) {
      for (const active of ramped) {
        for (const hydrator of hydrators) {
          for (const user of users) {
            const state = formState({ category, ingredients: ["Aqua", active, hydrator] }, user);
            // Oil's frequency is "daily PM use" — PM, so no contradiction.
            if (category === "Oil") {
              expect(state.session).toBe("pm");
              expect(state.sessionHint).not.toMatch(MORNING);
              expect(state.freqHint).not.toMatch(MORNING);
            } else {
              expectEveningStory(state);
            }
          }
        }
      }
    }
  });

  it("leaves products without a ramped active unchanged", () => {
    const ha = { category: "Serum", ingredients: ["Aqua", "Sodium Hyaluronate", "Glycerin"] };
    expect(getFormSession(ha)).toEqual({ locked: null, auto: { session: "both", reason: "Hydrating actives benefit from twice-daily use." } });
    expect(getFormFrequency(ha)).toEqual(getSuggestedFrequency(ha));
    const cleanser = { category: "Cleanser", ingredients: ["Aqua", "Glycerin"] };
    expect(getFormSession(cleanser).auto).toEqual(getAutoSession(cleanser));
    expect(getFormFrequency(cleanser)).toEqual(getSuggestedFrequency(cleanser));
  });
});
