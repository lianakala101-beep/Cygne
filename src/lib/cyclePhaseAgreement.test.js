import { describe, it, expect } from "vitest";
import { getPhaseForDay, getCyclePhaseNameForDate, CYCLE_PHASES } from "./cycle.js";
import { buildCycleRing } from "./cycleRing.js";
import { buildProgressIndex } from "./progressIndex.js";
import { getCyclePhase as trackerPhase } from "../progress.jsx";
import * as server from "../../supabase/functions/_shared/cycle.ts";

const TODAY = "2026-09-20";

const dayOffset = (from, n) => {
  const [y, m, d] = from.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().split("T")[0];
};

// Start date that makes TODAY cycle day `day`.
const startFor = (day) => dayOffset(TODAY, -(day - 1));

// The arc CycleRing.jsx highlights: the ring phase holding today's day.
const ringArc = (ring) => {
  const todayDay = ring.todayIndex + 1;
  return ring.phases.find(p => todayDay >= p.startDay && todayDay <= p.endDay)
    || (ring.runningLong ? ring.phases[ring.phases.length - 1] : null);
};

const NEXT = { Menstrual: "Follicular", Follicular: "Ovulation", Ovulatory: "Luteal", Luteal: "Period" };
const when = (n) => (n === 1 ? "tomorrow" : `${n} days`);

describe("tracker label, ring arc and Next pill agree", () => {
  for (const len of [28, 32, 35, 37]) {
    for (const day of [14, 15, 16, len]) {
      it(`cycle length ${len}, day ${day}`, () => {
        const ring = buildCycleRing({ cycleStartDate: startFor(day), cycleLength: len, today: TODAY });
        const index = buildProgressIndex({ cycleStartDate: startFor(day), cycleLength: len, cycleTrackingOn: true, today: TODAY });
        const label = trackerPhase(day, len);
        const daysInPhase = label.endDay - day + 1;

        expect(ring.todayIndex + 1).toBe(day);
        expect(ringArc(ring).name).toBe(label.name);
        expect(getPhaseForDay(day, len)).toEqual({ name: label.name, startDay: label.startDay, endDay: label.endDay });
        // The pill names the phase after the label's, starting the day
        // after the tracker's "Nd in phase" runs out.
        expect(index.pills.find(p => p.key === "next").value).toBe(`${NEXT[label.name]} · ${when(daysInPhase)}`);
      });
    }
  }

  it("matches the cases from the report", () => {
    expect(trackerPhase(15, 28).name).toBe("Ovulatory");
    expect(trackerPhase(14, 28).name).toBe("Ovulatory");
    expect(trackerPhase(15, 32).name).toBe("Follicular");
    expect(trackerPhase(15, 35).name).toBe("Follicular");
  });
});

describe("getPhaseForDay", () => {
  // The fixed ranges every caller used before (Luteal 17–35, then the
  // Luteal fallback past 35).
  const legacy = (day) => (CYCLE_PHASES.find(p => day >= p.days[0] && day <= p.days[1]) || CYCLE_PHASES[3]).name;

  it("is unchanged for a 28-day cycle, and when the length is missing", () => {
    for (let day = 1; day <= 45; day++) {
      expect(getPhaseForDay(day, 28).name).toBe(legacy(day));
      expect(getPhaseForDay(day, null).name).toBe(legacy(day));
      expect(getPhaseForDay(day, undefined).name).toBe(legacy(day));
      expect(getPhaseForDay(day, "").name).toBe(legacy(day));
    }
  });

  it("reads a numeric-string length", () => {
    expect(getPhaseForDay(15, "35")).toEqual(getPhaseForDay(15, 35));
  });

  it("reads days past the cycle length as Luteal", () => {
    expect(getPhaseForDay(40, 32).name).toBe("Luteal");
  });

  it("drives getCyclePhaseNameForDate", () => {
    expect(getCyclePhaseNameForDate("2026-09-01", 35, "2026-09-15")).toBe("Follicular");
    expect(getCyclePhaseNameForDate("2026-09-01", 28, "2026-09-15")).toBe("Ovulatory");
  });
});

describe("cycle-phase-alert mirror (supabase/functions/_shared/cycle.ts)", () => {
  it("matches the client for every length and day", () => {
    for (const len of [null, undefined, "", "32", ...Array.from({ length: 25 }, (_, i) => 21 + i)]) {
      for (let day = 1; day <= 45; day++) {
        expect(server.getPhaseForDay(day, len)).toEqual(getPhaseForDay(day, len));
      }
    }
  });
});
