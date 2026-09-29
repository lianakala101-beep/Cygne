import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ritualCompleteKey, readManualOverride, isManualOverrideStale } from "./ritualKeys.js";
import { localDateKey } from "./journal.js";

// US Eastern (EDT, UTC-4): the UTC date flips at 8pm local, which is where
// the old UTC-keyed completion state reset.
const AT = {
  pm759: new Date("2026-09-20T23:59:00.000Z"),    // 7:59pm Sun Sep 20
  pm801: new Date("2026-09-21T00:01:00.000Z"),    // 8:01pm Sun Sep 20
  pm9:   new Date("2026-09-21T01:00:00.000Z"),    // 9:00pm Sun Sep 20
  pm1159: new Date("2026-09-21T03:59:00.000Z"),   // 11:59pm Sun Sep 20
  am8:   new Date("2026-09-21T12:00:00.000Z"),    // 8:00am Mon Sep 21
  pm6next: new Date("2026-09-21T22:00:00.000Z"),  // 6:00pm Mon Sep 21
};
const utcDay = (d) => d.toISOString().split("T")[0]; // how keys used to be built

const ORIGINAL_TZ = process.env.TZ;

beforeAll(() => {
  process.env.TZ = "America/New_York";
  // Fail loudly if this runtime ignored the TZ change.
  expect(AT.pm801.getDate()).toBe(20);
  expect(AT.am8.getDate()).toBe(21);
});

afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

// Minimal stand-in for the ritual screen's localStorage use.
function makeStore() {
  const map = new Map();
  return {
    complete(now, period, steps) { map.set(ritualCompleteKey(localDateKey(now), period), JSON.stringify(steps)); },
    steps(now, period) { return JSON.parse(map.get(ritualCompleteKey(localDateKey(now), period)) || "[]"); },
    setOverride(now, value) { map.set("override", JSON.stringify({ value, date: localDateKey(now) })); },
    override(now) { return readManualOverride(map.get("override"), localDateKey(now)); },
    overrideStale(now) { return isManualOverrideStale(map.get("override"), localDateKey(now)); },
  };
}

describe("ritual completion keys (local date)", () => {
  it("builds the same key format as before, from the given day", () => {
    expect(ritualCompleteKey("2026-09-20", "PM")).toBe("ritual_complete_2026-09-20_PM");
  });

  it("keeps a PM ritual completed at 9pm complete through the night", () => {
    const store = makeStore();
    store.complete(AT.pm9, "PM", ["cleanser", "moisturizer"]);
    expect(store.steps(AT.pm9, "PM")).toEqual(["cleanser", "moisturizer"]);
    expect(store.steps(AT.pm1159, "PM")).toEqual(["cleanser", "moisturizer"]);
  });

  it("does not reset at 8pm", () => {
    const store = makeStore();
    store.complete(AT.pm759, "PM", ["cleanser"]);
    expect(store.steps(AT.pm801, "PM")).toEqual(["cleanser"]);
    expect(store.steps(AT.pm9, "PM")).toEqual(["cleanser"]);
    expect(localDateKey(AT.pm759)).toBe(localDateKey(AT.pm801));
  });

  it("does not carry a 9pm PM ritual into the next morning's AM ritual", () => {
    const store = makeStore();
    store.complete(AT.pm9, "PM", ["cleanser", "moisturizer"]);
    expect(store.steps(AT.am8, "AM")).toEqual([]);
    expect(ritualCompleteKey(localDateKey(AT.am8), "AM")).not.toBe(ritualCompleteKey(localDateKey(AT.pm9), "PM"));
  });

  it("does not carry it into the next evening's PM ritual either", () => {
    const store = makeStore();
    store.complete(AT.pm9, "PM", ["cleanser", "moisturizer"]);
    expect(store.steps(AT.pm6next, "PM")).toEqual([]);
  });

  it("documents the old behaviour: UTC keys reset at 8pm and leaked into the next evening", () => {
    // Reset: 7:59pm and 8:01pm landed on different UTC days.
    expect(utcDay(AT.pm759)).not.toBe(utcDay(AT.pm801));
    // Leak: 9pm Sunday and 6pm Monday shared one UTC day, so Sunday night's
    // PM steps showed as done on Monday evening.
    expect(ritualCompleteKey(utcDay(AT.pm9), "PM")).toBe(ritualCompleteKey(utcDay(AT.pm6next), "PM"));
  });
});

describe("manual AM/PM override (local date)", () => {
  it("applies for the rest of the day it was set, including past 8pm", () => {
    const store = makeStore();
    store.setOverride(AT.pm759, "PM");
    expect(store.override(AT.pm801)).toBe("PM");
    expect(store.override(AT.pm1159)).toBe("PM");
    expect(store.overrideStale(AT.pm1159)).toBe(false);
  });

  it("does not carry into the next morning", () => {
    const store = makeStore();
    store.setOverride(AT.pm9, "PM");
    expect(store.override(AT.am8)).toBeNull();
    expect(store.overrideStale(AT.am8)).toBe(true);
  });

  it("documents the old behaviour: a 9pm override was still active the next morning", () => {
    expect(utcDay(AT.pm9)).toBe(utcDay(AT.am8));
  });

  it("treats missing, unreadable and value-less overrides sensibly", () => {
    expect(readManualOverride(null, "2026-09-20")).toBeNull();
    expect(readManualOverride("not json", "2026-09-20")).toBeNull();
    expect(readManualOverride(JSON.stringify({ date: "2026-09-20" }), "2026-09-20")).toBeNull();
    expect(isManualOverrideStale(null, "2026-09-20")).toBe(false);
    expect(isManualOverrideStale("not json", "2026-09-20")).toBe(true);
  });
});
