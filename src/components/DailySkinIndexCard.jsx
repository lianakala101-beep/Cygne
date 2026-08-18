// Daily Skin Index — glanceable data readout for the home dashboard.
// Synthesizes cycle phase + local weather (already computed by
// dashboard.jsx) into 2-4 short label/value rows plus one rule-based
// action line. See src/lib/skinIndex.js for the derivation logic —
// this file is presentation only.
//
// Deliberately distinct from the Swan Sense card next to it: Swan
// Sense is a written sentence on a borderless transparent surface;
// this is a flat 1px-bordered card of scannable data points, meant
// to read in ~5 seconds like a weather app rather than a paragraph.
import { buildSkinIndex } from "../lib/skinIndex.js";

// Tone → { label color, pill border } pairs. Matches the semantic
// palette already used elsewhere in the app: sage/moss for a
// favorable reading (e.g. ritual.jsx's "in ritual" state), warm clay
// for a caution reading (e.g. shelf-life warnings, back-off states),
// plain ivory for anything in between.
const TONE_STYLES = {
  caution:  { color: "#c9a985", border: "rgba(139,115,85,0.45)" },
  positive: { color: "#8fac93", border: "rgba(110,138,114,0.4)" },
  neutral:  { color: "var(--color-ivory, #faf9f4)", border: "rgba(250,249,244,0.32)" },
};

function DailySkinIndexCard({ cyclePhaseName = null, weather = null }) {
  const { items, actionLine } = buildSkinIndex({ cyclePhaseName, weather });
  if (items.length === 0) return null;

  return (
    <div style={{
      background: "rgba(250,249,244,0.05)",
      border: "1px solid rgba(250,249,244,0.16)",
      borderRadius: 8,
      padding: "18px 20px",
      marginBottom: 20,
    }}>
      <p style={{
        fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 10,
        letterSpacing: "0.28em", textTransform: "uppercase",
        color: "var(--color-ivory, #faf9f4)", opacity: 0.75,
        margin: "0 0 14px",
      }}>
        Daily Skin Index
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map(item => {
          const tone = TONE_STYLES[item.tone] || TONE_STYLES.neutral;
          return (
            <div key={item.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{
                fontFamily: "var(--font-body)", fontWeight: 400, fontSize: 11,
                letterSpacing: "0.14em", textTransform: "uppercase",
                color: "var(--color-ivory, #faf9f4)", opacity: 0.65,
              }}>
                {item.label}
              </span>
              <span style={{
                display: "inline-flex", alignItems: "center",
                padding: "3px 10px",
                border: `1px solid ${tone.border}`,
                borderRadius: 999,
                fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 10,
                letterSpacing: "0.16em", textTransform: "uppercase",
                color: tone.color,
                whiteSpace: "nowrap", lineHeight: 1,
              }}>
                ( {item.value} )
              </span>
            </div>
          );
        })}
      </div>

      {actionLine && (
        <>
          <div style={{ height: 1, background: "rgba(250,249,244,0.14)", margin: "14px 0" }} />
          <p style={{
            fontFamily: "var(--font-body)", fontWeight: 400, fontSize: 12,
            color: "#F4F3EF", opacity: 0.88,
            lineHeight: 1.6, margin: 0,
          }}>
            {actionLine}
          </p>
        </>
      )}
    </div>
  );
}

export { DailySkinIndexCard };
