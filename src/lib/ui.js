// Shared style helpers for the softening pass — nothing on the moss
// canvas is a solid ivory slab except the primary action pill and the
// Now card; everything else is translucent glass, and corners are soft
// everywhere. Plain style objects, spread into a component's own
// style={{...}}, matching how the rest of the app already writes
// inline styles — no CSS-in-JS runtime, just shared literals so the
// same look doesn't drift between call sites.

// Glass card — the default "content panel" look: near-transparent
// ivory fill, a thin ivory-alpha border, soft corners. This is what a
// solid ivory block becomes once it's not one of the two exceptions.
const glassCard = {
  background: "rgba(var(--rgb-ivory), 0.08)",
  border: "1px solid rgba(var(--rgb-ivory), 0.16)",
  borderRadius: "var(--radius-card)",
};

// Primary action — the one button-shaped exception to "everything is
// glass": solid ivory fill, moss text, fully pilled. Callers still own
// their own padding/width, since those vary by context (full-width vs.
// inline, etc.) — this only fixes the look.
const buttonPrimary = {
  background: "var(--color-ivory, #faf9f4)",
  color: "var(--color-inky-moss)",
  border: "none",
  borderRadius: "var(--radius-pill)",
  fontFamily: "var(--font-body)",
  fontSize: "var(--text-sm)",
  fontWeight: 500,
  letterSpacing: "var(--tracking-label)",
  textTransform: "uppercase",
  cursor: "pointer",
};

// Secondary action — outlined and glass-adjacent (transparent fill,
// ivory text/border at reduced opacity), fully pilled.
const buttonSecondary = {
  background: "transparent",
  color: "var(--color-ivory, #faf9f4)",
  border: "1px solid rgba(var(--rgb-ivory), 0.32)",
  borderRadius: "var(--radius-pill)",
  fontFamily: "var(--font-body)",
  fontSize: "var(--text-sm)",
  fontWeight: 500,
  letterSpacing: "var(--tracking-label)",
  textTransform: "uppercase",
  cursor: "pointer",
};

// Text input — transparent, ivory-alpha border, soft (not pilled)
// corners. Focus is handled globally already (App.jsx's injected
// `input:focus, select:focus, textarea:focus { border-color: var(--sage)
// !important; }`), so this only needs a sensible resting state.
const inputStyle = {
  background: "transparent",
  border: "1px solid rgba(var(--rgb-ivory), 0.32)",
  borderRadius: "var(--radius)",
  color: "var(--color-ivory, #faf9f4)",
  fontFamily: "var(--font-body)",
  fontSize: "var(--text-sm)",
  outline: "none",
};

export { glassCard, buttonPrimary, buttonSecondary, inputStyle };
