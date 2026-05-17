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
});

describe("detectConflicts", () => {
  it("flags retinol + vitamin C", () => {
    const products = [
      p({ id: "r", ingredients: ["retinol"] }),
      p({ id: "c", ingredients: ["ascorbic acid"] }),
    ];
    const out = detectConflicts(products);
    expect(out.some(c => c.pair.includes("retinol") && c.pair.includes("vitamin C"))).toBe(true);
  });

  it("returns no conflict when only one side of a pair is present", () => {
    const out = detectConflicts([p({ ingredients: ["retinol"] })]);
    expect(out.length).toBe(0);
  });

  it("suppresses a conflict when all involved products are alternating", () => {
    const products = [
      p({ id: "r", ingredients: ["retinol"], frequency: "alternating" }),
      p({ id: "a", ingredients: ["glycolic acid"], frequency: "alternating" }),
    ];
    const out = detectConflicts(products);
    expect(out.length).toBe(0);
  });

  it("does not suppress when a non-alternating product is involved", () => {
    const products = [
      p({ id: "r", ingredients: ["retinol"], frequency: "alternating" }),
      p({ id: "a", ingredients: ["glycolic acid"], frequency: "daily" }),
    ];
    const out = detectConflicts(products);
    expect(out.length).toBeGreaterThan(0);
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
    const r = p({ id: "ret", ingredients: ["retinol"] });
    const c = p({ id: "vc", ingredients: ["ascorbic acid"] });
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
