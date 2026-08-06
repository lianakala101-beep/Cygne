// Weekly check-in nudge for a product on Introduce Slowly.
//
// Rendered inline above its matching IntroduceSlowlyCard whenever
// getRampWeek(product) > (product.lastCheckinWeek ?? 0) — i.e. the
// user has entered a new ramp week but hasn't logged a reaction yet.
// Four quick-tap response states plus a short optional note, then
// dismisses on submit (the parent bumps lastCheckinWeek so the nudge
// stops firing until the next 7-day boundary).
//
// Save flow — split into two callbacks so the card can hold a visible
// success/error state before the parent unmounts it:
//   onSave(state, note) → Promise<void>
//     Does the Supabase insert. Throws on failure. Does NOT touch
//     lastCheckinWeek — that's the parent's decision after the card
//     signals it's done displaying success.
//   onDone()
//     Called only after a successful save + brief success flash.
//     Parent bumps lastCheckinWeek, which cascades an unmount of
//     the card. Without this split the parent's setProducts would
//     race the card's setSaved and the checkmark would never paint.
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

// How long the success checkmark stays visible before we call onDone
// and let the parent unmount us. Short enough that a fast user isn't
// blocked from continuing, long enough to actually paint + read.
const SUCCESS_HOLD_MS = 900;

export function RampCheckinCard({ productName, weekNumber, onSave, onDone, onDismiss }) {
  const [picked, setPicked] = useState(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("idle"); // "idle" | "saving" | "saved" | "error"
  const [errorMsg, setErrorMsg] = useState(null);

  const saving = status === "saving";
  const saved  = status === "saved";

  const submit = async () => {
    // Guard against double-submission from a fast double-tap or a
    // stale click after the button was already disabled.
    if (!picked || saving || saved) return;
    setStatus("saving");
    setErrorMsg(null);
    try {
      await onSave(picked, note.trim() || null);
      // Success: paint the checkmark, hold briefly, then signal the
      // parent to unmount us. The hold is required because the
      // parent's state update would race the checkmark render if we
      // called onDone immediately.
      setStatus("saved");
      await new Promise(r => setTimeout(r, SUCCESS_HOLD_MS));
      onDone?.();
    } catch (e) {
      setStatus("error");
      setErrorMsg(e?.message || "Couldn't save your check-in. Please try again.");
    }
  };

  // Small right-side glyph used inside the primary button. Kept as a
  // tiny inline SVG rather than another Icon import — this component
  // already avoids external icon deps to keep its render self-contained.
  const CheckGlyph = () => (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" style={{ display: "inline-block", verticalAlign: "middle", marginLeft: 6 }}>
      <path d="M2 7.5 L5.5 11 L12 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  // Save-button label + text swap for each status. Loading text
  // deliberately uses an ellipsis so screen-readers announce it as
  // in-progress work.
  const buttonLabel =
    saving ? "Saving…" :
    saved  ? "Saved" :
    status === "error" ? "Try again" :
    "Save check-in";

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
        {onDismiss && !saving && !saved && (
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
          button — the label text carries the meaning, not the color.
          Buttons disable during saving/saved so the selection can't
          shift while a submit is in flight or already succeeded. */}
      <div
        aria-disabled={saving || saved}
        style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12,
          opacity: (saving || saved) ? 0.55 : 1,
          pointerEvents: (saving || saved) ? "none" : "auto",
          transition: "opacity 0.18s",
        }}
      >
        {RESPONSES.map(r => {
          const isSelected = picked === r.key;
          return (
            <button
              key={r.key}
              onClick={() => setPicked(r.key)}
              disabled={saving || saved}
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
                cursor: (saving || saved) ? "default" : "pointer",
                transition: "border-color 0.18s",
              }}
              onMouseEnter={e => { if (!isSelected && !saving && !saved) e.currentTarget.style.border = BUTTON_STYLE.hover.border; }}
              onMouseLeave={e => { if (!isSelected && !saving && !saved) e.currentTarget.style.border = BUTTON_STYLE.base.border; }}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {/* Optional note + Save/Retry button. The whole block only
          appears once a state is picked so the empty card stays calm.
          Textarea locks during saving/saved to match the pill grid. */}
      {picked && (
        <>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value.slice(0, 500))}
            placeholder="Optional note — anything you want to remember about this week."
            rows={2}
            disabled={saving || saved}
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
              opacity: (saving || saved) ? 0.55 : 1,
              transition: "opacity 0.18s",
            }}
          />

          {/* Error message — only present in error status. Warm-clay
              tone rather than a red alert so it reads as a gentle
              retry-prompt in keeping with the rest of the surface. */}
          {status === "error" && errorMsg && (
            <p
              role="alert"
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 11,
                color: "#8b7355",
                margin: "0 0 10px",
                lineHeight: 1.5,
                letterSpacing: "0.01em",
              }}
            >
              {errorMsg}
            </p>
          )}

          <button
            onClick={submit}
            disabled={saving || saved}
            aria-live="polite"
            style={{
              width: "100%",
              padding: "10px 0",
              // Saved variant strengthens the ivory fill + inky border
              // as the visible confirmation. Loading and idle keep the
              // sage-tinted outlined style already in use elsewhere in
              // the card; error uses the same idle style so "Try again"
              // reads as a normal next action, not an ongoing alert.
              background:
                saved ? "rgba(250, 249, 244, 0.82)" :
                       "rgba(45,61,43,0.12)",
              border:
                saved ? "1px solid rgba(28, 28, 26, 0.70)" :
                       "1px solid rgba(45,61,43,0.35)",
              borderRadius: 10,
              fontFamily: "var(--font-body)",
              fontSize: 10,
              fontWeight: 400,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: saved ? "#1c1c1a" : "var(--sage, #2d3d2b)",
              cursor: (saving || saved) ? "default" : "pointer",
              opacity: saving ? 0.7 : 1,
              transition: "background 0.18s, border-color 0.18s, color 0.18s, opacity 0.18s",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
            onMouseEnter={e => { if (!saving && !saved) e.currentTarget.style.background = "rgba(45,61,43,0.2)"; }}
            onMouseLeave={e => { if (!saving && !saved) e.currentTarget.style.background = "rgba(45,61,43,0.12)"; }}
          >
            {buttonLabel}
            {saved && <CheckGlyph />}
          </button>
        </>
      )}
    </div>
  );
}
