import { useState, useEffect, useRef } from "react";
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
    color: "#6e8a72",
    colorBg: "rgba(122,144,112,0.08)",
    colorBorder: "rgba(122,144,112,0.22)",
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

const HANDLED_MESSAGE = "Noted. Check back next week — if your skin stays calm we'll increase frequency.";
const BACKOFF_MESSAGE = "Understood. We'll slow the pace. Check back in a few days and let us know how your skin feels.";

function formatStartedLabel(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return `Started ${dt.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`;
}

function IntroduceSlowlyCard({ product, schedule, weekNumber: weekNumberProp, onAdvance, onHold, onResetStart }) {
  const [expanded, setExpanded] = useState(false);
  const [justActioned, setJustActioned] = useState(null); // "advance" | "hold" | null
  const [confirmReset, setConfirmReset] = useState(false);
  const [pickedDate, setPickedDate] = useState("");
  const [graduating, setGraduating] = useState(false);
  const weekNumber = weekNumberProp ?? getRampWeek(product);
  const phase = getRampPhase(schedule, weekNumber);
  const phaseIndex = schedule.phases.findIndex(p => p.weeks.includes(Math.min(weekNumber, 12)));
  const isHeld = product.rampHeld === true;
  const clampedPhaseIndex = Math.min(phaseIndex, schedule.phases.length - 1);
  const startedLabel = formatStartedLabel(product.routineStartDate);

  // Graduation: matches recordRampAction's "currentWeek >= maxWeek" guard,
  // so a "handled" tap at the final week would clear routineStartDate and
  // remove the product from Introduce Slowly. We intercept that single tap
  // with a ceremonial confirmation before letting the parent's handler run.
  const maxWeek = Math.max(...schedule.phases[schedule.phases.length - 1].weeks);
  const isFinalWeek = weekNumber >= maxWeek;

  const handleAdvanceClick = () => {
    if (isFinalWeek) {
      setGraduating(true);
    } else {
      onAdvance(product.id);
      setJustActioned("advance");
    }
  };

  const confirmGraduation = () => {
    setGraduating(false);
    onAdvance(product.id);
  };

  // Verify calendar-based progression at render time.
  useEffect(() => {
    if (product?.routineStartDate) {
      // eslint-disable-next-line no-console
      console.log("[Cygne ramp]", {
        productId: product.id,
        productName: product.name,
        routineStartDate: product.routineStartDate,
        daysSinceStart: daysBetweenLocal(product.routineStartDate),
        currentWeek: weekNumber,
        phase: phase.name,
        isHeld,
      });
    }
  }, [product?.id, product?.routineStartDate, weekNumber]);

  // Auto-dismiss the contextual follow-up: 3 seconds, or on next scroll.
  useEffect(() => {
    if (!justActioned) return;
    const timer = setTimeout(() => setJustActioned(null), 3000);
    const onScroll = () => setJustActioned(null);
    window.addEventListener("scroll", onScroll, { passive: true, once: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [justActioned]);

  return (
    <div style={{ background: schedule.colorBg, border: `1px solid ${schedule.colorBorder}`, borderRadius: 14, marginBottom: 12, overflow: "hidden" }}>

      {/* Header */}
      <div onClick={() => setExpanded(e => !e)} style={{ padding: "16px 18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: schedule.color, background: `${schedule.color}18`, padding: "2px 8px", borderRadius: 20 }}>{schedule.label}</span>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: isHeld ? "#8b7355" : "var(--clay)", opacity: 0.7 }}>Week {weekNumber} · {isHeld ? "Holding" : phase.name}</span>
          </div>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 500, color: "var(--parchment)", margin: "0 0 2px" }}>{product.name}</p>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: schedule.color, margin: 0, letterSpacing: "0.04em" }}>{phase.frequency}</p>
          {startedLabel && (
            <p style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--clay)", margin: "4px 0 0", opacity: 0.6, letterSpacing: "0.04em" }}>{startedLabel}</p>
          )}
        </div>

        {/* Phase dots */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, marginLeft: 14, flexShrink: 0 }}>
          {schedule.phases.map((p, i) => (
            <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: i <= clampedPhaseIndex ? schedule.color : "var(--border)", transition: "background 0.3s" }} />
          ))}
        </div>
        <span style={{ color: "var(--clay)", opacity: 0.5, marginLeft: 10, display: "inline-block", transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
          <Icon name="chevron" size={13} />
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: "0 18px 18px", borderTop: `1px solid ${schedule.colorBorder}` }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--clay)", margin: "14px 0 14px", lineHeight: 1.7 }}>{phase.instruction}</p>

          {/* On track / Back off */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            <div style={{ padding: "10px 12px", background: "rgba(122,144,112,0.08)", border: "1px solid rgba(122,144,112,0.2)", borderRadius: 10 }}>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--sage)", margin: "0 0 4px" }}>On track</p>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: 0, lineHeight: 1.55 }}>{phase.onTrack}</p>
            </div>
            <div style={{ padding: "10px 12px", background: "rgba(139,115,85,0.06)", border: "1px solid rgba(139,115,85,0.18)", borderRadius: 10 }}>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8b7355", margin: "0 0 4px" }}>Back off</p>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: 0, lineHeight: 1.55 }}>{phase.backOff}</p>
            </div>
          </div>

          {/* Weekly response buttons */}
          {isHeld ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ padding: "12px 16px", background: "rgba(139,115,85,0.08)", border: "1px solid rgba(139,115,85,0.22)", borderRadius: 10, textAlign: "center" }}>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, color: "#8b7355", margin: "0 0 2px" }}>Paused — repeat this week</p>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--clay)", margin: 0, opacity: 0.7 }}>When you're ready, mark as handled to advance.</p>
              </div>
              <button onClick={handleAdvanceClick}
                style={{ width: "100%", padding: "10px 0", background: "rgba(122,144,112,0.12)", border: "1px solid rgba(122,144,112,0.3)", borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--sage)", cursor: "pointer", transition: "all 0.18s" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(122,144,112,0.2)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(122,144,112,0.12)"}>
                Skin handled it — advance <Icon name="check" size={10} />
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleAdvanceClick}
                style={{ flex: 1, padding: "10px 0", background: "rgba(122,144,112,0.12)", border: "1px solid rgba(122,144,112,0.3)", borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--sage)", cursor: "pointer", transition: "all 0.18s" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(122,144,112,0.2)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(122,144,112,0.12)"}>
                Skin handled it <Icon name="check" size={10} />
              </button>
              <button onClick={() => { onHold(product.id); setJustActioned("hold"); }}
                style={{ flex: 1, padding: "10px 0", background: "rgba(139,115,85,0.06)", border: "1px solid rgba(139,115,85,0.18)", borderRadius: 10, fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8b7355", cursor: "pointer", transition: "all 0.18s" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(139,115,85,0.12)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(139,115,85,0.06)"}>
                Backing off
              </button>
            </div>
          )}

          {/* Contextual follow-up — auto-dismisses after 3s or next scroll */}
          {justActioned && (
            <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: "10px 2px 0", lineHeight: 1.6, opacity: 0.75, transition: "opacity 0.3s" }}>
              {justActioned === "advance" ? HANDLED_MESSAGE : BACKOFF_MESSAGE}
            </p>
          )}

          {/* Reset start date — pick any past date */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--border)" }}>
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
                    style={{ padding: "6px 12px", background: pickedDate ? "rgba(139,115,85,0.12)" : "transparent", border: `1px solid ${pickedDate ? "rgba(139,115,85,0.35)" : "var(--border)"}`, borderRadius: 8, fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: pickedDate ? "#8b7355" : "var(--clay)", cursor: pickedDate ? "pointer" : "not-allowed", opacity: pickedDate ? 1 : 0.5 }}>
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

      {/* Graduation modal — appears once when the user marks the final
          week as handled. No auto-dismiss; user must tap to confirm. */}
      {graduating && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 250,
          background: "rgba(8,10,9,0.55)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 24px",
        }}>
          <div style={{
            background: "#2a3a2b",
            color: "#e8e0c8",
            border: "1px solid rgba(232,224,200,0.16)",
            borderRadius: 18,
            padding: "34px 28px 26px",
            maxWidth: 360, width: "100%",
            textAlign: "center",
          }}>
            <p style={{
              fontFamily: "var(--font-display)",
              fontSize: 18, fontWeight: 400, letterSpacing: "0.05em", lineHeight: 1.5,
              color: "#e8e0c8",
              letterSpacing: "0.02em",
              margin: "0 0 22px",
              whiteSpace: "pre-line",
            }}>
              {"Your skin has made its peace with this one.\nIt's ready to stay."}
            </p>
            <button onClick={confirmGraduation}
              style={{
                padding: "12px 24px",
                background: "rgba(122,144,112,0.22)",
                color: "#e8e0c8",
                border: "1px solid rgba(232,224,200,0.28)",
                borderRadius: 10,
                fontFamily: "var(--font-body)",
                fontSize: 11, fontWeight: 600,
                letterSpacing: "0.18em", textTransform: "uppercase",
                cursor: "pointer",
                transition: "background 0.18s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(122,144,112,0.32)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(122,144,112,0.22)"}>
              Resume Routine
            </button>
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
                  ? "rgba(122,144,112,0.15)"
                  : active
                  ? "rgba(122,144,112,0.07)"
                  : "var(--surface)",
                border: selected
                  ? "1px solid rgba(122,144,112,0.45)"
                  : active
                  ? "1px solid rgba(122,144,112,0.25)"
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
                fontWeight: active ? 700 : 500,
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
                    <p style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 10px", opacity: 0.55 }}>
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
                            <p style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500, color: "var(--parchment)", margin: "0 0 1px" }}>{p.name}</p>
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