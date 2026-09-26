// ── Trigger button ──────────────────────────────────────────────────────────
// Only the small Ask Cygne CTA lives here now. The richer AskCygneOverlay
// + WordReveal helpers were removed in the dead-code sweep — the modal at
// src/components/AskCygneModal.jsx is the canonical Ask Cygne surface.
export function AskCygneButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", width: "100%", alignItems: "center", justifyContent: "center", gap: "var(--space-2)",
        padding: "var(--space-4) var(--space-4)", background: "transparent",
        border: "1.5px solid rgba(var(--rgb-ivory), 0.56)", borderRadius: "var(--radius)",
        cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 700,
        fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase",
        color: "var(--color-ivory, #faf9f4)", transition: "all 0.2s",
        WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "rgba(var(--rgb-ivory), 0.08)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
      Ask Cygne
    </button>
  );
}
