import { describe, it, expect } from "vitest";
import { buildContext, SYSTEM_PROMPT } from "./swan-sense-daily.js";

// Regression coverage for the zero-product hallucination fix: a user with
// no products got a line referencing "your exfoliating and clarifying
// steps" because an empty products list simply produced no "In routine"
// line at all — the model had no explicit signal that there weren't any
// products to omit, and the prompt had no rule against inventing one.
describe("buildContext — products", () => {
  it("states explicitly that the user has no products when the list is empty", () => {
    const context = buildContext({ products: [] });
    expect(context).toMatch(/no products yet/i);
    expect(context).toMatch(/do not refer to their routine, steps, or products/i);
  });

  it("also states no-products when the products key is missing entirely", () => {
    const context = buildContext({});
    expect(context).toMatch(/no products yet/i);
  });

  it("lists in-routine products and omits the no-products line when products exist", () => {
    const context = buildContext({
      products: [{ brand: "CeraVe", name: "Hydrating Cleanser", inRoutine: true }],
    });
    expect(context).toMatch(/In routine: CeraVe Hydrating Cleanser/);
    expect(context).not.toMatch(/no products yet/i);
  });

  it("documents today's behavior when every product is out of routine: neither line fires", () => {
    // The vanity isn't empty (products.length > 0), so this isn't the
    // "no products yet" case the fix targets — but every product is
    // filtered out of "In routine" too, so the context is silent on
    // products either way. Not a regression from this fix; recorded here
    // so a future change to this edge case shows up as an intentional
    // test update rather than a silent behavior shift.
    const context = buildContext({
      products: [{ brand: "CeraVe", name: "Hydrating Cleanser", inRoutine: false }],
    });
    expect(context).not.toMatch(/In routine:/);
    expect(context).not.toMatch(/no products yet/i);
  });
});

describe("SYSTEM_PROMPT", () => {
  it("prefers one sentence, caps at two", () => {
    expect(SYSTEM_PROMPT).toMatch(/one sentence preferred, two sentences maximum/i);
  });

  it("includes the never-invent-a-product/step/routine AVOID rule", () => {
    expect(SYSTEM_PROMPT).toMatch(/never mention a specific product, step, or routine that isn't named/i);
  });
});
