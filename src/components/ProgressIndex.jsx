// Progress index layer — sits directly under the Cycle Ring: a pair of
// glanceable pills, up to two plain-sentence insights, and one tappable
// "Now" card. Data comes from buildProgressIndex in src/lib/progressIndex.js.

import { Icon } from "../components.jsx";
import { glassCard } from "../lib/ui.js";

// The Now card is one of exactly two solid-ivory-family surfaces left
// after the softening pass (the other is the primary action pill) —
// everything else on the moss canvas is glass. "veil" is the glass
// alternative, kept behind this single flag so it can be previewed
// without touching layout, copy, or behavior anywhere else.
const NOW_CARD_STYLE = "pearl"; // "pearl" | "veil"

const NOW_CARD_VARIANTS = {
  pearl: {
    card: { background: "var(--color-pearl)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)" },
    textColor: "var(--color-inky-moss)",
    eyebrowColor: "var(--color-bronze)",
  },
  veil: {
    card: glassCard,
    textColor: "var(--color-ivory)",
    eyebrowColor: "var(--color-gold)",
  },
};

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

      {now && (() => {
        const variant = NOW_CARD_VARIANTS[NOW_CARD_STYLE] || NOW_CARD_VARIANTS.pearl;
        return (
          <button
            type="button"
            onClick={() => onNow?.(now)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)",
              width: "100%", padding: "var(--space-4) var(--space-5)",
              border: "none",
              ...variant.card,
              color: variant.textColor, textAlign: "left", cursor: "pointer",
              WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
            }}
          >
            <span style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", minWidth: 0 }}>
              <span style={{
                fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)",
                textTransform: "uppercase", color: variant.eyebrowColor,
              }}>Now</span>
              <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-md)", color: variant.textColor }}>{now.text}</span>
            </span>
            <span aria-hidden="true" style={{ display: "inline-flex", flexShrink: 0 }}><Icon name="arrow-right" size={16} /></span>
          </button>
        );
      })()}
    </div>
  );
}
