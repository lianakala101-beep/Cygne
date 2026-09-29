import { Icon } from "../components.jsx";

// 3x2 grid of tracker circles under the Now card, each opening a detail
// sheet with that section's content. Data-only props: `attention` is
// {journal, introduce, treatments} booleans from
// src/lib/trackerAttention.js; `introduceDimmed` is true only during
// Acute treatment recovery, when Introduce Slowly still needs to be
// reachable (it explains itself, rather than just vanishing) but reads
// as de-emphasized next to the trackers that are fully live right now.
const TRACKERS = [
  { key: "journal",    label: "Journal",    icon: "book" },
  { key: "face",       label: "Face Map",   icon: "face" },
  { key: "cycle",      label: "Cycle",      icon: "cycle" },
  { key: "introduce",  label: "Introduce",  icon: "flask" },
  { key: "treatments", label: "Treatments", icon: "medical" },
  { key: "body",       label: "Body",       icon: "body" },
];

// Composed from the space scale (--space-12 + --space-2 = 48 + 8 = 56)
// rather than a literal 56, per the "tokens only" brief — there's no
// single --space-* step at 56.
const CIRCLE_SIZE = "calc(var(--space-12) + var(--space-2))";

function TrackerGrid({ attention = {}, onOpen, introduceDimmed = false }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-5) var(--space-3)" }}>
      {/* :active is the correct control for tap feedback (vs. :hover,
          which sticks on touch devices) — inline styles can't express
          a pseudo-class, so this is a small scoped stylesheet, same
          pattern as the app's other injected <style> blocks (e.g. the
          focus-visible ring in App.jsx). */}
      <style>{`
        .tracker-cell { -webkit-tap-highlight-color: transparent; }
        .tracker-cell:active .tracker-circle {
          transform: scale(0.96);
          border-color: rgba(var(--rgb-ivory), 0.56);
        }
      `}</style>
      {TRACKERS.map(t => {
        const dimmed = t.key === "introduce" && introduceDimmed;
        const showDot = !!attention[t.key];
        return (
          <button
            key={t.key}
            type="button"
            className="tracker-cell"
            onClick={() => onOpen?.(t.key)}
            aria-label={t.label}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-2)",
              background: "none", border: "none", padding: 0, cursor: "pointer",
              opacity: dimmed ? 0.4 : 1,
              WebkitAppearance: "none", appearance: "none",
            }}
          >
            <span
              className="tracker-circle"
              style={{
                position: "relative",
                width: CIRCLE_SIZE, height: CIRCLE_SIZE,
                borderRadius: "var(--radius-pill)",
                border: "1px solid rgba(var(--rgb-ivory), 0.32)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--color-ivory)",
                transition: "transform 0.15s ease, border-color 0.15s ease",
              }}
            >
              <Icon name={t.icon} size={22} />
              {showDot && (
                <span aria-hidden="true" style={{
                  position: "absolute", top: "var(--space-1)", right: "var(--space-1)",
                  width: 6, height: 6, borderRadius: "50%",
                  background: "var(--color-gold)",
                }} />
              )}
            </span>
            <span style={{
              fontFamily: "var(--font-body)", fontSize: "var(--text-xs)",
              letterSpacing: "var(--tracking-label)", textTransform: "uppercase",
              color: "var(--color-ivory)", opacity: 0.85,
            }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export { TrackerGrid };
