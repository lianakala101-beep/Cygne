import { useEffect, useMemo, useRef, useState } from "react";
import { detectActives, detectConflicts, calcSpending } from "../engine.js";

// Linen / paper noise — matches the rest of the app's editorial surfaces.
const GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='250' height='250'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='250' height='250' filter='url(%23g)' opacity='0.045'/%3E%3C/svg%3E\")";

const PEBBLE = "var(--color-pebble, #7a7a7a)";
const STONE  = "var(--color-stone, #5a5a5a)";
const INKY   = "var(--color-inky-moss, #2d3d2b)";
const IVORY  = "var(--color-ivory, #faf9f4)";
const INK    = "var(--color-ink, #1c1c1a)";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ─── Narrative helpers ────────────────────────────────────────────────────────
// Each builder returns a single paragraph (or a short multi-sentence run) for
// a section. Empty / low-signal months fall through to a quieter sentence so
// the recap never reads as broken.

function narrateSkin({ journalsM, checkInsM }) {
  const total = journalsM.length;
  const conditions = journalsM.reduce((acc, j) => { if (j.condition) acc[j.condition] = (acc[j.condition] || 0) + 1; return acc; }, {});
  const positive = (conditions.glowing || 0) + (conditions.good || 0);
  const tough    = (conditions.rough   || 0) + (conditions.dull || 0);
  const irritation = checkInsM.filter(c => c.irritation && c.irritation !== "none").length;
  const breakouts  = checkInsM.filter(c => c.breakout).length;

  if (total === 0 && checkInsM.length === 0) {
    return "A quiet month — nothing logged. The recap fills in as you check in or jot a journal entry.";
  }
  const parts = [];
  parts.push(`You logged ${total} journal ${total === 1 ? "entry" : "entries"}${checkInsM.length ? ` and ${checkInsM.length} check-${checkInsM.length === 1 ? "in" : "ins"}` : ""}.`);
  if (positive && positive > tough) {
    parts.push(`Skin trended luminous — ${positive} ${positive === 1 ? "day" : "days"} logged as good or glowing.`);
  } else if (tough && tough >= positive) {
    parts.push(`More texture than glow this month — ${tough} ${tough === 1 ? "day" : "days"} logged as rough or dull.`);
  } else if (total > 0) {
    parts.push("Steady overall, no strong direction either way.");
  }
  if (irritation) parts.push(`Irritation flagged on ${irritation} check-${irritation === 1 ? "in" : "ins"}.`);
  if (breakouts)  parts.push(`Breakouts noted on ${breakouts} ${breakouts === 1 ? "day" : "days"}.`);
  return parts.join(" ");
}

function narrateTelling({ journalsM, checkInsM }) {
  const zoneCounts = {};
  journalsM.forEach(j => (j.affectedZones || []).forEach(z => { zoneCounts[z] = (zoneCounts[z] || 0) + 1; }));
  const top = Object.entries(zoneCounts).sort((a, b) => b[1] - a[1])[0];

  const poorSleep = journalsM.filter(j => j.sleep === "poor").length;
  const highStress = journalsM.filter(j => j.stress === "high").length;
  const irritated = checkInsM.filter(c => c.irritation && c.irritation !== "none").length;

  const parts = [];
  if (top && top[1] >= 2) {
    const zone = top[0].replace(/_/g, " ");
    parts.push(`Your ${zone} flagged ${top[1]} times — the most-active zone of the month.`);
  }
  if (poorSleep >= 3 && irritated >= 2) {
    parts.push("Poor-sleep nights and irritation showed up close together — barrier recovery wants more rest, not more actives.");
  } else if (poorSleep >= 3) {
    parts.push(`${poorSleep} poor-sleep nights logged. Cortisol is doing more here than any product can.`);
  }
  if (highStress >= 3) {
    parts.push(`${highStress} high-stress days. If breakouts cluster around them, that's the signal — not the ritual.`);
  }
  if (parts.length === 0) {
    return "No clear patterns surfaced this month. Keep logging — patterns need a few weeks to firm up.";
  }
  return parts.join(" ");
}

function narrateRitual({ products, treatmentsM }) {
  const inRoutine = products.filter(p => p.inRoutine !== false);
  const ramping = products.filter(p => p.routineStartDate && (p.rampWeek || 1) > 0 && p.inRoutine !== false);
  const parts = [];
  parts.push(`Your ritual carried ${inRoutine.length} ${inRoutine.length === 1 ? "product" : "products"} this month${inRoutine.length === 0 ? "." : "."}`);
  if (ramping.length) {
    parts.push(`${ramping.length} ${ramping.length === 1 ? "active was" : "actives were"} in their introduction window.`);
  }
  if (treatmentsM.length) {
    const labels = treatmentsM.map(t => t.label || t.typeId).filter(Boolean);
    parts.push(`Treatments logged: ${labels.join(", ")}.`);
  } else {
    parts.push("No professional treatments logged.");
  }
  return parts.join(" ");
}

function narrateVanity({ products }) {
  const conflicts = detectConflicts(products);
  const spending = calcSpending(products);
  const total = products.length;
  const inRoutine = products.filter(p => p.inRoutine !== false).length;
  const benched = total - inRoutine;
  const parts = [];
  parts.push(`Your vanity holds ${total} ${total === 1 ? "product" : "products"}${benched ? ` (${inRoutine} active, ${benched} on the bench)` : ""}.`);
  if (spending.total > 0) {
    parts.push(`Total invested: $${Math.round(spending.total)}.`);
  }
  if (conflicts.length) {
    const warnings = conflicts.filter(c => c.severity === "warning").length;
    parts.push(`${conflicts.length} ingredient ${conflicts.length === 1 ? "conflict" : "conflicts"} flagged${warnings ? ` (${warnings} marked as warning)` : ""}.`);
  } else if (total > 0) {
    parts.push("No ingredient conflicts — your stack is well-spaced.");
  }
  return parts.join(" ");
}

function narrateAhead({ user, view }) {
  // Cycle position next month (rough estimate — user.cycleStartDate + 28-day cycle)
  const parts = [];
  const cycleStart = user?.cycleStartDate;
  if (cycleStart) {
    const start = new Date(cycleStart + "T00:00:00").getTime();
    // First day of next month
    const nextMonthStart = new Date(view.year, view.month + 1, 1).getTime();
    if (Number.isFinite(start) && nextMonthStart >= start) {
      const day = ((Math.floor((nextMonthStart - start) / 86400000) % 28) + 28) % 28 + 1;
      const phase = day <= 5 ? "menstrual" : day <= 13 ? "follicular" : day <= 16 ? "ovulatory" : "luteal";
      parts.push(`Next month opens in your ${phase} phase — pace actives accordingly.`);
    }
  }
  const occasion = user?.skinProfile?.specialOccasion;
  if (occasion && !/not right now/i.test(occasion)) {
    parts.push(`Your ${occasion.toLowerCase()} is on the calendar — keep the ritual steady, no new actives close to the date.`);
  }
  // Climate / season cue
  const climate = (user?.skinProfile?.climate || "").toLowerCase();
  const nextMonthIdx = (view.month + 1) % 12;
  const seasonHint = (() => {
    if (nextMonthIdx <= 1 || nextMonthIdx === 11) return "winter";
    if (nextMonthIdx <= 4) return "spring";
    if (nextMonthIdx <= 7) return "summer";
    return "fall";
  })();
  if (seasonHint === "winter" && (climate === "dry" || climate === "cold")) {
    parts.push("Winter on a dry climate calls for more humectant + ceramide layering — barrier first, actives second.");
  } else if (seasonHint === "summer") {
    parts.push("UV climbs through summer — daily SPF and reapply every two hours outdoors.");
  }
  if (parts.length === 0) {
    parts.push("Stay with what's working. Don't introduce more than one new active at a time.");
  }
  return parts.join(" ");
}

// ─── In-view fade ─────────────────────────────────────────────────────────────
function useFadeIn({ rootRef } = {}) {
  const ref = useRef(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") { setRevealed(true); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          setRevealed(true);
          io.disconnect();
          break;
        }
      }
    }, {
      root: rootRef?.current || null,
      threshold: 0.18,
      rootMargin: "0px 0px -8% 0px",
    });
    io.observe(node);
    return () => io.disconnect();
  }, [rootRef]);
  return [ref, revealed];
}

// ─── Section ──────────────────────────────────────────────────────────────────
function Section({ label, body, rootRef, divider = true }) {
  const [ref, revealed] = useFadeIn({ rootRef });
  return (
    <section
      ref={ref}
      style={{
        opacity: revealed ? 1 : 0,
        transform: revealed ? "translateY(0)" : "translateY(14px)",
        transition: "opacity 700ms ease, transform 700ms ease",
        padding: "26px 0",
        borderBottom: divider ? "1px solid rgba(45,61,43,0.12)" : "none",
      }}
    >
      <p style={{
        fontFamily: "var(--font-display)",
        fontWeight: 700, fontSize: 9, letterSpacing: "0.22em",
        textTransform: "uppercase", color: "var(--color-inky-moss, #2d3d2b)",
        margin: "0 0 14px",
      }}>{label}</p>
      <p style={{
        fontFamily: "var(--font-body)",
        fontWeight: 400, fontSize: 15,
        color: "var(--color-inky-moss, #2d3d2b)", margin: 0, lineHeight: 1.7,
      }}>{body}</p>
    </section>
  );
}

// ─── Calendar + zone helpers ──────────────────────────────────────────────────
const DOW = ["M", "T", "W", "T", "F", "S", "S"];

const CONDITION_DOT = {
  glowing: "#2d3d2b",
  good:    "#2d3d2b",
  okay:    "#5a5a5a",
  dull:    "#8b7355",
  rough:   "#8b7355",
};

const dayKey = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const bestCondition = (journal) => journal?.condition || null;

const zoneLabelDisplay = (zone) => {
  if (!zone) return "";
  return String(zone)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

// ─── MonthlyRecap overlay ─────────────────────────────────────────────────────
//
// Props:
//   - offset:  0 = current month, -1 = previous, etc. (default 0)
//   - journals, checkIns, treatments, products, reflections, user — for
//     narrative and stats
//   - onClose: () => void
//
// Every array prop defaults to []. Every derived data field defaults to a
// sensible empty value (0, [], null) so the recap renders cleanly even on a
// brand-new account with nothing logged.
export function MonthlyRecap({
  offset = 0,
  journals = [],
  checkIns = [],
  treatments = [],
  reflections = [],
  products = [],
  user = {},
  onClose,
}) {
  const scrollRef = useRef(null);

  const view = useMemo(() => {
    const today = new Date();
    const target = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const year = target.getFullYear();
    const month = target.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const start = new Date(year, month, 1).getTime();
    const end   = new Date(year, month, daysInMonth, 23, 59, 59, 999).getTime();
    const inMonth = (iso) => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return t >= start && t <= end;
    };
    return { year, month, daysInMonth, monthLabel: MONTHS[month], inMonth };
  }, [offset]);

  // Defensive coercions — if a prop arrives non-array (legacy storage,
  // half-loaded state) treat it as empty so we never call .filter on null.
  const data = useMemo(() => {
    const journalsArr = Array.isArray(journals) ? journals : [];
    const checkInsArr = Array.isArray(checkIns) ? checkIns : [];
    const treatmentsArr = Array.isArray(treatments) ? treatments : [];
    const reflectionsArr = Array.isArray(reflections) ? reflections : [];

    const journalsM    = journalsArr.filter(j => view.inMonth(j?.date));
    const checkInsM    = checkInsArr.filter(c => view.inMonth(c?.date));
    const treatmentsM  = treatmentsArr.filter(t => view.inMonth(t?.date));
    const reflectionsM = reflectionsArr.filter(r => view.inMonth(r?.date));

    // Day-of-month bucket keyed by local YYYY-MM-DD so the calendar can read
    // off journal / check-in / treatment markers per cell.
    const byDay = {};
    const bump = (date, slot, value) => {
      if (!date) return;
      const key = dayKey(new Date(date));
      if (!byDay[key]) byDay[key] = { journal: null, checkIns: [], treatment: null };
      if (slot === "journal") byDay[key].journal = value;
      if (slot === "checkIn") byDay[key].checkIns.push(value);
      if (slot === "treatment") byDay[key].treatment = value;
    };
    journalsM.forEach(j   => bump(j?.date, "journal", j));
    checkInsM.forEach(c   => bump(c?.date, "checkIn", c));
    treatmentsM.forEach(t => bump(t?.date, "treatment", t));

    // Aggregate stats
    const activeDays = Object.keys(byDay).length;
    const conditions = journalsM.reduce((acc, j) => {
      if (j?.condition) acc[j.condition] = (acc[j.condition] || 0) + 1;
      return acc;
    }, {});
    const dominantEntry = Object.entries(conditions).sort((a, b) => b[1] - a[1])[0];
    const dominant = dominantEntry ? [dominantEntry[0].charAt(0).toUpperCase() + dominantEntry[0].slice(1), dominantEntry[1]] : null;

    const irritation = checkInsM.filter(c => c?.irritation && c.irritation !== "none").length;
    const breakouts  = checkInsM.filter(c => c?.breakout).length;

    const zoneCounts = {};
    journalsM.forEach(j => (j?.affectedZones || []).forEach(z => {
      if (!z) return;
      zoneCounts[z] = (zoneCounts[z] || 0) + 1;
    }));
    const topZones = Object.entries(zoneCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return {
      journalsM, checkInsM, treatmentsM,
      monthJournals: journalsM,
      monthReflections: reflectionsM,
      monthTreatments: treatmentsM,
      byDay,
      activeDays,
      dominant,
      irritation,
      breakouts,
      topZones,
    };
  }, [journals, checkIns, treatments, reflections, view]);

  // Calendar grid cells: leading blanks so day 1 lines up with its weekday
  // (Mon-start), then days 1..daysInMonth. Blanks are nulls — render path
  // skips them as empty <div>s.
  const cells = useMemo(() => {
    const firstOfMonth = new Date(view.year, view.month, 1);
    const dow = firstOfMonth.getDay(); // 0..6, Sun..Sat
    const leadBlanks = (dow + 6) % 7;  // shift so Monday is column 0
    const result = new Array(leadBlanks).fill(null);
    for (let d = 1; d <= view.daysInMonth; d++) result.push(d);
    return result;
  }, [view]);

  const isToday = (d) => {
    const now = new Date();
    return now.getFullYear() === view.year && now.getMonth() === view.month && now.getDate() === d;
  };

  const isEmpty = data.activeDays === 0 && data.monthReflections.length === 0 && data.monthTreatments.length === 0;

  const sections = useMemo(() => ([
    { label: "Your skin this month",       body: narrateSkin(data) },
    { label: "What your skin is telling you", body: narrateTelling(data) },
    { label: "Your ritual",                body: narrateRitual({ products, treatmentsM: data.treatmentsM }) },
    { label: "Your vanity",                body: narrateVanity({ products }) },
    { label: "Looking ahead",              body: narrateAhead({ user, view }) },
  ]), [data, products, user, view]);

  // ESC closes the overlay
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && onClose) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={scrollRef}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: IVORY,
        backgroundImage: GRAIN,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        color: INK,
      }}
    >
      {/* Close × */}
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          position: "fixed", top: 18, left: 22, zIndex: 1,
          background: "none", border: "none", cursor: "pointer",
          color: PEBBLE, fontSize: 22, lineHeight: 1, padding: 6,
          fontFamily: "var(--font-display)",
        }}
        aria-label="Close"
      >×</button>

      <div style={{ maxWidth: 540, margin: "0 auto", padding: "60px 28px 44px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <h1 style={{
            fontFamily: "var(--font-signature)",
            fontSize: 36, fontWeight: 400, letterSpacing: "0.01em",
            color: INKY, margin: 0, lineHeight: 1.1,
          }}>
            {view.monthLabel}
          </h1>
          <p style={{
            fontFamily: "var(--font-body)",
            fontSize: 11, fontWeight: 400, letterSpacing: "0.18em",
            textTransform: "uppercase", color: "var(--color-inky-moss, #2d3d2b)",
            margin: "6px 0 0",
          }}>
            {view.year} · IN REVIEW
          </p>
        </div>

        {/* Silver divider */}
        <div style={{
          width: 80, height: 1, margin: "0 auto 12px",
          background: "linear-gradient(90deg, transparent 0%, rgba(192,192,192,0.55) 50%, transparent 100%)",
        }} />

        {/* Sections */}
        {sections.map((s, i) => (
          <Section
            key={s.label}
            label={s.label}
            body={s.body}
            rootRef={scrollRef}
            divider={i < sections.length - 1}
          />
        ))}

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 48 }}>
          <img
            src="/cygne-logo.png"
            alt="Cygne"
            style={{
              width: 80, height: "auto", display: "block",
              margin: "0 auto 14px",
              filter: "brightness(0.45) contrast(1.3) saturate(0.65)",
              opacity: 0.85,
            }}
          />
          <p style={{
            fontFamily: "var(--font-body)",
            fontSize: 12, fontWeight: 400, letterSpacing: "0.14em", textTransform: "uppercase",
            color: "var(--color-inky-moss, #2d3d2b)", margin: 0,
          }}>
            built around you.
          </p>
        </div>
      </div>

      {isEmpty ? (
        <p style={{
          fontFamily: "var(--font-body)", fontSize: 13,
          color: "var(--color-inky-moss, #2d3d2b)", textAlign: "center", margin: "20px 0 8px",
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
                color: "var(--color-inky-moss, #2d3d2b)", textAlign: "center", textTransform: "uppercase",
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
                textTransform: "uppercase", color: "var(--color-inky-moss, #2d3d2b)", margin: "0 0 8px",
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
                      letterSpacing: "0.1em", color: "var(--color-inky-moss, #2d3d2b)",
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
        textTransform: "uppercase", color: "var(--color-inky-moss, #2d3d2b)",
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
        textTransform: "uppercase", color: "var(--color-inky-moss, #2d3d2b)",
      }}>{label}</span>
    </div>
  );
}
