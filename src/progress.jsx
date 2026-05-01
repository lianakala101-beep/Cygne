import { useState, useEffect } from "react";
import { Icon, Section } from "./components.jsx";
import { detectActives, analyzeShelf, detectConflicts, buildRoutine, hasSPFCoverage } from "./engine.js";
import { getAutoSession } from "./productmodal.jsx";
import { RAMP_SCHEDULES, RAMP_ACTIVES, IntroduceSlowlyCard, getRampWeek } from "./ramp.jsx";
import { getCurrentCycleDay, getTreatmentElapsed, daysBetweenLocal } from "./utils.jsx";


function computeStabilityScore(products, checkIns, activeMap) {
  const conflicts = detectConflicts(products);
  const { flags } = analyzeShelf(products);
  const exfoliantCount = products.filter(p => {
    const a = detectActives(p.ingredients || []);
    return a.AHA || a.BHA || p.category === "Exfoliant";
  }).length;

  let score = 72;
  if (conflicts.length > 0) score -= conflicts.length * 8;
  if (exfoliantCount > 1) score -= 6;
  if (flags.some(f => f.severity === "warning")) score -= 4;
  if (hasSPFCoverage(products, activeMap)) score += 6;
  if (products.some(p => p.category === "Moisturizer" || p.category === "SPF Moisturizer")) score += 5;
  if (activeMap["ceramides"] || activeMap["hyaluronic acid"]) score += 4;
  if (conflicts.length === 0 && !flags.some(f => f.severity === "warning")) score += 8;

  if (checkIns.length > 0) {
    const recent = checkIns.slice(-4);
    const irritDelta = recent.reduce((s, c) => s + ({ none: 0, mild: -3, moderate: -9 }[c.irritation] || 0), 0);
    const tightDelta = recent.reduce((s, c) => s + (c.tight ? -4 : 2), 0);
    const breakoutDelta = recent.reduce((s, c) => s + (c.breakout ? -3 : 1), 0);
    score += Math.round((irritDelta + tightDelta + breakoutDelta) / recent.length);
  }
  return Math.max(20, Math.min(100, score));
}

function generateTimeline(baseScore, checkIns) {
  return ["Week 1","Week 2","Week 3","Week 4"].map((label, i) => {
    const weekCheckins = checkIns.filter((_, idx) => Math.floor(idx / 2) === i);
    let score = Math.max(20, Math.min(100, baseScore - (3 - i) * 5));
    if (weekCheckins.length > 0) {
      const delta = weekCheckins.reduce((s, c) => s + ({ none: 0, mild: -4, moderate: -10 }[c.irritation] || 0), 0) / weekCheckins.length;
      score = Math.max(20, Math.min(100, score + Math.round(delta)));
    }
    const intensity = score > 80 ? "Low" : score > 65 ? "Moderate" : "High";
    const refinements = (i === 1 && checkIns.length > 1) ? "Conflict noted" : (i === 2 && checkIns.length > 3) ? "Schedule adjusted" : null;
    return { label, score: Math.round(score), intensity, refinements };
  });
}

const FACE_ZONES = ["Forehead", "Hairline", "Temples", "T-zone", "Nose", "Left cheek", "Right cheek", "Above lip", "Mustache area", "Sideburns", "Chin", "Jawline", "Beard/facial hair area"];
const NECK_BEARD_ZONES = ["Neck", "Neck sides", "Under jaw", "Beard area", "Neck beard line", "Neckline"];
const CHECKIN_BODY_ZONES = ["Chest", "Upper back", "Shoulders", "Scalp/hairline"];

function CheckInModal({ onSubmit, onClose }) {
  const [irritation, setIrritation] = useState("none");
  const [breakout, setBreakout] = useState(false);
  const [breakoutZones, setBreakoutZones] = useState([]);
  const [tight, setTight] = useState(false);
  // idle → rippling (600ms) → closing (300ms) → onSubmit fires
  const [submitState, setSubmitState] = useState("idle");

  const toggleZone = (z) => setBreakoutZones(prev => prev.includes(z) ? prev.filter(x => x !== z) : [...prev, z]);

  const handleSubmit = () => {
    if (submitState !== "idle") return;
    const data = { irritation, breakout, breakoutZones: breakout ? breakoutZones : [], tight, date: new Date().toISOString() };
    setSubmitState("rippling");
    setTimeout(() => {
      setSubmitState("closing");
      setTimeout(() => onSubmit(data), 300);
    }, 600);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(8,10,9,0.82)", backdropFilter: "blur(10px)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      >
      <div style={{
        background: "var(--ink)", width: "100%", maxWidth: 520,
        borderRadius: "20px 20px 0 0", padding: "30px 24px 52px",
        border: "1px solid var(--border)", borderBottom: "none",
        transformOrigin: "center bottom",
        animation: submitState === "closing" ? "checkInClose 300ms ease-in forwards" : "none",
      }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
          <div>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 6px" }}>Weekly Check-In</p>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--parchment)", margin: 0 }}>How is your skin?</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", padding: 4, marginTop: 2 }}><Icon name="x" size={17} /></button>
        </div>

        {[
          { label: "Any irritation this week?", opts: ["none","mild","moderate"], labels: ["None","Mild","Moderate"], val: irritation, set: setIrritation },
        ].map(q => (
          <div key={q.label} style={{ marginBottom: 24 }}>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--clay)", margin: "0 0 11px", letterSpacing: "0.02em" }}>{q.label}</p>
            <div style={{ display: "flex", gap: 8 }}>
              {q.opts.map((opt, i) => (
                <button key={opt} onClick={() => q.set(opt)}
                  style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: `1px solid ${q.val === opt ? "#2d3d2b" : "var(--border)"}`, background: q.val === opt ? "rgba(45,61,43,0.12)" : "transparent", color: q.val === opt ? "#2d3d2b" : "var(--clay)", fontFamily: "var(--font-body)", fontSize: 11, fontWeight: q.val === opt ? 600 : 400, cursor: "pointer", letterSpacing: "0.06em", transition: "all 0.18s" }}>
                  {q.labels[i]}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Breakout question — with conditional zone picker */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--clay)", margin: "0 0 11px", letterSpacing: "0.02em" }}>Any new breakouts?</p>
          <div style={{ display: "flex", gap: 8 }}>
            {[false, true].map(opt => (
              <button key={String(opt)} onClick={() => { setBreakout(opt); if (!opt) setBreakoutZones([]); }}
                style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: `1px solid ${breakout === opt ? "#2d3d2b" : "var(--border)"}`, background: breakout === opt ? "rgba(45,61,43,0.12)" : "transparent", color: breakout === opt ? "#2d3d2b" : "var(--clay)", fontFamily: "var(--font-body)", fontSize: 11, fontWeight: breakout === opt ? 600 : 400, cursor: "pointer", letterSpacing: "0.06em", transition: "all 0.18s" }}>
                {opt ? "Yes" : "No"}
              </button>
            ))}
          </div>

          {breakout && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: "0 0 10px", letterSpacing: "0.04em", opacity: 0.7 }}>Where? <span style={{ opacity: 0.5 }}>Select all that apply</span></p>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 9, color: "var(--clay)", margin: "0 0 8px", letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.55 }}>Face</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {FACE_ZONES.map(z => {
                  const active = breakoutZones.includes(z);
                  return (
                    <button key={z} onClick={() => toggleZone(z)} style={{
                      padding: "6px 13px", borderRadius: 20,
                      border: `1px solid ${active ? "rgba(139,115,85,0.55)" : "var(--border)"}`,
                      background: active ? "rgba(139,115,85,0.12)" : "transparent",
                      color: active ? "#8b7355" : "var(--clay)",
                      fontFamily: "var(--font-body)", fontSize: 11,
                      fontWeight: active ? 600 : 400,
                      cursor: "pointer", transition: "all 0.15s",
                      letterSpacing: "0.04em",
                    }}>
                      {z}
                    </button>
                  );
                })}
              </div>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 9, color: "var(--clay)", margin: "14px 0 8px", letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.55 }}>Neck</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {NECK_BEARD_ZONES.map(z => {
                  const active = breakoutZones.includes(z);
                  return (
                    <button key={z} onClick={() => toggleZone(z)} style={{
                      padding: "6px 13px", borderRadius: 20,
                      border: `1px solid ${active ? "rgba(139,115,85,0.55)" : "var(--border)"}`,
                      background: active ? "rgba(139,115,85,0.12)" : "transparent",
                      color: active ? "#8b7355" : "var(--clay)",
                      fontFamily: "var(--font-body)", fontSize: 11,
                      fontWeight: active ? 600 : 400,
                      cursor: "pointer", transition: "all 0.15s",
                      letterSpacing: "0.04em",
                    }}>
                      {z}
                    </button>
                  );
                })}
              </div>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 9, color: "var(--clay)", margin: "14px 0 8px", letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.55 }}>Body</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {CHECKIN_BODY_ZONES.map(z => {
                  const active = breakoutZones.includes(z);
                  return (
                    <button key={z} onClick={() => toggleZone(z)} style={{
                      padding: "6px 13px", borderRadius: 20,
                      border: `1px solid ${active ? "rgba(139,115,85,0.55)" : "var(--border)"}`,
                      background: active ? "rgba(139,115,85,0.12)" : "transparent",
                      color: active ? "#8b7355" : "var(--clay)",
                      fontFamily: "var(--font-body)", fontSize: 11,
                      fontWeight: active ? 600 : 400,
                      cursor: "pointer", transition: "all 0.15s",
                      letterSpacing: "0.04em",
                    }}>
                      {z}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Tight / dry question */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--clay)", margin: "0 0 11px", letterSpacing: "0.02em" }}>Skin feeling tight or dry?</p>
          <div style={{ display: "flex", gap: 8 }}>
            {[false, true].map(opt => (
              <button key={String(opt)} onClick={() => setTight(opt)}
                style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: `1px solid ${tight === opt ? "#2d3d2b" : "var(--border)"}`, background: tight === opt ? "rgba(45,61,43,0.12)" : "transparent", color: tight === opt ? "#2d3d2b" : "var(--clay)", fontFamily: "var(--font-body)", fontSize: 11, fontWeight: tight === opt ? 600 : 400, cursor: "pointer", letterSpacing: "0.06em", transition: "all 0.18s" }}>
                {opt ? "Yes" : "No"}
              </button>
            ))}
          </div>
        </div>

        <button onClick={handleSubmit} disabled={submitState !== "idle"}
          style={{
            position: "relative",
            width: "100%", marginTop: 8, padding: "15px 0",
            background: "#2d3d2b", color: "#fdfcf9", border: "none", borderRadius: 10,
            fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700,
            letterSpacing: "0.14em", textTransform: "uppercase",
            cursor: submitState === "idle" ? "pointer" : "default",
            overflow: "visible",
          }}>
          {submitState === "rippling" && (
            <>
              <span aria-hidden="true" style={{
                position: "absolute", inset: 0,
                borderRadius: 10,
                border: "1.5px solid rgba(210,200,170,0.5)",
                pointerEvents: "none",
                transformOrigin: "center",
                animation: "checkInRing 600ms ease-out forwards",
              }} />
              <span aria-hidden="true" style={{
                position: "absolute", inset: 0,
                borderRadius: 10,
                border: "1.5px solid rgba(210,200,170,0.5)",
                pointerEvents: "none",
                transformOrigin: "center",
                animation: "checkInRing 600ms ease-out 300ms forwards",
              }} />
            </>
          )}
          <span style={{ position: "relative" }}>Submit Check-In</span>
        </button>
      </div>
    </div>
  );
}



// --- SKIN JOURNAL -------------------------------------------------------------

const SKIN_CONDITIONS = [
  { key: "rough",    label: "Rough",    color: "#8b7355", bg: "rgba(139,115,85,0.10)",   border: "rgba(139,115,85,0.35)"  },
  { key: "dull",     label: "Dull",     color: "#8b7355", bg: "rgba(139,115,85,0.10)", border: "rgba(139,115,85,0.35)"},
  { key: "okay",     label: "Okay",     color: "#2d3d2b", bg: "rgba(45,61,43,0.10)", border: "rgba(45,61,43,0.25)"},
  { key: "good",     label: "Good",     color: "#2d3d2b", bg: "rgba(45,61,43,0.13)", border: "rgba(45,61,43,0.4)" },
  { key: "glowing",  label: "Glowing",  color: "#2d3d2b", bg: "rgba(45,61,43,0.10)", border: "rgba(45,61,43,0.4)"},
];

function SkinJournalModal({ onSubmit, onClose, existing = null }) {
  const today = new Date().toISOString().split("T")[0];
  const [condition, setCondition] = useState(existing?.condition || null);
  const [sleep,     setSleep]     = useState(existing?.sleep     ?? null); // "good"|"poor"|null
  const [stress,    setStress]    = useState(existing?.stress    ?? null); // "low"|"high"|null
  const [notes,     setNotes]     = useState(existing?.notes     || "");
  // Which option is currently playing the soft pulse. Cleared on
  // animation end so a re-tap can replay the pulse.
  const [pulsing, setPulsing] = useState(null);

  const pickCondition = (key) => {
    setCondition(key);
    setPulsing(key);
  };

  const canSubmit = condition !== null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(8,10,8,0.85)", backdropFilter: "blur(12px)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      >
      <div style={{ background: "var(--ink)", width: "100%", maxWidth: 520, borderRadius: "20px 20px 0 0", padding: "28px 24px 40px", overflowY: "auto", maxHeight: "90vh" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 4px" }}>SKIN JOURNAL</p>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--parchment)", margin: 0 }}>How is your skin today?</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", padding: 4 }}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: "0 0 28px", opacity: 0.7 }}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>

        {/* Condition */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 12px" }}>Skin condition</p>
          <div style={{ display: "flex", gap: 8 }}>
            {SKIN_CONDITIONS.map(c => {
              const selected = condition === c.key;
              const dimmed = condition !== null && !selected;
              return (
                <button key={c.key} onClick={() => pickCondition(c.key)}
                  onAnimationEnd={() => { if (pulsing === c.key) setPulsing(null); }}
                  style={{
                    flex: 1, padding: "12px 0", borderRadius: 11,
                    border: `1px solid ${selected ? c.border : "var(--border)"}`,
                    background: selected ? c.bg : "transparent",
                    color: selected ? c.color : "var(--clay)",
                    fontFamily: "var(--font-body)", fontSize: 10,
                    fontWeight: selected ? 600 : 400, letterSpacing: "0.04em",
                    cursor: "pointer",
                    opacity: dimmed ? 0.4 : 1,
                    transition: "background 0.15s, border-color 0.15s, color 0.15s, opacity 0.25s ease-out",
                    animation: pulsing === c.key ? "softPulse 400ms ease-in-out" : "none",
                    willChange: pulsing === c.key ? "transform, opacity" : "auto",
                  }}>
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sleep */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 12px" }}>Sleep last night</p>
          <div style={{ display: "flex", gap: 8 }}>
            {[{ key: "good", label: "Good" }, { key: "poor", label: "Poor" }].map(opt => (
              <button key={opt.key} onClick={() => setSleep(s => s === opt.key ? null : opt.key)}
                style={{ flex: 1, padding: "11px 0", borderRadius: 11, border: `1px solid ${sleep === opt.key ? "rgba(45,61,43,0.5)" : "var(--border)"}`, background: sleep === opt.key ? "rgba(45,61,43,0.10)" : "transparent", color: sleep === opt.key ? "#2d3d2b" : "var(--clay)", fontFamily: "var(--font-body)", fontSize: 11, fontWeight: sleep === opt.key ? 600 : 400, cursor: "pointer", transition: "all 0.15s" }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stress */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 12px" }}>Stress today</p>
          <div style={{ display: "flex", gap: 8 }}>
            {[{ key: "low", label: "Low" }, { key: "high", label: "High" }].map(opt => (
              <button key={opt.key} onClick={() => setStress(s => s === opt.key ? null : opt.key)}
                style={{ flex: 1, padding: "11px 0", borderRadius: 11, border: `1px solid ${stress === opt.key ? "rgba(45,61,43,0.5)" : "var(--border)"}`, background: stress === opt.key ? "rgba(45,61,43,0.10)" : "transparent", color: stress === opt.key ? "#2d3d2b" : "var(--clay)", fontFamily: "var(--font-body)", fontSize: 11, fontWeight: stress === opt.key ? 600 : 400, cursor: "pointer", transition: "all 0.15s" }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 12px" }}>Notes <span style={{ opacity: 0.45, textTransform: "none", letterSpacing: 0 }}>optional</span></p>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Anything worth noting today..."
            style={{ width: "100%", minHeight: 72, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 11, padding: "12px 14px", fontFamily: "var(--font-body)", fontSize: 12, color: "var(--parchment)", resize: "none", outline: "none", boxSizing: "border-box", lineHeight: 1.6 }}
          />
        </div>

        <button
          onClick={() => canSubmit && onSubmit({ date: today, condition, sleep, stress, notes: notes.trim() })}
          style={{ width: "100%", padding: "15px 0", background: canSubmit ? "#2d3d2b" : "var(--surface)", color: canSubmit ? "#fdfcf9" : "var(--clay)", border: `1px solid ${canSubmit ? "transparent" : "var(--border)"}`, borderRadius: 13, fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", cursor: canSubmit ? "pointer" : "default", transition: "all 0.2s" }}>
          Save Entry
        </button>
      </div>
    </div>
  );
}

// --- HORMONE CYCLE TRACKER ---------------------------------------------------

const CYCLE_PHASES = [
  {
    name: "Menstrual",
    days: [1, 5],
    color: "#8b7355",
    bg: "rgba(139,115,85,0.08)",
    border: "rgba(139,115,85,0.25)",
    dot: "rgba(139,115,85,0.85)",
    description: "Estrogen and progesterone are at their lowest. The skin barrier is more permeable and reactive.",
    nudge: "Reduce active intensity this week. Prioritize ceramides, gentle cleansing, and occlusive hydration.",
    activeAdvice: (hasRetinol, hasAHA, hasBHA) => {
      if (hasRetinol) return "Consider resting your retinoid tonight — barrier recovery is slower during menstruation.";
      if (hasAHA) return "Lighten exfoliation frequency. Your skin is more sensitized this week.";
      return "Lean into barrier support. This is a recovery week.";
    }
  },
  {
    name: "Follicular",
    days: [6, 13],
    color: "#2d3d2b",
    bg: "rgba(45,61,43,0.08)",
    border: "rgba(45,61,43,0.25)",
    dot: "rgba(45,61,43,0.85)",
    description: "Estrogen is rising. Skin cell turnover increases and the barrier is more resilient.",
    nudge: "Good window for actives. Exfoliation and vitamin C absorb well as estrogen climbs.",
    activeAdvice: (hasRetinol, hasAHA, hasBHA) => {
      if (hasRetinol && hasAHA) return "This is your strongest week for actives — alternating retinol and AHA is well-tolerated now.";
      if (hasAHA || hasBHA) return "Exfoliation is well-tolerated this week. Maintain your current schedule.";
      if (hasRetinol) return "Skin is more resilient now. If tolerating well, this is a good week to hold frequency.";
      return "Skin is at good baseline. Your ritual should feel effective this week.";
    }
  },
  {
    name: "Ovulatory",
    days: [14, 16],
    color: "#8b7355",
    bg: "rgba(139,115,85,0.08)",
    border: "rgba(139,115,85,0.25)",
    dot: "rgba(139,115,85,0.85)",
    description: "Estrogen peaks. Skin typically looks and feels its best — luminous and well-hydrated.",
    nudge: "Peak skin window. Your ritual is working optimally. No adjustments needed.",
    activeAdvice: () => "Skin is at peak resilience. Continue your ritual as normal."
  },
  {
    name: "Luteal",
    days: [17, 35],
    color: "#8b7355",
    bg: "rgba(139,115,85,0.08)",
    border: "rgba(139,115,85,0.28)",
    dot: "rgba(139,115,85,0.85)",
    description: "Progesterone rises, increasing sebum production. Congestion and breakouts are more likely.",
    nudge: "Watch for congestion. BHA helps keep pores clear. Reduce heavy occlusives if skin feels clogged.",
    activeAdvice: (hasRetinol, hasAHA, hasBHA) => {
      if (hasBHA) return "Your BHA is well-suited to this phase. Prioritize it over heavier treatments if skin feels congested.";
      if (hasRetinol) return "Retinol supports cell turnover during this oilier phase. Maintain frequency if tolerating well.";
      return "Consider introducing a salicylic acid product to manage congestion during the luteal phase.";
    }
  },
];

function getCyclePhase(day) {
  return CYCLE_PHASES.find(p => day >= p.days[0] && day <= p.days[1]) || CYCLE_PHASES[3];
}

function CycleTracker({ products, activeMap, cycleDay: cycledayProp = 14, onSetCycleDay, user = {}, onUpdateUser = () => {} }) {
  const enabled = user.cycleTrackingEnabled || false;
  // Compute cycle day dynamically from cycleStartDate (LOCAL date, not UTC)
  const computedDay = getCurrentCycleDay(user) || cycledayProp || 14;
  const cycleDay = computedDay;
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(String(computedDay));

  const hasRetinol = !!(activeMap["retinol"]?.length);
  const hasAHA = !!(activeMap["AHA"]?.length);
  const hasBHA = !!(activeMap["BHA"]?.length);

  const phase = getCyclePhase(cycleDay);
  const daysUntilNext = phase.days[1] - cycleDay + 1;
  const advice = phase.activeAdvice(hasRetinol, hasAHA, hasBHA);

  const handleSetDay = () => {
    const d = Math.max(1, Math.min(35, parseInt(inputVal) || 1));
    // Store cycle start date at LOCAL midnight so it advances at local midnight
    const now = new Date();
    const startLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (d - 1));
    onUpdateUser({ ...user, cycleStartDate: startLocal.toISOString(), cycleDay: d });
    setEditing(false);
  };

  if (!enabled) {
    return (
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 20px", marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ color: "var(--clay)", display: "inline-flex" }}><Icon name="moon" size={14} /></span>
          <span style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--clay)" }}>Sync Your Ritual With Your Rhythm</span>
          <span style={{ fontSize: 9, fontFamily: "var(--font-body)", color: "var(--clay)", background: "var(--surface)", border: "1px solid var(--border)", padding: "2px 8px", borderRadius: 20, letterSpacing: "0.06em" }}>Optional</span>
        </div>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--clay)", margin: "0 0 16px", lineHeight: 1.65 }}>
          Your hormones shift every week. Your ritual should too. Enable this to receive phase-aware nudges drawn from what's already on your vanity.
        </p>
        <button onClick={() => onUpdateUser({ ...user, cycleTrackingEnabled: true })}
          style={{ padding: "10px 20px", background: "rgba(45,61,43,0.10)", border: "1px solid rgba(45,61,43,0.3)", borderRadius: 10, fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2d3d2b", cursor: "pointer", transition: "all 0.2s" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(45,61,43,0.18)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(45,61,43,0.10)"; }}>
          Enable
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Phase card */}
      <div style={{ background: phase.bg, border: `1px solid ${phase.border}`, borderRadius: 16, padding: "20px 20px 18px", marginBottom: 10, position: "relative", overflow: "hidden" }}>

        {/* Background phase arc */}
        <div style={{ position: "absolute", top: -30, right: -30, width: 110, height: 110, borderRadius: "50%", border: `18px solid ${phase.dot}`, opacity: 0.06, pointerEvents: "none" }} />

        {/* Header row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 4px" }}>Sync Your Ritual With Your Rhythm</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: phase.dot, flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--font-body)", fontSize: 16, fontWeight: 600, color: "var(--parchment)", letterSpacing: "0.02em" }}>{phase.name}</span>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--clay)" }}>Phase</span>
            </div>
          </div>

          {/* Day editor */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            {editing ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="number" min="1" max="35"
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSetDay()}
                  style={{ width: 48, padding: "4px 8px", background: "var(--ink)", border: `1px solid ${phase.border}`, borderRadius: 6, color: "var(--parchment)", fontFamily: "var(--font-body)", fontSize: 13, textAlign: "center", outline: "none" }}
                  autoFocus
                />
                <button onClick={handleSetDay} style={{ padding: "4px 10px", background: phase.bg, border: `1px solid ${phase.border}`, borderRadius: 6, color: phase.color, fontFamily: "var(--font-body)", fontSize: 9, cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase" }}>Set</button>
              </div>
            ) : (
              <button onClick={() => { setInputVal(String(cycleDay)); setEditing(true); }}
                style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 13, letterSpacing: "0.08em", color: "var(--color-stone)", lineHeight: 1.6 }}>Day {cycleDay}</span>
              </button>
            )}
            <span style={{ fontFamily: "var(--font-body)", fontSize: 9, color: "var(--clay)", opacity: 0.6, letterSpacing: "0.04em" }}>{daysUntilNext}d in phase</span>
          </div>
        </div>

        {/* Phase description */}
        <p style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 13, letterSpacing: "0.08em", color: "var(--color-stone)", margin: "0 0 14px", lineHeight: 1.6 }}>{phase.description}</p>

        {/* Nudge */}
        <div style={{ padding: "12px 14px", background: "rgba(0,0,0,0.15)", borderRadius: 10, marginBottom: 0 }}>
          <p style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 13, letterSpacing: "0.08em", color: "var(--color-stone)", margin: 0, lineHeight: 1.6 }}>{phase.nudge}</p>
        </div>
      </div>

      {/* Shelf-specific advice */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 8px" }}>Your Vanity This Week</p>
        <p style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 13, letterSpacing: "0.08em", color: "var(--color-stone)", margin: "0 0 12px", lineHeight: 1.6 }}>{advice}</p>
        <button onClick={() => setEnabled(false)}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--clay)", opacity: 0.45, transition: "opacity 0.2s" }}
          onMouseEnter={e => e.currentTarget.style.opacity = "0.75"}
          onMouseLeave={e => e.currentTarget.style.opacity = "0.45"}>
          Disable tracking
        </button>
      </div>

      {/* Compact cycle arc */}
      <div style={{ display: "flex", gap: 3, marginTop: 10 }}>
        {CYCLE_PHASES.map((p, i) => {
          const isActive = phase.name === p.name;
          const width = ((p.days[1] - p.days[0] + 1) / 35) * 100;
          return (
            <div key={i} style={{ flex: p.days[1] - p.days[0] + 1, height: 3, borderRadius: 3, background: isActive ? p.dot : "rgba(255,255,255,0.07)", transition: "background 0.3s" }} />
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
        {CYCLE_PHASES.map((p, i) => (
          <span key={i} style={{ fontFamily: "var(--font-body)", fontSize: 8, letterSpacing: "0.08em", color: phase.name === p.name ? "var(--parchment)" : "var(--clay)", opacity: phase.name === p.name ? 1 : 0.4 }}>{p.name.slice(0, 3).toUpperCase()}</span>
        ))}
      </div>
    </div>
  );
}


// --- TREATMENT TRACKER --------------------------------------------------------

const TREATMENT_TYPES = [
  {
    id: "peel_light",
    label: "Chemical Peel — Light",
    description: "Lactic, mandelic, or low-% glycolic",
    phases: [
      { label: "Acute", days: [1, 3], description: "Skin is sensitized. Cleanse gently, moisturize, physical SPF only. No actives of any kind.", resume: [] },
      { label: "Healing", days: [4, 7], description: "Mild peeling possible. Continue gentle routine. Introduce hyaluronic acid if not already using.", resume: ["Hyaluronic Acid", "Gentle Moisturizer"] },
      { label: "Reintroduction", days: [8, 14], description: "Skin should feel settled. Reintroduce Vitamin C first, then BHA if tolerated.", resume: ["Vitamin C", "BHA"] },
      { label: "Cleared", days: [15, 999], description: "Resume full routine. Retinol and AHA can return at normal frequency.", resume: ["Retinol", "AHA", "Full Ritual"] },
    ]
  },
  {
    id: "peel_medium",
    label: "Chemical Peel — Medium",
    description: "TCA 20–35%, Jessner, high-% glycolic",
    phases: [
      { label: "Acute", days: [1, 5], description: "Active peeling. Cleanse only with gentle cleanser. Physical SPF. No makeup, no actives. Avoid sun entirely.", resume: [] },
      { label: "Healing", days: [6, 10], description: "Peeling subsiding. Add moisturizer. Physical SPF mandatory. Still no actives.", resume: ["Moisturizer"] },
      { label: "Rebuilding", days: [11, 21], description: "Skin rebuilding barrier. Reintroduce Vitamin C at end of this phase only.", resume: ["Vitamin C"] },
      { label: "Reintroduction", days: [22, 35], description: "Gradually reintroduce BHA, then AHA. Retinol last — only after full settling.", resume: ["BHA", "AHA"] },
      { label: "Cleared", days: [36, 999], description: "Full ritual can resume. Monitor skin response when reintroducing retinol.", resume: ["Retinol", "Full Ritual"] },
    ]
  },
  {
    id: "laser",
    label: "Laser / IPL / BBL",
    description: "Resurfacing, pigmentation, or vascular treatments",
    phases: [
      { label: "Acute", days: [1, 4], description: "Redness and sensitivity peak. Gentle cleanser, physical SPF 50, fragrance-free moisturizer only. Ice if needed.", resume: [] },
      { label: "Healing", days: [5, 10], description: "Surface healing. Continue barrier-support routine. Avoid heat, steam, and exercise.", resume: ["Moisturizer", "Physical SPF"] },
      { label: "Reintroduction", days: [11, 21], description: "Reintroduce Vitamin C and low-actives. Monitor for hyperpigmentation.", resume: ["Vitamin C", "Niacinamide"] },
      { label: "Cleared", days: [22, 999], description: "Resume full routine. SPF remains critical for 3 months post-laser.", resume: ["Full Ritual"] },
    ]
  },
  {
    id: "microneedling",
    label: "Microneedling / RF",
    description: "Standard or radiofrequency microneedling",
    phases: [
      { label: "Acute", days: [1, 2], description: "Micro-channels are open. Cleanse gently, apply prescribed serum only, physical SPF. No makeup.", resume: [] },
      { label: "Healing", days: [3, 5], description: "Redness fading. Add hyaluronic acid and ceramide moisturizer. Still no actives.", resume: ["Hyaluronic Acid", "Ceramide Moisturizer"] },
      { label: "Reintroduction", days: [6, 14], description: "Skin closing up. Vitamin C and niacinamide can return. Hold retinol and exfoliants.", resume: ["Vitamin C", "Niacinamide"] },
      { label: "Cleared", days: [15, 999], description: "Resume full ritual including retinol and exfoliants.", resume: ["Full Ritual"] },
    ]
  },
  {
    id: "facial",
    label: "Clinical Facial / HydraFacial",
    description: "Professional extraction or hydration treatment",
    phases: [
      { label: "Settling", days: [1, 2], description: "Skin may be temporarily reactive. Skip retinol and exfoliants for 48 hours.", resume: ["Vitamin C", "Moisturizer"] },
      { label: "Cleared", days: [3, 999], description: "Resume full ritual.", resume: ["Full Ritual"] },
    ]
  },
  {
    id: "injectable",
    label: "Injectables — Botox / Filler",
    description: "Neurotoxin or dermal filler",
    phases: [
      { label: "Settling", days: [1, 3], description: "Avoid pressure on treated areas. No massage, no facial. Skincare ritual can continue as normal.", resume: ["Full Routine (avoid treated areas)"] },
      { label: "Cleared", days: [4, 999], description: "No restrictions.", resume: ["Full Ritual"] },
    ]
  },
  {
    id: "prescription",
    label: "Prescription Treatment",
    description: "Tretinoin, hydroquinone, or clinical-strength prescribed",
    phases: [
      { label: "Adjustment", days: [1, 21], description: "Follow prescriber guidance. Avoid layering additional actives unless directed. Barrier support is key.", resume: ["Gentle Cleanser", "Moisturizer", "SPF"] },
      { label: "Stabilized", days: [22, 999], description: "Skin adapting. Discuss reintroducing supporting actives with your prescriber.", resume: ["Vitamin C (AM)", "Niacinamide"] },
    ]
  },
];

function getTreatmentPhase(treatment) {
  const elapsed = getTreatmentElapsed(treatment.date);
  const type = TREATMENT_TYPES.find(t => t.id === treatment.typeId);
  if (!type) return null;
  const phase = type.phases.find(p => elapsed >= p.days[0] && elapsed <= p.days[1]);
  return { phase, elapsed, type, totalDays: type.phases[type.phases.length - 1].days[0] - 1 };
}

// Determines which active ingredients are currently paused / reintroducing
// based on the most recent non-cleared treatment.
//
// Three states per active:
//   pausedActives  — completely removed from routine (early recovery phases)
//   reintroActives — in routine at reduced frequency via Introduce Slowly
//   (not listed)   — fully active, no restrictions
//
// pausedActives and reintroActives are mutually exclusive — an active is
// never in both lists.
function getActivePauseState(treatments = [], products = []) {
  if (!treatments.length) return { pausedActives: [], reintroActives: [], treatment: null, phase: null };
  const candidates = treatments
    .map(t => ({ t, info: getTreatmentPhase(t) }))
    .filter(x => x.info && x.info.phase && x.info.phase.label !== "Cleared")
    .sort((a, b) => new Date(b.t.date) - new Date(a.t.date));
  if (!candidates.length) return { pausedActives: [], reintroActives: [], treatment: null, phase: null };
  const { t: treatment, info } = candidates[0];
  const { phase } = info;
  const tracked = ["retinol", "AHA", "BHA", "vitamin C"];
  const isResumed = (act) => (phase.resume || []).some(r =>
    r === "Full Ritual" || r.toLowerCase().includes(act.toLowerCase())
  );
  const isReintroPhase = /reintroduc|rebuilding|stabilized/i.test(phase.label);
  const isEarlyPhase = /acute|healing|settling/i.test(phase.label);
  const pausedActives = [];
  const reintroActives = [];
  tracked.forEach(act => {
    if (isResumed(act)) {
      if (isReintroPhase) reintroActives.push(act);
      // else: fully resumed, no restrictions
    } else if (isEarlyPhase) {
      pausedActives.push(act);
    } else {
      // Reintro phase but not yet explicitly resumed → introduce slowly
      reintroActives.push(act);
    }
  });
  return { pausedActives, reintroActives, treatment, phase };
}

// Expanded pause rules applied during Acute recovery phases.
// Returns a short reason tag, or null if the product is safe.
const ACUTE_PAUSE_RULES = [
  { keywords: ["retinol", "retinoid", "tretinoin"],                                     reason: "active"     },
  { keywords: ["glycolic acid", "salicylic acid", "lactic acid", "mandelic acid",
               "ascorbic acid", "alpha hydroxy", "beta hydroxy", " aha ", " bha "],     reason: "acid"       },
  { keywords: ["benzoyl peroxide"],                                                      reason: "active"     },
  { keywords: ["exfoliant", "exfoliating", "exfoliate", "scrub"],                       reason: "exfoliant"  },
  { keywords: ["toning pad", "toner pad", "peel pad"],                                  reason: "exfoliant"  },
];
function getAcutePauseReason(product) {
  if (!product) return null;
  const haystack = [
    product.name     || "",
    product.category || "",
    ...(Array.isArray(product.ingredients)
          ? product.ingredients
          : typeof product.ingredients === "string"
            ? product.ingredients.split(",")
            : []),
  ].join(" ").toLowerCase();

  for (const { keywords, reason } of ACUTE_PAUSE_RULES) {
    if (keywords.some(kw => haystack.includes(kw))) return reason;
  }
  // "peel" in name or category (but not "peel off" instructional text)
  if (/\bpeel\b/.test(haystack) && !haystack.includes("peel off")) return "exfoliant";
  return null;
}

function buildTreatmentRoutineAdvice(phase, products, activeMap) {
  const hasSPF = hasSPFCoverage(products, activeMap);
  const isAcutePhase = /acute/i.test(phase.label);

  // paused: { name, reason } — actual product names shown in the UI
  const paused = [];
  const cleared = []; // strings

  const isCleared = (name) => (phase.resume || []).some(r =>
    r.toLowerCase().includes(name.toLowerCase()) || r === "Full Ritual"
  );

  if (isAcutePhase) {
    // Scan actual vanity products for all ingredients / categories to pause
    products.forEach(p => {
      const reason = getAcutePauseReason(p);
      if (reason) paused.push({ name: p.name, reason });
    });
  } else {
    const hasRetinol = !!activeMap["retinol"]?.length;
    const hasAHA    = !!activeMap["AHA"]?.length;
    const hasBHA    = !!activeMap["BHA"]?.length;
    const hasVitC   = !!activeMap["vitamin C"]?.length;
    if (hasRetinol) { isCleared("Retinol")    ? cleared.push("Retinol")       : paused.push({ name: "Retinol",       reason: "active" }); }
    if (hasAHA)     { isCleared("AHA")        ? cleared.push("AHA Exfoliant") : paused.push({ name: "AHA Exfoliant", reason: "acid"   }); }
    if (hasBHA)     { isCleared("BHA")        ? cleared.push("BHA Exfoliant") : paused.push({ name: "BHA Exfoliant", reason: "acid"   }); }
    if (hasVitC)    { isCleared("Vitamin C")  ? cleared.push("Vitamin C")     : paused.push({ name: "Vitamin C",     reason: "active" }); }
  }

  if (hasSPF) cleared.push("SPF — mandatory");
  return { paused, cleared };
}

const inputSt = { width: "100%", padding: "12px 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontFamily: "var(--font-body)", fontSize: 14, color: "var(--parchment)", outline: "none" };
const labelSt = { fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay)", display: "block", marginBottom: 6 };

function AddTreatmentModal({ onSave, onClose }) {
  const [typeId, setTypeId] = useState(TREATMENT_TYPES[0].id);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [intensity, setIntensity] = useState("standard");
  const selected = TREATMENT_TYPES.find(t => t.id === typeId);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(8,10,8,0.85)", backdropFilter: "blur(12px)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "var(--ink)", width: "100%", maxWidth: 520, borderRadius: "20px 20px 0 0", padding: "28px 24px 52px", maxHeight: "88vh", overflowY: "auto", border: "1px solid var(--border)", borderBottom: "none" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 5px" }}>Log Treatment</p>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--parchment)", margin: 0, lineHeight: 1.1 }}>What did you get?</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", padding: 4 }}><Icon name="x" size={17} /></button>
        </div>

        {/* Treatment type */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelSt}>Treatment Type</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {TREATMENT_TYPES.map(t => (
              <button key={t.id} onClick={() => setTypeId(t.id)}
                style={{ padding: "12px 16px", background: typeId === t.id ? "rgba(45,61,43,0.12)" : "var(--ink)", border: `1px solid ${typeId === t.id ? "rgba(45,61,43,0.4)" : "var(--border)"}`, borderRadius: 11, cursor: "pointer", textAlign: "left", transition: "all 0.18s" }}>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--parchment)", margin: "0 0 2px", fontWeight: typeId === t.id ? 600 : 400 }}>{t.label}</p>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--clay)", margin: 0 }}>{t.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Date */}
        <div style={{ marginBottom: 24 }}>
          <label style={labelSt}>Treatment Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ ...inputSt, colorScheme: "dark" }} />
        </div>

        <button onClick={() => onSave({ id: Date.now().toString(), typeId, date, label: selected?.label })}
          style={{ width: "100%", padding: "14px 0", background: "#2d3d2b", color: "#fdfcf9", border: "none", borderRadius: 10, fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer" }}>
          Start Recovery Tracking
        </button>
      </div>
    </div>
  );
}

function TreatmentRecoveryCard({ treatment, products, activeMap, onDismiss, onResetDate }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const result = getTreatmentPhase(treatment);
  if (!result || !result.phase) return null;

  const { phase, elapsed, type } = result;
  const { paused, cleared } = buildTreatmentRoutineAdvice(phase, products, activeMap);
  const isLastPhase = phase.label === "Cleared" || phase.days[1] === 999;

  const phaseIndex = type.phases.findIndex(p => p.label === phase.label);
  const progress = Math.min((elapsed / (type.phases[type.phases.length - 2]?.days[1] || 21)) * 100, 100);

  // "Started April 7" — tolerant to both YYYY-MM-DD strings and full ISO timestamps
  const startedLabel = (() => {
    if (!treatment.date) return null;
    const iso = String(treatment.date);
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    if (!y || !m || !d) return null;
    return `Started ${new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric" })}`;
  })();

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ background: "rgba(45,61,43,0.07)", border: "1px solid rgba(45,61,43,0.22)", borderRadius: 16, padding: "18px 20px 16px", position: "relative" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 3px" }}>Recovery — Day {elapsed}</p>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 400, letterSpacing: "0.08em", color: "var(--parchment)", margin: "0 0 2px", lineHeight: 1.2 }}>{type.label}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: isLastPhase ? "#2d3d2b" : "#8b7355" }} />
              <span style={{ fontFamily: "var(--font-body)", fontSize: 10, color: isLastPhase ? "#2d3d2b" : "#8b7355", fontWeight: 600, letterSpacing: "0.06em" }}>{phase.label}</span>
            </div>
            {startedLabel && (
              <p style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--clay)", margin: "5px 0 0", opacity: 0.6, letterSpacing: "0.04em" }}>{startedLabel}</p>
            )}
          </div>
          {isLastPhase && (
            <button onClick={onDismiss} style={{ padding: "6px 12px", background: "rgba(232,226,217,0.18)", border: "1px solid rgba(45,61,43,0.3)", borderRadius: 8, fontFamily: "var(--font-body)", fontSize: 9, color: "#2d3d2b", cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              All Clear
            </button>
          )}
        </div>

        {/* Progress bar */}
        {!isLastPhase && (
          <div style={{ height: 2, background: "var(--border)", borderRadius: 2, marginBottom: 14, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: "#2d3d2b", borderRadius: 2, transition: "width 0.4s ease" }} />
          </div>
        )}

        {/* Phase description */}
        <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: "0 0 14px", lineHeight: 1.65 }}>{phase.description}</p>

        {/* Paused actives */}
        {paused.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "#8b7355", margin: "0 0 6px" }}>Paused from your vanity</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {paused.map((p, i) => (
                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9, fontFamily: "var(--font-body)", color: "#8b7355", background: "rgba(139,115,85,0.08)", border: "1px solid rgba(139,115,85,0.22)", padding: "3px 10px", borderRadius: 20, letterSpacing: "0.06em" }}>
                  {p.name}
                  <span style={{ fontSize: 9, letterSpacing: "0.1em", color: "var(--color-pebble)", opacity: 0.65 }}>{p.reason}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Cleared */}
        {cleared.length > 0 && (
          <div>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "#2d3d2b", margin: "0 0 6px" }}>Cleared to use</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {cleared.map((c, i) => (
                <span key={i} style={{ fontSize: 9, fontFamily: "var(--font-body)", color: "#2d3d2b", background: "rgba(45,61,43,0.08)", border: "1px solid rgba(45,61,43,0.22)", padding: "3px 10px", borderRadius: 20, letterSpacing: "0.06em" }}>{c}</span>
              ))}
            </div>
          </div>
        )}

        {/* Phase timeline dots */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginTop: 16 }}>
          {type.phases.map((p, i) => {
            const isCurrent = p.label === phase.label;
            const isPast = i < phaseIndex;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", flex: i < type.phases.length - 1 ? 1 : 0 }}>
                <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ width: isCurrent ? 9 : 6, height: isCurrent ? 9 : 6, borderRadius: "50%", background: isCurrent ? "#2d3d2b" : isPast ? "rgba(45,61,43,0.5)" : "var(--border)", transition: "all 0.3s", border: isCurrent ? "2px solid rgba(45,61,43,0.4)" : "none", flexShrink: 0 }} />
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 7, color: isCurrent ? "#2d3d2b" : "var(--clay)", opacity: isCurrent ? 1 : 0.5, letterSpacing: "0.06em", whiteSpace: "nowrap", position: "absolute", top: 13 }}>{p.label}</span>
                </div>
                {i < type.phases.length - 1 && <div style={{ flex: 1, height: 1, background: isPast ? "rgba(45,61,43,0.4)" : "var(--border)", margin: "0 2px", marginBottom: 4 }} />}
              </div>
            );
          })}
        </div>
        <div style={{ height: 18 }} />

        {/* Reset start date — for correcting a corrupted date */}
        {onResetDate && (
          <div style={{ marginTop: 6, paddingTop: 10, borderTop: "1px dashed var(--border)" }}>
            {confirmReset ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--clay)", flex: 1 }}>Reset Day 1 to today?</span>
                <button onClick={() => { onResetDate(); setConfirmReset(false); }}
                  style={{ padding: "6px 12px", background: "rgba(139,115,85,0.12)", border: "1px solid rgba(139,115,85,0.35)", borderRadius: 8, fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8b7355", cursor: "pointer" }}>
                  Confirm
                </button>
                <button onClick={() => setConfirmReset(false)}
                  style={{ padding: "6px 12px", background: "transparent", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clay)", cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmReset(true)}
                style={{ background: "none", border: "none", padding: 0, fontFamily: "var(--font-body)", fontSize: 10, color: "var(--clay)", opacity: 0.6, cursor: "pointer", letterSpacing: "0.06em", textDecoration: "underline" }}>
                Reset start date
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TreatmentSection({ treatments, saveTreatment, removeTreatment, updateTreatmentDate = () => {}, products, activeMap }) {
  const [addOpen, setAddOpen] = useState(false);
  const activeTreatments = treatments.filter(t => {
    const r = getTreatmentPhase(t);
    return r && r.phase;
  });

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--clay)" }}>Treatments</span>
          {activeTreatments.length > 0 && (
            <span style={{ fontSize: 9, fontFamily: "var(--font-body)", color: "#2d3d2b", background: "rgba(232,226,217,0.18)", border: "1px solid rgba(45,61,43,0.25)", padding: "2px 8px", borderRadius: 20 }}>{activeTreatments.length} active</span>
          )}
        </div>
        <button onClick={() => setAddOpen(true)}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", background: "none", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "var(--font-body)", fontSize: 9, color: "var(--clay)", cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase", transition: "all 0.2s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#2d3d2b"; e.currentTarget.style.color = "#2d3d2b"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--clay)"; }}>
          <Icon name="plus" size={11} /> Log
        </button>
      </div>

      {activeTreatments.length === 0 ? (
        <div style={{ padding: "20px 0", textAlign: "center" }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--clay)", margin: "0 0 4px" }}>No active recovery windows.</p>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--clay)", opacity: 0.5 }}>Log a treatment to get a day-by-day recovery routine.</p>
        </div>
      ) : (
        activeTreatments.map(t => (
          <TreatmentRecoveryCard
            key={t.id}
            treatment={t}
            products={products}
            activeMap={activeMap}
            onDismiss={() => removeTreatment(t.id)}
            onResetDate={(newIso) => updateTreatmentDate(t.id, newIso)}
          />
        ))
      )}

      {addOpen && (
        <AddTreatmentModal
          onSave={t => { saveTreatment(t); setAddOpen(false); }}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  );
}


// --- BODY ACNE TRACKER --------------------------------------------------------

const FACE_TRACKER_ZONES = [
  {
    id: "forehead",
    label: "Forehead",
    causes: ["Hair product transfer (especially at night)", "Sweat trapped under bangs or hats", "Stress and sebum overproduction"],
    advice: "Keep hair off the forehead at night. A BHA toner applied with a cotton pad targets closed comedones without over-drying the rest of the face.",
    products: ["BHA toner (salicylic acid)", "Oil-free moisturiser"],
  },
  {
    id: "temples",
    label: "Temples",
    causes: ["Phone screen contact", "Sunglasses or headband friction", "Hair product migrating from the hairline"],
    advice: "Clean your phone screen daily and rotate which side you press to your face. Wipe sunglasses arms with a micellar pad between uses.",
    products: ["Micellar water wipes", "BHA spot treatment"],
  },
  {
    id: "nose",
    label: "Nose",
    causes: ["High sebum concentration in the T-zone", "Closed comedones and blackheads", "Incomplete cleansing around the creases"],
    advice: "Extend cleansing time on and around the nose — the creases trap sebum. A BHA toner 3–5x per week keeps pores clear without over-exfoliating.",
    products: ["BHA toner (salicylic acid 2%)", "Clay mask 1x weekly"],
  },
  {
    id: "cheeks",
    label: "Cheeks",
    causes: ["Pillowcase buildup", "Phone screen contact", "Hormonal fluctuations", "Heavier skincare occluding pores"],
    advice: "Change pillowcases every 2–3 days. If only one side breaks out, that's your phone / sleep side. Lighten up on cheek-area creams during flare-ups.",
    products: ["Silk or satin pillowcase", "Niacinamide serum", "Lightweight moisturiser"],
  },
  {
    id: "chin",
    label: "Chin",
    causes: ["Hormonal — especially in the luteal phase", "Hand-to-face contact", "Mask friction or toothpaste residue"],
    advice: "Chin breakouts are the classic hormonal pattern. BHA spot treatment in the week before your period helps. Rinse the chin after brushing your teeth.",
    products: ["BHA spot treatment", "Niacinamide serum"],
  },
  {
    id: "jawline",
    label: "Jawline",
    causes: ["Hormonal — progesterone-driven", "Phone contact", "Hair product running down from the hairline"],
    advice: "If it tracks with your cycle, this is hormonal. Cleanse extending beyond the jaw into the neck, and keep hair off the jawline at night.",
    products: ["Gentle cleanser", "BHA toner on a cotton pad"],
  },
  {
    id: "perioral",
    label: "Above lip / perioral",
    causes: ["Toothpaste (SLS or fluoride) residue", "Lip balm ingredients migrating", "Mask friction"],
    advice: "Switch to an SLS-free toothpaste for two weeks to test. Rinse the area thoroughly after brushing. Check lip product ingredients for known pore-cloggers.",
    products: ["SLS-free toothpaste", "Fragrance-free lip balm"],
  },
  {
    id: "mustache",
    label: "Mustache area",
    causes: ["Shaving irritation and ingrown hairs", "Lip balm or food residue", "Heavy creams absorbed into facial hair"],
    advice: "Use a fresh blade and shave in the direction of hair growth. A thin BHA application after shaving helps prevent ingrowns turning into pustules.",
    products: ["BHA toner post-shave", "Fragrance-free shave gel"],
  },
  {
    id: "beard_area",
    label: "Beard / facial hair area",
    causes: ["Folliculitis from shaving", "Trapped oil and debris in facial hair", "Beard oil or balm build-up"],
    advice: "Wash beard area with a gentle cleanser daily — product residue and sebum accumulate in the hair. Benzoyl peroxide 2.5% reduces folliculitis bacteria when used 3–4x weekly.",
    products: ["Benzoyl peroxide 2.5% wash", "Lightweight beard oil (jojoba)"],
  },
  {
    id: "sideburns",
    label: "Sideburns",
    causes: ["Hair product migration from styling", "Friction from headphones, hats, or eyewear", "Incomplete cleansing at the hair boundary"],
    advice: "Rinse the sideburn area thoroughly when washing hair — conditioner often lingers here. Wipe headphone cushions weekly.",
    products: ["Clarifying shampoo", "BHA toner on cotton pad"],
  },
  {
    id: "hairline",
    label: "Hairline",
    causes: ["Shampoo or conditioner residue", "Styling products (gels, oils, sprays) migrating", "Sweat trapped under hair"],
    advice: "Hairline breakouts almost always link to hair products. Rinse thoroughly, tilting your head back, and check for silicones or heavy oils in your products.",
    products: ["Silicone-free shampoo", "BHA toner on cotton pad"],
  },
  {
    id: "neck",
    label: "Neck",
    causes: ["Hair product running down after washing", "Laundry detergent or fabric softener residue on collars", "Sunscreen / fragrance sensitivity"],
    advice: "Rinse the neck thoroughly after washing hair. Switch to fragrance-free detergent for two weeks to rule it out. Extend skincare onto the neck — don't stop at the jaw.",
    products: ["Fragrance-free detergent", "Same moisturiser as face, extended"],
  },
  {
    id: "neck_beard_line",
    label: "Neck beard line",
    causes: ["Shaving irritation and ingrown hairs at the beard boundary", "Friction from shirt collars", "Sweat trapped against the neckline"],
    advice: "Shave with the grain at the neckline — not against it. BHA toner applied after shaving reduces ingrowns. Unbutton collars slightly when skin is flaring.",
    products: ["BHA toner post-shave", "Fresh single-blade razor"],
  },
];

const BODY_ZONES = [
  {
    id: "chest",
    label: "Chest",
    causes: ["Detergent or fabric softener residue", "Sweat and tight synthetic fabrics", "Hormonal fluctuations", "Heavy chest/décolleté skincare products"],
    advice: "Switch to fragrance-free detergent. Natural fabrics breathe better. Avoid heavy creams on the chest — the skin here is more occlusion-sensitive than the face.",
    products: ["Fragrance-free detergent", "BHA toner applied with cotton pad", "Lightweight non-comedogenic moisturizer"],
  },
  {
    id: "upper_back",
    label: "Upper Back",
    causes: ["Sweat and heat trapped under clothing", "Hair products (conditioner, oils) running down", "Backpack or bag friction", "Post-workout bacteria buildup"],
    advice: "Rinse hair products off your back thoroughly. Shower immediately after sweating. Use a long-handled brush with a BHA or benzoyl peroxide wash to reach the full area.",
    products: ["BHA body wash (salicylic acid 2%)", "Benzoyl peroxide wash 5–10%", "Oil-free sunscreen for back"],
  },
  {
    id: "lower_back",
    label: "Lower Back",
    causes: ["Waistband friction and occlusion", "Sweat pooling under clothing", "Hormonal fluctuations"],
    advice: "Loose-fitting clothing around the waist helps significantly. AHA body lotion applied after showering helps with texture and congestion in this area.",
    products: ["AHA body lotion (lactic or glycolic)", "Lightweight non-comedogenic moisturizer"],
  },
  {
    id: "shoulders",
    label: "Shoulders",
    causes: ["Friction from straps, bags, or seatbelts", "Sweat accumulation", "Hair product contact"],
    advice: "Friction acne responds well to consistent BHA use. Apply after showering while skin is still slightly damp. Switching bag sides can help if one shoulder is worse.",
    products: ["BHA body spray or wash", "Niacinamide body lotion"],
  },
  {
    id: "arms",
    label: "Upper Arms",
    causes: ["Often keratosis pilaris (KP) rather than acne — rough texture, not inflamed", "Dry skin and follicle buildup", "Friction from clothing"],
    advice: "KP responds to AHA (lactic acid) or urea-based body lotion applied consistently. It's not acne — salicylic acid is less effective here than AHA. Avoid scrubbing, which worsens it.",
    products: ["AHA body lotion (lactic acid 5–10%)", "Urea cream 10–20%", "Gentle non-foaming body wash"],
  },
  {
    id: "butt",
    label: "Butt",
    causes: ["Prolonged sitting and friction", "Sweat and occlusion from tight clothing", "Folliculitis from shaving or waxing", "Non-breathable fabric underwear"],
    advice: "Butt acne is usually folliculitis, not true acne. BHA or benzoyl peroxide wash used consistently helps. Wear breathable cotton underwear and shower promptly after sweating. Avoid sitting in damp workout clothes.",
    products: ["BHA body wash (salicylic acid 2%)", "Benzoyl peroxide wash 5%", "Lightweight non-comedogenic moisturizer"],
  },
  {
    id: "scalp",
    label: "Scalp",
    causes: ["Build-up from silicones, oils, or dry shampoo", "Sweat trapped under hats or long hair", "Dandruff / seborrheic dermatitis feeding pityrosporum"],
    advice: "Shampoo more often during flares, focusing the lather at the roots. A salicylic acid or ketoconazole scalp shampoo 2x weekly clears build-up and reduces yeast overgrowth.",
    products: ["Salicylic acid scalp shampoo", "Ketoconazole 1% shampoo (2x weekly)"],
  },
];

const BODY_TRIGGERS = [
  { id: "sweat", label: "Gym / Sweat" },
  { id: "detergent", label: "New detergent" },
  { id: "tight_clothing", label: "Tight clothing" },
  { id: "stress", label: "High stress" },
  { id: "diet", label: "Diet change" },
  { id: "hormonal", label: "Hormonal week" },
  { id: "hair_products", label: "Hair products" },
  { id: "new_product", label: "New skincare product" },
];

function buildBodyShelfAdvice(zones, products, activeMap) {
  const hasBHA = !!activeMap["BHA"]?.length || products.some(p => (p.ingredients || []).some(i => i.includes("salicylic")));
  const hasNiacinamide = products.some(p => (p.ingredients || []).some(i => i.includes("niacinamide")));
  const hasAHA = !!activeMap["AHA"]?.length;

  const gaps = [];
  const doubles = [];

  if (zones.length > 0) {
    if (!hasBHA) gaps.push({ product: "BHA body wash", reason: "Salicylic acid is the most effective OTC active for body acne — it penetrates follicles and reduces congestion." });
    if (zones.includes("arms")) gaps.push({ product: "AHA body lotion (lactic acid)", reason: "Upper arm texture (KP) responds specifically to AHA, not BHA. Consistent daily use is what works." });
    if (hasBHA) doubles.push({ product: "Your BHA product", note: "Can be diluted into a small amount of water and applied to the back, chest, or shoulders as a targeted treatment." });
    if (hasNiacinamide) doubles.push({ product: "Your niacinamide serum", note: "Safe to apply to chest and shoulder acne — reduces redness and sebum production in those areas too." });
    if (hasAHA && !zones.includes("arms")) doubles.push({ product: "Your AHA product", note: "A thin layer on chest or back 2–3× per week helps with texture and congestion." });
  }

  return { gaps, doubles };
}

function BodyAcneTracker({ products, activeMap, user = {}, onUpdateUser = () => {} }) {
  const enabled = user.bodyAcneEnabled || false;
  const zones = user.bodyAcneZones || [];
  const [triggerLog, setTriggerLog] = useState([]);
  const [showTriggerModal, setShowTriggerModal] = useState(false);
  const [selectedTriggers, setSelectedTriggers] = useState([]);
  const [expandedZone, setExpandedZone] = useState(null);

  const { gaps, doubles } = buildBodyShelfAdvice(zones, products, activeMap);

  const setEnabled = (val) => onUpdateUser({ ...user, bodyAcneEnabled: val });
  const _cd = getCurrentCycleDay(user);
  const isLuteal = _cd ? getCyclePhase(_cd).name === "Luteal" : false;

  const toggleZone = (id) => {
    const updated = zones.includes(id) ? zones.filter(x => x !== id) : [...zones, id];
    onUpdateUser({ ...user, bodyAcneZones: updated });
  };

  if (!enabled) {
    return (
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 20px", marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--clay)" }}>Body Acne</span>
          <span style={{ fontSize: 9, fontFamily: "var(--font-body)", color: "var(--clay)", background: "var(--surface)", border: "1px solid var(--border)", padding: "2px 8px", borderRadius: 20, letterSpacing: "0.06em" }}>Optional</span>
        </div>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--clay)", margin: "0 0 16px", lineHeight: 1.65 }}>
          Track body acne zones, identify triggers, and get advice drawn from what's already on your vanity.
        </p>
        <button onClick={() => setEnabled(true)}
          style={{ padding: "10px 20px", background: "rgba(45,61,43,0.10)", border: "1px solid rgba(45,61,43,0.3)", borderRadius: 10, fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2d3d2b", cursor: "pointer", transition: "all 0.2s" }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(45,61,43,0.18)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(45,61,43,0.10)"}>
          Enable
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--clay)" }}>Body Acne</span>
          {zones.length > 0 && <span style={{ fontSize: 9, fontFamily: "var(--font-body)", color: "#2d3d2b", background: "rgba(232,226,217,0.18)", border: "1px solid rgba(45,61,43,0.25)", padding: "2px 8px", borderRadius: 20 }}>{zones.length} zone{zones.length !== 1 ? "s" : ""}</span>}
        </div>
        <button onClick={() => setShowTriggerModal(true)}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", background: "none", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "var(--font-body)", fontSize: 9, color: "var(--clay)", cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase", transition: "all 0.2s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#2d3d2b"; e.currentTarget.style.color = "#2d3d2b"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--clay)"; }}>
          <Icon name="plus" size={11} /> Log Trigger
        </button>
      </div>

      {/* Zone selector */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "16px 18px", marginBottom: 12 }}>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 12px" }}>Where do you experience it?</p>

        <p style={{ fontFamily: "var(--font-body)", fontSize: 9, color: "var(--clay)", margin: "0 0 8px", letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.55 }}>Face</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
          {FACE_TRACKER_ZONES.map(zone => {
            const active = zones.includes(zone.id);
            return (
              <button key={zone.id} onClick={() => { toggleZone(zone.id); setExpandedZone(active ? null : zone.id); }}
                style={{ padding: "9px 16px", borderRadius: 22, border: `1px solid ${active ? "rgba(45,61,43,0.5)" : "var(--border)"}`, background: active ? "rgba(45,61,43,0.10)" : "transparent", color: active ? "#2d3d2b" : "var(--clay)", fontFamily: "var(--font-body)", fontSize: 11, fontWeight: active ? 600 : 400, cursor: "pointer", transition: "all 0.18s" }}>
                {zone.label}
              </button>
            );
          })}
        </div>

        <p style={{ fontFamily: "var(--font-body)", fontSize: 9, color: "var(--clay)", margin: "0 0 8px", letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.55 }}>Body</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {BODY_ZONES.map(zone => {
            const active = zones.includes(zone.id);
            return (
              <button key={zone.id} onClick={() => { toggleZone(zone.id); setExpandedZone(active ? null : zone.id); }}
                style={{ padding: "9px 16px", borderRadius: 22, border: `1px solid ${active ? "rgba(45,61,43,0.5)" : "var(--border)"}`, background: active ? "rgba(45,61,43,0.10)" : "transparent", color: active ? "#2d3d2b" : "var(--clay)", fontFamily: "var(--font-body)", fontSize: 11, fontWeight: active ? 600 : 400, cursor: "pointer", transition: "all 0.18s" }}>
                {zone.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Zone details */}
      {zones.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {[...FACE_TRACKER_ZONES, ...BODY_ZONES].filter(z => zones.includes(z.id)).map(zone => {
            const open = expandedZone === zone.id;
            return (
              <div key={zone.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", transition: "all 0.2s" }}>
                <button onClick={() => setExpandedZone(open ? null : zone.id)}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#2d3d2b" }} />
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--parchment)", fontWeight: 500 }}>{zone.label}</span>
                  </div>
                  <span style={{ color: "var(--clay)", opacity: 0.4, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s", display: "inline-flex" }}><Icon name="chevron" size={12} /></span>
                </button>
                {open && (
                  <div style={{ padding: "0 18px 16px", borderTop: "1px solid var(--border)" }}>
                    {/* Causes */}
                    <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--clay)", margin: "14px 0 8px" }}>Common Causes</p>
                    {zone.causes.map((c, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, marginBottom: 5 }}>
                        <div style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--clay)", flexShrink: 0, marginTop: 5, opacity: 0.5 }} />
                        <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: 0, lineHeight: 1.6 }}>{c}</p>
                      </div>
                    ))}
                    {/* Advice */}
                    <div style={{ marginTop: 12, padding: "12px 14px", background: "rgba(45,61,43,0.06)", border: "1px solid rgba(45,61,43,0.18)", borderRadius: 10 }}>
                      <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--parchment)", margin: 0, lineHeight: 1.65 }}>{zone.advice}</p>
                    </div>
                    {/* Suggested products */}
                    <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--clay)", margin: "12px 0 7px" }}>What Helps</p>
                    {zone.products.map((p, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 9, color: "#2d3d2b", flexShrink: 0, marginTop: 2 }}>+</span>
                        <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: 0, lineHeight: 1.6 }}>{p}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Shelf integration */}
      {zones.length > 0 && (gaps.length > 0 || doubles.length > 0) && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px", marginBottom: 12 }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 12px" }}>Your Vanity</p>

          {doubles.length > 0 && (
            <div style={{ marginBottom: doubles.length > 0 && gaps.length > 0 ? 12 : 0 }}>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2d3d2b", margin: "0 0 8px" }}>Already on your vanity</p>
              {doubles.map((d, i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 7 }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#2d3d2b", flexShrink: 0, marginTop: 4 }} />
                  <div>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--parchment)", margin: "0 0 2px", fontWeight: 500 }}>{d.product}</p>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: 0, lineHeight: 1.55 }}>{d.note}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {gaps.length > 0 && (
            <div>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8b7355", margin: "0 0 8px" }}>Worth adding</p>
              {gaps.map((g, i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 7 }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#8b7355", flexShrink: 0, marginTop: 4 }} />
                  <div>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--parchment)", margin: "0 0 2px", fontWeight: 500 }}>{g.product}</p>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: 0, lineHeight: 1.55 }}>{g.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Trigger log */}
      {triggerLog.length > 0 && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px" }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 12px" }}>Recent Triggers</p>
          {triggerLog.slice(-5).reverse().map((entry, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: i < triggerLog.slice(-5).length - 1 ? 10 : 0, paddingBottom: i < triggerLog.slice(-5).length - 1 ? 10 : 0, borderBottom: i < triggerLog.slice(-5).length - 1 ? "1px solid var(--border)" : "none" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 3 }}>
                  {entry.triggers.map((t, j) => (
                    <span key={j} style={{ fontSize: 9, fontFamily: "var(--font-body)", color: "var(--clay)", background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", padding: "2px 8px", borderRadius: 20 }}>{t}</span>
                  ))}
                </div>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--clay)", margin: 0, opacity: 0.5 }}>{new Date(entry.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Disable */}
      <button onClick={() => setEnabled(false)}
        style={{ background: "none", border: "none", padding: "12px 0 0", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--clay)", opacity: 0.35, transition: "opacity 0.2s" }}
        onMouseEnter={e => e.currentTarget.style.opacity = "0.7"}
        onMouseLeave={e => e.currentTarget.style.opacity = "0.35"}>
        Disable tracking
      </button>

      {/* Trigger log modal */}
      {showTriggerModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(8,10,8,0.85)", backdropFilter: "blur(12px)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={e => e.target === e.currentTarget && setShowTriggerModal(false)}>
          <div style={{ background: "var(--ink)", width: "100%", maxWidth: 520, borderRadius: "20px 20px 0 0", padding: "28px 24px 52px", border: "1px solid var(--border)", borderBottom: "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 4px" }}>Log</p>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--parchment)", margin: 0 }}>What happened today?</h2>
              </div>
              <button onClick={() => setShowTriggerModal(false)} style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", padding: 4 }}><Icon name="x" size={17} /></button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
              {BODY_TRIGGERS.map(t => {
                const active = selectedTriggers.includes(t.label);
                return (
                  <button key={t.id} onClick={() => setSelectedTriggers(prev => active ? prev.filter(x => x !== t.label) : [...prev, t.label])}
                    style={{ padding: "10px 16px", borderRadius: 22, border: `1px solid ${active ? "rgba(45,61,43,0.5)" : "var(--border)"}`, background: active ? "rgba(45,61,43,0.10)" : "var(--ink)", color: active ? "#2d3d2b" : "var(--clay)", fontFamily: "var(--font-body)", fontSize: 12, cursor: "pointer", transition: "all 0.18s" }}>
                    {t.label}
                  </button>
                );
              })}
            </div>
            <button onClick={() => {
              if (selectedTriggers.length > 0) {
                setTriggerLog(prev => [...prev, { date: new Date().toISOString(), triggers: selectedTriggers }]);
                setSelectedTriggers([]);
                setShowTriggerModal(false);
              }
            }}
              style={{ width: "100%", padding: "14px 0", background: selectedTriggers.length > 0 ? "#2d3d2b" : "var(--ink)", color: selectedTriggers.length > 0 ? "#fdfcf9" : "var(--clay)", border: "none", borderRadius: 10, fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", cursor: selectedTriggers.length > 0 ? "pointer" : "default", opacity: selectedTriggers.length > 0 ? 1 : 0.5 }}>
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function JournalFullView({ journals, onClose, onEditToday }) {
  const today = new Date().toISOString().split("T")[0];
  const sorted = [...journals].sort((a, b) => b.date.localeCompare(a.date));

  // Group by month
  const groups = [];
  let currentMonth = null;
  for (const j of sorted) {
    const d = new Date(j.date + "T12:00:00");
    const monthKey = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (monthKey !== currentMonth) {
      currentMonth = monthKey;
      groups.push({ month: monthKey, entries: [] });
    }
    groups[groups.length - 1].entries.push(j);
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "var(--ink)", overflowY: "auto", padding: "0 0 40px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 12px", borderBottom: "1px solid var(--border)" }}>
        <button onClick={onClose}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-body)", fontSize: 12, color: "var(--clay)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <Icon name="arrow-left" size={12} /> Back
        </button>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--parchment)", margin: 0 }}>Skin Journal</h2>
        <button onClick={onEditToday}
          style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, color: "#2d3d2b", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          + Log
        </button>
      </div>

      <div style={{ padding: "0 20px" }}>
        {groups.map(g => (
          <div key={g.month}>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--clay)", margin: "24px 0 10px", opacity: 0.7 }}>{g.month}</p>
            {g.entries.map(j => {
              const c = SKIN_CONDITIONS.find(x => x.key === j.condition);
              const d = new Date(j.date + "T12:00:00");
              const isToday = j.date === today;
              const dateLabel = isToday ? "Today" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
              return (
                <div key={j.date} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: j.notes ? 8 : 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: c ? c.color : "var(--clay)", flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: isToday ? "var(--parchment)" : "var(--clay)" }}>{dateLabel}</span>
                      <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: c ? c.color : "var(--parchment)", fontWeight: 600 }}>{c ? c.label : j.condition}</span>
                    </div>
                    <div style={{ display: "flex", gap: 5 }}>
                      {j.sleep && <span style={{ fontSize: 9, fontFamily: "var(--font-body)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clay)", background: "var(--ink)", padding: "2px 7px", borderRadius: 20 }}>Sleep {j.sleep}</span>}
                      {j.stress && <span style={{ fontSize: 9, fontFamily: "var(--font-body)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clay)", background: "var(--ink)", padding: "2px 7px", borderRadius: 20 }}>Stress {j.stress}</span>}
                    </div>
                  </div>
                  {j.notes && (
                    <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: 0, lineHeight: 1.5, opacity: 0.8 }}>{j.notes}</p>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {sorted.length === 0 && (
          <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--clay)", textAlign: "center", marginTop: 40, opacity: 0.6 }}>No journal entries yet. Start logging to see your history.</p>
        )}
      </div>
    </div>
  );
}

// --- WEEK AT A GLANCE --------------------------------------------------------
// Weekly summary: skin ratings, check-ins, and ritual adherence proxy
// (days with any logged journal OR check-in entry this week).
function isScheduledOnDate(product, date) {
  const freq = product.frequency || "daily";
  if (freq === "daily") return true;
  if (freq === "as-needed") return false;
  const rs = product.routineStartDate;
  const start = rs
    ? (() => { const [y, m, d] = rs.split("T")[0].split("-").map(Number); return new Date(y, m - 1, d); })()
    : new Date();
  const dayDiff = Math.floor((date - start) / 86400000);
  if (freq === "alternating") return dayDiff % 2 === 0;
  if (freq === "2-3x") return [0, 2, 4].includes(((dayDiff % 7) + 7) % 7);
  if (freq === "weekly") return ((dayDiff % 7) + 7) % 7 === 0;
  return true;
}

function getProductSession(product) {
  if (product.session === "am") return "am";
  if (product.session === "pm") return "pm";
  if (product.session === "both") return "both";
  return getAutoSession(product).session;
}

function WeekAtAGlance({ checkIns, journals, products = [], pausedActives = [] }) {
  const [selectedDay, setSelectedDay] = useState(null);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffToMon = (today.getDay() + 6) % 7;
  const monday = new Date(startOfToday.getTime() - diffToMon * 86400000);

  const { am: amProducts, pm: pmProducts, periodic } = buildRoutine(products, { pausedActives });
  const allRoutine = [...new Map([...amProducts, ...pmProducts, ...periodic].map(p => [p.id, p])).values()];

  const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
  const DAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getTime() + i * 86400000);
    const iso = d.toISOString().split("T")[0];
    const journal = journals.find(j => j.date === iso) || null;
    const dayCheckIns = checkIns.filter(c => {
      if (!c.date) return false;
      const cd = new Date(c.date);
      return cd.getFullYear() === d.getFullYear() && cd.getMonth() === d.getMonth() && cd.getDate() === d.getDate();
    });
    const cond = journal ? SKIN_CONDITIONS.find(x => x.key === journal.condition) : null;
    const hasActivity = !!journal || dayCheckIns.length > 0;
    const hasIrritation = dayCheckIns.some(c => c.irritation && c.irritation !== "none");
    const isToday = d.getTime() === startOfToday.getTime();

    const am = [], pm = [];
    allRoutine.forEach(p => {
      const scheduled = isScheduledOnDate(p, d);
      const sess = getProductSession(p);
      if (sess === "am" || sess === "both") am.push({ ...p, scheduled });
      if (sess === "pm" || sess === "both") pm.push({ ...p, scheduled });
    });

    days.push({ iso, label: DAY_LABELS[i], full: DAY_FULL[i], date: d, journal, cond, dayCheckIns, hasActivity, hasIrritation, isToday, am, pm });
  }

  const weekJournals = days.filter(d => d.journal).length;
  const weekCheckIns = days.reduce((sum, d) => sum + d.dayCheckIns.length, 0);
  const adherencePct = Math.round((days.filter(d => d.hasActivity).length / 7) * 100);

  const bestDay = days.filter(d => d.cond).sort((a, b) => {
    const order = { rough: 0, dull: 1, okay: 2, good: 3, glowing: 4 };
    return (order[b.journal.condition] ?? -1) - (order[a.journal.condition] ?? -1);
  })[0];

  const hasAnyData = weekJournals > 0 || weekCheckIns > 0;
  const selectedDayObj = selectedDay !== null ? days[selectedDay] : null;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 16px 14px" }}>
      {/* 7-day routine grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5, marginBottom: 14 }}>
        {days.map((d, i) => {
          const amScheduled = d.am.filter(p => p.scheduled).length;
          const pmScheduled = d.pm.filter(p => p.scheduled).length;
          const selected = selectedDay === i;
          return (
            <button key={d.iso} onClick={() => setSelectedDay(selected ? null : i)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                padding: "10px 4px 8px", gap: 6,
                background: selected ? "rgba(45,61,43,0.15)" : d.isToday ? "rgba(45,61,43,0.07)" : "transparent",
                border: selected ? "1px solid rgba(45,61,43,0.45)" : d.isToday ? "1px solid rgba(45,61,43,0.25)" : "1px solid var(--border)",
                borderRadius: 12, cursor: "pointer", transition: "all 0.15s",
              }}>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 10, fontWeight: d.isToday ? 700 : 500, letterSpacing: "0.08em", color: d.isToday ? "var(--parchment)" : "var(--clay)" }}>{d.label}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, minHeight: 32, justifyContent: "flex-start", alignItems: "center", width: "100%" }}>
                {d.am.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3, justifyContent: "center" }}>
                    {d.am.map((p, j) => (
                      <div key={j} style={{ width: 6, height: 6, borderRadius: "50%", background: p.scheduled ? "var(--sage)" : "var(--taupe)", opacity: p.scheduled ? 0.9 : 0.4 }} />
                    ))}
                  </div>
                )}
                {(d.am.length > 0 || d.pm.length > 0) && (
                  <div style={{ width: "60%", height: 1, background: "var(--border)", opacity: 0.5 }} />
                )}
                {d.pm.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3, justifyContent: "center" }}>
                    {d.pm.map((p, j) => (
                      <div key={j} style={{ width: 6, height: 6, borderRadius: "50%", background: p.scheduled ? "var(--parchment)" : "var(--taupe)", opacity: p.scheduled ? 0.85 : 0.4 }} />
                    ))}
                  </div>
                )}
                {d.am.length === 0 && d.pm.length === 0 && (
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--taupe)", opacity: 0.35 }} />
                )}
              </div>
              {d.isToday && <div style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--sage)" }} />}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: selectedDay !== null ? 14 : 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--sage)", opacity: 0.9 }} />
          <span style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay)", opacity: 0.6 }}>AM</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--parchment)", opacity: 0.85 }} />
          <span style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay)", opacity: 0.6 }}>PM</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--taupe)", opacity: 0.4 }} />
          <span style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay)", opacity: 0.6 }}>Skipped</span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: "var(--font-body)", fontSize: 9, color: "var(--clay)", opacity: 0.4, letterSpacing: "0.06em" }}>Tap a day</span>
      </div>

      {/* Expanded day detail */}
      {selectedDayObj && (
        <div style={{ background: "var(--ink)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", marginBottom: 14 }}>
          <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--border)" }}>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 400, letterSpacing: "0.08em", color: "var(--parchment)", margin: 0 }}>{selectedDayObj.full}</p>
          </div>
          {selectedDayObj.am.length === 0 && selectedDayObj.pm.length === 0 ? (
            <div style={{ padding: "18px 16px" }}>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--clay)", margin: 0, opacity: 0.6 }}>No products in your routine yet.</p>
            </div>
          ) : (
            <div>
              {[{ key: "am", label: "\u2600 Morning", items: selectedDayObj.am }, { key: "pm", label: "\u263D Evening", items: selectedDayObj.pm }].map(slot => {
                if (slot.items.length === 0) return null;
                return (
                  <div key={slot.key} style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 10px", opacity: 0.55 }}>{slot.label}</p>
                    {slot.items.map((p, j) => {
                      const freq = p.frequency || "daily";
                      const isAlternating = freq !== "daily";
                      return (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: j < slot.items.length - 1 ? 8 : 0, opacity: p.scheduled ? 1 : 0.35 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.scheduled ? (slot.key === "am" ? "var(--sage)" : "var(--parchment)") : "var(--taupe)", flexShrink: 0, opacity: p.scheduled ? 1 : 0.5 }} />
                          <div style={{ flex: 1 }}>
                            <p style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500, color: "var(--parchment)", margin: "0 0 1px" }}>
                              {p.name}
                              {!p.scheduled && isAlternating && <span style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--clay)", opacity: 0.6, marginLeft: 6 }}>skipped</span>}
                            </p>
                            <p style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--clay)", margin: 0, opacity: 0.6 }}>
                              {p.brand}{isAlternating ? " · " + ({ alternating: "Every other night", "2-3x": "2-3× per week", weekly: "Once a week", "as-needed": "As needed" }[freq] || freq) : ""}
                            </p>
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

      {/* Stats row */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
        <div style={{ textAlign: "center", flex: 1 }}>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, letterSpacing: "0.05em", color: "var(--parchment)", margin: 0, lineHeight: 1 }}>{weekJournals}<span style={{ fontSize: 13, color: "var(--clay)", opacity: 0.6 }}>/7</span></p>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay)", margin: "4px 0 0", opacity: 0.6 }}>Journaled</p>
        </div>
        <div style={{ width: 1, background: "var(--border)" }} />
        <div style={{ textAlign: "center", flex: 1 }}>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, letterSpacing: "0.05em", color: "var(--parchment)", margin: 0, lineHeight: 1 }}>{weekCheckIns}</p>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay)", margin: "4px 0 0", opacity: 0.6 }}>Check-ins</p>
        </div>
        <div style={{ width: 1, background: "var(--border)" }} />
        <div style={{ textAlign: "center", flex: 1 }}>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, letterSpacing: "0.05em", color: "var(--parchment)", margin: 0, lineHeight: 1 }}>{adherencePct}<span style={{ fontSize: 13, color: "var(--clay)", opacity: 0.6 }}>%</span></p>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay)", margin: "4px 0 0", opacity: 0.6 }}>Adherence</p>
        </div>
      </div>

      {/* Best day summary */}
      {bestDay && bestDay.cond && (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: "12px 0 0", opacity: 0.75, lineHeight: 1.5 }}>
          Best day: <span style={{ color: bestDay.cond.color, fontWeight: 500 }}>{bestDay.date.toLocaleDateString("en-US", { weekday: "long" })}</span> — {bestDay.cond.label.toLowerCase()}.
        </p>
      )}
      {!hasAnyData && allRoutine.length === 0 && (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: "12px 0 0", opacity: 0.55, textAlign: "center" }}>
          Add products to your vanity to see your weekly schedule.
        </p>
      )}
    </div>
  );
}


function Progress({ products, checkIns, setCheckIns, treatments = [], setTreatments, saveTreatment, removeTreatment, updateTreatmentDate = () => {}, user = {}, onAdvanceRamp, onHoldRamp, onResetRampStart = () => {}, journals = [], setJournals = () => {}, onUpdateUser = () => {} }) {
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const [journalFullView, setJournalFullView] = useState(false);
  const { activeMap } = analyzeShelf(products);
  const conflicts = detectConflicts(products);

  const consistencyPct = checkIns.length === 0 ? null
    : Math.min(100, Math.round(100
        - (checkIns.filter(c => c.irritation !== "none").length / checkIns.length) * 28
        - (checkIns.filter(c => c.tight).length / checkIns.length) * 18
        - (checkIns.filter(c => c.breakout).length / checkIns.length) * 14));

  const lastCheckIn = checkIns.length ? checkIns.reduce((a, b) => new Date(a.date) > new Date(b.date) ? a : b) : null;
  const daysSince = lastCheckIn ? daysBetweenLocal(lastCheckIn.date) : null;
  const dueCheckin = daysSince === null || daysSince >= 3;

  // Active treatment pause state — drives reintroduction after recovery.
  const { pausedActives, reintroActives, treatment: pauseTreatment, phase: pausePhase } = getActivePauseState(treatments, products);

  // Core ramp list: products the user has actively been building up.
  const primaryRamp = products.filter(p =>
    p.inRoutine !== false &&
    p.routineStartDate &&
    (p.category === "Toning Pad" || RAMP_ACTIVES.some(a => detectActives(p.ingredients || [])[a]))
  );

  // Reintroduction list: products whose active is resuming after a treatment
  // but which aren't already in the primary ramp. We reset them to week 1
  // conceptually — but only for display (we don't mutate the stored rampWeek
  // unless the user explicitly advances).
  const reintroRamp = reintroActives.length > 0
    ? products.filter(p => {
        if (p.inRoutine === false) return false;
        if (primaryRamp.find(x => x.id === p.id)) return false;
        const actives = detectActives(p.ingredients || []);
        return reintroActives.some(a => actives[a]);
      }).map(p => ({ ...p, __reintroducing: true, rampWeek: p.rampWeek || 1 }))
    : [];

  const rampProducts = [...primaryRamp, ...reintroRamp];

  const sectionLabel = (icon, text) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <span style={{ color: "var(--clay)", opacity: 0.6 }}><Icon name={icon} size={13} /></span>
      <span style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--clay)" }}>{text}</span>
      <div style={{ flex: 1, height: 1, background: "var(--border)", marginLeft: 8 }} />
    </div>
  );

  return (
    <div>

      {/* -- Header ----------------------------------------------------------- */}
      <div style={{ marginBottom: 20, paddingTop: 44 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 38, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--color-inky-moss)", margin: 0, lineHeight: 1.15 }}>Your Progress</h1>
      </div>

      {/* -- Skin Journal ------------------------------------------------------ */}
      {sectionLabel("book-open", "Your Journal")}
      {(() => {
        const today = new Date().toISOString().split("T")[0];
        const todayEntry = journals.find(j => j.date === today);
        const pastEntries = [...journals].filter(j => j.date !== today).sort((a, b) => b.date.localeCompare(a.date));
        const visiblePast = pastEntries.slice(0, 3);
        const cond = todayEntry ? SKIN_CONDITIONS.find(c => c.key === todayEntry.condition) : null;
        return (
          <div style={{ marginBottom: 24 }}>
            {/* Today's featured card */}
            {!todayEntry ? (
              <button onClick={() => setShowJournal(true)}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 18px", background: "rgba(45,61,43,0.07)", border: "1px solid rgba(45,61,43,0.18)", borderRadius: 14, cursor: "pointer" }}>
                <div style={{ textAlign: "left" }}>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 4px" }}>Skin Journal</p>
                  <p style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 400, letterSpacing: "0.08em", color: "var(--parchment)", margin: 0 }}>How is your skin today?</p>
                </div>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, color: "#2d3d2b", letterSpacing: "0.06em" }}>+ Log</span>
              </button>
            ) : (
              <div onClick={() => setShowJournal(true)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 18px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, cursor: "pointer" }}>
                <div>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 3px" }}>Today</p>
                  <p style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 400, letterSpacing: "0.08em", color: cond ? cond.color : "var(--parchment)", margin: 0 }}>{cond ? cond.label : todayEntry.condition}</p>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {todayEntry.sleep && <span style={{ fontSize: 9, fontFamily: "var(--font-body)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clay)", background: "var(--ink)", padding: "3px 8px", borderRadius: 20 }}>Sleep {todayEntry.sleep}</span>}
                  {todayEntry.stress && <span style={{ fontSize: 9, fontFamily: "var(--font-body)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clay)", background: "var(--ink)", padding: "3px 8px", borderRadius: 20 }}>Stress {todayEntry.stress}</span>}
                </div>
              </div>
            )}

            {/* Previous entries (max 3) */}
            {visiblePast.length > 0 && (
              <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--clay)", margin: "14px 0 6px", opacity: 0.7 }}>Previous entries</p>
            )}
            {visiblePast.map(j => {
              const c = SKIN_CONDITIONS.find(x => x.key === j.condition);
              const d = new Date(j.date + "T12:00:00");
              const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
              return (
                <div key={j.date} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", background: "var(--surface)", border: "1px solid var(--border)", marginTop: -1, borderRadius: 0 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: c ? c.color : "var(--clay)", flexShrink: 0 }} />
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", flex: 1 }}>{label}</span>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: c ? c.color : "var(--parchment)", fontWeight: 500 }}>{c ? c.label : j.condition}</span>
                  {j.notes && <span style={{ fontFamily: "var(--font-body)", fontSize: 9, color: "var(--clay)", opacity: 0.5, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.notes}</span>}
                </div>
              );
            })}

            {/* View all link */}
            {pastEntries.length > 0 && (
              <button onClick={() => setJournalFullView(true)}
                style={{ width: "100%", padding: "9px 0", background: "var(--surface)", border: "1px solid var(--border)", borderTop: "none", marginTop: -1, borderRadius: "0 0 10px 10px", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.08em", color: "#2d3d2b" }}>
                View all {journals.length} entries <Icon name="arrow-right" size={10} />
              </button>
            )}
          </div>
        );
      })()}

      {/* -- Ritual Check-in ---------------------------------------------------- */}
      {sectionLabel("activity", "Ritual Check-in")}
      {dueCheckin ? (
        <button onClick={() => setShowCheckIn(true)}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", background: "rgba(45,61,43,0.09)", border: "1px solid rgba(45,61,43,0.28)", borderRadius: 14, marginBottom: 24, cursor: "pointer", textAlign: "left" }}>
          <div>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 4px" }}>Ritual Check-in</p>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 400, letterSpacing: "0.08em", color: "var(--parchment)", margin: "0 0 4px", lineHeight: 1 }}>How did your skin respond?</p>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: 0 }}>
              {daysSince === null ? "Log your first check-in to start tracking." : "Last check-in " + daysSince + " day" + (daysSince !== 1 ? "s" : "") + " ago."}
            </p>
          </div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, color: "#2d3d2b", flexShrink: 0, marginLeft: 12 }}>Check in <Icon name="arrow-right" size={11} /></span>
        </button>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, marginBottom: 24 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#2d3d2b", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--parchment)" }}>
              Checked in {daysSince === 0 ? "today" : daysSince + " day" + (daysSince !== 1 ? "s" : "") + " ago"}
            </span>
            {lastCheckIn && lastCheckIn.irritation && lastCheckIn.irritation !== "none" && (
              <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", marginLeft: 8, opacity: 0.7 }}>{lastCheckIn.irritation} irritation</span>
            )}
          </div>
          <button onClick={() => setShowCheckIn(true)} style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.08em", color: "var(--clay)", background: "none", border: "1px solid var(--border)", borderRadius: 20, padding: "5px 12px", cursor: "pointer" }}>Update</button>
        </div>
      )}

      {/* -- Consistency score — only when there are check-ins ------------------ */}
      {consistencyPct !== null && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 20px", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 48, fontWeight: 200, color: "var(--parchment)", lineHeight: 1 }}>{consistencyPct}</span>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)" }}>ritual health</span>
            </div>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--clay)", opacity: 0.6 }}>from {checkIns.length} check-in{checkIns.length !== 1 ? "s" : ""}</span>
          </div>
          <div style={{ height: 2, background: "rgba(255,255,255,0.05)", borderRadius: 2, marginBottom: 12, overflow: "hidden" }}>
            <div style={{ width: consistencyPct + "%", height: "100%", background: consistencyPct >= 80 ? "#2d3d2b" : consistencyPct >= 60 ? "#8b7355" : "#8b7355", borderRadius: 2, transition: "width 0.6s ease" }} />
          </div>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: 0, lineHeight: 1.6 }}>
            {consistencyPct >= 85 ? "Strong adherence — your ritual is building compounding benefit." :
             consistencyPct >= 70 ? "Mostly consistent. Fewer irritation days will improve this score." :
             "Irregularity detected. Consistent application is what drives visible results."}
          </p>
        </div>
      )}

      {/* -- Week at a glance (always visible) ---------------------------------- */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--clay)", marginBottom: 14 }}>Your week at a glance</p>
        <WeekAtAGlance checkIns={checkIns} journals={journals} products={products} pausedActives={pausedActives} />
      </div>

      {/* -- Introduce Slowly (hidden during Acute recovery; empty state otherwise) */}
      <div style={{ marginBottom: 28 }}>
        {/acute/i.test(pausePhase?.label) ? (
          <p style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontStyle: "italic", fontSize: 11, letterSpacing: "0.15em", color: "var(--color-pebble)", textAlign: "center", margin: "16px 0" }}>
            Introduce Slowly is paused while you recover.
          </p>
        ) : (
          <>
            {sectionLabel("leaf", "Introduce Slowly")}
            {reintroActives.length > 0 && pauseTreatment && pausePhase && (
              <div style={{ background: "rgba(45,61,43,0.08)", border: "1px solid rgba(45,61,43,0.25)", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--sage)", margin: "0 0 4px" }}>Reintroducing after recovery</p>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: 0, lineHeight: 1.55 }}>
                  You're in the {pausePhase.label.toLowerCase()} phase. {reintroActives.join(", ")} can return — but build slowly from week 1 to avoid overwhelming skin that's still settling.
                </p>
              </div>
            )}
            {rampProducts.length > 0 ? (
              rampProducts.map(p => {
                const activeKey = p.category === "Toning Pad"
                  ? "toning pad"
                  : RAMP_ACTIVES.find(a => detectActives(p.ingredients || [])[a]);
                const schedule = RAMP_SCHEDULES[activeKey];
                if (!schedule) return null;
                return (
                  <IntroduceSlowlyCard
                    key={p.id}
                    product={p}
                    schedule={schedule}
                    weekNumber={getRampWeek(p)}
                    onAdvance={onAdvanceRamp}
                    onHold={onHoldRamp}
                    onResetStart={onResetRampStart}
                  />
                );
              })
            ) : (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 18px 16px" }}>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--clay)", margin: 0, lineHeight: 1.6, opacity: 0.75 }}>
                  No actives in ramp-up right now.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* -- Treatments --------------------------------------------------------- */}
      {sectionLabel("drop", "Treatments")}
      <div style={{ marginBottom: 28 }}>
        <TreatmentSection treatments={treatments} saveTreatment={saveTreatment} removeTreatment={removeTreatment} updateTreatmentDate={updateTreatmentDate} products={products} activeMap={activeMap} />
      </div>

      {/* -- Body Acne --------------------------------------------------------- */}
      {sectionLabel("layers", "Body Acne")}
      <div style={{ marginBottom: 28 }}>
        <BodyAcneTracker products={products} activeMap={activeMap} user={user} onUpdateUser={onUpdateUser} />
      </div>

      {/* -- Cycle Tracking ---------------------------------------------------- */}
      {sectionLabel("activity", "Cycle Tracking")}
      <div style={{ marginBottom: 28 }}>
        <CycleTracker products={products} activeMap={activeMap} cycleDay={user && user.cycleDay ? user.cycleDay : 14} onSetCycleDay={d => onUpdateUser && onUpdateUser({ ...user, cycleDay: d })} user={user} onUpdateUser={onUpdateUser} />
      </div>

      {showCheckIn && (
        <CheckInModal
          onSubmit={data => { setCheckIns(p => [...p, data]); setShowCheckIn(false); }}
          onClose={() => setShowCheckIn(false)}
        />
      )}

      {showJournal && (
        <SkinJournalModal
          existing={journals.find(j => j.date === new Date().toISOString().split("T")[0]) || null}
          onSubmit={data => {
            setJournals(prev => {
              const filtered = prev.filter(j => j.date !== data.date);
              return [...filtered, data].sort((a, b) => a.date.localeCompare(b.date));
            });
            setShowJournal(false);
          }}
          onClose={() => setShowJournal(false)}
        />
      )}

      {journalFullView && (
        <JournalFullView
          journals={journals}
          onClose={() => setJournalFullView(false)}
          onEditToday={() => { setJournalFullView(false); setShowJournal(true); }}
        />
      )}
    </div>
  );
}


function LocationManager({ locationData, setLocationData, locationDenied, setLocationDenied }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const requestLocation = () => {
    if (!navigator.geolocation) { setError("Location not supported on this device."); return; }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lon } = pos.coords;
          const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
          const geoData = await geoRes.json();
          const city = geoData.address?.city || geoData.address?.town || geoData.address?.suburb || "Your location";
          const country = geoData.address?.country_code?.toUpperCase() || "";
          setLocationData({ lat, lon, city, country });
          if (setLocationDenied) setLocationDenied(false);
        } catch(e) {
          setError("Could not resolve location.");
        } finally {
          setLoading(false);
        }
      },
      () => {
        setError("Location access denied.");
        setLoading(false);
        if (setLocationDenied) setLocationDenied(true);
      }
    );
  };

  if (locationData) {
    return (
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "var(--clay)", opacity: 0.6, display: "inline-flex" }}><Icon name="target" size={14} /></span>
            <div>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--parchment)", margin: "0 0 2px", fontWeight: 500 }}>{locationData.city}{locationData.country ? `, ${locationData.country}` : ""}</p>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--clay)", margin: 0 }}>{locationData.lat.toFixed(3)}°, {locationData.lon.toFixed(3)}°</p>
            </div>
          </div>
          <button onClick={requestLocation}
            style={{ padding: "6px 12px", background: "none", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "var(--font-body)", fontSize: 9, color: "var(--clay)", cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase", transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#2d3d2b"; e.currentTarget.style.color = "#2d3d2b"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--clay)"; }}>
            {loading ? "..." : "Update"}
          </button>
        </div>
        {error && <p style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "#8b7355", margin: "10px 0 0" }}>{error}</p>}
      </div>
    );
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px" }}>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--clay)", margin: "0 0 14px", lineHeight: 1.65 }}>
        {locationDenied
          ? "Location was previously denied. You can grant access in your browser settings, then try again."
          : "Share your location so Cygne can read local humidity, UV index, and temperature — and adjust your ritual advice accordingly."}
      </p>
      <button onClick={requestLocation}
        style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 18px", background: "rgba(45,61,43,0.10)", border: "1px solid rgba(45,61,43,0.3)", borderRadius: 10, fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 600, color: "#2d3d2b", cursor: "pointer", letterSpacing: "0.12em", textTransform: "uppercase", transition: "all 0.2s" }}
        onMouseEnter={e => e.currentTarget.style.background = "rgba(45,61,43,0.18)"}
        onMouseLeave={e => e.currentTarget.style.background = "rgba(45,61,43,0.10)"}>
        {loading ? "Requesting..." : locationDenied ? "Try Again" : "Enable Location"}
      </button>
      {error && <p style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "#8b7355", margin: "10px 0 0" }}>{error}</p>}
    </div>
  );
}

export { Progress, CheckInModal, LocationManager, getTreatmentPhase, TreatmentRecoveryCard, getCyclePhase, getActivePauseState };