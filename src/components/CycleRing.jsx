// Cycle Ring — one dot per day of the current cycle (or the last 28
// calendar days), day 1 at the top running clockwise. Phase arcs and
// phase names sit just outside the dots in cycle mode; the center shows
// journal consistency (or progress toward the first pattern). Data comes from
// buildCycleRing in src/lib/cycleRing.js.
//
// The numbers below are SVG geometry in viewBox units (the SVG scales to
// its container). Every color, size, and tracking value comes from tokens.

import { buildCycleRing } from "../lib/cycleRing.js";

const VIEW = 280;
const CENTER = VIEW / 2;
const R_DOTS = 92;
const R_ARC = 106;
const R_LABEL_TOP = 116;    // label baseline on the upper half (glyphs point outward)
const R_LABEL_BOTTOM = 124; // label baseline on the lower half (glyphs point inward)
const ARC_WIDTH = 2;
const ARC_GAP = 4;          // px of clear space between neighbouring phase arcs
const LABEL_SPAN = Math.PI / 3; // label path extends ±60° so short phases never clip their name

const DOT_FILL = {
  glowing: "var(--color-ivory)",
  good: "var(--color-ivory)",
  okay: "var(--color-gold)",
  low: "var(--color-rose)",
};

const LEGEND = [
  { key: "glowing", label: "Glowing" },
  { key: "good", label: "Good" },
  { key: "okay", label: "Okay" },
  { key: "low", label: "Low" },
];

const polar = (r, angle) => [CENTER + r * Math.sin(angle), CENTER - r * Math.cos(angle)];

// SVG arc from `from` to `to` (radians, 0 = top, clockwise positive).
function arcPath(r, from, to) {
  const [x1, y1] = polar(r, from);
  const [x2, y2] = polar(r, to);
  const sweep = to > from ? 1 : 0;
  const large = Math.abs(to - from) > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} ${sweep} ${x2} ${y2}`;
}

function Dot({ state, x, y, r, maxHaloR }) {
  if (state === "missed") {
    return <circle cx={x} cy={y} r={r - 0.5} style={{ fill: "none", stroke: "rgba(var(--rgb-ivory), 0.32)", strokeWidth: 1 }} />;
  }
  if (state === "future" || state === "before-start") {
    return <circle cx={x} cy={y} r={r * 0.45} style={{ fill: "rgba(var(--rgb-ivory), 0.16)" }} />;
  }
  if (state === "glowing") {
    return (
      <g>
        <circle cx={x} cy={y} r={Math.min(r * 2.2, maxHaloR)} style={{ fill: "rgba(var(--rgb-ivory), 0.16)" }} />
        <circle cx={x} cy={y} r={r * 1.25} style={{ fill: DOT_FILL.glowing }} />
      </g>
    );
  }
  return <circle cx={x} cy={y} r={r} style={{ fill: DOT_FILL[state] }} />;
}

export function CycleRing({ journalEntries, cycleStartDate, cycleLength, today }) {
  const ring = buildCycleRing({ journalEntries, cycleStartDate, cycleLength, today });
  const n = ring.days.length;
  const step = (2 * Math.PI) / n;
  const angleOf = (index) => index * step;
  const spacing = step * R_DOTS;
  const dotR = Math.min(4, Math.max(2.5, spacing * 0.24));
  const todayR = Math.min(dotR + 3.5, spacing / 2 - 0.5);

  const todayDay = ring.todayIndex + 1;
  const currentPhase = ring.phases.find(p => todayDay >= p.startDay && todayDay <= p.endDay)
    || (ring.runningLong ? ring.phases[ring.phases.length - 1] : null);
  const gapAngle = (ARC_WIDTH / 2 + ARC_GAP / 2) / R_ARC;

  const summary = ring.mode === "cycle"
    ? `Cycle day ${todayDay} of ${ring.cycleLength}${currentPhase ? `, ${currentPhase.name} phase` : ""}. ${ring.center.label}: ${ring.center.value}.`
    : `Last 28 days. ${ring.center.label}: ${ring.center.value}.`;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-4)" }}>
      <div style={{ position: "relative", width: "100%", maxWidth: VIEW }}>
        <svg viewBox={`0 0 ${VIEW} ${VIEW}`} width="100%" role="img" aria-label={summary} style={{ display: "block", overflow: "visible" }}>
          {ring.phases.map((phase) => {
            const from = angleOf(phase.startDay - 1) - step / 2 + gapAngle;
            const to = angleOf(phase.endDay - 1) + step / 2 - gapAngle;
            const mid = (from + to) / 2;
            const isCurrent = phase === currentPhase;
            const upper = Math.cos(mid) >= 0;
            const labelId = `cycle-ring-label-${phase.name}`;
            const labelPath = upper
              ? arcPath(R_LABEL_TOP, mid - LABEL_SPAN, mid + LABEL_SPAN)
              : arcPath(R_LABEL_BOTTOM, mid + LABEL_SPAN, mid - LABEL_SPAN);
            return (
              <g key={phase.name}>
                <path d={arcPath(R_ARC, from, to)} style={{
                  fill: "none",
                  stroke: `rgba(var(--rgb-ivory), ${isCurrent ? 0.56 : 0.16})`,
                  strokeWidth: ARC_WIDTH,
                  strokeLinecap: "round",
                }} />
                <path id={labelId} d={labelPath} style={{ fill: "none", stroke: "none" }} />
                <text style={{
                  fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)",
                  textTransform: "uppercase",
                  fill: `rgba(var(--rgb-ivory), ${isCurrent ? 0.82 : 0.32})`,
                }}>
                  <textPath href={`#${labelId}`} startOffset="50%" textAnchor="middle">{phase.name}</textPath>
                </text>
              </g>
            );
          })}

          {ring.days.map((d, i) => {
            const [x, y] = polar(R_DOTS, angleOf(i));
            return <Dot key={d.date} state={d.state} x={x} y={y} r={dotR} maxHaloR={spacing / 2} />;
          })}

          {(() => {
            const [x, y] = polar(R_DOTS, angleOf(ring.todayIndex));
            return <circle cx={x} cy={y} r={todayR} style={{ fill: "none", stroke: "var(--color-ivory)", strokeWidth: 1 }} />;
          })()}
        </svg>

        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: "var(--space-1)", pointerEvents: "none",
        }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)", fontWeight: 500, color: "var(--color-ivory)", lineHeight: 1 }}>
            {ring.center.value}
          </span>
          <span style={{
            fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)",
            textTransform: "uppercase", color: "rgba(var(--rgb-ivory), 0.56)", textAlign: "center",
            maxWidth: "50%", lineHeight: 1.4,
          }}>
            {ring.center.label}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "rgba(var(--rgb-ivory), 0.56)", whiteSpace: "nowrap" }}>
        {LEGEND.map((item, i) => (
          <span key={item.key} style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
            {i > 0 && <span aria-hidden="true">·</span>}
            <span aria-hidden="true" style={{
              width: "var(--space-2)", height: "var(--space-2)", borderRadius: "var(--radius-pill)",
              background: DOT_FILL[item.key],
              boxShadow: item.key === "glowing" ? "0 0 0 var(--space-1) rgba(var(--rgb-ivory), 0.16)" : "none",
            }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
