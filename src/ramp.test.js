import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getRampWeek, getRampPhase, RAMP_SCHEDULES, RAMP_ACTIVES, RAMP_NAME_FALLBACK_CUTOFF_MS, getRampActiveKey, isOnRampList, needsRampEnrolment, getRampSchedule, isSchedulePaced, isHighStrengthAzelaic, getRampDaysAtWeek, isReadyToAdvance, deriveRampSignals } from "./ramp.jsx";

// Force "today" to a fixed local date so daysBetweenLocal is deterministic.
function setToday(year, monthIndex, day) {
  vi.setSystemTime(new Date(year, monthIndex, day, 12, 0, 0));
}

// Build a YYYY-MM-DD string for the given local date.
function iso(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

describe("getRampWeek", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("returns 1 when there is no product", () => {
    expect(getRampWeek(undefined)).toBe(1);
    expect(getRampWeek(null)).toBe(1);
  });

  it("returns 1 on the start date", () => {
    setToday(2026, 4, 17);
    expect(getRampWeek({ routineStartDate: iso(2026, 4, 17) })).toBe(1);
  });

  it("stays in week 1 for the first six days", () => {
    setToday(2026, 4, 23); // 6 days after May 17
    expect(getRampWeek({ routineStartDate: iso(2026, 4, 17) })).toBe(1);
  });

  it("advances to week 2 exactly seven days after start", () => {
    setToday(2026, 4, 24); // 7 days after May 17
    expect(getRampWeek({ routineStartDate: iso(2026, 4, 17) })).toBe(2);
  });

  it("advances to week 5 after 28 days", () => {
    setToday(2026, 5, 14); // 28 days after May 17
    expect(getRampWeek({ routineStartDate: iso(2026, 4, 17) })).toBe(5);
  });

  it("falls back to stored rampWeek when no routineStartDate", () => {
    expect(getRampWeek({ rampWeek: 3 })).toBe(3);
  });

  it("never returns less than 1 even for a future start date", () => {
    setToday(2026, 4, 17);
    expect(getRampWeek({ routineStartDate: iso(2026, 5, 1) })).toBe(1);
  });
});

describe("getRampPhase", () => {
  const retinol = RAMP_SCHEDULES.retinol;

  it("returns the Patch phase for week 1", () => {
    expect(getRampPhase(retinol, 1).name).toBe("Patch");
  });

  it("returns the Introduce phase for weeks 2-4", () => {
    [2, 3, 4].forEach((w) => expect(getRampPhase(retinol, w).name).toBe("Introduce"));
  });

  it("returns the Build phase for weeks 5-8", () => {
    [5, 6, 7, 8].forEach((w) => expect(getRampPhase(retinol, w).name).toBe("Build"));
  });

  it("returns the Maintain phase for weeks 9-12", () => {
    [9, 10, 11, 12].forEach((w) => expect(getRampPhase(retinol, w).name).toBe("Maintain"));
  });

  it("clamps weeks beyond the schedule to the final phase (Maintain forever)", () => {
    expect(getRampPhase(retinol, 99).name).toBe("Maintain");
  });
});

describe("RAMP_ACTIVES", () => {
  it("includes azelaic acid alongside the original four actives", () => {
    expect(RAMP_ACTIVES).toEqual(expect.arrayContaining(["retinol", "AHA", "BHA", "vitamin C", "azelaic acid"]));
    expect(RAMP_ACTIVES.length).toBe(5);
  });
});

describe("RAMP_SCHEDULES retinol label", () => {
  // IntroduceSlowlyCard gates the retinoid pregnancy/prescriber notes on
  // schedule.label === "Retinol" — this guards that string against a
  // silent rename that would otherwise break the gate without any test
  // failing elsewhere.
  it("is exactly \"Retinol\"", () => {
    expect(RAMP_SCHEDULES.retinol.label).toBe("Retinol");
  });
});

describe("RAMP_SCHEDULES azelaic acid", () => {
  const azelaic = RAMP_SCHEDULES["azelaic acid"];

  it("exists and has the same 4-phase shape as the other schedules", () => {
    expect(azelaic).toBeDefined();
    expect(azelaic.phases.map(p => p.name)).toEqual(["Patch", "Introduce", "Build", "Maintain"]);
  });

  it("every phase has frequency, instruction, onTrack, and backOff copy", () => {
    azelaic.phases.forEach(phase => {
      expect(typeof phase.frequency).toBe("string");
      expect(phase.frequency.length).toBeGreaterThan(0);
      expect(typeof phase.instruction).toBe("string");
      expect(phase.instruction.length).toBeGreaterThan(0);
      expect(typeof phase.onTrack).toBe("string");
      expect(phase.onTrack.length).toBeGreaterThan(0);
      expect(typeof phase.backOff).toBe("string");
      expect(phase.backOff.length).toBeGreaterThan(0);
    });
  });

  it("maps weeks to phases per the spec: Patch wk1, Introduce wk2-3, Build wk4-6, Maintain wk7-12", () => {
    expect(getRampPhase(azelaic, 1).name).toBe("Patch");
    [2, 3].forEach(w => expect(getRampPhase(azelaic, w).name).toBe("Introduce"));
    [4, 5, 6].forEach(w => expect(getRampPhase(azelaic, w).name).toBe("Build"));
    [7, 8, 9, 10, 11, 12].forEach(w => expect(getRampPhase(azelaic, w).name).toBe("Maintain"));
  });

  it("clamps weeks beyond the schedule to Maintain forever, same as every other active", () => {
    expect(getRampPhase(azelaic, 99).name).toBe("Maintain");
  });
});

describe("getRampSchedule / sensitivity pacing", () => {
  it("returns the base azelaic acid schedule unchanged with no sensitivity concern", () => {
    const schedule = getRampSchedule("azelaic acid", []);
    expect(schedule).toBe(RAMP_SCHEDULES["azelaic acid"]);
    expect(isSchedulePaced([])).toBe(false);
  });

  it("paces azelaic acid for Rosacea: Patch/Introduce each grow a week, Maintain caps at Nightly", () => {
    const base = RAMP_SCHEDULES["azelaic acid"];
    const paced = getRampSchedule("azelaic acid", ["Rosacea"]);
    expect(isSchedulePaced(["Rosacea"])).toBe(true);
    expect(paced).not.toBe(base);

    const patch = paced.phases.find(p => p.name === "Patch");
    const introduce = paced.phases.find(p => p.name === "Introduce");
    const build = paced.phases.find(p => p.name === "Build");
    const maintain = paced.phases.find(p => p.name === "Maintain");

    expect(patch.weeks).toEqual([1, 2]);
    expect(introduce.weeks).toEqual([3, 4, 5]);
    expect(build.weeks).toEqual([6, 7, 8]);
    expect(maintain.weeks).toEqual([9, 10, 11, 12, 13, 14]);
    expect(maintain.frequency).toBe("Nightly");
  });

  it("paces azelaic acid for Cystic/hormonal acne the same way as Rosacea", () => {
    const paced = getRampSchedule("azelaic acid", ["Cystic/hormonal acne"]);
    expect(paced.phases.find(p => p.name === "Maintain").frequency).toBe("Nightly");
  });

  it("regression: retinol pacing is unaffected by azelaic acid's addition", () => {
    const paced = getRampSchedule("retinol", ["Rosacea"]);
    expect(paced.phases.find(p => p.name === "Maintain").frequency).toBe("3× per week");
  });

  it("regression: an unpaced retinol schedule is still returned by reference", () => {
    expect(getRampSchedule("retinol", [])).toBe(RAMP_SCHEDULES.retinol);
  });
});

describe("isHighStrengthAzelaic", () => {
  it("returns true for 15% azelaic acid", () => {
    expect(isHighStrengthAzelaic(["Azelaic Acid 15%", "glycerin"])).toBe(true);
  });

  it("returns true for 20% azelaic acid", () => {
    expect(isHighStrengthAzelaic(["azelaic acid 20%"])).toBe(true);
  });

  it("returns false for 10% azelaic acid (the common OTC ceiling)", () => {
    expect(isHighStrengthAzelaic(["azelaic acid 10%"])).toBe(false);
  });

  it("returns false for anything at or below 10%", () => {
    expect(isHighStrengthAzelaic(["azelaic acid 5%"])).toBe(false);
    expect(isHighStrengthAzelaic(["azelaic acid 9.5%"])).toBe(false);
  });

  it("returns true for an in-between compounded strength like 14.5%", () => {
    expect(isHighStrengthAzelaic(["azelaic acid 14.5%"])).toBe(true);
  });

  it("returns true for a compounded 18%", () => {
    expect(isHighStrengthAzelaic(["azelaic acid 18%"])).toBe(true);
  });

  it("returns true for anything just above 10%", () => {
    expect(isHighStrengthAzelaic(["azelaic acid 10.5%"])).toBe(true);
  });

  it("returns false when no percentage is listed", () => {
    expect(isHighStrengthAzelaic(["azelaic acid"])).toBe(false);
  });

  it("returns false for a product with no azelaic acid at all", () => {
    expect(isHighStrengthAzelaic(["niacinamide 10%", "retinol"])).toBe(false);
  });

  it("returns false for null/undefined/empty ingredients", () => {
    expect(isHighStrengthAzelaic(null)).toBe(false);
    expect(isHighStrengthAzelaic(undefined)).toBe(false);
    expect(isHighStrengthAzelaic([])).toBe(false);
  });

  it("accepts a comma-separated string as well as an array", () => {
    expect(isHighStrengthAzelaic("Azelaic Acid 15%, Niacinamide 10%")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isHighStrengthAzelaic(["AZELAIC ACID 20%"])).toBe(true);
  });
});

describe("getRampDaysAtWeek", () => {
  const product = { id: "p1", routineStartDate: "2026-09-07" };

  it("counts today as a day at the week", () => {
    expect(getRampDaysAtWeek(product, "2026-09-07")).toBe(1);  // week 1, day 1
    expect(getRampDaysAtWeek(product, "2026-09-13")).toBe(7);  // week 1, day 7
    expect(getRampDaysAtWeek(product, "2026-09-14")).toBe(1);  // week 2, day 1
    expect(getRampDaysAtWeek(product, "2026-09-20")).toBe(7);  // week 2, day 7
  });

  it("is null without a start date or before it", () => {
    expect(getRampDaysAtWeek({ id: "p1" }, "2026-09-20")).toBeNull();
    expect(getRampDaysAtWeek(product, "2026-09-06")).toBeNull();
  });
});

describe("isReadyToAdvance", () => {
  // Week 2 of a product started 2026-09-07; today (Sun 2026-09-20) is day 7
  // of it, so the current stretch runs 2026-09-14 → today.
  const TODAY = "2026-09-20";
  const product = { id: "p1", name: "Adapalene Gel", routineStartDate: "2026-09-07" };
  // created_at is built from LOCAL time, so the fixtures hold in any timezone.
  const at = (day, hour = 12, minute = 0) => {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y, m - 1, d, hour, minute).toISOString();
  };
  const checkIn = (state, day, extra = {}) => ({ product_id: "p1", week_number: 2, response_state: state, created_at: at(day), ...extra });
  const calm = [checkIn("no_reaction", "2026-09-16")];

  it("is ready when all four conditions hold", () => {
    expect(isReadyToAdvance(product, calm, TODAY)).toBe(true);
    expect(isReadyToAdvance(product, [checkIn("loving_it", "2026-09-15"), checkIn("no_reaction", "2026-09-18")], TODAY)).toBe(true);
  });

  it("needs 5 days at the current week: day 4 is not ready, day 5 is", () => {
    expect(isReadyToAdvance(product, calm, "2026-09-14")).toBe(false); // day 1
    expect(isReadyToAdvance(product, calm, "2026-09-17")).toBe(false); // day 4
    expect(isReadyToAdvance(product, calm, "2026-09-18")).toBe(true);  // day 5
    expect(isReadyToAdvance(product, calm, "2026-09-19")).toBe(true);  // day 6
    expect(isReadyToAdvance(product, calm, "2026-09-20")).toBe(true);  // day 7
  });

  it("still applies the other conditions on day 5", () => {
    const DAY5 = "2026-09-18";
    expect(isReadyToAdvance(product, calm, DAY5)).toBe(true);
    // No check-in during the stretch (this one is from the previous week).
    expect(isReadyToAdvance(product, [checkIn("no_reaction", "2026-09-10", { week_number: 1 })], DAY5)).toBe(false);
    // Irritation earlier in the stretch, latest calm — only the irritation rule fails.
    const irritated = [checkIn("no_reaction", "2026-09-17"), checkIn("mild_irritation", "2026-09-15")];
    expect(deriveRampSignals(irritated, "p1", 2).suggestHold).toBe(false);
    expect(isReadyToAdvance(product, irritated, DAY5)).toBe(false);
    // Latest is a breakout — only suggestHold fails.
    const breakout = [checkIn("breakout", "2026-09-17"), checkIn("no_reaction", "2026-09-15")];
    expect(deriveRampSignals(breakout, "p1", 2).suggestHold).toBe(true);
    expect(isReadyToAdvance(product, breakout, DAY5)).toBe(false);
  });

  it("is not ready the day after rolling into a new week, even with last week's calm check-ins", () => {
    expect(isReadyToAdvance(product, [checkIn("no_reaction", "2026-09-18")], "2026-09-21")).toBe(false);
  });

  it("is not ready without a check-in during the stretch", () => {
    expect(isReadyToAdvance(product, [], TODAY)).toBe(false);
    expect(isReadyToAdvance(product, [checkIn("no_reaction", "2026-09-10", { week_number: 1 })], TODAY)).toBe(false);
    expect(isReadyToAdvance(product, [checkIn("no_reaction", "2026-09-16", { product_id: "other" })], TODAY)).toBe(false);
    expect(isReadyToAdvance(product, null, TODAY)).toBe(false);
  });

  it("is not ready when any check-in in the stretch reported irritation", () => {
    // The latest check-in is calm, so suggestHold is false — only this rule fails.
    const checkIns = [checkIn("no_reaction", "2026-09-18"), checkIn("mild_irritation", "2026-09-15")];
    expect(deriveRampSignals(checkIns, "p1", 2).suggestHold).toBe(false);
    expect(isReadyToAdvance(product, checkIns, TODAY)).toBe(false);
  });

  it("is not ready when suggestHold is true", () => {
    // A breakout isn't irritation, so only suggestHold blocks this one.
    const checkIns = [checkIn("breakout", "2026-09-18"), checkIn("no_reaction", "2026-09-15")];
    expect(deriveRampSignals(checkIns, "p1", 2).suggestHold).toBe(true);
    expect(isReadyToAdvance(product, checkIns, TODAY)).toBe(false);
  });

  it("is not ready without a usable start date", () => {
    expect(isReadyToAdvance({ id: "p1" }, calm, TODAY)).toBe(false);
    expect(isReadyToAdvance({ id: "p1", routineStartDate: "2026-09-25" }, calm, TODAY)).toBe(false);
    expect(isReadyToAdvance(null, calm, TODAY)).toBe(false);
  });

  it("draws the stretch at local midnight of the week's first day", () => {
    const justAfter = { ...checkIn("no_reaction", "2026-09-14"), created_at: at("2026-09-14", 0, 30) };
    const justBefore = { ...checkIn("no_reaction", "2026-09-13"), created_at: at("2026-09-13", 23, 30) };
    expect(isReadyToAdvance(product, [justAfter], TODAY)).toBe(true);
    expect(isReadyToAdvance(product, [justBefore], TODAY)).toBe(false);
  });
});

// Ids are Date.now() strings from the add-product form; the name
// fallback only applies at or after the cutoff.
const OLD_ID = String(RAMP_NAME_FALLBACK_CUTOFF_MS - 86400000); // a day before
const NEW_ID = String(RAMP_NAME_FALLBACK_CUTOFF_MS + 60000);    // a minute after

describe("getRampActiveKey", () => {
  it("uses the ingredient list first", () => {
    expect(getRampActiveKey({ id: NEW_ID, category: "Serum", name: "Night Serum", ingredients: ["aqua", "azelaic acid"] })).toBe("azelaic acid");
    // Ingredients name BHA; the name says retinol — ingredients win.
    expect(getRampActiveKey({ id: NEW_ID, category: "Serum", name: "Retinol Clarifying Serum", ingredients: ["aqua", "salicylic acid"] })).toBe("BHA");
  });

  it("falls back to the name when the ingredient list is empty (new products)", () => {
    expect(getRampActiveKey({ id: NEW_ID, category: "Serum", name: "Azelaic Acid 10 Hyaluron Redness Soothing Serum", ingredients: [] })).toBe("azelaic acid");
    expect(getRampActiveKey({ id: NEW_ID, category: "Serum", name: "Granactive Retinoid 2% Emulsion" })).toBe("retinol");
    expect(getRampActiveKey({ id: NEW_ID, category: "Exfoliant", name: "Skin Perfecting 2% BHA Liquid", ingredients: "" })).toBe("BHA");
    expect(getRampActiveKey({ id: NEW_ID, category: "Cleanser", name: "Salicylic Acid Cleanser", ingredients: [] })).toBe("BHA");
    expect(getRampActiveKey({ id: NEW_ID, category: "Toner", name: "Glycolic Acid 7% Toning Solution", ingredients: [] })).toBe("AHA");
    expect(getRampActiveKey({ id: NEW_ID, category: "Serum", name: "C-Firma Vitamin C Day Serum", ingredients: [] })).toBe("vitamin C");
  });

  it("falls back to the name when the ingredients name no ramped active (new products)", () => {
    expect(getRampActiveKey({ id: NEW_ID, category: "Serum", name: "Azelaic Acid Booster", ingredients: ["aqua", "glycerin", "sodium hyaluronate"] })).toBe("azelaic acid");
  });

  it("returns null when neither ingredients nor name match", () => {
    expect(getRampActiveKey({ id: NEW_ID, category: "Moisturizer", name: "Bahama Butter Cream", ingredients: ["shea butter"] })).toBeNull();
    expect(getRampActiveKey({ id: NEW_ID, category: "Serum", name: "Hyaluronic Acid 2% + B5", ingredients: [] })).toBeNull();
    expect(getRampActiveKey({ id: NEW_ID, category: "Serum" })).toBeNull();
    expect(getRampActiveKey(null)).toBeNull();
  });

  it("keeps Toning Pad as its own ramp", () => {
    expect(getRampActiveKey({ category: "Toning Pad", name: "Glycolic Pads", ingredients: ["glycolic acid"] })).toBe("toning pad");
  });
});

describe("name fallback cutoff", () => {
  const blank = (id) => ({ id, category: "Serum", name: "Azelaic Acid 10 Hyaluron Redness Soothing Serum", ingredients: [] });

  it("is 2026-10-13T19:00:00Z", () => {
    expect(new Date(RAMP_NAME_FALLBACK_CUTOFF_MS).toISOString()).toBe("2026-10-13T19:00:00.000Z");
  });

  it("an older product with blank ingredients and \"Azelaic\" in the name gets no enrolment and no card", () => {
    const p = blank(OLD_ID);
    expect(getRampActiveKey(p)).toBeNull();
    expect(needsRampEnrolment(p)).toBe(false);
    // Even with a start date (e.g. set by "Add to ritual"), it stays off the card list.
    expect(isOnRampList({ ...p, routineStartDate: "2026-10-01" })).toBe(false);
  });

  it("a newer product with blank ingredients and \"Azelaic\" in the name is enrolled and gets a card", () => {
    const p = blank(NEW_ID);
    expect(getRampActiveKey(p)).toBe("azelaic acid");
    expect(needsRampEnrolment(p)).toBe(true);
    expect(isOnRampList({ ...p, routineStartDate: "2026-10-13" })).toBe(true);
  });

  it("treats the cutoff itself as new, and non-timestamp ids as old", () => {
    expect(getRampActiveKey(blank(String(RAMP_NAME_FALLBACK_CUTOFF_MS)))).toBe("azelaic acid");
    expect(getRampActiveKey(blank("legacy-7"))).toBeNull();
    expect(getRampActiveKey(blank(undefined))).toBeNull();
  });

  it("leaves ingredient detection unchanged for older products", () => {
    const old = { id: OLD_ID, category: "Serum", name: "Night Serum", ingredients: ["aqua", "azelaic acid"] };
    expect(getRampActiveKey(old)).toBe("azelaic acid");
    expect(needsRampEnrolment(old)).toBe(true);
    expect(isOnRampList({ ...old, routineStartDate: "2026-10-01" })).toBe(true);
  });

  it("keeps products out of the ritual off the list and out of enrolment", () => {
    const p = { ...blank(NEW_ID), inRoutine: false };
    expect(needsRampEnrolment(p)).toBe(false);
    expect(isOnRampList({ ...p, routineStartDate: "2026-10-13" })).toBe(false);
  });
});
