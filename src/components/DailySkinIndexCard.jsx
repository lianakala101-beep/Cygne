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

// Typography audit — one shared spec per role, reused everywhere that
// role appears so nothing drifts row to row:
//
//   LABEL_STYLE  — every uppercase small-caps label, including the
//     card's own "Daily Skin Index" header. Fungis Heavy, 10px,
//     0.28em tracking — exactly the Swan Sense eyebrow spec
//     (src/ritual.jsx's ivory-flat "Swan Sense" label), which is the
//     small-caps size already established for this part of the
//     dashboard. Only opacity varies (header slightly louder than
//     the per-item row labels) — font-size and letter-spacing never
//     do, so the labels read as one family of text.
//
//   VALUE_STYLE  — the three index values. Fungis Heavy — the only
//     Heavy-weight text on the card besides the labels/header (which
//     stay exactly as they were), 20px, 0.02em tracking matching the
//     large-Fungis-headline convention used elsewhere (e.g. the
//     skin-status phrase in src/lib/cycleShare.js), not the wide
//     small-caps tracking that only belongs on tiny label text.
//
//   ACTION_LINE_STYLE — matches Swan Sense's own daily-insight
//     paragraph exactly (src/ritual.jsx's ivory-flat variant): Fungis
//     Normal, 16px, 0.01em tracking, 1.5 line-height, full-opacity
//     ivory.
const LABEL_STYLE = {
  fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 10,
  letterSpacing: "0.28em", textTransform: "uppercase",
  color: "var(--color-ivory, #faf9f4)",
};

const VALUE_STYLE = {
  fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20,
  letterSpacing: "0.02em", textTransform: "uppercase",
  lineHeight: 1,
};

// Every pill shares this floor so "0" and "ESCALATING" read as the
// same fixed-size object rather than shrink-wrapping to their own
// text — sized to comfortably fit the longest actual value
// ("ESCALATING") without wrapping.
const PILL_MIN_WIDTH = 140;

const ACTION_LINE_STYLE = {
  fontFamily: "var(--font-body)", fontWeight: 400, fontSize: 16,
  letterSpacing: "0.01em", lineHeight: 1.5,
  color: "var(--color-ivory, #faf9f4)",
  margin: 0,
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
      <p style={{ ...LABEL_STYLE, opacity: 0.75, margin: "0 0 16px" }}>
        Daily Skin Index
      </p>

      {/* Each item is a single horizontal row — label left, value
          pill right. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {items.map(item => {
          const tone = TONE_STYLES[item.tone] || TONE_STYLES.neutral;
          return (
            <div key={item.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <span style={{ ...LABEL_STYLE, opacity: 0.6 }}>
                {item.label}
              </span>
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                minWidth: PILL_MIN_WIDTH,
                whiteSpace: "nowrap",
                padding: "6px 16px",
                border: `1px solid ${tone.border}`,
                borderRadius: 999,
                ...VALUE_STYLE,
                color: tone.color,
              }}>
                {item.value}
              </span>
            </div>
          );
        })}
      </div>

      {actionLine && (
        <>
          <div style={{ height: 1, background: "rgba(250,249,244,0.14)", margin: "16px 0" }} />
          <p style={ACTION_LINE_STYLE}>
            {actionLine}
          </p>
        </>
      )}
    </div>
  );
}

export { DailySkinIndexCard };
