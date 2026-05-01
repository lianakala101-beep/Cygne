import { useMemo, useState } from "react";
import { FACE_ZONES, FACE_ZONE_LABELS, FACE_ZONE_IDS } from "./FaceZoneSelector.jsx";
import { AskCygneModal } from "./AskCygneModal.jsx";

const PERIODS = [
  { key: 7,  label: "7 DAYS"   },
  { key: 30, label: "30 DAYS"  },
  { key: 90, label: "3 MONTHS" },
];

// Cycle phase windows mirror src/progress.jsx CYCLE_PHASES.
const CYCLE_PHASES = [
  { name: "Menstrual",  range: [1, 5]   },
  { name: "Follicular", range: [6, 13]  },
  { name: "Ovulatory",  range: [14, 16] },
  { name: "Luteal",     range: [17, 35] },
];

const PEBBLE = "var(--color-pebble, #7a7a7a)";
const STONE = "var(--color-stone, #5a5a5a)";
const INKY = "var(--color-inky-moss, #2d3d2b)";
const IVORY = "var(--color-ivory, #faf9f4)";
const STROKE_DEFAULT = INKY;

function daysAgoIso(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function fillForScore(s) {
  if (s <= 0) return "none";
  if (s <= 0.25) return "rgba(45,61,43,0.08)";
  if (s <= 0.50) return "rgba(45,61,43,0.20)";
  if (s <= 0.75) return "rgba(45,61,43,0.40)";
  return "rgba(45,61,43,0.65)";
}

function cycleDayForDate(dateStr, cycleStartDate, cycleLength = 28) {
  if (!cycleStartDate) return null;
  const start = new Date(cycleStartDate + "T00:00:00").getTime();
  const target = new Date(dateStr + "T00:00:00").getTime();
  const diff = Math.floor((target - start) / 86400000);
  if (Number.isNaN(diff)) return null;
  const mod = ((diff % cycleLength) + cycleLength) % cycleLength;
  return mod + 1;
}

function phaseForDay(day) {
  if (day == null) return null;
  return CYCLE_PHASES.find(p => day >= p.range[0] && day <= p.range[1])?.name || null;
}

function zoneLabelDisplay(id) {
  return (FACE_ZONE_LABELS[id] || id.replace(/_/g, " ")).toUpperCase();
}

export function FaceHeatMap({ journals = [], products = [], user = {} }) {
  const [period, setPeriod] = useState(30);
  const [activeZone, setActiveZone] = useState(null);
  const [askingZone, setAskingZone] = useState(null);

  const cutoffIso = daysAgoIso(period);
  const journalsInPeriod = useMemo(
    () => journals.filter(j => j?.date && j.date >= cutoffIso && Array.isArray(j.affectedZones)),
    [journals, cutoffIso]
  );

  // Total entries in window that contributed at least one zone — used for empty-state gating.
  const entriesWithZones = journalsInPeriod.filter(j => j.affectedZones.length > 0).length;

  const zoneFrequency = useMemo(() => {
    const base = FACE_ZONE_IDS.reduce((acc, id) => { acc[id] = 0; return acc; }, {});
    for (const j of journalsInPeriod) {
      for (const z of j.affectedZones) {
        if (z in base) base[z] += 1;
      }
    }
    return base;
  }, [journalsInPeriod]);

  const maxCount = Math.max(...Object.values(zoneFrequency), 0);
  const normalized = (z) => (maxCount > 0 ? zoneFrequency[z] / maxCount : 0);

  const isEmpty = entriesWithZones < 5;

  return (
    <div style={{
      background: IVORY,
      borderRadius: 16,
      padding: "22px 20px 26px",
      border: "1px solid rgba(45,61,43,0.10)",
    }}>
      <p style={{
        fontFamily: "var(--font-display, 'Fungis Heavy', 'Space Grotesk', sans-serif)",
        fontWeight: 700, fontSize: 11, letterSpacing: "0.2em",
        color: INKY, margin: "0 0 20px",
      }}>
        INFLAMMATION MAP
      </p>

      {/* Time filter */}
      <div style={{ display: "flex", justifyContent: "center", gap: 0, marginBottom: 18 }}>
        {PERIODS.map((p, i) => (
          <span key={p.key} style={{ display: "inline-flex", alignItems: "center" }}>
            <button
              onClick={() => setPeriod(p.key)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: "4px 10px",
                fontFamily: "var(--font-display, 'Fungis Heavy', sans-serif)",
                fontSize: 9, letterSpacing: "0.15em",
                color: period === p.key ? INKY : PEBBLE,
                fontWeight: period === p.key ? 700 : 400,
              }}
            >
              {p.label}
            </button>
            {i < PERIODS.length - 1 && (
              <span style={{ color: PEBBLE, fontSize: 9, opacity: 0.6 }}>·</span>
            )}
          </span>
        ))}
      </div>

      {/* Heat map SVG */}
      <svg
        viewBox="0 0 200 260"
        style={{ width: 220, height: "auto", margin: "0 auto", display: "block", opacity: isEmpty ? 0.35 : 1 }}
        aria-label="Face inflammation heat map"
      >
        <ellipse
          cx="100" cy="128" rx="74" ry="104"
          fill="none" stroke={STROKE_DEFAULT} strokeOpacity="0.3" strokeWidth="1"
          pointerEvents="none"
        />
        {FACE_ZONES.map(z => {
          const score = normalized(z.id);
          const fill = isEmpty ? "none" : fillForScore(score);
          const isActive = activeZone === z.id;
          return (
            <path
              key={z.id}
              d={z.d}
              fill={fill}
              stroke={isActive ? "rgba(45,61,43,0.7)" : STROKE_DEFAULT}
              strokeOpacity={isActive ? 1 : 0.3}
              strokeWidth="1"
              onClick={isEmpty ? undefined : () => setActiveZone(z.id)}
              style={{
                cursor: isEmpty ? "default" : "pointer",
                transition: "fill 200ms ease, stroke 200ms ease, stroke-opacity 200ms ease",
              }}
            >
              <title>{z.label}</title>
            </path>
          );
        })}
      </svg>

      {/* Empty state */}
      {isEmpty && (
        <>
          <p style={{
            fontFamily: "var(--font-display, 'Fungis Heavy', sans-serif)",
            fontWeight: 400, fontStyle: "italic",
            fontSize: 13, color: PEBBLE,
            textAlign: "center", marginTop: 16,
          }}>
            your map is taking shape
          </p>
          <p style={{
            fontFamily: "var(--font-display, 'Fungis Heavy', sans-serif)",
            fontSize: 10, letterSpacing: "0.1em",
            color: PEBBLE, opacity: 0.6,
            textAlign: "center", marginTop: 6, textTransform: "uppercase",
          }}>
            log skin observations to reveal your patterns
          </p>
        </>
      )}

      {activeZone && !isEmpty && (
        <ZoneInsightDrawer
          zoneId={activeZone}
          journals={journals}
          products={products}
          user={user}
          onClose={() => setActiveZone(null)}
          onAskCygne={() => setAskingZone(activeZone)}
        />
      )}

      {askingZone && (
        <AskCygneModal
          initialQuestion={`Why do I keep breaking out on my ${zoneLabelDisplay(askingZone).toLowerCase()}?`}
          context={buildContext(askingZone, journals, products, user)}
          onClose={() => setAskingZone(null)}
        />
      )}
    </div>
  );
}

function buildContext(zoneId, journals, products, user) {
  const lines = [];
  const label = zoneLabelDisplay(zoneId).toLowerCase();
  const cutoff = daysAgoIso(30);
  const flares = journals.filter(j => j?.date && j.date >= cutoff && Array.isArray(j.affectedZones) && j.affectedZones.includes(zoneId));
  lines.push(`Zone: ${label}.`);
  lines.push(`Logged ${flares.length} times in the last 30 days.`);
  if (user?.skinType) lines.push(`Skin type: ${user.skinType}.`);
  if (user?.concerns?.length) lines.push(`Concerns: ${user.concerns.join(", ")}.`);
  const inRoutine = (products || []).filter(p => p.inRoutine !== false).map(p => `${p.name || "(unnamed)"}${p.brand ? " by " + p.brand : ""}`);
  if (inRoutine.length) lines.push(`Currently in routine: ${inRoutine.slice(0, 8).join("; ")}.`);
  return lines.join(" ");
}

function ZoneInsightDrawer({ zoneId, journals, products, user, onClose, onAskCygne }) {
  const cutoff30 = daysAgoIso(30);
  const flareEntries = journals.filter(j =>
    j?.date && j.date >= cutoff30 &&
    Array.isArray(j.affectedZones) && j.affectedZones.includes(zoneId)
  );
  const flareCount = flareEntries.length;

  // Cycle phase pattern
  const cycleStart = user?.cycleStartDate;
  const phaseTally = {};
  if (cycleStart) {
    for (const f of flareEntries) {
      const day = cycleDayForDate(f.date, cycleStart);
      const phase = phaseForDay(day);
      if (phase) phaseTally[phase] = (phaseTally[phase] || 0) + 1;
    }
  }
  const dominantPhase = Object.entries(phaseTally).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Products present during flare-ups: a product is "present" on a flare date
  // if it's still in the routine and started on/before that date (or has no
  // explicit start date, in which case we treat it as always-on).
  const productScores = {};
  for (const f of flareEntries) {
    for (const p of products || []) {
      if (p.inRoutine === false) continue;
      const startsOk = !p.routineStartDate || p.routineStartDate <= f.date;
      if (!startsOk) continue;
      productScores[p.id] = (productScores[p.id] || 0) + 1;
    }
  }
  const topProducts = Object.entries(productScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => products.find(p => p.id === id))
    .filter(Boolean);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 250,
        background: "rgba(28,28,26,0.5)",
        backdropFilter: "blur(8px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520,
          background: IVORY,
          borderRadius: "20px 20px 0 0",
          padding: "24px 22px 32px",
          maxHeight: "85vh", overflowY: "auto",
          color: "var(--color-ink, #1c1c1a)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <h3 style={{
            fontFamily: "var(--font-display, 'Fungis Heavy', sans-serif)",
            fontWeight: 700, fontSize: 14, letterSpacing: "0.18em",
            color: INKY, margin: 0,
          }}>
            {zoneLabelDisplay(zoneId)}
          </h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: STONE, fontSize: 18, lineHeight: 1 }}
          >×</button>
        </div>

        {/* Stats */}
        <p style={{
          fontFamily: "var(--font-display, 'Fungis Heavy', sans-serif)",
          fontWeight: 400, fontSize: 13, color: STONE,
          margin: "0 0 12px",
        }}>
          Logged {flareCount} time{flareCount === 1 ? "" : "s"} this month
        </p>

        {/* Cycle phase */}
        {dominantPhase && (
          <p style={{
            fontFamily: "var(--font-display, 'Fungis Heavy', sans-serif)",
            fontStyle: "italic", fontSize: 12,
            color: INKY,
            margin: "0 0 18px",
          }}>
            Most active during your {dominantPhase.toLowerCase()} phase
          </p>
        )}

        {/* Products */}
        <div style={{ marginTop: 8, marginBottom: 22 }}>
          <p style={{
            fontFamily: "var(--font-display, 'Fungis Heavy', sans-serif)",
            fontWeight: 400, fontSize: 10, letterSpacing: "0.15em",
            color: PEBBLE, textTransform: "uppercase",
            margin: "0 0 8px",
          }}>
            Products present during flare-ups
          </p>
          {topProducts.length === 0 ? (
            <p style={{
              fontFamily: "var(--font-body, 'Fungis Normal', 'Space Grotesk', sans-serif)",
              fontSize: 12, color: STONE, opacity: 0.7, margin: 0,
            }}>
              Not enough data yet.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {topProducts.map(p => (
                <li
                  key={p.id}
                  style={{
                    fontFamily: "var(--font-body, 'Fungis Normal', 'Space Grotesk', sans-serif)",
                    fontSize: 13, color: "var(--color-ink, #1c1c1a)",
                    padding: "6px 0",
                    borderBottom: "1px solid rgba(45,61,43,0.08)",
                  }}
                >
                  {p.name || "(unnamed)"}{p.brand ? <span style={{ color: STONE }}> · {p.brand}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          onClick={onAskCygne}
          style={{
            width: "100%", padding: "14px 0",
            background: "transparent",
            border: "1px solid var(--color-inky-moss, #2d3d2b)",
            color: INKY,
            borderRadius: 12,
            fontFamily: "var(--font-display, 'Fungis Heavy', sans-serif)",
            fontWeight: 700, fontSize: 11, letterSpacing: "0.18em",
            cursor: "pointer",
          }}
        >
          ASK CYGNE ABOUT THIS ZONE →
        </button>
      </div>
    </div>
  );
}
