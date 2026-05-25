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
        border: "1.5px solid rgba(250,249,244,0.5)", borderRadius: 6,
        cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 700,
        fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase",
        color: "var(--color-ivory, #faf9f4)", transition: "all 0.2s",
        WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "rgba(250,249,244,0.08)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
      Ask Cygne
    </button>
  );
}
