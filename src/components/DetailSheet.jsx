import { useEffect } from "react";
import { Icon } from "../components.jsx";

// Full-height detail sheet for the Progress tracker grid. Rises over the
// Progress screen (a small reveal strip stays visible above it, matching
// the app's other bottom-sheet surfaces, just stretched taller) rather
// than covering the literal top edge, so --radius-sheet's rounded top
// corners read against something. Progress itself stays mounted
// underneath the whole time — this is an overlay, not a route change —
// so its scroll position is untouched by opening or closing a sheet.
//
// z-index 60: above the bottom nav (50) so it fully covers it, but below
// the app's actual modals (CheckInModal 100, SkinJournalModal 200,
// JournalFullView 2000, etc.) so any of those can still open on top of
// an open sheet, same as they could on the bare Progress page.
function DetailSheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed", top: "var(--space-10)", left: 0, right: 0, bottom: 0,
        zIndex: 60,
        background: "var(--color-inky-moss)",
        borderRadius: "var(--radius-sheet)",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
        boxShadow: "0 calc(var(--space-2) * -1) var(--space-8) rgba(0, 0, 0, 0.4)",
      }}
    >
      {/* Header — back arrow / centered title / equal-width spacer, so
          the title is genuinely centered rather than just left-biased
          with a right-aligned close control. */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "var(--space-5) var(--space-5) var(--space-4)",
        flexShrink: 0,
      }}>
        <div style={{ width: "var(--space-10)", display: "flex" }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to Progress"
            style={{
              background: "none", border: "none", padding: "var(--space-2)", margin: "calc(var(--space-2) * -1)",
              color: "var(--color-ivory)", cursor: "pointer", display: "inline-flex",
              WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
            }}
          >
            <Icon name="arrow-left" size={18} />
          </button>
        </div>
        <h2 style={{
          flex: 1, textAlign: "center",
          fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-lg)",
          letterSpacing: "var(--tracking-display)", textTransform: "uppercase",
          color: "var(--color-ivory)", margin: 0,
        }}>{title}</h2>
        <div style={{ width: "var(--space-10)" }} aria-hidden="true" />
      </div>

      <div style={{
        flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch",
        padding: "0 var(--space-6) var(--space-10)",
      }}>
        {children}
      </div>
    </div>
  );
}

export { DetailSheet };
