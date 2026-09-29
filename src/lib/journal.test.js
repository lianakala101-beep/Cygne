import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { localDateKey, upsertJournalEntry, withLegacyTodayTolerance } from "./journal.js";
import { buildCycleRing } from "./cycleRing.js";
import { buildProgressIndex } from "./progressIndex.js";

// The bug only shows up west of UTC, so pin the timezone: 9pm US Eastern
// on Sep 20 is already Sep 21 in UTC.
const EVENING = new Date("2026-09-21T01:00:00.000Z"); // 9:00pm EDT, Sun Sep 20
const MORNING = new Date("2026-09-21T12:00:00.000Z"); // 8:00am EDT, Mon Sep 21
const utcKey = (d) => d.toISOString().split("T")[0]; // how entries used to be keyed

const ORIGINAL_TZ = process.env.TZ;

beforeAll(() => {
  process.env.TZ = "America/New_York";
  // Fail loudly if this runtime ignored the TZ change.
  expect(EVENING.getDate()).toBe(20);
  expect(MORNING.getDate()).toBe(21);
});

afterEach(() => {
  vi.useRealTimers();
  process.env.TZ = "America/New_York";
});

afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe("localDateKey", () => {
  it("is the calendar date in the device timezone, not the UTC date", () => {
    expect(localDateKey(EVENING)).toBe("2026-09-20");
    expect(localDateKey(MORNING)).toBe("2026-09-21");
    expect(localDateKey(new Date(2026, 8, 20, 23, 59))).toBe("2026-09-20");
  });

  it("defaults to now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(EVENING);
    expect(localDateKey()).toBe("2026-09-20");
  });
});

describe("saving a 9pm entry and a next-morning entry", () => {
  it("lands on different local dates and overwrites nothing", () => {
    vi.useFakeTimers();

    vi.setSystemTime(EVENING);
    let journals = upsertJournalEntry([], { date: localDateKey(), condition: "good" });

    vi.setSystemTime(MORNING);
    journals = upsertJournalEntry(journals, { date: localDateKey(), condition: "rough" });

    expect(journals).toEqual([
      { date: "2026-09-20", condition: "good" },
      { date: "2026-09-21", condition: "rough" },
    ]);
  });

  it("documents the old behaviour: UTC keys collided and the morning entry replaced the evening one", () => {
    expect(utcKey(EVENING)).toBe(utcKey(MORNING));
    let journals = upsertJournalEntry([], { date: utcKey(EVENING), condition: "good" });
    journals = upsertJournalEntry(journals, { date: utcKey(MORNING), condition: "rough" });
    expect(journals).toEqual([{ date: "2026-09-21", condition: "rough" }]);
  });

  it("still replaces an entry made on the same local day", () => {
    const journals = upsertJournalEntry(
      upsertJournalEntry([], { date: "2026-09-20", condition: "okay" }),
      { date: "2026-09-20", condition: "glowing" },
    );
    expect(journals).toEqual([{ date: "2026-09-20", condition: "glowing" }]);
  });

  it("keeps entries sorted by date", () => {
    const journals = upsertJournalEntry([{ date: "2026-09-21", condition: "good" }], { date: "2026-09-19", condition: "okay" });
    expect(journals.map(j => j.date)).toEqual(["2026-09-19", "2026-09-21"]);
  });
});

describe("withLegacyTodayTolerance", () => {
  it("re-dates an entry saved under this evening's UTC key to today", () => {
    const out = withLegacyTodayTolerance([{ date: "2026-09-21", condition: "good" }], EVENING);
    expect(out).toEqual([{ date: "2026-09-20", condition: "good" }]);
  });

  it("leaves entries alone when today already has a local-dated entry", () => {
    const entries = [{ date: "2026-09-20", condition: "okay" }, { date: "2026-09-21", condition: "good" }];
    expect(withLegacyTodayTolerance(entries, EVENING)).toBe(entries);
  });

  it("leaves entries alone once local and UTC dates agree", () => {
    const entries = [{ date: "2026-09-21", condition: "good" }];
    expect(withLegacyTodayTolerance(entries, MORNING)).toBe(entries);
  });

  it("leaves entries alone east of UTC, where a UTC-dated entry is yesterday's", () => {
    process.env.TZ = "Asia/Tokyo";
    const today = new Date("2026-09-20T20:00:00.000Z"); // 5am Sep 21 in Tokyo, still Sep 20 in UTC
    expect(today.getDate()).toBe(21);
    const entries = [{ date: "2026-09-20", condition: "good" }];
    expect(withLegacyTodayTolerance(entries, today)).toBe(entries);
  });

  it("ignores string dates and bad input", () => {
    expect(withLegacyTodayTolerance(null, EVENING)).toEqual([]);
    const entries = [{ date: "2026-09-21", condition: "good" }];
    expect(withLegacyTodayTolerance(entries, "2026-09-20")).toBe(entries);
  });
});

describe("existing UTC-keyed entries still count as today", () => {
  const legacy = [{ date: "2026-09-21", condition: "good" }]; // saved at 9pm under the old UTC key

  it("in the Progress index 'logged today?' check", () => {
    const checkIns = [{ date: "2026-09-18T09:00:00.000Z" }];
    const index = buildProgressIndex({ journalEntries: legacy, checkIns, today: EVENING });
    expect(index.now).toBeNull();
    expect(buildProgressIndex({ journalEntries: [], checkIns, today: EVENING }).now).toEqual({ kind: "journal", text: "Log today's skin" });
  });

  it("in the Cycle Ring's dot for today", () => {
    const ring = buildCycleRing({ journalEntries: legacy, today: EVENING });
    expect(ring.days[ring.todayIndex]).toMatchObject({ date: "2026-09-20", state: "good" });
  });
});
