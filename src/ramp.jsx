import { useState } from "react";
import { Icon } from "./components.jsx";
import { detectActives } from "./engine.js";
import { daysBetweenLocal } from "./utils.jsx";


const RAMP_SCHEDULES = {
  retinol: {
    label: "Retinol",
    color: "#8b7355",
    colorBg: "rgba(139,115,85,0.08)",
    colorBorder: "rgba(139,115,85,0.22)",
    phases: [
      {
        name: "Patch",
        weeks: [1],
        frequency: "1× this week",
        instruction: "Apply a small amount to your jawline or behind one ear for 2 nights. Watch for redness, stinging, or flaking.",
        onTrack: "No reaction — you're clear to begin.",
        backOff: "Redness or burning — wait another week before starting.",
      },
      {
        name: "Introduce",
        weeks: [2, 3, 4],
        frequency: "1–2× per week",
        instruction: "Apply every 3–4 days on clean, dry skin. Use a gentle moisturizer after.",
        onTrack: "Mild dryness or flaking is normal. Stay the course.",
        backOff: "Stinging or peeling — drop back to once a week for two more weeks.",
      },
      {
        name: "Build",
        weeks: [5, 6, 7, 8],
        frequency: "3× per week",
        instruction: "Increase to every other day. Avoid mixing with AHA/BHA on the same night.",
        onTrack: "Skin is tolerating well. Texture improvement starts around now.",
        backOff: "Persistent irritation — return to Introduce phase for 2 weeks.",
      },
      {
        name: "Maintain",
        weeks: [9, 10, 11, 12],
        frequency: "4–5× per week",
        instruction: "Evening use most nights. You can now layer with hyaluronic acid underneath.",
        onTrack: "Full tolerance reached. Compounding benefits continue for months.",
        backOff: "If skin flares with weather changes, back off to 3× and hold.",
      },
    ],
  },
  AHA: {
    label: "AHA Exfoliant",
    color: "#8b7355",
    colorBg: "rgba(139,115,85,0.08)",
    colorBorder: "rgba(139,115,85,0.22)",
    phases: [
      {
        name: "Patch",
        weeks: [1],
        frequency: "1× this week",
        instruction: "Apply to your jawline or behind one ear for one night. AHAs can cause stinging — check your baseline before going all over.",
        onTrack: "No reaction — proceed to introduce.",
        backOff: "Burning beyond a mild tingle — try a lower-concentration formula first.",
      },
      {
        name: "Introduce",
        weeks: [2, 3, 4],
        frequency: "1× per week",
        instruction: "Use once weekly in the evening. Rinse off if it's a leave-on and your skin is new to acids.",
        onTrack: "Smooth texture after 2–3 days. Some flaking is normal.",
        backOff: "Redness lasting more than a day — wait another week and try again.",
      },
      {
        name: "Build",
        weeks: [5, 6, 7, 8],
        frequency: "2× per week",
        instruction: "Space at least 3 days apart. Do not layer with retinol on the same night.",
        onTrack: "Brighter skin, smoother texture. You're building a rhythm.",
        backOff: "Sensitivity increasing — hold at 1× per week for two more weeks.",
      },
      {
        name: "Maintain",
        weeks: [9, 10, 11, 12],
        frequency: "2–3× per week",
        instruction: "Consistent exfoliation at this frequency drives sustained results. SPF is non-negotiable.",
        onTrack: "Texture and tone should show clear improvement by now.",
        backOff: "Reduce frequency in summer or when using other active treatments.",
      },
    ],
  },
  BHA: {
    label: "BHA Exfoliant",
    // Moss accent instead of ivory — the ivory value was invisible on
    // the ivory Progress band. Moss reads on both surfaces (dark green
    // on ivory, dark green on the dark-canvas card's ivory-tinted wash).
    color: "#2d3d2b",
    colorBg: "rgba(45,61,43,0.06)",
    colorBorder: "rgba(45,61,43,0.22)",
    phases: [
      {
        name: "Patch",
        weeks: [1],
        frequency: "1× this week",
        instruction: "Apply a small amount to your chin or jaw for one night. BHA is generally well-tolerated.",
        onTrack: "No reaction — begin introducing.",
        backOff: "Unusual dryness or peeling — hold another week.",
      },
      {
        name: "Introduce",
        weeks: [2, 3, 4],
        frequency: "2× per week",
        instruction: "Apply on cleansed skin, let it absorb before moisturizer. Great for congestion and pores.",
        onTrack: "Blackheads loosening, pores looking smaller — it's working.",
        backOff: "Over-drying — reduce to once weekly and add more moisturizer.",
      },
      {
        name: "Build",
        weeks: [5, 6, 7, 8],
        frequency: "3–4× per week",
        instruction: "Can increase to every other day if skin is tolerating well. Don't mix with AHA same night.",
        onTrack: "Skin staying clear. This is the maintenance sweet spot for most people.",
        backOff: "Dryness or breakout flare — ease back to 2× and hold.",
      },
      {
        name: "Maintain",
        weeks: [9, 10, 11, 12],
        frequency: "Daily or as needed",
        instruction: "Some people use BHA daily long-term. Read your skin week to week.",
        onTrack: "Pores, clarity, and texture should be noticeably improved.",
        backOff: "Reduce in winter or if barrier feels compromised.",
      },
    ],
  },
  "vitamin C": {
    label: "Vitamin C",
    color: "#8b7355",
    colorBg: "rgba(139,115,85,0.06)",
    colorBorder: "rgba(139,115,85,0.18)",
    phases: [
      {
        name: "Patch",
        weeks: [1],
        frequency: "1× this week",
        instruction: "Apply a few drops to your jawline for two mornings. Vitamin C oxidises quickly — if it stings or turns skin orange, the formula has degraded.",
        onTrack: "No reaction — proceed. Apply in the morning before SPF.",
        backOff: "Stinging or redness — try a lower percentage (5–10%) first.",
      },
      {
        name: "Introduce",
        weeks: [2, 3, 4],
        frequency: "Every other morning",
        instruction: "Apply after cleansing, before moisturizer. Always follow with SPF — Vitamin C amplifies photosensitivity.",
        onTrack: "Skin looks brighter after 2–3 weeks. That's the antioxidant working.",
        backOff: "Tingling beyond the first minute — dilute with moisturizer until tolerance builds.",
      },
      {
        name: "Build",
        weeks: [5, 6, 7, 8],
        frequency: "Every morning",
        instruction: "Daily morning use. Store in a cool, dark place to prevent oxidation.",
        onTrack: "Pigmentation fading, overall tone evening out.",
        backOff: "If you're using retinol at night, space by at least 8 hours.",
      },
      {
        name: "Maintain",
        weeks: [9, 10, 11, 12],
        frequency: "Daily — morning routine",
        instruction: "Vitamin C is a long-term investment. Results compound over months, not days.",
        onTrack: "Sustained brightness and antioxidant protection. Don't skip SPF.",
        backOff: "If the formula has oxidised (turned orange/brown), replace it.",
      },
    ],
  },
  "toning pad": {
    label: "Toning Pad (BHA/AHA)",
    color: "#8b7355",
    colorBg: "rgba(139,115,85,0.08)",
    colorBorder: "rgba(139,115,85,0.22)",
    phases: [
      { name: "Patch", weeks: [1], frequency: "Patch test first", instruction: "Apply to your jawline or cheek for 2 nights before using all over. Daily-dose actives are gentler but still worth checking.", onTrack: "No reaction — you're clear to start daily use.", backOff: "Any irritation — give skin 3 days rest before trying again." },
      { name: "Introduce", weeks: [2, 3], frequency: "Daily — PM only", instruction: "Use once daily in the evening. Apply after cleansing, before serum. BHA pads can be used AM too once tolerated.", onTrack: "Skin feels smooth, no flaking or redness.", backOff: "Stinging or peeling — drop to every other night for a week." },
      { name: "Build", weeks: [4, 5, 6], frequency: "Daily — AM + PM", instruction: "If BHA, you can now use AM and PM. If AHA, keep to PM. Let the pad sit for 30–60 seconds before next step.", onTrack: "Pores look refined, texture improving.", backOff: "Any sensitivity flare — return to PM only for a week." },
      { name: "Maintain", weeks: [7], frequency: "Daily as tolerated", instruction: "This is your long-term rhythm. BHA pads work best as a consistent daily habit rather than spot treatment.", onTrack: "Consistent use is the goal — no need to push further.", backOff: "If skin feels stripped, add a hydrating toner after the pad." },
    ],
  }
};

const RAMP_ACTIVES = ["retinol", "AHA", "BHA", "vitamin C"];

function getRampPhase(schedule, week) {
  for (const phase of schedule.phases) {
    if (phase.weeks.includes(week)) return phase;
  }
  return schedule.phases[schedule.phases.length - 1]; // Maintain forever
}

// Compute the current Introduce Slowly week from the product's
// routineStartDate. Week 1 starts on the start date; each subsequent week
// begins exactly 7 local days later. Falls back to stored rampWeek only
// when no start date is set.
function getRampWeek(product) {
  if (!product) return 1;
  if (product.routineStartDate) {
    const days = daysBetweenLocal(product.routineStartDate);
    return Math.max(1, Math.floor(days / 7) + 1);
  }
  return product.rampWeek || 1;
}

function formatStartedLabel(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return `Started ${dt.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`;
}

// Introduce Slowly card — combined routine info + weekly check-in in
// one card per product. Was previously two stacked cards (RampCheckinCard
// on top, IntroduceSlowlyCard below). The check-in state + submit flow
// is folded in here; RampCheckinCard the component is kept for the
// push-notification deep-link modal but no longer rendered on the
// Progress screen.
//
// Visual base is the moss-tinted RampCheckinCard treatment
// (rgba(45,61,43,0.06) bg + 22% moss border, 14px radius) — chosen
// over the schedule's warm-tan tint so every ramp card looks the same
// regardless of ingredient. Ingredient identity still comes through
// via the category chip and the phase-dot color.
const RESPONSE_OPTIONS = [
  { key: "no_reaction",     label: "No reaction"     },
  { key: "loving_it",       label: "Loving it"       },
  { key: "mild_irritation", label: "Mild irritation" },
  { key: "breakout",        label: "Breakout"        },
];

const CHECKIN_SUCCESS_HOLD_MS = 900;

function IntroduceSlowlyCard({
  product,
  schedule,
  weekNumber: weekNumberProp,
  onResetStart,
  checkinDue = false,
  onCheckinSave,
  onCheckinDone,
  isLast = false,
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pickedDate, setPickedDate] = useState("");
  // Check-in local state (was in the separate RampCheckinCard before the
  // two cards were combined). Reset to idle after a successful save so
  // next week's check-in starts fresh.
  const [picked, setPicked] = useState(null);
  const [note, setNote] = useState("");
  const [checkinStatus, setCheckinStatus] = useState("idle"); // "idle" | "saving" | "saved" | "error"
  const [checkinError, setCheckinError] = useState(null);

  const weekNumber = weekNumberProp ?? getRampWeek(product);
  const phase = getRampPhase(schedule, weekNumber);
  const phaseIndex = schedule.phases.findIndex(p => p.weeks.includes(Math.min(weekNumber, 12)));
  const isHeld = product.rampHeld === true;
  const clampedPhaseIndex = Math.min(phaseIndex, schedule.phases.length - 1);
  const startedLabel = formatStartedLabel(product.routineStartDate);
  const maxWeek = Math.max(...schedule.phases[schedule.phases.length - 1].weeks);

  const saving = checkinStatus === "saving";
  const saved  = checkinStatus === "saved";
  const weekPad = String(weekNumber).padStart(2, "0");
  const showCheckin = checkinDue;

  const submitCheckin = async () => {
    if (!picked || saving || saved) return;
    setCheckinStatus("saving");
    setCheckinError(null);
    try {
      await onCheckinSave?.(picked, note.trim() || null);
      setCheckinStatus("saved");
      await new Promise(r => setTimeout(r, CHECKIN_SUCCESS_HOLD_MS));
      onCheckinDone?.();
      // Local reset so when this week's checkinDue flips to false and a
      // future week re-enables it, the pill grid starts empty again.
      setPicked(null);
      setNote("");
      setCheckinStatus("idle");
    } catch (e) {
      setCheckinStatus("error");
      setCheckinError(e?.message || "Couldn't save your check-in. Please try again.");
    }
  };

  return (
    // Editorial flat container — no border/bg/radius. Each product reads
    // as its own section separated from neighbours by hair rules.
    // Matches the dashboard's editorial line-item treatment inverted for
    // the ivory band.
    <div style={{
      padding: "16px 0",
      borderTop: "1px solid rgba(28,28,26,0.25)",
      borderBottom: isLast ? "1px solid rgba(28,28,26,0.25)" : "none",
    }}>
      {/* Header row: WK badge (when check-in due) + expand chevron */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
          {showCheckin ? (
            <>
              <span style={{
                display: "inline-flex", alignItems: "center",
                padding: "3px 10px",
                border: "1px solid rgba(45,61,43,0.42)",
                borderRadius: 999,
                fontFamily: "var(--font-display)",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.22em",
                color: "var(--sage, #2d3d2b)",
                whiteSpace: "nowrap", lineHeight: 1,
              }}>( WK {weekPad} )</span>
              <span style={{
                fontFamily: "var(--font-display)", fontSize: 9, fontWeight: 700,
                letterSpacing: "0.20em", textTransform: "uppercase",
                color: "var(--sage, #2d3d2b)", opacity: 0.75,
              }}>Check-in</span>
            </>
          ) : (
            <span style={{
              fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 400,
              letterSpacing: "0.14em", textTransform: "uppercase",
              color: schedule.color, background: `${schedule.color}18`,
              padding: "2px 8px", borderRadius: 20,
              whiteSpace: "nowrap",
            }}>{schedule.label}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          aria-expanded={expanded}
          aria-label={expanded ? "Hide phase details" : "Show phase details"}
          style={{
            background: "none", border: "none", padding: 4, cursor: "pointer",
            color: "var(--clay)", opacity: 0.65,
            transform: expanded ? "rotate(90deg)" : "none",
            transition: "transform 0.2s, opacity 0.2s",
            display: "inline-flex", flexShrink: 0,
            WebkitAppearance: "none", appearance: "none",
            WebkitTapHighlightColor: "transparent",
          }}>
          <Icon name="chevron" size={13} />
        </button>
      </div>

      {/* Product name — visual anchor */}
      <p style={{
        fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 400,
        color: "var(--parchment)", margin: "0 0 8px",
        lineHeight: 1.35,
      }}>{product.name}</p>

      {/* Routine metadata */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        {showCheckin && (
          <span style={{
            fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 400,
            letterSpacing: "0.14em", textTransform: "uppercase",
            color: schedule.color, background: `${schedule.color}18`,
            padding: "2px 8px", borderRadius: 20,
          }}>{schedule.label}</span>
        )}
        <span style={{
          fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: isHeld ? "#8b7355" : "var(--clay)", opacity: 0.85,
        }}>Week {weekNumber} of {maxWeek} · {isHeld ? "Holding" : phase.name}</span>
      </div>

      <p style={{
        fontFamily: "var(--font-body)", fontSize: 11, color: schedule.color,
        margin: 0, letterSpacing: "0.04em",
      }}>{phase.frequency}</p>
      {startedLabel && (
        <p style={{
          fontFamily: "var(--font-body)", fontSize: 10, color: "var(--clay)",
          margin: "3px 0 0", opacity: 0.7, letterSpacing: "0.04em",
        }}>{startedLabel}</p>
      )}

      {/* Phase progress dots — small horizontal strip, one per phase */}
      <div style={{ display: "flex", gap: 5, marginTop: 12 }}>
        {schedule.phases.map((p, i) => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: "50%",
            background: i <= clampedPhaseIndex ? schedule.color : "var(--border)",
            transition: "background 0.3s",
          }} />
        ))}
      </div>

      {/* Held indicator — inline italic caption; no bordered chip so it
          reads as running commentary on the ivory band. */}
      {isHeld && (
        <p style={{
          fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 400,
          fontStyle: "italic",
          color: "#8b7355", margin: "12px 0 0",
          letterSpacing: "0.02em",
        }}>
          Paused — repeat this week
        </p>
      )}

      {/* Check-in section — inline when a new ramp week is due */}
      {showCheckin && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(28,28,26,0.18)" }}>
          <p style={{
            fontFamily: "var(--font-body)", fontSize: 11,
            color: "var(--clay, var(--color-stone))", margin: "0 0 12px",
            lineHeight: 1.55, opacity: 0.85,
          }}>How did your skin respond this week?</p>

          {/* Response grid — same ivory-pill treatment used by the
              standalone RampCheckinCard so the modal + inline check-ins
              stay visually consistent. */}
          <div
            aria-disabled={saving || saved}
            style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12,
              opacity: (saving || saved) ? 0.55 : 1,
              pointerEvents: (saving || saved) ? "none" : "auto",
              transition: "opacity 0.18s",
            }}
          >
            {RESPONSE_OPTIONS.map(r => {
              const isSelected = picked === r.key;
              return (
                <button
                  key={r.key}
                  onClick={() => setPicked(r.key)}
                  disabled={saving || saved}
                  style={{
                    padding: "10px 8px",
                    background: "rgba(250, 249, 244, 0.82)",
                    border: isSelected
                      ? "1px solid rgba(28, 28, 26, 0.70)"
                      : "1px solid rgba(28, 28, 26, 0.18)",
                    borderRadius: 10,
                    fontFamily: "var(--font-body)",
                    fontSize: 10, fontWeight: 400,
                    letterSpacing: "0.14em", textTransform: "uppercase",
                    color: "#1c1c1a",
                    cursor: (saving || saved) ? "default" : "pointer",
                    transition: "border-color 0.18s",
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>

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

              {checkinStatus === "error" && checkinError && (
                <p role="alert" style={{
                  fontFamily: "var(--font-body)", fontSize: 11, color: "#8b7355",
                  margin: "0 0 10px", lineHeight: 1.5, letterSpacing: "0.01em",
                }}>{checkinError}</p>
              )}

              <button
                onClick={submitCheckin}
                disabled={saving || saved}
                aria-live="polite"
                style={{
                  width: "100%",
                  padding: "10px 0",
                  background: saved ? "rgba(250, 249, 244, 0.82)" : "rgba(45,61,43,0.12)",
                  border: saved ? "1px solid rgba(28, 28, 26, 0.70)" : "1px solid rgba(45,61,43,0.35)",
                  borderRadius: 10,
                  fontFamily: "var(--font-body)",
                  fontSize: 10, fontWeight: 400,
                  letterSpacing: "0.12em", textTransform: "uppercase",
                  color: saved ? "#1c1c1a" : "var(--sage, #2d3d2b)",
                  cursor: (saving || saved) ? "default" : "pointer",
                  opacity: saving ? 0.7 : 1,
                  transition: "background 0.18s, border-color 0.18s, color 0.18s, opacity 0.18s",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {saving ? "Saving…" : saved ? "Saved" : checkinStatus === "error" ? "Try again" : "Save check-in"}
                {saved && (
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" style={{ display: "inline-block", verticalAlign: "middle", marginLeft: 6 }}>
                    <path d="M2 7.5 L5.5 11 L12 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </>
          )}
        </div>
      )}

      {/* Expanded phase detail — chevron-toggled, so the always-visible
          card stays compact until the user opts in. */}
      {expanded && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(28,28,26,0.18)" }}>
          <p style={{
            fontFamily: "var(--font-body)", fontSize: 12,
            color: "var(--clay)", margin: "0 0 14px", lineHeight: 1.7,
          }}>{phase.instruction}</p>

          {/* On track / Back off — informational; flat two-column with
              colored eyebrow, no bordered box on the ivory band. */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 400, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--sage)", margin: "0 0 4px" }}>On track</p>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: 0, lineHeight: 1.55 }}>{phase.onTrack}</p>
            </div>
            <div>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 400, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8b7355", margin: "0 0 4px" }}>Back off</p>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: 0, lineHeight: 1.55 }}>{phase.backOff}</p>
            </div>
          </div>

          {/* Reset start date — pick any past date */}
          <div style={{ paddingTop: 12, borderTop: "1px dashed var(--border)" }}>
            {confirmReset ? (
              <div>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--clay)", margin: "0 0 8px", opacity: 0.8 }}>Pick the date you actually started this product — the week will recalculate from there.</p>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <input
                    type="date"
                    value={pickedDate}
                    max={(() => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; })()}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setPickedDate(e.target.value)}
                    style={{ flex: 1, minWidth: 140, padding: "7px 10px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "var(--font-body)", fontSize: 11, color: "var(--parchment)", cursor: "pointer" }}
                  />
                  <button
                    disabled={!pickedDate}
                    onClick={(e) => { e.stopPropagation(); if (!pickedDate) return; onResetStart?.(product.id, pickedDate); setConfirmReset(false); setPickedDate(""); }}
                    style={{ padding: "6px 12px", background: pickedDate ? "rgba(139,115,85,0.12)" : "transparent", border: `1px solid ${pickedDate ? "rgba(139,115,85,0.35)" : "var(--border)"}`, borderRadius: 8, fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 400, letterSpacing: "0.1em", textTransform: "uppercase", color: pickedDate ? "#8b7355" : "var(--clay)", cursor: pickedDate ? "pointer" : "not-allowed", opacity: pickedDate ? 1 : 0.5 }}>
                    Save
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setConfirmReset(false); setPickedDate(""); }}
                    style={{ padding: "6px 12px", background: "transparent", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clay)", cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={(e) => { e.stopPropagation(); setConfirmReset(true); }}
                style={{ background: "none", border: "none", padding: 0, fontFamily: "var(--font-body)", fontSize: 10, color: "var(--clay)", opacity: 0.6, cursor: "pointer", letterSpacing: "0.06em", textDecoration: "underline" }}>
                Reset start date
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- WEEKLY RITUAL CALENDAR --------------------------------------------------

function WeeklyRitualCalendar({ rampProducts, products }) {
  const [selectedDay, setSelectedDay] = useState(null);
  const today = new Date();
  const todayIndex = today.getDay(); // 0=Sun,1=Mon,...6=Sat

  // We show Mon–Sun. Map day label to getDay() value
  const DAYS = [
    { label: "M", full: "Monday",    dow: 1 },
    { label: "T", full: "Tuesday",   dow: 2 },
    { label: "W", full: "Wednesday", dow: 3 },
    { label: "T", full: "Thursday",  dow: 4 },
    { label: "F", full: "Friday",    dow: 5 },
    { label: "S", full: "Saturday",  dow: 6 },
    { label: "S", full: "Sunday",    dow: 0 },
  ];

  // For each ramp product, figure out which days of the week it's scheduled
  // based on frequency + routineStartDate
  const getScheduledDows = (product) => {
    const freq = product.frequency || "daily";
    if (freq === "daily") return [0,1,2,3,4,5,6];
    if (freq === "as-needed") return [];
    if (freq === "weekly") {
      const start = product.routineStartDate ? new Date(product.routineStartDate) : new Date();
      // Find which day of week is the weekly day
      return [start.getDay()];
    }
    if (freq === "alternating") {
      const start = product.routineStartDate ? new Date(product.routineStartDate) : new Date();
      // Walk Mon-Sun and check parity
      const scheduled = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        // go to Monday of current week
        const monday = new Date(today);
        const diffToMon = (today.getDay() + 6) % 7;
        monday.setDate(today.getDate() - diffToMon + i);
        const dayDiff = Math.floor((monday - start) / 86400000);
        if (dayDiff % 2 === 0) scheduled.push(monday.getDay());
      }
      return scheduled;
    }
    if (freq === "2-3x") {
      // Mon, Wed, Fri → dow 1, 3, 5
      return [1, 3, 5];
    }
    return [0,1,2,3,4,5,6];
  };

  // Determine AM vs PM per product
  const getSession = (product) => {
    if (product.session === "am") return "am";
    if (product.session === "pm") return "pm";
    if (product.session === "both") return "both";
    // auto-detect
    const actives = Object.keys(detectActives(product.ingredients || []));
    const hasRetinol = actives.includes("retinol") || actives.includes("bakuchiol");
    const hasAHA = actives.includes("AHA");
    const hasBHA = actives.includes("BHA");
    const hasVitC = actives.includes("vitamin C");
    const hasBenzoyl = actives.includes("benzoyl peroxide");
    const hasPeptides = actives.includes("peptides");
    if (product.category === "SPF") return "am";
    if (hasVitC || hasBenzoyl) return "am";
    if (hasRetinol || hasAHA || hasPeptides) return "pm";
    if (hasBHA) return "pm";
    return "both";
  };

  // Get color for a product (from RAMP_SCHEDULES if available, else sage)
  const getColor = (product) => {
    const activeKey = product.category === "Toning Pad"
      ? "toning pad"
      : RAMP_ACTIVES.find(a => detectActives(product.ingredients || [])[a]);
    return RAMP_SCHEDULES[activeKey]?.color || "var(--sage)";
  };

  // Build per-day product lists { am: [...], pm: [...] }
  const getDayProducts = (dow) => {
    const am = [], pm = [];
    rampProducts.forEach(p => {
      const dows = getScheduledDows(p);
      if (!dows.includes(dow)) return;
      const sess = getSession(p);
      if (sess === "am" || sess === "both") am.push(p);
      if (sess === "pm" || sess === "both") pm.push(p);
    });
    return { am, pm };
  };

  const isToday = (dow) => dow === todayIndex;
  const selectedDayObj = selectedDay !== null ? DAYS[selectedDay] : null;
  const selectedProducts = selectedDayObj ? getDayProducts(selectedDayObj.dow) : null;

  return (
    <div style={{ marginBottom: 28 }}>

      {/* 7-day strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5, marginBottom: 14 }}>
        {DAYS.map((day, i) => {
          const { am, pm } = getDayProducts(day.dow);
          const total = new Set([...am, ...pm]).size;
          const active = isToday(day.dow);
          const selected = selectedDay === i;

          return (
            <button
              key={i}
              onClick={() => setSelectedDay(selected ? null : i)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                padding: "10px 4px 10px",
                background: selected
                  ? "rgba(45,61,43,0.15)"
                  : active
                  ? "rgba(45,61,43,0.07)"
                  : "var(--surface)",
                border: selected
                  ? "1px solid rgba(45,61,43,0.45)"
                  : active
                  ? "1px solid rgba(45,61,43,0.25)"
                  : "1px solid var(--border)",
                borderRadius: 12,
                cursor: "pointer",
                transition: "all 0.15s",
                gap: 7,
              }}>

              {/* Day label */}
              <span style={{
                fontFamily: "var(--font-body)",
                fontSize: 10,
                fontWeight: 400,
                letterSpacing: "0.08em",
                color: active ? "var(--parchment)" : "var(--clay)",
              }}>{day.label}</span>

              {/* AM dots */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3, minHeight: 36, justifyContent: "flex-start", alignItems: "center", width: "100%" }}>
                {am.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3, justifyContent: "center" }}>
                    {am.map((p, j) => (
                      <div key={j} style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: getColor(p),
                        opacity: 0.9,
                      }} />
                    ))}
                  </div>
                )}
                {/* divider */}
                {(am.length > 0 || pm.length > 0) && (
                  <div style={{ width: "60%", height: 1, background: "var(--border)", opacity: 0.6 }} />
                )}
                {pm.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3, justifyContent: "center" }}>
                    {pm.map((p, j) => (
                      <div key={j} style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: getColor(p),
                        opacity: 0.55,
                      }} />
                    ))}
                  </div>
                )}
                {total === 0 && (
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--border)", opacity: 0.4 }} />
                )}
              </div>

              {/* Today pip */}
              {active && (
                <div style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--sage)" }} />
              )}
            </button>
          );
        })}
      </div>

      {/* AM / PM legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: selectedDay !== null ? 16 : 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--clay)", opacity: 0.9 }} />
          <span style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay)", opacity: 0.6 }}>AM</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--clay)", opacity: 0.45 }} />
          <span style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay)", opacity: 0.6 }}>PM</span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: "var(--font-body)", fontSize: 9, color: "var(--clay)", opacity: 0.4, letterSpacing: "0.06em" }}>Tap a day to expand</span>
      </div>

      {/* Expanded day detail */}
      {selectedDay !== null && selectedProducts && (
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          overflow: "hidden",
          marginTop: 4,
        }}>
          <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--border)" }}>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 400, letterSpacing: "0.08em", color: "var(--parchment)", margin: 0 }}>
              {selectedDayObj.full}
            </p>
          </div>

          {selectedProducts.am.length === 0 && selectedProducts.pm.length === 0 ? (
            <div style={{ padding: "18px 16px" }}>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--clay)", margin: 0, opacity: 0.6 }}>Rest day — no actives scheduled.</p>
            </div>
          ) : (
            <div>
              {["am", "pm"].map(slot => {
                const slotProducts = selectedProducts[slot];
                if (slotProducts.length === 0) return null;
                return (
                  <div key={slot} style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                    <p style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 400, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 10px", opacity: 0.55 }}>
                      <Icon name={slot === "am" ? "sun" : "moon"} size={10} /> {slot === "am" ? "Morning" : "Evening"}
                    </p>
                    {slotProducts.map((p, i) => {
                      const color = getColor(p);
                      const activeKey = p.category === "Toning Pad"
                        ? "toning pad"
                        : RAMP_ACTIVES.find(a => detectActives(p.ingredients || [])[a]);
                      const schedule = RAMP_SCHEDULES[activeKey];
                      const phase = schedule ? getRampPhase(schedule, getRampWeek(p)) : null;
                      return (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: i < slotProducts.length - 1 ? 10 : 0 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <p style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 400, color: "var(--parchment)", margin: "0 0 1px" }}>{p.name}</p>
                            {phase && (
                              <p style={{ fontFamily: "var(--font-body)", fontSize: 10, color, margin: 0, letterSpacing: "0.04em" }}>
                                Week {getRampWeek(p)} · {phase.frequency}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- PROGRESS ----------------------------------------------------------------

export { RAMP_SCHEDULES, RAMP_ACTIVES, IntroduceSlowlyCard, WeeklyRitualCalendar, getRampWeek, getRampPhase };