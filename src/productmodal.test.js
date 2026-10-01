import { describe, it, expect } from "vitest";
import { getSuggestedFrequency } from "./productmodal.jsx";

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
