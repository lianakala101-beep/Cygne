// Progress index layer — sits directly under the Cycle Ring: a pair of
// glanceable pills, up to two plain-sentence insights, and one tappable
// "Now" card. Data comes from buildProgressIndex in src/lib/progressIndex.js.

import { Icon } from "../components.jsx";

function Pill({ label, value }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-1)",
      padding: "var(--space-2) var(--space-3)",
      border: "1px solid rgba(var(--rgb-ivory), 0.32)", borderRadius: "var(--radius-pill)",
      textAlign: "center", minWidth: 0,
    }}>
      <span style={{
        fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)",
        textTransform: "uppercase", color: "var(--color-ivory)", opacity: 0.7, lineHeight: 1.3,
      }}>{label}</span>
      <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", color: "var(--color-ivory)", lineHeight: 1.3 }}>{value}</span>
    </div>
  );
}

export function ProgressIndex({ index, onNow }) {
  const { pills, insights, now } = index;
  if (pills.length === 0 && insights.length === 0 && !now) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      {pills.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
          {pills.length === 1
            ? <div style={{ gridColumn: "1 / -1", justifySelf: "center", width: "50%" }}><Pill {...pills[0]} /></div>
            : pills.map(p => <Pill key={p.key} {...p} />)}
        </div>
      )}

      {insights.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {insights.map(text => (
            <p key={text} style={{
              fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", lineHeight: 1.6,
              color: "var(--color-ivory)", opacity: 0.9, textAlign: "center", margin: 0,
            }}>{text}</p>
          ))}
        </div>
      )}

      {now && (
        <button
          type="button"
          onClick={() => onNow?.(now.kind)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)",
            width: "100%", padding: "var(--space-4) var(--space-5)",
            background: "rgba(var(--rgb-ivory), 0.94)", border: "none", borderRadius: "var(--radius)",
            color: "var(--color-inky-moss)", textAlign: "left", cursor: "pointer",
            WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
          }}
        >
          <span style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", minWidth: 0 }}>
            <span style={{
              fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)",
              textTransform: "uppercase", color: "var(--color-bronze)",
            }}>Now</span>
            <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-md)", color: "var(--color-inky-moss)" }}>{now.text}</span>
          </span>
          <span aria-hidden="true" style={{ display: "inline-flex", flexShrink: 0 }}><Icon name="arrow-right" size={16} /></span>
        </button>
      )}
    </div>
  );
}
