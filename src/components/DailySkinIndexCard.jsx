// Daily Skin Index — glanceable data readout for the home dashboard.
// Synthesizes cycle phase + local weather (already computed by
// dashboard.jsx) into a location/day/phase context line, up to 4
// short label/value rows, and a short list of rule-based guidance
// bullets. See src/lib/skinIndex.js for the derivation logic — this
// file is presentation only.
//
// Deliberately distinct from the Swan Sense card next to it: Swan
// Sense is a written sentence on a borderless transparent surface;
// this is a flat 1px-bordered card of scannable data points, meant
// to read in ~5 seconds like a weather app rather than a paragraph.
import { buildSkinIndex } from "../lib/skinIndex.js";

// Tone → { label color, pill border } pairs. The pill sits on a
// near-transparent wash over the dashboard's dark inky-moss canvas,
// so text needs to pair with a DARK background the same way the
// Progress-screen contrast fix paired text color with actual
// surface tone rather than a semantic-only palette (see
// src/progress.jsx's ivory-band SectionShell token overrides). At
// the pill's small 9px size, the previous tinted caution/positive
// colors (warm clay / sage) sat around a 4-4.5:1 contrast ratio
// against the dark fill — legible in isolation but marginal at that
// size. All three tones now share one uniform bright ivory/cream
// text color (~11:1 against the dark fill) so contrast is never in
// question; the tone signal still comes through via the pill's
// outline color, which stays distinct per tone.
const TONE_STYLES = {
  caution:  { color: "var(--color-ivory, #faf9f4)", border: "rgba(139,115,85,0.45)" },
  positive: { color: "var(--color-ivory, #faf9f4)", border: "rgba(110,138,114,0.4)" },
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
//     stay exactly as they were) — at 9px, deliberately smaller than
//     the 10px header/labels so the pill is never the largest text
//     on the card. Distinctness comes from the Heavy weight + pill
//     outline, not from size. 0.02em tracking matches the large-
//     Fungis-headline convention used elsewhere (e.g. the skin-status
//     phrase in src/lib/cycleShare.js), not the wide small-caps
//     tracking that only belongs on tiny label text.
//
//   ACTION_LINE_STYLE — matches Swan Sense's own daily-insight
//     paragraph exactly (src/ritual.jsx's ivory-flat variant): Fungis
//     Normal, 16px, 0.01em tracking, 1.5 line-height, full-opacity
//     ivory. Each guidance bullet reuses this same spec — the change
//     from one summary sentence to a short list is structural, not
//     typographic.
//
//   CONTEXT_LINE_STYLE — the new location/day/phase line that sits
//     above the "Daily Skin Index" header. Deliberately lighter than
//     LABEL_STYLE (Normal weight, not Heavy; 0.14em tracking, not
//     0.28em) so it reads as quiet framing rather than competing with
//     the header directly beneath it for top billing.
const LABEL_STYLE = {
  fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 10,
  letterSpacing: "0.28em", textTransform: "uppercase",
  color: "var(--color-ivory, #faf9f4)",
};

const CONTEXT_LINE_STYLE = {
  fontFamily: "var(--font-body)", fontWeight: 400, fontSize: 10,
  letterSpacing: "0.14em", textTransform: "uppercase",
  color: "var(--color-ivory, #faf9f4)", opacity: 0.55,
  // 16px matches the card's established section-to-section rhythm
  // (header-to-items gap, and the divider margin before the action
  // bullets both use 16px) — was 10px, noticeably tighter than every
  // other gap on the card.
  margin: "0 0 16px",
};

const VALUE_STYLE = {
  fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 9,
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

// City + day/phase context line — e.g. "Atlanta, US • Day 18
// (Luteal Phase)". Built from whatever's available; either half can
// be missing without the other. locationData only carries city +
// country (see progress.jsx's LocationManager / onboarding.jsx's
// reverse-geocode call — there's no state/region field anywhere in
// the app today), so this uses the same "city, country" format
// already established at progress.jsx:2190 rather than inventing a
// state field that doesn't exist in the data model.
function buildContextLine({ locationData, cyclePhaseName, cycleDay }) {
  const locationPart = locationData?.city
    ? `${locationData.city}${locationData.country ? `, ${locationData.country}` : ""}`
    : null;
  const phasePart = cyclePhaseName && cycleDay
    ? `Day ${cycleDay} (${cyclePhaseName} Phase)`
    : null;
  return [locationPart, phasePart].filter(Boolean).join(" • ") || null;
}

function DailySkinIndexCard({ cyclePhaseName = null, cycleDay = null, weather = null, locationData = null }) {
  const { items, actions } = buildSkinIndex({ cyclePhaseName, weather });
  if (items.length === 0) return null;

  const contextLine = buildContextLine({ locationData, cyclePhaseName, cycleDay });

  return (
    <div style={{
      background: "rgba(250,249,244,0.05)",
      border: "1px solid rgba(250,249,244,0.16)",
      borderRadius: 8,
      padding: "18px 20px",
      marginBottom: 20,
    }}>
      {contextLine && (
        <p style={CONTEXT_LINE_STYLE}>
          {contextLine}
        </p>
      )}
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

      {actions.length > 0 && (
        <>
          <div style={{ height: 1, background: "rgba(250,249,244,0.14)", margin: "16px 0" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {actions.map((action, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span aria-hidden="true" style={{ ...ACTION_LINE_STYLE, flexShrink: 0 }}>—</span>
                <p style={{ ...ACTION_LINE_STYLE, margin: 0 }}>{action}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export { DailySkinIndexCard };
