// Skin-goal tracker rendered inside the Monthly Recap overlay.
//
// Only mounts when the user has ≥1 active row in the `skin_goals`
// table. Zero active = section returns null entirely — no forced
// minimum, no "pick a goal" nag. That's an explicit product call:
// the recap should reward existing intent, not chase it.
//
// Distinct from user.skinProfile.skinGoals — that aspirational
// Title-Case array on user_metadata is untouched, keeps feeding the
// intelligence engine and LLM prompts. This surface is the clinical
// "what am I working on this month" tracker (snake_case values from
// a fixed check-constrained set on the skin_goals table).
//
// All writes are async handlers passed in from App.jsx →
// Dashboard → MonthlyRecap → here, matching the recordRampCheckin
// convention. On success the parent updates state and this
// component re-renders with the new list.

import { useState } from "react";

const IVORY = "var(--color-ivory, #faf9f4)";

// Fixed catalog. Values MUST match the CHECK constraint on
// skin_goals.goal (see 20260724020000_create_skin_goals_table.sql).
// Labels are for display only.
const GOAL_CATALOG = [
  { value: "plump_skin",       label: "Plump skin"       },
  { value: "even_tone",        label: "Even tone"        },
  { value: "reduce_texture",   label: "Reduce texture"   },
  { value: "reduce_breakouts", label: "Reduce breakouts" },
  { value: "reduce_pores",     label: "Reduce pores"     },
  { value: "hydration",        label: "Hydration"        },
];

function labelFor(value) {
  return GOAL_CATALOG.find((g) => g.value === value)?.label ?? value;
}

export function SkinGoalsSection({
  goals = [],
  onMarkMet,
  onRemove,
  onAdd,
}) {
  const [busy, setBusy] = useState(null); // goal id or "add:<value>" while its handler is in flight
  const [showAdder, setShowAdder] = useState(false);

  const activeGoals = goals.filter((g) => g.status === "active");
  // Skip the entire section when the user has no active tracker
  // goals. This is the "no forced minimum" branch — the recap should
  // read cleanly without ever nagging them into picking one.
  if (activeGoals.length === 0) return null;

  const activeValues = new Set(activeGoals.map((g) => g.goal));
  const remainingCatalog = GOAL_CATALOG.filter((g) => !activeValues.has(g.value));

  const withBusy = async (key, fn) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ margin: "0 auto 40px", textAlign: "left", maxWidth: 420 }}>
      {/* Section header — mirrors the recap's uppercase-tracked
          treatments so this reads as another editorial beat, not a
          UI panel dropped in. */}
      <p style={{
        fontFamily: "var(--font-display)",
        fontSize: 11, fontWeight: 700, letterSpacing: "0.15em",
        textTransform: "uppercase", color: IVORY,
        margin: "0 0 6px", textAlign: "center", opacity: 0.85,
      }}>
        Your Skin Goals
      </p>
      <p style={{
        fontFamily: "var(--font-body)",
        fontSize: 13, fontWeight: 400, lineHeight: 1.6,
        color: "rgba(255,255,255,0.7)",
        margin: "0 0 22px", textAlign: "center",
      }}>
        Do you feel your skin goals have been met this month?
      </p>

      {/* One row per active goal — label on the left, met + remove on
          the right. Small × doubles as the "deprioritize" affordance
          the spec calls out. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {activeGoals.map((g) => (
          <div
            key={g.id}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 14px",
              background: "rgba(250,249,244,0.06)",
              border: "1px solid rgba(250,249,244,0.18)",
              borderRadius: 10,
            }}
          >
            <span style={{
              fontFamily: "var(--font-body)", fontSize: 14,
              color: IVORY, flex: 1, minWidth: 0,
            }}>
              {labelFor(g.goal)}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => withBusy(g.id, () => onMarkMet?.(g.id))}
                disabled={busy != null}
                style={{
                  padding: "6px 12px",
                  background: "transparent",
                  border: "1px solid rgba(250,249,244,0.6)",
                  borderRadius: 999,
                  fontFamily: "var(--font-body)",
                  fontSize: 9, fontWeight: 400, letterSpacing: "0.14em",
                  textTransform: "uppercase", color: IVORY,
                  cursor: busy != null ? "default" : "pointer",
                  opacity: busy === g.id ? 0.5 : 1,
                  transition: "background 0.18s",
                }}
                onMouseEnter={(e) => { if (busy == null) e.currentTarget.style.background = "rgba(250,249,244,0.12)"; }}
                onMouseLeave={(e) => { if (busy == null) e.currentTarget.style.background = "transparent"; }}
              >
                {busy === g.id ? "Saving…" : "Met"}
              </button>
              <button
                onClick={() => withBusy(g.id, () => onRemove?.(g.id))}
                disabled={busy != null}
                aria-label={`Remove ${labelFor(g.goal)}`}
                style={{
                  background: "none", border: "none",
                  color: "rgba(255,255,255,0.45)",
                  cursor: busy != null ? "default" : "pointer",
                  fontSize: 18, lineHeight: 1, padding: 4,
                }}
              >×</button>
            </div>
          </div>
        ))}
      </div>

      {/* Add affordance — subtle "+ another" toggle that reveals the
          remaining catalog as tappable chips. Hidden when the user
          already has every catalog option active. */}
      {remainingCatalog.length > 0 && (
        <div style={{ marginTop: 18, textAlign: "center" }}>
          {!showAdder ? (
            <button
              onClick={() => setShowAdder(true)}
              style={{
                background: "none", border: "none",
                fontFamily: "var(--font-body)",
                fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase",
                color: "rgba(255,255,255,0.55)",
                cursor: "pointer", padding: "4px 8px",
              }}
            >
              + Add another
            </button>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
              {remainingCatalog.map((opt) => {
                const key = `add:${opt.value}`;
                const active = busy === key;
                return (
                  <button
                    key={opt.value}
                    onClick={() => withBusy(key, async () => {
                      await onAdd?.(opt.value);
                      setShowAdder(false);
                    })}
                    disabled={busy != null}
                    style={{
                      padding: "6px 12px",
                      background: active ? "rgba(250,249,244,0.18)" : "rgba(250,249,244,0.06)",
                      border: "1px solid rgba(250,249,244,0.24)",
                      borderRadius: 999,
                      fontFamily: "var(--font-body)",
                      fontSize: 11, color: IVORY,
                      cursor: busy != null ? "default" : "pointer",
                      opacity: busy != null && !active ? 0.5 : 1,
                    }}
                  >
                    {active ? "Adding…" : opt.label}
                  </button>
                );
              })}
              <button
                onClick={() => setShowAdder(false)}
                disabled={busy != null}
                style={{
                  background: "none", border: "none",
                  color: "rgba(255,255,255,0.4)",
                  fontFamily: "var(--font-body)", fontSize: 11,
                  letterSpacing: "0.14em", textTransform: "uppercase",
                  cursor: busy != null ? "default" : "pointer", padding: "6px 8px",
                }}
              >Cancel</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
