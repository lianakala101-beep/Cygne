import { useMemo, useState } from "react";
import { FACE_ZONE_LABELS } from "./FaceZoneSelector.jsx";

// Same palette as the journal entry chips so the calendar reads coherently
// against the rest of the Progress tab.
const CONDITION_DOT = {
  rough:   "#8b7355",
  dull:    "#a8906c",
  okay:    "#2d3d2b",
  good:    "#3d5240",
  glowing: "#526859",
};

const PEBBLE = "var(--color-pebble, #7a7a7a)";
const STONE  = "var(--color-stone, #5a5a5a)";
const INKY   = "var(--color-inky-moss, #2d3d2b)";
const IVORY  = "var(--color-ivory, #faf9f4)";
const INK    = "var(--color-ink, #1c1c1a)";

const MONTH_LABELS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["S","M","T","W","T","F","S"]; // Sunday-first grid

function bestCondition(journal) {
  // Sort key: more positive conditions trump more negative ones for the
  // single-dot-per-day display.
  const order = { rough: 0, dull: 1, okay: 2, good: 3, glowing: 4 };
  return journal?.condition && order[journal.condition] !== undefined
    ? journal.condition
    : null;
}

function dayKey(date) {
  // Local YYYY-MM-DD that matches how journal/checkIn entries are saved.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function zoneLabelDisplay(id) {
  return FACE_ZONE_LABELS[id] || id.replace(/_/g, " ");
}

export function MonthlyRecap({ journals = [], checkIns = [], treatments = [], reflections = [] }) {
  const [offset, setOffset] = useState(0); // 0 = current month, -1 = previous, etc.

  const view = useMemo(() => {
    const today = new Date();
    const target = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const year = target.getFullYear();
    const month = target.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month, daysInMonth, 23, 59, 59, 999);
    const inMonth = (iso) => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return t >= monthStart.getTime() && t <= monthEnd.getTime();
    };
    return { year, month, daysInMonth, monthStart, monthEnd, inMonth, label: MONTH_LABELS[month] };
  }, [offset]);

  const data = useMemo(() => {
    const monthJournals    = journals.filter(j => view.inMonth(j?.date));
    const monthCheckIns    = checkIns.filter(c => view.inMonth(c?.date));
    const monthTreatments  = treatments.filter(t => view.inMonth(t?.date));
    const monthReflections = reflections.filter(r => view.inMonth(r?.date));

    // Day map keyed by local YYYY-MM-DD
    const byDay = {};
    for (let d = 1; d <= view.daysInMonth; d++) {
      const key = dayKey(new Date(view.year, view.month, d));
      byDay[key] = { journal: null, checkIns: [], treatment: null };
    }
    monthJournals.forEach(j => { if (byDay[j.date]) byDay[j.date].journal = j; });
    monthCheckIns.forEach(c => {
      if (!c?.date) return;
      const k = dayKey(new Date(c.date));
      if (byDay[k]) byDay[k].checkIns.push(c);
    });
    monthTreatments.forEach(t => {
      const k = dayKey(new Date(t.date));
      if (byDay[k]) byDay[k].treatment = t;
    });

    // Aggregates
    const conditionCounts = {};
    monthJournals.forEach(j => {
      if (j?.condition) conditionCounts[j.condition] = (conditionCounts[j.condition] || 0) + 1;
    });
    const dominant = Object.entries(conditionCounts).sort((a, b) => b[1] - a[1])[0] || null;

    const zoneCounts = {};
    monthJournals.forEach(j => {
      (j?.affectedZones || []).forEach(z => { zoneCounts[z] = (zoneCounts[z] || 0) + 1; });
    });
    const topZones = Object.entries(zoneCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

    const irritation = monthCheckIns.filter(c => c.irritation && c.irritation !== "none").length;
    const breakouts  = monthCheckIns.filter(c => c.breakout).length;
    const activeDays = Object.values(byDay).filter(d => d.journal || d.checkIns.length || d.treatment).length;

    return {
      monthJournals,
      monthCheckIns,
      monthTreatments,
      monthReflections,
      byDay,
      conditionCounts,
      dominant,
      topZones,
      irritation,
      breakouts,
      activeDays,
    };
  }, [journals, checkIns, treatments, reflections, view]);

  const isCurrentMonth = offset === 0;
  const isEmpty = data.activeDays === 0 && data.monthTreatments.length === 0 && data.monthReflections.length === 0;

  // Calendar cell layout: leading blanks for days-of-week before day 1.
  const firstDow = view.monthStart.getDay(); // 0 = Sunday
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= view.daysInMonth; d++) cells.push(d);

  const today = new Date();
  const isToday = (d) => isCurrentMonth && d === today.getDate() && view.month === today.getMonth() && view.year === today.getFullYear();

  return (
    <div style={{
      background: IVORY,
      borderRadius: 16,
      padding: "22px 20px 24px",
      border: "1px solid rgba(45,61,43,0.10)",
    }}>
      {/* Header — month nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <button
          onClick={() => setOffset(o => o - 1)}
          aria-label="Previous month"
          style={{ background: "none", border: "none", padding: "4px 8px", cursor: "pointer", color: PEBBLE, fontSize: 14, lineHeight: 1 }}
        >‹</button>
        <p style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700, fontSize: 13, letterSpacing: "0.22em",
          color: INKY, margin: 0, textTransform: "uppercase",
        }}>
          {view.label} {view.year}
        </p>
        <button
          onClick={() => setOffset(o => Math.min(0, o + 1))}
          disabled={isCurrentMonth}
          aria-label="Next month"
          style={{
            background: "none", border: "none", padding: "4px 8px",
            cursor: isCurrentMonth ? "default" : "pointer",
            color: isCurrentMonth ? "rgba(122,122,122,0.35)" : PEBBLE,
            fontSize: 14, lineHeight: 1,
          }}
        >›</button>
      </div>

      {isEmpty ? (
        <p style={{
          fontFamily: "var(--font-body)", fontStyle: "italic", fontSize: 13,
          color: PEBBLE, textAlign: "center", margin: "20px 0 8px",
          lineHeight: 1.6,
        }}>
          Nothing logged this month yet. Check-ins and journals will fill in here.
        </p>
      ) : (
        <>
          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 22 }}>
            <Stat label="Days logged" value={data.activeDays} />
            <Stat
              label={data.dominant ? data.dominant[0] : "Entries"}
              value={data.dominant ? data.dominant[1] : data.monthJournals.length}
            />
            <Stat label="Irritation" value={data.irritation} />
          </div>

          {/* Day-of-week header */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
            {DOW.map((d, i) => (
              <div key={i} style={{
                fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.16em",
                color: PEBBLE, textAlign: "center", textTransform: "uppercase",
              }}>{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 22 }}>
            {cells.map((d, i) => {
              if (!d) return <div key={`b-${i}`} />;
              const cell = data.byDay[dayKey(new Date(view.year, view.month, d))];
              const cond = bestCondition(cell?.journal);
              const dot = cond ? CONDITION_DOT[cond] : (cell?.checkIns.length ? "rgba(45,61,43,0.4)" : null);
              const todayCell = isToday(d);
              return (
                <div key={d} style={{
                  aspectRatio: "1 / 1",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  background: todayCell ? "rgba(45,61,43,0.06)" : "transparent",
                  border: todayCell ? "1px solid rgba(45,61,43,0.30)" : "1px solid transparent",
                  borderRadius: 6,
                  position: "relative",
                }}>
                  <span style={{
                    fontFamily: "var(--font-body)", fontSize: 10,
                    color: cell?.journal || cell?.checkIns.length ? INK : PEBBLE,
                    opacity: cell?.journal || cell?.checkIns.length ? 1 : 0.55,
                    lineHeight: 1,
                  }}>{d}</span>
                  {dot && (
                    <span style={{
                      width: 5, height: 5, borderRadius: "50%",
                      background: dot,
                      marginTop: 3,
                      border: cell?.treatment ? "1px solid rgba(139,115,85,0.6)" : "none",
                    }} />
                  )}
                  {!dot && cell?.treatment && (
                    <span style={{
                      width: 5, height: 5, borderRadius: "50%",
                      background: "transparent",
                      border: "1px solid rgba(139,115,85,0.6)",
                      marginTop: 3,
                    }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Top zones */}
          {data.topZones.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <p style={{
                fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.18em",
                textTransform: "uppercase", color: PEBBLE, margin: "0 0 8px",
              }}>
                Most-flagged zones
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.topZones.map(([zone, count]) => (
                  <div key={zone} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "6px 0", borderBottom: "1px solid rgba(45,61,43,0.08)",
                  }}>
                    <span style={{
                      fontFamily: "var(--font-body)", fontSize: 12, color: INK,
                    }}>{zoneLabelDisplay(zone)}</span>
                    <span style={{
                      fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 400,
                      letterSpacing: "0.1em", color: STONE,
                    }}>{count}×</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer counts — reflections + treatments */}
          {(data.monthReflections.length > 0 || data.monthTreatments.length > 0 || data.breakouts > 0) && (
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 14,
              paddingTop: 14, borderTop: "1px solid rgba(45,61,43,0.08)",
            }}>
              {data.monthReflections.length > 0 && (
                <FooterCount label="Reflections" value={data.monthReflections.length} />
              )}
              {data.monthTreatments.length > 0 && (
                <FooterCount label="Treatments" value={data.monthTreatments.length} />
              )}
              {data.breakouts > 0 && (
                <FooterCount label="Breakout days" value={data.breakouts} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{
        fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 28,
        color: INKY, lineHeight: 1, marginBottom: 4,
      }}>{value}</div>
      <div style={{
        fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.14em",
        textTransform: "uppercase", color: PEBBLE,
      }}>{label}</div>
    </div>
  );
}

function FooterCount({ label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
      <span style={{
        fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: INKY, lineHeight: 1,
      }}>{value}</span>
      <span style={{
        fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.12em",
        textTransform: "uppercase", color: PEBBLE,
      }}>{label}</span>
    </div>
  );
}
