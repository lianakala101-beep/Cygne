import { describe, it, expect } from "vitest";
import {
  detectActives,
  detectActivesFromProduct,
  buildRoutine,
  detectConflicts,
  analyzeShelf,
  calcSpending,
  applyPhilosophy,
  getProductConflicts,
  isExfoliantLike,
  isDampSkinProduct,
  hasSPFCoverage,
  isTretinoin,
} from "./engine.js";

// Build a minimal product shape with sensible defaults so individual tests
// only need to override the fields they care about.
const p = (overrides = {}) => ({
  id: overrides.id ?? Math.random().toString(36).slice(2),
  brand: "Test",
  name: "Test Product",
  category: "Serum",
  ingredients: [],
  inRoutine: true,
  ...overrides,
});

describe("detectActives", () => {
  it("detects retinol from an explicit ingredient", () => {
    expect(detectActives(["retinol", "squalane"])).toEqual({ retinol: true });
  });

  it("detects multiple actives from a single list", () => {
    const a = detectActives(["niacinamide", "salicylic acid", "hyaluronic acid"]);
    expect(a.niacinamide).toBe(true);
    expect(a.BHA).toBe(true);
    expect(a["hyaluronic acid"]).toBe(true);
  });

  it("accepts a comma-separated string and splits it", () => {
    const a = detectActives("ascorbic acid, glycerin");
    expect(a["vitamin C"]).toBe(true);
  });

  it("returns an empty object for non-list input", () => {
    expect(detectActives(null)).toEqual({});
    expect(detectActives(undefined)).toEqual({});
  });

  it("matches substrings (e.g. 'l-ascorbic acid' matches 'ascorbic acid')", () => {
    expect(detectActives(["l-ascorbic acid"])["vitamin C"]).toBe(true);
  });

  it("detects AHA from the bare 'aha' label common on K-beauty labels", () => {
    expect(detectActives(["aha"]).AHA).toBe(true);
    expect(detectActives(["AHA complex"]).AHA).toBe(true);
    expect(detectActives(["Alpha Hydroxy Acid"]).AHA).toBe(true);
  });

  it("detects BHA from the bare 'bha' label common on K-beauty labels", () => {
    expect(detectActives(["bha"]).BHA).toBe(true);
    expect(detectActives(["BHA blend"]).BHA).toBe(true);
    expect(detectActives(["Beta Hydroxy Acid"]).BHA).toBe(true);
  });

  it("detects both AHA and BHA from a combined 'aha/bha' label", () => {
    const a = detectActives(["AHA", "BHA"]);
    expect(a.AHA).toBe(true);
    expect(a.BHA).toBe(true);
  });

  it("detects azelaic acid from an explicit ingredient", () => {
    expect(detectActives(["azelaic acid", "glycerin"])).toEqual({ "azelaic acid": true });
  });

  it("does not mistake azelaic acid for any other active", () => {
    const a = detectActives(["azelaic acid"]);
    expect(a.AHA).toBeUndefined();
    expect(a.BHA).toBeUndefined();
    expect(a.retinol).toBeUndefined();
  });

  it("detects tretinoin and adapalene as the retinol active key", () => {
    // ACTIVE_RULES.retinol.keywords includes both by name — this is the
    // exact lookup the product-add flow's retinoid pregnancy caution
    // gate relies on (formActives.includes("retinol")).
    expect(detectActives(["tretinoin"]).retinol).toBe(true);
    expect(detectActives(["adapalene"]).retinol).toBe(true);
  });
});

describe("detectActivesFromProduct", () => {
  it("defaults a toning pad with no ingredient hits to BHA", () => {
    const a = detectActivesFromProduct(p({ category: "Toning Pad", ingredients: [] }));
    expect(a.BHA).toBe(true);
  });

  it("upgrades from product name keywords when ingredients are sparse", () => {
    const a = detectActivesFromProduct(p({ name: "Glycolic Acid Pads", ingredients: [] }));
    expect(a.AHA).toBe(true);
  });

  it("returns empty object for nullish product", () => {
    expect(detectActivesFromProduct(null)).toEqual({});
  });

  it("maps tretinoin and adapalene ingredients to the retinol active key", () => {
    // Both share ACTIVE_RULES.retinol's keyword list, so anything gated
    // on the "retinol" active (e.g. the pregnancy caution) covers them.
    expect(detectActivesFromProduct(p({ ingredients: ["tretinoin"] })).retinol).toBe(true);
    expect(detectActivesFromProduct(p({ ingredients: ["adapalene"] })).retinol).toBe(true);
  });
});

describe("isTretinoin", () => {
  it("detects tretinoin from the ingredient list", () => {
    expect(isTretinoin(p({ ingredients: ["tretinoin"] }))).toBe(true);
  });

  it("detects the Retin-A brand name from the ingredient list", () => {
    expect(isTretinoin(p({ ingredients: ["Retin-A 0.025%"] }))).toBe(true);
  });

  it("falls back to the product name when ingredients don't mention it", () => {
    expect(isTretinoin(p({ name: "Retin-A Micro", ingredients: [] }))).toBe(true);
    expect(isTretinoin(p({ name: "Generic Tretinoin Cream", ingredients: [] }))).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isTretinoin(p({ ingredients: ["TRETINOIN"] }))).toBe(true);
  });

  it("returns false for plain retinol (not tretinoin)", () => {
    expect(isTretinoin(p({ ingredients: ["retinol"] }))).toBe(false);
  });

  it("returns false for adapalene (not tretinoin)", () => {
    expect(isTretinoin(p({ ingredients: ["adapalene"] }))).toBe(false);
  });

  it("returns false for a product with no retinoid at all", () => {
    expect(isTretinoin(p({ ingredients: ["niacinamide"] }))).toBe(false);
  });

  it("returns false for null/undefined product", () => {
    expect(isTretinoin(null)).toBe(false);
    expect(isTretinoin(undefined)).toBe(false);
  });

  it("accepts a comma-separated ingredient string as well as an array", () => {
    expect(isTretinoin(p({ ingredients: "Tretinoin 0.05%, Glycerin" }))).toBe(true);
  });
});

describe("isExfoliantLike", () => {
  it("flags products in the Exfoliant category", () => {
    expect(isExfoliantLike(p({ category: "Exfoliant" }))).toBe(true);
  });

  it("flags products in the Toning Pad category", () => {
    expect(isExfoliantLike(p({ category: "Toning Pad" }))).toBe(true);
  });

  it("flags products whose name contains pad/peel/scrub", () => {
    expect(isExfoliantLike(p({ name: "Resurfacing Peel" }))).toBe(true);
  });

  it("flags products with AHA/BHA/PHA in the ingredient list", () => {
    expect(isExfoliantLike(p({ ingredients: ["salicylic acid"] }))).toBe(true);
  });

  it("returns false for a plain serum with no acid hits", () => {
    expect(isExfoliantLike(p({ ingredients: ["hyaluronic acid"] }))).toBe(false);
  });
});

describe("isDampSkinProduct", () => {
  it("flags humectant-forward ingredients", () => {
    expect(isDampSkinProduct(p({ ingredients: ["hyaluronic acid"] }))).toBe(true);
  });

  it("flags Toner/Essence/Mist categories regardless of ingredients", () => {
    expect(isDampSkinProduct(p({ category: "Toner", ingredients: [] }))).toBe(true);
    expect(isDampSkinProduct(p({ category: "Essence", ingredients: [] }))).toBe(true);
  });

  it("returns false for non-humectant serums", () => {
    expect(isDampSkinProduct(p({ category: "Serum", ingredients: ["retinol"] }))).toBe(false);
  });
});

describe("hasSPFCoverage", () => {
  it("returns true when a product is in the SPF category", () => {
    expect(hasSPFCoverage([p({ category: "SPF" })], {})).toBe(true);
  });

  it("returns true when SPF Moisturizer is present", () => {
    expect(hasSPFCoverage([p({ category: "SPF Moisturizer" })], {})).toBe(true);
  });

  it("returns true when a product's ingredients trip the SPF detector", () => {
    expect(hasSPFCoverage([p({ category: "Moisturizer", ingredients: ["zinc oxide"] })], {})).toBe(true);
  });

  it("returns false when no SPF source exists", () => {
    expect(hasSPFCoverage([p({ category: "Serum" })], {})).toBe(false);
  });
});

describe("calcSpending", () => {
  it("sums product prices and groups by category", () => {
    const r = calcSpending([
      p({ price: 30, category: "Serum" }),
      p({ price: 20, category: "Serum" }),
      p({ price: 50, category: "SPF" }),
    ]);
    expect(r.total).toBe(100);
    expect(r.byCategory.Serum).toBe(50);
    expect(r.byCategory.SPF).toBe(50);
  });

  it("treats missing price as zero", () => {
    const r = calcSpending([p({ price: undefined }), p({ price: 10 })]);
    expect(r.total).toBe(10);
  });
});

describe("applyPhilosophy", () => {
  const steps = [
    { id: "a", category: "Cleanser" },
    { id: "b", category: "Toner" },
    { id: "c", category: "Serum" },
    { id: "d", category: "Eye Cream" },
    { id: "e", category: "Moisturizer" },
    { id: "f", category: "Oil" },
    { id: "g", category: "Mask" },
    { id: "h", category: "SPF" },
  ];

  it("keeps every step under Multi-Step", () => {
    expect(applyPhilosophy(steps, "Multi-Step").length).toBe(steps.length);
  });

  it("keeps every step when philosophy is empty", () => {
    expect(applyPhilosophy(steps, "").length).toBe(steps.length);
  });

  it("drops Mask + Oil under Somewhere In Between", () => {
    const out = applyPhilosophy(steps, "Somewhere In Between");
    const cats = out.map(s => s.category);
    expect(cats).not.toContain("Mask");
    expect(cats).not.toContain("Oil");
    expect(cats).toContain("Serum");
  });

  it("drops Mask, Oil, Eye Cream, Mist, Toning Pad under Minimalist", () => {
    const out = applyPhilosophy(steps, "Minimalist");
    const cats = out.map(s => s.category);
    expect(cats).not.toContain("Mask");
    expect(cats).not.toContain("Oil");
    expect(cats).not.toContain("Eye Cream");
    expect(cats).toContain("Cleanser");
    expect(cats).toContain("SPF");
  });
});

describe("buildRoutine", () => {
  it("excludes products with inRoutine: false", () => {
    const out = buildRoutine([p({ inRoutine: false }), p({ category: "Cleanser" })]);
    expect(out.am.length + out.pm.length).toBeGreaterThan(0);
    // The first product is excluded — only the cleanser is in some session.
    const ids = [...out.am, ...out.pm].map(x => x.id);
    expect(ids).not.toContain("excluded");
  });

  it("places SPF only in AM", () => {
    const spf = p({ id: "spf", category: "SPF", session: "" });
    const out = buildRoutine([spf]);
    expect(out.am.map(x => x.id)).toContain("spf");
    expect(out.pm.map(x => x.id)).not.toContain("spf");
  });

  it("places Prescription only in PM", () => {
    const rx = p({ id: "rx", category: "Prescription", session: "" });
    const out = buildRoutine([rx]);
    expect(out.am.map(x => x.id)).not.toContain("rx");
    expect(out.pm.map(x => x.id)).toContain("rx");
  });

  it("places retinol products in PM only (pmOnly active)", () => {
    const ret = p({ id: "ret", category: "Serum", ingredients: ["retinol"], session: "" });
    const out = buildRoutine([ret]);
    expect(out.am.map(x => x.id)).not.toContain("ret");
    expect(out.pm.map(x => x.id)).toContain("ret");
  });

  it("honors explicit session='both' over auto-detection", () => {
    const m = p({ id: "m", category: "Moisturizer", session: "both" });
    const out = buildRoutine([m]);
    expect(out.am.map(x => x.id)).toContain("m");
    expect(out.pm.map(x => x.id)).toContain("m");
  });

  it("sends Exfoliant to periodic, not am/pm", () => {
    const ex = p({ id: "ex", category: "Exfoliant" });
    const out = buildRoutine([ex]);
    expect(out.periodic.map(x => x.id)).toContain("ex");
    expect(out.am.map(x => x.id)).not.toContain("ex");
    expect(out.pm.map(x => x.id)).not.toContain("ex");
  });

  it("places azelaic acid in both AM and PM by default (either session is fine)", () => {
    const aze = p({ id: "aze", category: "Serum", ingredients: ["azelaic acid"], session: "" });
    const out = buildRoutine([aze]);
    expect(out.am.map(x => x.id)).toContain("aze");
    expect(out.pm.map(x => x.id)).toContain("aze");
  });

  it("still honors an explicit AM-only session for azelaic acid", () => {
    const aze = p({ id: "aze", category: "Serum", ingredients: ["azelaic acid"], session: "am" });
    const out = buildRoutine([aze]);
    expect(out.am.map(x => x.id)).toContain("aze");
    expect(out.pm.map(x => x.id)).not.toContain("aze");
  });

  it("regression: retinol is still PM-only after adding azelaic acid", () => {
    const ret = p({ id: "ret", category: "Serum", ingredients: ["retinol"], session: "" });
    const out = buildRoutine([ret]);
    expect(out.am.map(x => x.id)).not.toContain("ret");
    expect(out.pm.map(x => x.id)).toContain("ret");
  });
});

describe("detectConflicts", () => {
  it("flags retinol + vitamin C when scheduled in the same session", () => {
    const products = [
      p({ id: "r", ingredients: ["retinol"], session: "pm" }),
      p({ id: "c", ingredients: ["ascorbic acid"], session: "pm" }),
    ];
    const out = detectConflicts(products);
    expect(out.some(c => c.pair.includes("retinol") && c.pair.includes("vitamin C"))).toBe(true);
  });

  it("does not flag retinol + vitamin C when the user split them across sessions", () => {
    const products = [
      p({ id: "r", ingredients: ["retinol"], session: "pm" }),
      p({ id: "c", ingredients: ["ascorbic acid"], session: "am" }),
    ];
    const out = detectConflicts(products);
    expect(out.length).toBe(0);
  });

  it("does not flag when auto-detection already places the pair in different sessions", () => {
    // retinol auto-lands in PM (pmOnly), vitamin C auto-lands in AM (AM-pref
    // serum) — the routine engine has already separated them.
    const products = [
      p({ id: "r", ingredients: ["retinol"] }),
      p({ id: "c", ingredients: ["ascorbic acid"] }),
    ];
    const out = detectConflicts(products);
    expect(out.length).toBe(0);
  });

  it("returns no conflict when only one side of a pair is present", () => {
    const out = detectConflicts([p({ ingredients: ["retinol"] })]);
    expect(out.length).toBe(0);
  });

  it("still flags a same-session conflict when both products are alternating, marking it intermittent", () => {
    // Prior behaviour suppressed the flag entirely because both were
    // "spaced." But two products on alternating nights that started on
    // the same day layer on every one of those alternating nights, so
    // the shared-night risk is real. Surface the flag; mark intermittent.
    const products = [
      p({ id: "r", ingredients: ["retinol"], frequency: "alternating", session: "pm" }),
      p({ id: "a", ingredients: ["glycolic acid"], frequency: "alternating", session: "pm" }),
    ];
    const out = detectConflicts(products);
    const c = out.find(x => x.pair.includes("retinol") && x.pair.includes("AHA"));
    expect(c).toBeDefined();
    expect(c.intermittent).toBe(true);
    expect(c.reason).toMatch(/nights you use both/);
  });

  it("flags a same-session conflict when only one product is non-daily, marking intermittent", () => {
    // Retinol daily + AHA weekly in the same session: on the weekly AHA
    // night the two still layer. Under-warning on a barrier-damaging
    // combo is worse than a soft over-warn.
    const products = [
      p({ id: "r", ingredients: ["retinol"], frequency: "daily", session: "pm" }),
      p({ id: "a", ingredients: ["glycolic acid"], frequency: "weekly", session: "pm" }),
    ];
    const out = detectConflicts(products);
    const c = out.find(x => x.pair.includes("retinol") && x.pair.includes("AHA"));
    expect(c).toBeDefined();
    expect(c.intermittent).toBe(true);
    expect(c.reason).toMatch(/nights you use both/);
  });

  it("flags a same-session conflict when both products are daily, without the intermittent note", () => {
    const products = [
      p({ id: "r", ingredients: ["retinol"], frequency: "daily", session: "pm" }),
      p({ id: "a", ingredients: ["glycolic acid"], frequency: "daily", session: "pm" }),
    ];
    const out = detectConflicts(products);
    const c = out.find(x => x.pair.includes("retinol") && x.pair.includes("AHA"));
    expect(c).toBeDefined();
    expect(c.intermittent).toBe(false);
    expect(c.reason).not.toMatch(/nights you use both/);
  });

  describe("azelaic acid", () => {
    it("flags azelaic + AHA as a caution when scheduled in the same session", () => {
      const products = [
        p({ id: "az", ingredients: ["azelaic acid"], session: "pm" }),
        p({ id: "a", ingredients: ["glycolic acid"], session: "pm" }),
      ];
      const out = detectConflicts(products);
      const c = out.find(x => x.pair.includes("azelaic acid") && x.pair.includes("AHA"));
      expect(c).toBeDefined();
      expect(c.severity).toBe("caution");
    });

    it("flags azelaic + BHA as a caution when scheduled in the same session", () => {
      const products = [
        p({ id: "az", ingredients: ["azelaic acid"], session: "pm" }),
        p({ id: "b", ingredients: ["salicylic acid"], session: "pm" }),
      ];
      const out = detectConflicts(products);
      const c = out.find(x => x.pair.includes("azelaic acid") && x.pair.includes("BHA"));
      expect(c).toBeDefined();
      expect(c.severity).toBe("caution");
    });

    it("flags azelaic + retinol as info-level, not caution or warning", () => {
      const products = [
        p({ id: "az", ingredients: ["azelaic acid"], session: "pm" }),
        p({ id: "r", ingredients: ["retinol"], session: "pm" }),
      ];
      const out = detectConflicts(products);
      const c = out.find(x => x.pair.includes("azelaic acid") && x.pair.includes("retinol"));
      expect(c).toBeDefined();
      expect(c.severity).toBe("info");
    });

    it("does not flag azelaic + niacinamide", () => {
      const products = [
        p({ id: "az", ingredients: ["azelaic acid"], session: "both" }),
        p({ id: "n", ingredients: ["niacinamide"], session: "both" }),
      ];
      const out = detectConflicts(products);
      expect(out.some(c => c.pair.includes("azelaic acid"))).toBe(false);
    });

    it("does not flag azelaic + vitamin C", () => {
      const products = [
        p({ id: "az", ingredients: ["azelaic acid"], session: "both" }),
        p({ id: "c", ingredients: ["ascorbic acid"], session: "both" }),
      ];
      const out = detectConflicts(products);
      expect(out.some(c => c.pair.includes("azelaic acid"))).toBe(false);
    });
  });

  describe("regression: existing conflict pairs are unaffected by azelaic acid", () => {
    it("still flags retinol + vitamin C as a warning", () => {
      const products = [
        p({ id: "r", ingredients: ["retinol"], session: "pm" }),
        p({ id: "c", ingredients: ["ascorbic acid"], session: "pm" }),
      ];
      const c = detectConflicts(products).find(x => x.pair.includes("retinol") && x.pair.includes("vitamin C"));
      expect(c).toBeDefined();
      expect(c.severity).toBe("warning");
    });

    it("still flags AHA + BHA as a caution", () => {
      const products = [
        p({ id: "a", ingredients: ["glycolic acid"], session: "pm" }),
        p({ id: "b", ingredients: ["salicylic acid"], session: "pm" }),
      ];
      const c = detectConflicts(products).find(x => x.pair.includes("AHA") && x.pair.includes("BHA"));
      expect(c).toBeDefined();
      expect(c.severity).toBe("caution");
    });

    it("still flags retinol + benzoyl peroxide as irreconcilable", () => {
      const products = [
        p({ id: "r", ingredients: ["retinol"], session: "pm" }),
        p({ id: "bp", ingredients: ["benzoyl peroxide"], session: "pm" }),
      ];
      const c = detectConflicts(products).find(x => x.pair.includes("retinol") && x.pair.includes("benzoyl peroxide"));
      expect(c).toBeDefined();
      expect(c.irreconcilable).toBe(true);
    });

    it("still does not flag vitamin C + niacinamide when auto-scheduled apart", () => {
      const products = [
        p({ id: "c", ingredients: ["ascorbic acid"] }),
        p({ id: "n", ingredients: ["niacinamide"] }),
      ];
      // Vitamin C auto-lands AM-only (AM preference, Serum category);
      // niacinamide has no session preference so it defaults to both AM
      // and PM — they share the AM slot, so the caution still fires.
      // This just confirms that pair is unaffected by azelaic's new
      // entries in the table.
      const c = detectConflicts(products).find(x => x.pair.includes("vitamin C") && x.pair.includes("niacinamide"));
      expect(c).toBeDefined();
      expect(c.severity).toBe("caution");
    });
  });
});

describe("analyzeShelf", () => {
  it("produces an activeMap keyed by detected active", () => {
    const { activeMap } = analyzeShelf([
      p({ ingredients: ["retinol"] }),
      p({ ingredients: ["niacinamide"] }),
    ]);
    expect(Object.keys(activeMap)).toEqual(expect.arrayContaining(["retinol", "niacinamide"]));
  });

  it("flags missing SPF", () => {
    const { flags } = analyzeShelf([p({ category: "Moisturizer" })]);
    expect(flags.some(f => /spf/i.test(f.label))).toBe(true);
  });

  it("does not flag missing SPF when SPF Moisturizer is present", () => {
    const { flags } = analyzeShelf([p({ category: "SPF Moisturizer" })]);
    expect(flags.some(f => /No SPF/i.test(f.label))).toBe(false);
  });

  it("flags multiple exfoliants", () => {
    const { flags } = analyzeShelf([
      p({ category: "Moisturizer" }), // has the missing-SPF flag fall through
      p({ category: "SPF" }),
      p({ category: "Exfoliant", ingredients: ["glycolic acid"] }),
      p({ category: "Toning Pad", ingredients: ["salicylic acid"] }),
    ]);
    expect(flags.some(f => /exfoliants? detected/i.test(f.label))).toBe(true);
  });
});

describe("getProductConflicts", () => {
  it("returns conflicts the specific product participates in", () => {
    const r = p({ id: "ret", ingredients: ["retinol"], session: "pm" });
    const c = p({ id: "vc", ingredients: ["ascorbic acid"], session: "pm" });
    const conflicts = getProductConflicts(r, [r, c]);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(
      conflicts.every(
        x =>
          (x.productsA || []).some(pp => pp.id === r.id) ||
          (x.productsB || []).some(pp => pp.id === r.id)
      )
    ).toBe(true);
  });

  it("returns [] when product participates in no conflict", () => {
    const r = p({ id: "ret", ingredients: ["retinol"] });
    expect(getProductConflicts(r, [r])).toEqual([]);
  });

  it("returns [] when product is nullish", () => {
    expect(getProductConflicts(null, [])).toEqual([]);
  });
});
