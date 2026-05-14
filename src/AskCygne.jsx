// ── Trigger button ──────────────────────────────────────────────────────────
// Only the small Ask Cygne CTA lives here now. The richer AskCygneOverlay
// + WordReveal helpers were removed in the dead-code sweep — the modal at
// src/components/AskCygneModal.jsx is the canonical Ask Cygne surface.
export function AskCygneButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "10px 24px", background: "transparent",
        border: "1px solid rgba(45,61,43,0.3)", borderRadius: 0,
        cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 400,
        fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase",
        color: "var(--color-inky-moss)", transition: "all 0.2s",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "var(--color-inky-moss)"; e.currentTarget.style.color = "var(--color-ivory)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-inky-moss)"; }}>
      Ask Cygne
    </button>
  );
}
