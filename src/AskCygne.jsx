// ── Trigger button ──────────────────────────────────────────────────────────
// Only the small Ask Cygne CTA lives here now. The richer AskCygneOverlay
// + WordReveal helpers were removed in the dead-code sweep — the modal at
// src/components/AskCygneModal.jsx is the canonical Ask Cygne surface.
export function AskCygneButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", width: "100%", alignItems: "center", justifyContent: "center", gap: 8,
        padding: "14px 16px", background: "transparent",
        border: "1.5px solid var(--color-inky-moss, #2d3d2b)", borderRadius: 0,
        cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 700,
        fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase",
        color: "var(--color-inky-moss)", transition: "all 0.2s",
        WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "var(--color-inky-moss)"; e.currentTarget.style.color = "var(--color-ivory)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-inky-moss)"; }}>
      Ask Cygne
    </button>
  );
}
