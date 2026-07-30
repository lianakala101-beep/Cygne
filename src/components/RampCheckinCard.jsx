// Weekly check-in nudge for a product on Introduce Slowly.
//
// Rendered inline above its matching IntroduceSlowlyCard whenever
// getRampWeek(product) > (product.lastCheckinWeek ?? 0) — i.e. the
// user has entered a new ramp week but hasn't logged a reaction yet.
// Four quick-tap response states plus a short optional note, then
// dismisses on submit (the parent bumps lastCheckinWeek so the nudge
// stops firing until the next 7-day boundary).
//
// Design ties into the Introduce Slowly section styling — inky-moss
// tinted card, outlined buttons, Fungis body text, uppercase small
// labels with wide tracking. No emojis (project rule).

import { useState } from "react";

const RESPONSES = [
  { key: "no_reaction",     label: "No reaction"     },
  { key: "loving_it",       label: "Loving it"       },
  { key: "mild_irritation", label: "Mild irritation" },
  { key: "breakout",        label: "Breakout"        },
];

// Single ivory-card treatment for every response — same background
// used by the ritual-mode card in ritualscreen.jsx and the vanity
// glass cards. Semantic coloring (sage/amber-by-meaning) is
// deliberately removed; the label text carries the meaning. Selection
// is conveyed by the border darkening from a whisper of ink to a
// clear one, keeping layout stable (no border-width change).
const BUTTON_STYLE = {
  base: {
    background: "rgba(250, 249, 244, 0.82)",
    border:     "1px solid rgba(28, 28, 26, 0.18)",
    color:      "#1c1c1a",
  },
  hover: {
    border: "1px solid rgba(28, 28, 26, 0.35)",
  },
  selected: {
    border: "1px solid rgba(28, 28, 26, 0.70)",
  },
};

export function RampCheckinCard({ productName, weekNumber, onSubmit, onDismiss }) {
  const [picked, setPicked] = useState(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!picked || saving) return;
    setSaving(true);
    try {
      await onSubmit(picked, note.trim() || null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      background: "rgba(45,61,43,0.06)",
      border: "1px solid rgba(45,61,43,0.22)",
      borderRadius: 14,
      marginBottom: 12,
      padding: "14px 16px 16px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 400, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--sage, #2d3d2b)", margin: "0 0 3px" }}>
            Week {weekNumber} check-in
          </p>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--parchment, var(--color-ivory))", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {productName}
          </p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss check-in nudge"
            style={{ background: "none", border: "none", color: "var(--clay, var(--color-stone))", opacity: 0.6, fontSize: 18, lineHeight: 1, cursor: "pointer", padding: 4, flexShrink: 0 }}
          >
            ×
          </button>
        )}
      </div>

      <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay, var(--color-stone))", margin: "0 0 12px", lineHeight: 1.55, opacity: 0.85 }}>
        How did your skin respond this week?
      </p>

      {/* Response grid: 2x2. Uniform ivory-card treatment for every
          button — the label text carries the meaning, not the color. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        {RESPONSES.map(r => {
          const isSelected = picked === r.key;
          return (
            <button
              key={r.key}
              onClick={() => setPicked(r.key)}
              style={{
                padding: "10px 8px",
                background: BUTTON_STYLE.base.background,
                border: isSelected ? BUTTON_STYLE.selected.border : BUTTON_STYLE.base.border,
                borderRadius: 10,
                fontFamily: "var(--font-body)",
                fontSize: 10,
                fontWeight: 400,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: BUTTON_STYLE.base.color,
                cursor: "pointer",
                transition: "border-color 0.18s",
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.border = BUTTON_STYLE.hover.border; }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.border = BUTTON_STYLE.base.border; }}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {/* Optional note — only appears after a state is picked, so the
          empty state stays visually calm. */}
      {picked && (
        <>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value.slice(0, 500))}
            placeholder="Optional note — anything you want to remember about this week."
            rows={2}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "8px 10px",
              background: "rgba(250,249,244,0.06)",
              border: "1px solid rgba(45,61,43,0.20)",
              borderRadius: 8,
              fontFamily: "var(--font-body)",
              fontSize: 12,
              color: "var(--parchment, var(--color-ivory))",
              resize: "none",
              outline: "none",
              marginBottom: 10,
            }}
          />
          <button
            onClick={submit}
            disabled={saving}
            style={{
              width: "100%",
              padding: "10px 0",
              background: "rgba(45,61,43,0.12)",
              border: "1px solid rgba(45,61,43,0.35)",
              borderRadius: 10,
              fontFamily: "var(--font-body)",
              fontSize: 10,
              fontWeight: 400,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--sage, #2d3d2b)",
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.6 : 1,
              transition: "all 0.18s",
            }}
            onMouseEnter={e => { if (!saving) e.currentTarget.style.background = "rgba(45,61,43,0.2)"; }}
            onMouseLeave={e => { if (!saving) e.currentTarget.style.background = "rgba(45,61,43,0.12)"; }}
          >
            {saving ? "Saving…" : "Save check-in"}
          </button>
        </>
      )}
    </div>
  );
}
