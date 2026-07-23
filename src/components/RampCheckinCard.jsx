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
  { key: "no_reaction",     label: "No reaction",     tone: "sage"  },
  { key: "loving_it",       label: "Loving it",       tone: "sage"  },
  { key: "mild_irritation", label: "Mild irritation", tone: "amber" },
  { key: "breakout",        label: "Breakout",        tone: "amber" },
];

// Border + background palette per tone, matching the on-track / back-off
// pair inside IntroduceSlowlyCard so the visual language is consistent.
const TONE_STYLES = {
  sage: {
    bg:            "rgba(45,61,43,0.10)",
    bgHover:       "rgba(45,61,43,0.18)",
    bgSelected:    "rgba(45,61,43,0.24)",
    border:        "rgba(45,61,43,0.28)",
    borderSelect:  "rgba(45,61,43,0.75)",
    color:         "var(--sage, #2d3d2b)",
  },
  amber: {
    bg:            "rgba(139,115,85,0.08)",
    bgHover:       "rgba(139,115,85,0.16)",
    bgSelected:    "rgba(139,115,85,0.24)",
    border:        "rgba(139,115,85,0.22)",
    borderSelect:  "rgba(139,115,85,0.75)",
    color:         "#8b7355",
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

      {/* Response grid: 2x2 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        {RESPONSES.map(r => {
          const tone = TONE_STYLES[r.tone];
          const isSelected = picked === r.key;
          return (
            <button
              key={r.key}
              onClick={() => setPicked(r.key)}
              style={{
                padding: "10px 8px",
                background: isSelected ? tone.bgSelected : tone.bg,
                border: `1px solid ${isSelected ? tone.borderSelect : tone.border}`,
                borderRadius: 10,
                fontFamily: "var(--font-body)",
                fontSize: 10,
                fontWeight: 400,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                color: tone.color,
                cursor: "pointer",
                transition: "all 0.18s",
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = tone.bgHover; }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = tone.bg; }}
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
