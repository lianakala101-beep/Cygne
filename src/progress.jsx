import { useState, useEffect } from "react";
import { Icon, Section, ErrorBoundary } from "./components.jsx";
import { detectActives, detectActivesFromProduct, analyzeShelf, detectConflicts, buildRoutine, hasSPFCoverage } from "./engine.js";
import { getAutoSession } from "./productmodal.jsx";
import { RAMP_ACTIVES, IntroduceSlowlyCard, getRampWeek, getRampSchedule, isSchedulePaced, deriveRampSignals } from "./ramp.jsx";
import { getCurrentCycleDay, isCycleStale, CYCLE_STALE_MESSAGE, getTreatmentElapsed, daysBetweenLocal } from "./utils.jsx";
import { CYCLE_PHASES as CANONICAL_CYCLE_PHASES, getCyclePhase as getCanonicalCyclePhase } from "./lib/cycle.js";
import { FaceHeatMap } from "./components/FaceHeatMap.jsx";
import { AskCygneModal } from "./components/AskCygneModal.jsx";
import { CycleRing } from "./components/CycleRing.jsx";
import { ProgressIndex } from "./components/ProgressIndex.jsx";
import { TrackerGrid } from "./components/TrackerGrid.jsx";
import { DetailSheet } from "./components/DetailSheet.jsx";
import { localDateKey, upsertJournalEntry } from "./lib/journal.js";
import { buildProgressIndex } from "./lib/progressIndex.js";
import { buildTrackerAttention } from "./lib/trackerAttention.js";


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

  // Body-scroll lock. The modal is a fixed-position sheet, so without this
  // the page behind it still scrolls when the user drags on the backdrop or
  // near the modal edges — especially disorienting on the mobile browser
  // where the address bar collapses. Snapshot the previous overflow value
  // and restore it on unmount instead of hardcoding "" so any ancestor
  // that was managing body scroll (nested modal, drawer) gets its state
  // back exactly.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const toggleZone = (z) => setBreakoutZones(prev => prev.includes(z) ? prev.filter(x => x !== z) : [...prev, z]);

  const handleSubmit = () => {
    const data = { irritation, breakout, breakoutZones: breakout ? breakoutZones : [], tight, date: new Date().toISOString() };
    onSubmit(data);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(var(--rgb-ink), 0.82)", backdropFilter: "blur(10px)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      >
      <div style={{
        background: "var(--ink)", width: "100%", maxWidth: 520,
        borderRadius: "var(--radius-sheet)", padding: "var(--space-8) var(--space-6) calc(var(--space-1) * 13)",
        border: "1px solid var(--border)", borderBottom: "none",
      }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "calc(var(--space-1) * 7)" }}>
          <div>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 var(--space-2)" }}>Weekly Check-In</p>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)", fontWeight: 700, letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--parchment)", margin: 0 }}>How is your skin?</h2>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", padding: "var(--space-1)", marginTop: 2 }}><Icon name="x" size={17} /></button>
        </div>

        {[
          { label: "Any irritation this week?", opts: ["none","mild","moderate"], labels: ["None","Mild","Moderate"], val: irritation, set: setIrritation },
        ].map(q => (
          <div key={q.label} style={{ marginBottom: "var(--space-6)" }}>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: "0 0 var(--space-3)", letterSpacing: "0.02em" }}>{q.label}</p>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              {q.opts.map((opt, i) => (
                <button key={opt} onClick={() => q.set(opt)}
                  style={{ flex: 1, padding: "var(--space-3) 0", borderRadius: "var(--radius)", border: `1px solid ${q.val === opt ? "var(--color-inky-moss)" : "rgba(var(--rgb-ivory), 0.32)"}`, background: q.val === opt ? "rgba(var(--rgb-moss), 0.08)" : "transparent", color: q.val === opt ? "var(--color-inky-moss)" : "rgba(var(--rgb-ivory), 0.82)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 400, cursor: "pointer", letterSpacing: "0.06em", transition: "all 0.18s" }}>
                  {q.labels[i]}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Breakout question — with conditional zone picker */}
        <div style={{ marginBottom: "var(--space-6)" }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: "0 0 var(--space-3)", letterSpacing: "0.02em" }}>Any new breakouts?</p>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            {[false, true].map(opt => (
              <button key={String(opt)} onClick={() => { setBreakout(opt); if (!opt) setBreakoutZones([]); }}
                style={{ flex: 1, padding: "var(--space-3) 0", borderRadius: "var(--radius)", border: `1px solid ${breakout === opt ? "var(--color-inky-moss)" : "rgba(var(--rgb-ivory), 0.32)"}`, background: breakout === opt ? "rgba(var(--rgb-moss), 0.08)" : "transparent", color: breakout === opt ? "var(--color-inky-moss)" : "rgba(var(--rgb-ivory), 0.82)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 400, cursor: "pointer", letterSpacing: "0.06em", transition: "all 0.18s" }}>
                {opt ? "Yes" : "No"}
              </button>
            ))}
          </div>

          {breakout && (
            <div style={{ marginTop: "var(--space-4)" }}>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: "0 0 var(--space-3)", letterSpacing: "0.04em", opacity: 0.7 }}>Where? <span style={{ opacity: 0.5 }}>Select all that apply</span></p>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: "0 0 var(--space-2)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", opacity: 0.55 }}>Face</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                {FACE_ZONES.map(z => {
                  const active = breakoutZones.includes(z);
                  return (
                    <button key={z} onClick={() => toggleZone(z)} style={{
                      padding: "var(--space-2) var(--space-3)", borderRadius: "var(--radius-pill)",
                      border: `1px solid ${active ? "rgba(var(--rgb-bronze), 0.56)" : "var(--border)"}`,
                      background: active ? "rgba(var(--rgb-bronze), 0.08)" : "transparent",
                      color: active ? "var(--color-bronze)" : "var(--clay)",
                      fontFamily: "var(--font-body)", fontSize: "var(--text-xs)",
                      fontWeight: 400,
                      cursor: "pointer", transition: "all 0.15s",
                      letterSpacing: "0.04em",
                    }}>
                      {z}
                    </button>
                  );
                })}
              </div>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: "var(--space-4) 0 var(--space-2)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", opacity: 0.55 }}>Neck</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                {NECK_BEARD_ZONES.map(z => {
                  const active = breakoutZones.includes(z);
                  return (
                    <button key={z} onClick={() => toggleZone(z)} style={{
                      padding: "var(--space-2) var(--space-3)", borderRadius: "var(--radius-pill)",
                      border: `1px solid ${active ? "rgba(var(--rgb-bronze), 0.56)" : "var(--border)"}`,
                      background: active ? "rgba(var(--rgb-bronze), 0.08)" : "transparent",
                      color: active ? "var(--color-bronze)" : "var(--clay)",
                      fontFamily: "var(--font-body)", fontSize: "var(--text-xs)",
                      fontWeight: 400,
                      cursor: "pointer", transition: "all 0.15s",
                      letterSpacing: "0.04em",
                    }}>
                      {z}
                    </button>
                  );
                })}
              </div>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: "var(--space-4) 0 var(--space-2)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", opacity: 0.55 }}>Body</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                {CHECKIN_BODY_ZONES.map(z => {
                  const active = breakoutZones.includes(z);
                  return (
                    <button key={z} onClick={() => toggleZone(z)} style={{
                      padding: "var(--space-2) var(--space-3)", borderRadius: "var(--radius-pill)",
                      border: `1px solid ${active ? "rgba(var(--rgb-bronze), 0.56)" : "var(--border)"}`,
                      background: active ? "rgba(var(--rgb-bronze), 0.08)" : "transparent",
                      color: active ? "var(--color-bronze)" : "var(--clay)",
                      fontFamily: "var(--font-body)", fontSize: "var(--text-xs)",
                      fontWeight: 400,
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
        <div style={{ marginBottom: "var(--space-6)" }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: "0 0 var(--space-3)", letterSpacing: "0.02em" }}>Skin feeling tight or dry?</p>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            {[false, true].map(opt => (
              <button key={String(opt)} onClick={() => setTight(opt)}
                style={{ flex: 1, padding: "var(--space-3) 0", borderRadius: "var(--radius)", border: `1px solid ${tight === opt ? "var(--color-inky-moss)" : "rgba(var(--rgb-ivory), 0.32)"}`, background: tight === opt ? "rgba(var(--rgb-moss), 0.08)" : "transparent", color: tight === opt ? "var(--color-inky-moss)" : "rgba(var(--rgb-ivory), 0.82)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 400, cursor: "pointer", letterSpacing: "0.06em", transition: "all 0.18s" }}>
                {opt ? "Yes" : "No"}
              </button>
            ))}
          </div>
        </div>

        <button onClick={handleSubmit}
          onMouseDown={e => { e.currentTarget.style.opacity = "0.7"; }}
          onMouseUp={e => { e.currentTarget.style.opacity = "1"; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
          style={{
            width: "100%", marginTop: "var(--space-2)", padding: "var(--space-4) 0",
            background: "transparent", color: "var(--color-ivory, #faf9f4)", border: "1px solid var(--color-ivory, #faf9f4)", borderRadius: "var(--radius)",
            fontFamily: "var(--font-display)", fontSize: "var(--text-xs)", fontWeight: 700,
            letterSpacing: "var(--tracking-display)", textTransform: "uppercase",
            cursor: "pointer",
          }}>
          Submit Check-In
        </button>
      </div>
    </div>
  );
}



// --- SKIN JOURNAL -------------------------------------------------------------

const SKIN_CONDITIONS = [
  { key: "rough",    label: "Rough",    color: "var(--color-bronze)", bg: "rgba(var(--rgb-bronze), 0.08)",   border: "rgba(var(--rgb-bronze), 0.32)"  },
  { key: "dull",     label: "Dull",     color: "var(--color-bronze)", bg: "rgba(var(--rgb-bronze), 0.08)", border: "rgba(var(--rgb-bronze), 0.32)"},
  { key: "okay",     label: "Okay",     color: "var(--color-ivory, #faf9f4)", bg: "rgba(var(--rgb-ivory), 0.08)", border: "rgba(var(--rgb-moss), 0.32)"},
  { key: "good",     label: "Good",     color: "var(--color-ivory, #faf9f4)", bg: "rgba(var(--rgb-moss), 0.16)", border: "rgba(var(--rgb-moss), 0.32)" },
  { key: "glowing",  label: "Glowing",  color: "var(--color-ivory, #faf9f4)", bg: "rgba(var(--rgb-ivory), 0.08)", border: "rgba(var(--rgb-moss), 0.32)"},
];

function SkinJournalModal({ onSubmit, onClose, existing = null }) {
  const today = localDateKey();
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(var(--rgb-ink), 0.82)", backdropFilter: "blur(12px)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      >
      <div style={{ background: "var(--ink)", width: "100%", maxWidth: 520, borderRadius: "var(--radius-sheet)", padding: "calc(var(--space-1) * 7) var(--space-6) var(--space-10)", overflowY: "auto", maxHeight: "90vh" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--space-2)" }}>
          <div>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 var(--space-1)" }}>SKIN JOURNAL</p>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)", fontWeight: 700, letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--parchment)", margin: 0 }}>How is your skin today?</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", padding: "var(--space-1)" }}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: "0 0 calc(var(--space-1) * 7)", opacity: 0.7 }}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>

        {/* Condition */}
        <div style={{ marginBottom: "calc(var(--space-1) * 7)" }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 var(--space-3)" }}>Skin condition</p>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            {SKIN_CONDITIONS.map(c => {
              const selected = condition === c.key;
              const dimmed = condition !== null && !selected;
              return (
                <button key={c.key} onClick={() => pickCondition(c.key)}
                  onAnimationEnd={() => { if (pulsing === c.key) setPulsing(null); }}
                  style={{
                    flex: 1, padding: "var(--space-3) 0", borderRadius: "var(--radius)",
                    border: `1px solid ${selected ? c.border : "var(--border)"}`,
                    background: selected ? c.bg : "transparent",
                    color: selected ? c.color : "var(--clay)",
                    fontFamily: "var(--font-body)", fontSize: "var(--text-xs)",
                    fontWeight: 400, letterSpacing: "0.04em",
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
        <div style={{ marginBottom: "var(--space-6)" }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 var(--space-3)" }}>Sleep last night</p>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            {[{ key: "good", label: "Good" }, { key: "poor", label: "Poor" }].map(opt => (
              <button key={opt.key} onClick={() => setSleep(s => s === opt.key ? null : opt.key)}
                style={{ flex: 1, padding: "var(--space-3) 0", borderRadius: "var(--radius)", border: `1px solid ${sleep === opt.key ? "var(--color-inky-moss)" : "rgba(var(--rgb-ivory), 0.32)"}`, background: sleep === opt.key ? "rgba(var(--rgb-moss), 0.08)" : "transparent", color: sleep === opt.key ? "var(--color-inky-moss)" : "rgba(var(--rgb-ivory), 0.82)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 400, cursor: "pointer", transition: "all 0.15s" }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stress */}
        <div style={{ marginBottom: "var(--space-6)" }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 var(--space-3)" }}>Stress today</p>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            {[{ key: "low", label: "Low" }, { key: "high", label: "High" }].map(opt => (
              <button key={opt.key} onClick={() => setStress(s => s === opt.key ? null : opt.key)}
                style={{ flex: 1, padding: "var(--space-3) 0", borderRadius: "var(--radius)", border: `1px solid ${stress === opt.key ? "var(--color-inky-moss)" : "rgba(var(--rgb-ivory), 0.32)"}`, background: stress === opt.key ? "rgba(var(--rgb-moss), 0.08)" : "transparent", color: stress === opt.key ? "var(--color-inky-moss)" : "rgba(var(--rgb-ivory), 0.82)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 400, cursor: "pointer", transition: "all 0.15s" }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: "calc(var(--space-1) * 7)" }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 var(--space-3)" }}>Notes <span style={{ opacity: 0.45, textTransform: "none", letterSpacing: 0 }}>optional</span></p>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Anything worth noting today..."
            style={{ width: "100%", minHeight: 72, background: "var(--color-ivory-shadow)", border: "none", borderRadius: "var(--radius)", padding: "var(--space-3) var(--space-4)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--parchment)", resize: "none", outline: "none", boxSizing: "border-box", lineHeight: 1.6 }}
          />
        </div>

        <button
          onClick={() => canSubmit && onSubmit({ date: today, condition, sleep, stress, notes: notes.trim() })}
          onMouseDown={e => { if (canSubmit) e.currentTarget.style.opacity = "0.7"; }}
          onMouseUp={e => { if (canSubmit) e.currentTarget.style.opacity = "1"; }}
          onMouseLeave={e => { if (canSubmit) e.currentTarget.style.opacity = "1"; }}
          style={{ width: "100%", padding: "var(--space-4) 0", background: "transparent", color: "var(--color-ivory, #faf9f4)", border: "1px solid var(--color-ivory, #faf9f4)", borderRadius: "var(--radius)", fontFamily: "var(--font-display)", fontSize: "var(--text-xs)", fontWeight: 700, letterSpacing: "var(--tracking-display)", textTransform: "uppercase", opacity: canSubmit ? 1 : 0.45, cursor: canSubmit ? "pointer" : "default" }}>
          Save Entry
        </button>
      </div>
    </div>
  );
}

// --- HORMONE CYCLE TRACKER ---------------------------------------------------

// Presentation metadata for each cycle phase — keyed by the phase
// name that comes back from getCyclePhase. Split from the canonical
// name+days list (src/lib/cycle.js) so the edge function
// cycle-phase-alert can share the phase math without dragging in
// UI copy.
const PHASE_META = {
  Menstrual: {
    color: "var(--color-bronze)",
    bg: "rgba(var(--rgb-bronze), 0.08)",
    border: "rgba(var(--rgb-bronze), 0.32)",
    dot: "rgba(var(--rgb-bronze), 0.82)",
    description: "Estrogen and progesterone are at their lowest. The skin barrier is more permeable and reactive.",
    nudge: "Reduce active intensity this week. Prioritize ceramides, gentle cleansing, and occlusive hydration.",
    activeAdvice: (hasRetinol, hasAHA, _hasBHA) => {
      if (hasRetinol) return "Consider resting your retinoid tonight — barrier recovery is slower during menstruation.";
      if (hasAHA) return "Lighten exfoliation frequency. Your skin is more sensitized this week.";
      return "Lean into barrier support. This is a recovery week.";
    },
  },
  Follicular: {
    // Follicular's accent used to be ivory — invisible against the
    // ivory Section 06 band. Moss reads on both ivory (dark on light)
    // and dark canvas (via the existing --color-ivory-shadow wash).
    color: "var(--color-inky-moss)",
    bg: "rgba(var(--rgb-moss), 0.08)",
    border: "rgba(var(--rgb-moss), 0.32)",
    dot: "rgba(var(--rgb-moss), 0.82)",
    description: "Estrogen is rising. Skin cell turnover increases and the barrier is more resilient.",
    nudge: "Good window for actives. Exfoliation and vitamin C absorb well as estrogen climbs.",
    activeAdvice: (hasRetinol, hasAHA, hasBHA) => {
      if (hasRetinol && hasAHA) return "This is your strongest week for actives — alternating retinol and AHA is well-tolerated now.";
      if (hasAHA || hasBHA) return "Exfoliation is well-tolerated this week. Maintain your current schedule.";
      if (hasRetinol) return "Skin is more resilient now. If tolerating well, this is a good week to hold frequency.";
      return "Skin is at good baseline. Your ritual should feel effective this week.";
    },
  },
  Ovulatory: {
    color: "var(--color-bronze)",
    bg: "rgba(var(--rgb-bronze), 0.08)",
    border: "rgba(var(--rgb-bronze), 0.32)",
    dot: "rgba(var(--rgb-bronze), 0.82)",
    description: "Estrogen peaks. Skin typically looks and feels its best — luminous and well-hydrated.",
    nudge: "Peak skin window. Your ritual is working optimally. No adjustments needed.",
    activeAdvice: () => "Skin is at peak resilience. Continue your ritual as normal.",
  },
  Luteal: {
    color: "var(--color-bronze)",
    bg: "rgba(var(--rgb-bronze), 0.08)",
    border: "rgba(var(--rgb-bronze), 0.32)",
    dot: "rgba(var(--rgb-bronze), 0.82)",
    description: "Progesterone rises, increasing sebum production. Congestion and breakouts are more likely.",
    nudge: "Watch for congestion. BHA helps keep pores clear. Reduce heavy occlusives if skin feels clogged.",
    activeAdvice: (hasRetinol, _hasAHA, hasBHA) => {
      if (hasBHA) return "Your BHA is well-suited to this phase. Prioritize it over heavier treatments if skin feels congested.";
      if (hasRetinol) return "Retinol supports cell turnover during this oilier phase. Maintain frequency if tolerating well.";
      return "Consider introducing a salicylic acid product to manage congestion during the luteal phase.";
    },
  },
};

// Compose the canonical phase list with local presentation metadata
// so downstream render code can iterate a single decorated array as
// it did before the extraction. Phase math (name + days + getCyclePhase)
// is the single source of truth in src/lib/cycle.js.
const CYCLE_PHASES = CANONICAL_CYCLE_PHASES.map(p => ({ ...p, ...PHASE_META[p.name] }));

function getCyclePhase(day) {
  const base = getCanonicalCyclePhase(day);
  return { ...base, ...PHASE_META[base.name] };
}

function CycleTracker({ products: productsProp = [], activeMap, cycleDay: cycledayProp = 14, onSetCycleDay, user = {}, onUpdateUser = () => {} }) {
  const products = Array.isArray(productsProp) ? productsProp : [];
  const enabled = user.cycleTrackingEnabled || false;
  // Compute cycle day dynamically from cycleStartDate (LOCAL date, not UTC).
  // A start date more than 45 days old is stale: no day or phase is shown
  // (and no Day 14 fallback) until the user logs their period.
  const stale = isCycleStale(user);
  const computedDay = stale ? null : (getCurrentCycleDay(user) || cycledayProp || 14);
  const cycleDay = computedDay;
  const cycleLen = Math.max(21, Math.min(45, parseInt(user.cycleLength, 10) || 28));
  // Period is "running long" once the day count passes the user's chosen
  // cycle length — we show a quiet normalizing note in that case rather
  // than capping or auto-wrapping the day display.
  const runningLong = !stale && cycleDay > cycleLen;
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(String(computedDay ?? 1));
  const [editingLength, setEditingLength] = useState(false);
  const [lengthInputVal, setLengthInputVal] = useState(String(cycleLen));

  const hasRetinol = !!(activeMap["retinol"]?.length);
  const hasAHA = !!(activeMap["AHA"]?.length);
  const hasBHA = !!(activeMap["BHA"]?.length);

  const phase = stale ? null : getCyclePhase(cycleDay);
  const daysUntilNext = phase ? phase.days[1] - cycleDay + 1 : null;
  const advice = phase ? phase.activeAdvice(hasRetinol, hasAHA, hasBHA) : null;

  const handleSetDay = () => {
    const d = Math.max(1, Math.min(45, parseInt(inputVal) || 1));
    // Store cycle start date at LOCAL midnight so it advances at local midnight
    const now = new Date();
    const startLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (d - 1));
    onUpdateUser({ ...user, cycleStartDate: startLocal.toISOString(), cycleDay: d });
    setEditing(false);
  };

  const handleSetLength = () => {
    const len = Math.max(21, Math.min(45, parseInt(lengthInputVal, 10) || 28));
    onUpdateUser({ ...user, cycleLength: len });
    setEditingLength(false);
  };

  if (!enabled) {
    return (
      <div style={{
        padding: "var(--space-5) 0",
        borderTop: "1px solid rgba(var(--rgb-ink), 0.32)",
        borderBottom: "1px solid rgba(var(--rgb-ink), 0.32)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
          <span style={{ color: "var(--clay)", display: "inline-flex" }}><Icon name="moon" size={14} /></span>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)" }}>Sync Your Ritual With Your Rhythm</span>
          <span style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", color: "var(--clay)", letterSpacing: "0.06em", fontStyle: "italic" }}>Optional</span>
        </div>
        <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: "0 0 var(--space-4)", lineHeight: 1.65 }}>
          Your hormones shift every week. Your ritual should too. Enable this to receive phase-aware nudges drawn from what's already on your vanity.
        </p>
        <button onClick={() => onUpdateUser({ ...user, cycleTrackingEnabled: true })}
          style={{ padding: "var(--space-3) var(--space-5)", background: "transparent", border: "1px solid var(--color-ink)", borderRadius: "var(--radius)", fontFamily: "var(--font-display)", fontSize: "var(--text-xs)", fontWeight: 700, letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--color-ink)", cursor: "pointer", transition: "all 0.2s" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(var(--rgb-ink), 0.08)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
          Enable
        </button>
      </div>
    );
  }

  return (
    <div style={{
      padding: "var(--space-5) 0 var(--space-1)",
      borderTop: "1px solid rgba(var(--rgb-ink), 0.32)",
      borderBottom: "1px solid rgba(var(--rgb-ink), 0.32)",
    }}>
      {/* Phase block — editorial flat treatment. No bordered card, no
          decorative arc; the phase-dot bullet + name + Phase caption
          still identify the current phase. */}
      <div style={{ marginBottom: "var(--space-4)" }}>

        {/* Header row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
          <div>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 var(--space-1)" }}>Sync Your Ritual With Your Rhythm</p>
            {phase ? (
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: phase.dot, flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-md)", fontWeight: 400, color: "var(--parchment)", letterSpacing: "0.02em" }}>{phase.name}</span>
                <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)" }}>Phase</span>
              </div>
            ) : (
              <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-md)", fontWeight: 400, color: "var(--parchment)", letterSpacing: "0.02em" }}>{CYCLE_STALE_MESSAGE}</span>
            )}
          </div>

          {/* Day editor — button retains its border as a tap target */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "var(--space-1)" }}>
            {editing ? (
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <input
                  type="number" min="1" max="45"
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSetDay()}
                  style={{ width: 48, padding: "var(--space-1) var(--space-2)", background: "transparent", border: "1px solid rgba(var(--rgb-ink), 0.32)", borderRadius: "var(--radius-pill)", color: "var(--color-ink)", fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", textAlign: "center", outline: "none" }}
                  autoFocus
                />
                <button onClick={handleSetDay} style={{ padding: "var(--space-1) var(--space-3)", background: "transparent", border: "1px solid var(--color-ink)", borderRadius: "var(--radius-pill)", color: "var(--color-ink)", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-xs)", cursor: "pointer", letterSpacing: "var(--tracking-display)", textTransform: "uppercase" }}>Set</button>
              </div>
            ) : (
              <button onClick={() => { setInputVal(String(cycleDay ?? 1)); setEditing(true); }}
                style={{ background: "transparent", border: "1px solid rgba(var(--rgb-ink), 0.32)", borderRadius: "var(--radius-pill)", padding: "var(--space-1) var(--space-3)", cursor: "pointer", display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: "var(--text-sm)", letterSpacing: "var(--tracking-label)", color: "var(--color-ink)", lineHeight: 1.6, whiteSpace: "nowrap" }}>{phase ? `Day ${cycleDay}` : "Set day"}</span>
              </button>
            )}
            {phase && (
              <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "rgba(var(--rgb-ink), 0.56)", opacity: 0.85, letterSpacing: "0.04em" }}>{daysUntilNext}d in phase</span>
            )}
          </div>
        </div>

        {/* Phase description */}
        {phase && (
          <p style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "var(--text-sm)", letterSpacing: "0.02em", color: "var(--color-ink)", margin: "0 0 var(--space-3)", lineHeight: 1.6 }}>{phase.description}</p>
        )}

        {/* Quiet "running long" note — italic, no chip */}
        {runningLong && (
          <p style={{ fontFamily: "var(--font-body)", fontStyle: "italic", fontSize: "var(--text-xs)", letterSpacing: "0.02em", color: "rgba(var(--rgb-ink), 0.56)", margin: "0 0 var(--space-3)", lineHeight: 1.55 }}>
            Your cycle is running long — this is normal.
          </p>
        )}

        {/* Nudge — plain body copy, no box. */}
        {phase && (
          <p style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "var(--text-sm)", letterSpacing: "0.02em", color: "var(--color-ink)", margin: 0, lineHeight: 1.6 }}>{phase.nudge}</p>
        )}
      </div>

      {/* Shelf-specific advice — separated from the phase block by a soft
          rule. Container is flat; the eyebrow carries the section title. */}
      <div style={{ paddingTop: "var(--space-4)", borderTop: "1px solid rgba(var(--rgb-ink), 0.16)" }}>
        {advice && (
          <>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "rgba(var(--rgb-ink), 0.56)", margin: "0 0 var(--space-2)" }}>Your Vanity This Week</p>
            <p style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "var(--text-sm)", letterSpacing: "0.02em", color: "var(--color-ink)", margin: "0 0 var(--space-3)", lineHeight: 1.6 }}>{advice}</p>
          </>
        )}

        {/* Cycle length setting — accepts 21–45 days. */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "rgba(var(--rgb-ink), 0.56)" }}>Cycle length</span>
          {editingLength ? (
            <>
              <input
                type="number" min="21" max="45"
                value={lengthInputVal}
                onChange={e => setLengthInputVal(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSetLength()}
                style={{ width: 52, padding: "var(--space-1) var(--space-2)", background: "transparent", border: "1px solid rgba(var(--rgb-ink), 0.32)", borderRadius: "var(--radius-pill)", color: "var(--color-ink)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", textAlign: "center", outline: "none" }}
                autoFocus
              />
              <button onClick={handleSetLength} style={{ padding: "var(--space-1) var(--space-3)", background: "transparent", border: "1px solid var(--color-ink)", borderRadius: "var(--radius-pill)", color: "var(--color-ink)", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-xs)", cursor: "pointer", letterSpacing: "var(--tracking-display)", textTransform: "uppercase" }}>Set</button>
            </>
          ) : (
            <button onClick={() => { setLengthInputVal(String(cycleLen)); setEditingLength(true); }}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "0.04em", color: "var(--color-ink)", textDecoration: "underline", textDecorationColor: "rgba(var(--rgb-ink), 0.32)", textUnderlineOffset: 3 }}>
              {cycleLen} days
            </button>
          )}
        </div>

        <button onClick={() => setEnabled(false)}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--clay)", opacity: 0.45, transition: "opacity 0.2s" }}
          onMouseEnter={e => e.currentTarget.style.opacity = "0.75"}
          onMouseLeave={e => e.currentTarget.style.opacity = "0.45"}>
          Disable tracking
        </button>
      </div>

      {/* Compact cycle arc */}
      <div style={{ display: "flex", gap: "var(--space-1)", marginTop: "var(--space-3)" }}>
        {CYCLE_PHASES.map((p, i) => {
          const isActive = phase?.name === p.name;
          const width = ((p.days[1] - p.days[0] + 1) / 35) * 100;
          return (
            <div key={i} style={{ flex: p.days[1] - p.days[0] + 1, height: 3, borderRadius: "var(--radius-pill)", background: isActive ? p.dot : "rgba(var(--rgb-ink), 0.08)", transition: "background 0.3s" }} />
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "var(--space-1)" }}>
        {CYCLE_PHASES.map((p, i) => (
          <span key={i} style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)", color: phase?.name === p.name ? "var(--parchment)" : "var(--clay)", opacity: phase?.name === p.name ? 1 : 0.4 }}>{p.name.slice(0, 3).toUpperCase()}</span>
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

  // Track every active actually present in the user's vanity (driven by their
  // ingredients, not a hardcoded shortlist). Falls back to the core
  // treatment-sensitive set when the user has no qualifying products yet so
  // the recovery messaging still makes sense.
  //
  // Uses detectActivesFromProduct so a Toning Pad / pad-named product with
  // no listed acids still surfaces as having BHA (and thus gets paused or
  // reintroduced through every treatment phase, not just Acute).
  const present = new Set();
  for (const p of products) {
    if (p.inRoutine === false) continue;
    Object.keys(detectActivesFromProduct(p)).forEach(a => present.add(a));
  }
  if (present.size === 0) {
    ["retinol", "AHA", "BHA", "vitamin C", "benzoyl peroxide"].forEach(a => present.add(a));
  }
  const tracked = Array.from(present);

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
    // Scan every active present in the user's vanity (not a hardcoded
    // shortlist). SPF + barrier-supporting ingredients (HA, ceramides) are
    // never paused — they're treated as cleared baseline.
    const SAFE = new Set(["SPF", "hyaluronic acid", "ceramides"]);
    const displayName = (active) => active === "AHA" ? "AHA Exfoliant"
      : active === "BHA" ? "BHA Exfoliant"
      : active === "vitamin C" ? "Vitamin C"
      : active.charAt(0).toUpperCase() + active.slice(1);
    const reasonFor = (active) => (active === "AHA" || active === "BHA") ? "acid" : "active";
    Object.entries(activeMap || {}).forEach(([active, prods]) => {
      if (!prods || !prods.length) return;
      if (SAFE.has(active)) return;
      const display = displayName(active);
      if (isCleared(active) || isCleared(display)) {
        cleared.push(display);
      } else {
        paused.push({ name: display, reason: reasonFor(active) });
      }
    });
  }

  if (hasSPF) cleared.push("SPF — mandatory");
  return { paused, cleared };
}

const inputSt = { width: "100%", padding: "var(--space-3) var(--space-4)", background: "var(--color-ivory-shadow)", border: "none", borderRadius: "var(--radius)", fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", color: "var(--parchment)", outline: "none" };
const labelSt = { fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--clay)", display: "block", marginBottom: "var(--space-2)" };

function AddTreatmentModal({ onSave, onClose }) {
  const [typeId, setTypeId] = useState(TREATMENT_TYPES[0].id);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [intensity, setIntensity] = useState("standard");
  const selected = TREATMENT_TYPES.find(t => t.id === typeId);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(var(--rgb-ink), 0.82)", backdropFilter: "blur(12px)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "var(--ink)", width: "100%", maxWidth: 520, borderRadius: "var(--radius-sheet)", padding: "calc(var(--space-1) * 7) var(--space-6) calc(var(--space-1) * 13)", maxHeight: "88vh", overflowY: "auto", border: "1px solid var(--border)", borderBottom: "none" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--space-6)" }}>
          <div>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 var(--space-1)" }}>Log Treatment</p>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)", fontWeight: 700, letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--parchment)", margin: 0, lineHeight: 1.1 }}>What did you get?</h2>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", padding: "var(--space-1)" }}><Icon name="x" size={17} /></button>
        </div>

        {/* Treatment type */}
        <div style={{ marginBottom: "var(--space-5)" }}>
          <label style={labelSt}>Treatment Type</label>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {TREATMENT_TYPES.map(t => (
              <button key={t.id} onClick={() => setTypeId(t.id)}
                style={{ padding: "var(--space-3) var(--space-4)", background: typeId === t.id ? "rgba(var(--rgb-moss), 0.08)" : "var(--ink)", border: `1px solid ${typeId === t.id ? "rgba(var(--rgb-moss), 0.32)" : "var(--border)"}`, borderRadius: "var(--radius)", cursor: "pointer", textAlign: "left", transition: "all 0.18s" }}>
                <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--parchment)", margin: "0 0 2px", fontWeight: 400 }}>{t.label}</p>
                <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: 0 }}>{t.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Date */}
        <div style={{ marginBottom: "var(--space-6)" }}>
          <label style={labelSt}>Treatment Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ ...inputSt, colorScheme: "dark" }} />
        </div>

        <button onClick={() => onSave({ id: Date.now().toString(), typeId, date, label: selected?.label })}
          style={{ width: "100%", padding: "var(--space-4) 0", background: "transparent", color: "var(--color-ivory, #faf9f4)", border: "1px solid var(--color-ivory, #faf9f4)", borderRadius: "var(--radius)", fontFamily: "var(--font-display)", fontSize: "var(--text-xs)", fontWeight: 700, letterSpacing: "var(--tracking-display)", textTransform: "uppercase", cursor: "pointer" }}>
          Start Recovery Tracking
        </button>
      </div>
    </div>
  );
}

function TreatmentRecoveryCard({ treatment, products: productsProp = [], activeMap, onDismiss, onResetDate }) {
  const products = Array.isArray(productsProp) ? productsProp : [];
  const [confirmReset, setConfirmReset] = useState(false);
  const [pickedDate, setPickedDate] = useState("");
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
    <div style={{ marginBottom: "var(--space-5)" }}>
      <div style={{ background: "rgba(var(--rgb-moss), 0.08)", border: "1px solid rgba(var(--rgb-moss), 0.16)", borderRadius: "var(--radius)", padding: "var(--space-5) var(--space-5) var(--space-4)", position: "relative" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "var(--space-3)" }}>
          <div>
            <p style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xs)", fontWeight: 400, letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--color-ivory, #faf9f4)", margin: "0 0 var(--space-1)" }}>Recovery — Day {elapsed}</p>
            <p style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-md)", fontWeight: 400, letterSpacing: "var(--tracking-label)", color: "var(--parchment)", margin: "0 0 2px", lineHeight: 1.2 }}>{type.label}</p>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: isLastPhase ? "var(--color-inky-moss)" : "var(--color-bronze)" }} />
              <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: isLastPhase ? "var(--color-inky-moss)" : "var(--color-bronze)", fontWeight: 400, letterSpacing: "0.06em" }}>{phase.label}</span>
            </div>
            {startedLabel && (
              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: "var(--space-1) 0 0", opacity: 0.6, letterSpacing: "0.04em" }}>{startedLabel}</p>
            )}
          </div>
          {isLastPhase && (
            <button onClick={onDismiss} style={{ padding: "var(--space-2) var(--space-3)", background: "transparent", border: "1px solid var(--color-ivory, #faf9f4)", borderRadius: "var(--radius-pill)", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-xs)", color: "var(--color-ivory, #faf9f4)", cursor: "pointer", letterSpacing: "var(--tracking-display)", textTransform: "uppercase" }}>
              All Clear
            </button>
          )}
        </div>

        {/* Progress bar */}
        {!isLastPhase && (
          <div style={{ height: 2, background: "var(--border)", borderRadius: "var(--radius-pill)", marginBottom: "var(--space-4)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: "var(--color-inky-moss)", borderRadius: "var(--radius)", transition: "width 0.4s ease" }} />
          </div>
        )}

        {/* Phase description */}
        <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: "0 0 var(--space-4)", lineHeight: 1.65 }}>{phase.description}</p>

        {/* Paused actives */}
        {paused.length > 0 && (
          <div style={{ marginBottom: "var(--space-3)" }}>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--color-bronze)", margin: "0 0 var(--space-2)" }}>Paused from your vanity</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
              {paused.map((p, i) => (
                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", color: "var(--color-bronze)", background: "rgba(var(--rgb-bronze), 0.08)", border: "1px solid rgba(var(--rgb-bronze), 0.16)", padding: "var(--space-1) var(--space-3)", borderRadius: "var(--radius-pill)", letterSpacing: "0.06em" }}>
                  {p.name}
                  <span style={{ fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)", color: "rgba(var(--rgb-ivory), 0.56)", opacity: 0.65 }}>{p.reason}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Cleared */}
        {cleared.length > 0 && (
          <div>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--color-ivory, #faf9f4)", margin: "0 0 var(--space-2)" }}>Cleared to use</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
              {cleared.map((c, i) => (
                <span key={i} style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", color: "var(--color-ivory, #faf9f4)", background: "rgba(var(--rgb-ivory), 0.08)", border: "1px solid rgba(var(--rgb-moss), 0.16)", padding: "var(--space-1) var(--space-3)", borderRadius: "var(--radius-pill)", letterSpacing: "0.06em" }}>{c}</span>
              ))}
            </div>
          </div>
        )}

        {/* Phase timeline dots */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginTop: "var(--space-4)" }}>
          {type.phases.map((p, i) => {
            const isCurrent = p.label === phase.label;
            const isPast = i < phaseIndex;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", flex: i < type.phases.length - 1 ? 1 : 0 }}>
                <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-1)" }}>
                  <div style={{ width: isCurrent ? 9 : 6, height: isCurrent ? 9 : 6, borderRadius: "50%", background: isCurrent ? "var(--color-inky-moss)" : isPast ? "rgba(var(--rgb-moss), 0.56)" : "var(--border)", transition: "all 0.3s", border: isCurrent ? "2px solid rgba(var(--rgb-moss), 0.32)" : "none", flexShrink: 0 }} />
                  <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: isCurrent ? "var(--color-inky-moss)" : "var(--clay)", opacity: isCurrent ? 1 : 0.5, letterSpacing: "0.06em", whiteSpace: "nowrap", position: "absolute", top: 13 }}>{p.label}</span>
                </div>
                {i < type.phases.length - 1 && <div style={{ flex: 1, height: 1, background: isPast ? "rgba(var(--rgb-moss), 0.32)" : "var(--border)", margin: "0 2px", marginBottom: "var(--space-1)" }} />}
              </div>
            );
          })}
        </div>
        <div style={{ height: 18 }} />

        {/* Reset start date — pick the actual date treatment began */}
        {onResetDate && (
          <div style={{ marginTop: "var(--space-2)", paddingTop: "var(--space-3)", borderTop: "1px dashed var(--border)" }}>
            {confirmReset ? (
              <div>
                <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: "0 0 var(--space-2)", opacity: 0.8 }}>Pick the date you actually started this treatment — Day 1 will recalculate from there.</p>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                  <input
                    type="date"
                    value={pickedDate}
                    max={(() => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; })()}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setPickedDate(e.target.value)}
                    style={{ flex: 1, minWidth: 140, padding: "var(--space-2) var(--space-3)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--parchment)", cursor: "pointer" }}
                  />
                  <button
                    disabled={!pickedDate}
                    onClick={(e) => { e.stopPropagation(); if (!pickedDate) return; onResetDate(pickedDate); setConfirmReset(false); setPickedDate(""); }}
                    style={{ padding: "var(--space-2) var(--space-3)", background: pickedDate ? "rgba(var(--rgb-bronze), 0.08)" : "transparent", border: `1px solid ${pickedDate ? "rgba(var(--rgb-bronze), 0.32)" : "var(--border)"}`, borderRadius: "var(--radius)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 400, letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: pickedDate ? "var(--color-bronze)" : "var(--clay)", cursor: pickedDate ? "pointer" : "not-allowed", opacity: pickedDate ? 1 : 0.5 }}>
                    Save
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setConfirmReset(false); setPickedDate(""); }}
                    style={{ padding: "var(--space-2) var(--space-3)", background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-pill)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--clay)", cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmReset(true)}
                style={{ background: "none", border: "none", padding: 0, fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", opacity: 0.6, cursor: "pointer", letterSpacing: "0.06em", textDecoration: "underline" }}>
                Reset start date
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TreatmentSection({ treatments: treatmentsProp = [], saveTreatment, removeTreatment, updateTreatmentDate = () => {}, products: productsProp = [], activeMap }) {
  const treatments = Array.isArray(treatmentsProp) ? treatmentsProp : [];
  const products   = Array.isArray(productsProp)   ? productsProp   : [];
  const [addOpen, setAddOpen] = useState(false);
  const activeTreatments = treatments.filter(t => {
    const r = getTreatmentPhase(t);
    return r && r.phase;
  });

  return (
    <div style={{ marginBottom: "calc(var(--space-1) * 7)" }}>
      <button onClick={() => setAddOpen(true)}
        style={{ width: "100%", padding: "var(--space-3) 0", marginBottom: "var(--space-4)", background: "transparent", color: "var(--color-ivory, #faf9f4)", border: "1px solid var(--color-ivory, #faf9f4)", borderRadius: 0, fontFamily: "var(--font-display)", fontSize: "var(--text-xs)", fontWeight: 700, letterSpacing: "var(--tracking-display)", textTransform: "uppercase", cursor: "pointer", WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent" }}>
        Log
      </button>

      {activeTreatments.length === 0 ? (
        <div style={{ padding: "var(--space-5) 0", textAlign: "center" }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: "0 0 var(--space-1)" }}>No active recovery windows.</p>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", opacity: 0.5 }}>Log a treatment to get a day-by-day recovery routine.</p>
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

const SKIN_SYMPTOMS = [
  "Whitehead", "Blackhead", "Papule", "Pustule", "Cyst",
  "Dryness", "Flaking", "Redness", "Irritation", "Congestion",
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

function BodyAcneTracker({ products: productsProp = [], activeMap, user = {}, onUpdateUser = () => {}, triggerLog: triggerLogProp = [], setTriggerLog = () => {}, forceZonesExpanded = false, hideZonesHeader = false }) {
  const products   = Array.isArray(productsProp)   ? productsProp   : [];
  const triggerLog = Array.isArray(triggerLogProp) ? triggerLogProp : [];
  const enabled = user.bodyAcneEnabled || false;
  const zones = user.bodyAcneZones || [];
  const [showTriggerModal, setShowTriggerModal] = useState(false);
  const [selectedTriggers, setSelectedTriggers] = useState([]);
  const [selectedSymptoms, setSelectedSymptoms] = useState([]);
  const [expandedZone, setExpandedZone] = useState(null);
  // Body Acne section owns two independent collapsible rows on the dark
  // canvas: Log Today's Triggers (opens the modal sheet) and Body Acne
  // (expands the zone selector). Both default closed — except inside
  // the Body tracker sheet, where the caller renders it pre-expanded
  // with this second header hidden (forceZonesExpanded/hideZonesHeader),
  // since the sheet's own title already says "Body".
  const [zonesExpanded, setZonesExpanded] = useState(forceZonesExpanded);

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
      <div style={{ background: "var(--color-ivory-shadow)", border: "none", borderRadius: "var(--radius)", padding: "var(--space-5) var(--space-5)", marginBottom: "calc(var(--space-1) * 7)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)" }}>Body Acne</span>
          <span style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", color: "var(--clay)", background: "var(--color-ivory-shadow)", border: "none", padding: "2px var(--space-2)", borderRadius: "var(--radius-pill)", letterSpacing: "0.06em" }}>Optional</span>
        </div>
        <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: "0 0 var(--space-4)", lineHeight: 1.65 }}>
          Track body acne zones, identify triggers, and get advice drawn from what's already on your vanity.
        </p>
        <button onClick={() => setEnabled(true)}
          style={{ padding: "var(--space-3) var(--space-5)", background: "transparent", border: "1px solid var(--color-ivory, #faf9f4)", borderRadius: "var(--radius)", fontFamily: "var(--font-display)", fontSize: "var(--text-xs)", fontWeight: 700, letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--color-ivory, #faf9f4)", cursor: "pointer", transition: "all 0.2s" }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(var(--rgb-ivory), 0.08)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          Enable
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: "calc(var(--space-1) * 7)" }}>

      {/* Row 1 — LOG TODAY'S TRIGGERS. Tap opens the trigger/symptom sheet. */}
      <button onClick={() => setShowTriggerModal(true)}
        style={{
          display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
          padding: "var(--space-5) 0",
          background: "transparent", border: "none",
          borderTop: "1px solid rgba(var(--rgb-ivory), 0.32)",
          borderBottom: "1px solid rgba(var(--rgb-ivory), 0.32)",
          cursor: "pointer",
          WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
        }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-sm)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--color-ivory, #faf9f4)" }}>
          Log Today's Triggers
        </span>
        <span style={{ color: "var(--color-ivory, #faf9f4)", opacity: 0.7, display: "inline-flex" }}>
          <Icon name="arrow-right" size={14} />
        </span>
      </button>

      {/* Row 2 — BODY ACNE. Tap toggles the zone selector and the rest of
          the section. Shares its top hairline with Row 1 above via
          marginTop: -1. */}
      {!hideZonesHeader && (
      <button onClick={() => setZonesExpanded(o => !o)}
        aria-expanded={zonesExpanded}
        style={{
          display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
          padding: "var(--space-5) 0", marginTop: -1,
          background: "transparent", border: "none",
          borderTop: "1px solid rgba(var(--rgb-ivory), 0.32)",
          borderBottom: "1px solid rgba(var(--rgb-ivory), 0.32)",
          cursor: "pointer",
          WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
        }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-sm)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--color-ivory, #faf9f4)" }}>
          Body Acne
        </span>
        <span style={{
          color: "var(--color-ivory, #faf9f4)", opacity: 0.7,
          transform: zonesExpanded ? "rotate(90deg)" : "none",
          transition: "transform 0.2s",
          display: "inline-flex",
        }}>
          <Icon name="chevron" size={13} />
        </span>
      </button>
      )}

      {zonesExpanded && (
      <div style={{ paddingTop: "var(--space-4)" }}>
      {/* Zone selector */}
      <div style={{ marginBottom: "var(--space-4)" }}>
        <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 var(--space-3)" }}>Where do you experience it?</p>

        <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: "0 0 var(--space-2)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", opacity: 0.55 }}>Face</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}>
          {FACE_TRACKER_ZONES.map(zone => {
            const active = zones.includes(zone.id);
            return (
              <button key={zone.id} onClick={() => { toggleZone(zone.id); setExpandedZone(active ? null : zone.id); }}
                style={{ padding: "var(--space-2) var(--space-4)", borderRadius: "var(--radius)", border: `1px solid ${active ? "rgba(var(--rgb-ivory), 0.56)" : "var(--border)"}`, background: active ? "rgba(var(--rgb-ivory), 0.08)" : "transparent", color: active ? "var(--color-ivory, #faf9f4)" : "var(--clay)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 400, cursor: "pointer", transition: "all 0.18s" }}>
                {zone.label}
              </button>
            );
          })}
        </div>

        <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: "0 0 var(--space-2)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", opacity: 0.55 }}>Body</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
          {BODY_ZONES.map(zone => {
            const active = zones.includes(zone.id);
            return (
              <button key={zone.id} onClick={() => { toggleZone(zone.id); setExpandedZone(active ? null : zone.id); }}
                style={{ padding: "var(--space-2) var(--space-4)", borderRadius: "var(--radius)", border: `1px solid ${active ? "rgba(var(--rgb-ivory), 0.56)" : "var(--border)"}`, background: active ? "rgba(var(--rgb-ivory), 0.08)" : "transparent", color: active ? "var(--color-ivory, #faf9f4)" : "var(--clay)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 400, cursor: "pointer", transition: "all 0.18s" }}>
                {zone.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Zone details */}
      {zones.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
          {[...FACE_TRACKER_ZONES, ...BODY_ZONES].filter(z => zones.includes(z.id)).map(zone => {
            const open = expandedZone === zone.id;
            return (
              <div key={zone.id} style={{ background: "var(--color-ivory-shadow)", border: "none", borderRadius: "var(--radius)", overflow: "hidden", transition: "all 0.2s" }}>
                <button onClick={() => setExpandedZone(open ? null : zone.id)}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--space-4) var(--space-5)", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--color-inky-moss)" }} />
                    <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--parchment)", fontWeight: 400 }}>{zone.label}</span>
                  </div>
                  <span style={{ color: "var(--clay)", opacity: 0.4, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s", display: "inline-flex" }}><Icon name="chevron" size={12} /></span>
                </button>
                {open && (
                  <div style={{ padding: "0 var(--space-5) var(--space-4)", borderTop: "1px solid var(--border)" }}>
                    {/* Causes */}
                    <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--clay)", margin: "var(--space-4) 0 var(--space-2)" }}>Common Causes</p>
                    {zone.causes.map((c, i) => (
                      <div key={i} style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
                        <div style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--clay)", flexShrink: 0, marginTop: "var(--space-1)", opacity: 0.5 }} />
                        <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: 0, lineHeight: 1.6 }}>{c}</p>
                      </div>
                    ))}
                    {/* Advice */}
                    <div style={{ marginTop: "var(--space-3)", padding: "var(--space-3) var(--space-4)", background: "rgba(var(--rgb-moss), 0.08)", border: "1px solid rgba(var(--rgb-moss), 0.16)", borderRadius: "var(--radius)" }}>
                      <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--parchment)", margin: 0, lineHeight: 1.65 }}>{zone.advice}</p>
                    </div>
                    {/* Suggested products */}
                    <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--clay)", margin: "var(--space-3) 0 var(--space-2)" }}>What Helps</p>
                    {zone.products.map((p, i) => (
                      <div key={i} style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-ivory, #faf9f4)", flexShrink: 0, marginTop: 2 }}>+</span>
                        <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: 0, lineHeight: 1.6 }}>{p}</p>
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
        <div style={{ background: "var(--color-ivory-shadow)", border: "none", borderRadius: "var(--radius)", padding: "var(--space-4) var(--space-5)", marginBottom: "var(--space-3)" }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 var(--space-3)" }}>Your Vanity</p>

          {doubles.length > 0 && (
            <div style={{ marginBottom: doubles.length > 0 && gaps.length > 0 ? "var(--space-3)" : 0 }}>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--color-ivory, #faf9f4)", margin: "0 0 var(--space-2)" }}>Already on your vanity</p>
              {doubles.map((d, i) => (
                <div key={i} style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-2)" }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--color-inky-moss)", flexShrink: 0, marginTop: "var(--space-1)" }} />
                  <div>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--parchment)", margin: "0 0 2px", fontWeight: 400 }}>{d.product}</p>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: 0, lineHeight: 1.55 }}>{d.note}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {gaps.length > 0 && (
            <div>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--color-bronze)", margin: "0 0 var(--space-2)" }}>Worth adding</p>
              {gaps.map((g, i) => (
                <div key={i} style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-2)" }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--color-bronze)", flexShrink: 0, marginTop: "var(--space-1)" }} />
                  <div>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--parchment)", margin: "0 0 2px", fontWeight: 400 }}>{g.product}</p>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: 0, lineHeight: 1.55 }}>{g.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Trigger log */}
      {triggerLog.length > 0 && (
        <div style={{ background: "var(--color-ivory-shadow)", border: "none", borderRadius: "var(--radius)", padding: "var(--space-4) var(--space-5)" }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 var(--space-3)" }}>Recent Triggers</p>
          {triggerLog.slice(-5).reverse().map((entry, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)", marginBottom: i < triggerLog.slice(-5).length - 1 ? "var(--space-3)" : 0, paddingBottom: i < triggerLog.slice(-5).length - 1 ? "var(--space-3)" : 0, borderBottom: i < triggerLog.slice(-5).length - 1 ? "1px solid var(--border)" : "none" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)", marginBottom: "var(--space-1)" }}>
                  {entry.triggers.map((t, j) => (
                    <span key={j} style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", color: "var(--clay)", background: "rgba(var(--rgb-ivory), 0.08)", border: "1px solid var(--border)", padding: "2px var(--space-2)", borderRadius: "var(--radius-pill)" }}>{t}</span>
                  ))}
                </div>
                <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: 0, opacity: 0.5 }}>{new Date(entry.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Disable */}
      <button onClick={() => setEnabled(false)}
        style={{ background: "none", border: "none", padding: "var(--space-3) 0 0", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--clay)", opacity: 0.35, transition: "opacity 0.2s" }}
        onMouseEnter={e => e.currentTarget.style.opacity = "0.7"}
        onMouseLeave={e => e.currentTarget.style.opacity = "0.35"}>
        Disable tracking
      </button>
      </div>
      )}

      {/* Trigger log modal */}
      {showTriggerModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(var(--rgb-ink), 0.82)", backdropFilter: "blur(12px)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={e => e.target === e.currentTarget && setShowTriggerModal(false)}>
          <div style={{ background: "var(--ink)", width: "100%", maxWidth: 520, borderRadius: "var(--radius-sheet)", padding: "calc(var(--space-1) * 7) var(--space-6) calc(var(--space-1) * 13)", border: "1px solid var(--border)", borderBottom: "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-5)" }}>
              <div>
                <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 var(--space-1)" }}>Log</p>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)", fontWeight: 700, letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--parchment)", margin: 0 }}>What happened today?</h2>
              </div>
              <button onClick={() => setShowTriggerModal(false)} aria-label="Close" style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", padding: "var(--space-1)" }}><Icon name="x" size={17} /></button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginBottom: "var(--space-6)" }}>
              {BODY_TRIGGERS.map(t => {
                const active = selectedTriggers.includes(t.label);
                return (
                  <button key={t.id} onClick={() => setSelectedTriggers(prev => active ? prev.filter(x => x !== t.label) : [...prev, t.label])}
                    style={{ padding: "var(--space-3) var(--space-4)", borderRadius: "var(--radius)", border: `1px solid ${active ? "rgba(var(--rgb-moss), 0.56)" : "var(--border)"}`, background: active ? "rgba(var(--rgb-ivory), 0.08)" : "var(--ink)", color: active ? "var(--color-inky-moss)" : "var(--clay)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", cursor: "pointer", transition: "all 0.18s" }}>
                    {t.label}
                  </button>
                );
              })}
            </div>
            {/* What did your skin do? — symptom multi-select. Saved alongside
                triggers so SwanSense and Ask Cygne can correlate trigger
                events with the specific symptoms that followed. */}
            <div style={{ marginBottom: "var(--space-5)" }}>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 var(--space-1)" }}>Symptoms</p>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)", fontWeight: 700, letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--color-ivory, #faf9f4)", margin: "0 0 var(--space-4)" }}>What did your skin do?</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                {SKIN_SYMPTOMS.map(s => {
                  const active = selectedSymptoms.includes(s);
                  return (
                    <button key={s} onClick={() => setSelectedSymptoms(prev => active ? prev.filter(x => x !== s) : [...prev, s])}
                      style={{ padding: "var(--space-3) var(--space-4)", borderRadius: "var(--radius)", border: `1px solid ${active ? "rgba(var(--rgb-moss), 0.56)" : "var(--border)"}`, background: active ? "rgba(var(--rgb-ivory), 0.08)" : "var(--ink)", color: active ? "var(--color-inky-moss)" : "var(--clay)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", cursor: "pointer", transition: "all 0.18s" }}>
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
            <button onClick={() => {
              const hasAny = selectedTriggers.length > 0 || selectedSymptoms.length > 0;
              if (hasAny) {
                setTriggerLog(prev => [...prev, { date: new Date().toISOString(), triggers: selectedTriggers, symptoms: selectedSymptoms }]);
                setSelectedTriggers([]);
                setSelectedSymptoms([]);
                setShowTriggerModal(false);
              }
            }}
              style={{ width: "100%", padding: "var(--space-4) 0", background: "transparent", color: "var(--color-ivory, #faf9f4)", border: "1px solid var(--color-ivory, #faf9f4)", borderRadius: "var(--radius)", fontFamily: "var(--font-display)", fontSize: "var(--text-xs)", fontWeight: 700, letterSpacing: "var(--tracking-display)", textTransform: "uppercase", cursor: (selectedTriggers.length > 0 || selectedSymptoms.length > 0) ? "pointer" : "default", opacity: (selectedTriggers.length > 0 || selectedSymptoms.length > 0) ? 1 : 0.5 }}>
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function JournalFullView({ journals: journalsProp = [], onClose, onEditToday }) {
  const journals = Array.isArray(journalsProp) ? journalsProp : [];
  const today = localDateKey();
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
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "var(--ink)", overflowY: "auto", padding: "0 0 var(--space-10)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--space-5) var(--space-5) var(--space-3)", borderBottom: "1px solid var(--border)" }}>
        <button onClick={onClose}
          style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <Icon name="arrow-left" size={12} /> Back
        </button>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)", fontWeight: 700, letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--parchment)", margin: 0 }}>Skin Journal</h2>
        <button onClick={onEditToday}
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 400, color: "var(--color-ivory, #faf9f4)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          + Log
        </button>
      </div>

      <div style={{ padding: "0 var(--space-5)" }}>
        {groups.map(g => (
          <div key={g.month}>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)", margin: "var(--space-6) 0 var(--space-3)", opacity: 0.7 }}>{g.month}</p>
            {g.entries.map(j => {
              const c = SKIN_CONDITIONS.find(x => x.key === j.condition);
              const d = new Date(j.date + "T12:00:00");
              const isToday = j.date === today;
              const dateLabel = isToday ? "Today" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
              return (
                <div key={j.date} style={{ background: "var(--color-ivory-shadow)", border: "none", borderRadius: "var(--radius)", padding: "var(--space-4) var(--space-4)", marginBottom: "var(--space-2)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: j.notes ? "var(--space-2)" : 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: c ? c.color : "var(--clay)", flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: isToday ? "var(--parchment)" : "var(--clay)" }}>{dateLabel}</span>
                      <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: c ? c.color : "var(--parchment)", fontWeight: 400 }}>{c ? c.label : j.condition}</span>
                    </div>
                    <div style={{ display: "flex", gap: "var(--space-1)" }}>
                      {j.sleep && <span style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--clay)", background: "var(--ink)", padding: "2px var(--space-2)", borderRadius: "var(--radius-pill)" }}>Sleep {j.sleep}</span>}
                      {j.stress && <span style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--clay)", background: "var(--ink)", padding: "2px var(--space-2)", borderRadius: "var(--radius-pill)" }}>Stress {j.stress}</span>}
                    </div>
                  </div>
                  {j.notes && (
                    <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: 0, lineHeight: 1.5, opacity: 0.8 }}>{j.notes}</p>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {sorted.length === 0 && (
          <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", textAlign: "center", marginTop: "var(--space-10)", opacity: 0.6 }}>No journal entries yet. Start logging to see your history.</p>
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

// Merge the two hold-suggestion signals into one message per card.
// The check-in signal fires when the current week's most-recent
// response reported irritation. The cycle signal fires when the user
// is in — or about to enter — the luteal window and there's an
// active check-in context for the week (either due or already
// submitted this week). When both fire we acknowledge both in a
// single line rather than stacking two nudges.
function buildHoldSuggestion({ fromCheckin, fromCycle }) {
  if (fromCheckin && fromCycle) {
    return {
      active: true,
      message: "Your skin flagged irritation this week and tends to be more sensitive right now — consider holding at your current pace.",
    };
  }
  if (fromCheckin) {
    return {
      active: true,
      message: "Your skin flagged irritation this week — consider holding at your current pace.",
    };
  }
  if (fromCycle) {
    return {
      active: true,
      message: "Your skin tends to be more sensitive this week — consider holding at your current pace.",
    };
  }
  return { active: false, message: null };
}

function ProgressInner({ products: productsProp, checkIns: checkInsProp, setCheckIns, treatments: treatmentsProp = [], setTreatments, saveTreatment, removeTreatment, updateTreatmentDate = () => {}, user = {}, onAdvanceRamp, onHoldRamp, onResetRampStart = () => {}, onRampCheckinSave = async () => {}, onRampCheckinDone = () => {}, rampCheckins: rampCheckinsProp = [], cycleSuggestsHold = false, journals: journalsProp = [], setJournals = () => {}, onUpdateUser = () => {}, reflections: reflectionsProp = [], triggerLog: triggerLogProp = [], setTriggerLog = () => {} }) {
  // Defensive coercion for every collection prop. The `= []` destructure
  // defaults only catch `undefined`; explicit nulls or unexpected
  // non-array values (e.g. during the brief window between auth landing
  // and the Phase 1/2 table reads resolving) would still crash the first
  // .map / .filter / .length downstream. Coerce once here so everything
  // beyond this line can iterate without a guard.
  const products    = Array.isArray(productsProp)    ? productsProp    : [];
  const checkIns    = Array.isArray(checkInsProp)    ? checkInsProp    : [];
  const treatments  = Array.isArray(treatmentsProp)  ? treatmentsProp  : [];
  const journals    = Array.isArray(journalsProp)    ? journalsProp    : [];
  const reflections = Array.isArray(reflectionsProp) ? reflectionsProp : [];
  const triggerLog  = Array.isArray(triggerLogProp)  ? triggerLogProp  : [];
  const rampCheckins = Array.isArray(rampCheckinsProp) ? rampCheckinsProp : [];
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const [askCygneQuestion, setAskCygneQuestion] = useState(null);
  const [journalFullView, setJournalFullView] = useState(false);
  // Which tracker-grid detail sheet is open, if any: "journal" | "face" |
  // "cycle" | "introduce" | "treatments" | "body" | null.
  const [openSheet, setOpenSheet] = useState(null);
  // Set alongside openSheet("introduce") from the Now card's ramp action —
  // scrolled to once the sheet (and its content) has actually mounted.
  const [pendingScrollId, setPendingScrollId] = useState(null);
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

  // Tracker-grid attention dots — pure computation in
  // src/lib/trackerAttention.js. treatmentActive reuses pauseTreatment
  // from getActivePauseState above rather than recomputing "is a
  // treatment in active recovery": a non-null pauseTreatment already
  // means exactly that (the most recent non-cleared treatment).
  const todayKey = localDateKey();
  const loggedToday = journals.some(j => j.date === todayKey);
  const trackerAttention = buildTrackerAttention({
    journalLoggedToday: loggedToday,
    rampProducts,
    rampCheckins,
    treatmentActive: !!pauseTreatment,
    today: new Date(),
  });
  const introduceDimmed = /acute/i.test(pausePhase?.label);

  const SHEET_TITLES = {
    journal: "Journal",
    face: "Face Map",
    cycle: "Cycle Tracking",
    introduce: "Introduce Slowly",
    treatments: "Treatments",
    body: "Body",
  };

  // Scrolls to a ramp product's card once the Introduce sheet (opened via
  // the Now card's ramp action) has actually mounted its content — a
  // synchronous scrollIntoView right after setOpenSheet would run before
  // the sheet's children exist.
  useEffect(() => {
    if (openSheet !== "introduce" || !pendingScrollId) return;
    const id = pendingScrollId;
    const raf = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      setPendingScrollId(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [openSheet, pendingScrollId]);

  // Section header: plain caps title beside a hair rule. Tone-aware
  // so it reads on both the dark canvas and the ivory band. The
  // bracketed ( 0N ) badges that used to sit here were removed —
  // bracketed pills now only carry actual data (e.g. ( WK 14 ) on
  // check-in cards), not section counters.
  // showRule controls the trailing horizontal line next to the label —
  // several sections (Cycle Tracking, Ritual Check-in, Inflammation
  // Map, Introduce Slowly) render their own hair rules immediately
  // beneath the header already, so that trailing line was redundant
  // decoration stacked right on top of it. Defaults to true so
  // sections that don't have that issue (Your Journal, Treatments)
  // keep their existing look.
  const sectionHeader = (text, tone = "dark", showRule = true) => {
    const isDarkBg = tone === "dark";
    const color = isDarkBg ? "var(--color-ivory, #faf9f4)" : "var(--color-ink)";
    const ruleColor = isDarkBg ? "rgba(var(--rgb-ivory), 0.16)" : "rgba(var(--rgb-ink), 0.16)";
    // Font sizing mirrors the home page's editorial section labels
    // ("Ask Cygne" / "Begin Your Ritual" at src/dashboard.jsx:247,297):
    // 16px Fungis Heavy, 0.22em tracking, uppercase.
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
        <span style={{
          fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-md)",
          letterSpacing: "var(--tracking-display)", textTransform: "uppercase",
          color, lineHeight: 1.1,
        }}>{text}</span>
        {showRule && <div style={{ flex: 1, height: 1, background: ruleColor, marginLeft: "var(--space-1)" }} />}
      </div>
    );
  };

  // On ivory bands every legacy design token (--clay, --parchment,
  // --sage, --border, etc.) resolves to ivory or ivory-alpha via the
  // dark-canvas overrides in App.jsx — so any inline style using
  // var(--clay) etc. paints ivory-on-ivory. We shadow those tokens for
  // the ivory subtree so all downstream var() references flip to
  // dark-on-ivory values without touching every text node.
  const IVORY_BAND_TOKENS = {
    "--parchment":          "var(--color-ink)",
    "--clay":               "rgba(var(--rgb-ink), 0.56)",
    "--sage":               "var(--color-inky-moss)",
    "--muted":              "rgba(var(--rgb-ink), 0.56)",
    "--taupe":              "rgba(var(--rgb-ink), 0.56)",
    "--border":             "rgba(var(--rgb-ink), 0.16)",
    "--surface":            "rgba(var(--rgb-ink), 0.08)",
    "--color-ivory-shadow": "rgba(var(--rgb-ink), 0.08)",
    "--cta":                "rgba(var(--rgb-ink), 0.08)",
    "--overlay":            "rgba(var(--rgb-ink), 0.56)",
  };

  // Full-bleed section wrapper. Alternates ivory / dark bands down the
  // page so each section reads as its own editorial panel. Uses
  // negative horizontal margin to break the container's 22px inset.
  const SectionShell = ({ text, tone = "dark", children, bottom = "calc(var(--space-1) * 7)", showRule = true, hideHeader = false }) => (
    <div style={{
      marginLeft: "calc(var(--space-6) * -1)", marginRight: "calc(var(--space-6) * -1)",
      padding: "var(--space-6) var(--space-6) var(--space-5)",
      marginBottom: bottom,
      background: tone === "ivory" ? "var(--color-ivory, #faf9f4)" : "transparent",
      ...(tone === "ivory" ? IVORY_BAND_TOKENS : null),
    }}>
      {!hideHeader && sectionHeader(text, tone, showRule)}
      {children}
    </div>
  );

  return (
    <div>

      {/* -- Header ----------------------------------------------------------- */}
      <div style={{ marginBottom: "var(--space-5)", paddingTop: "calc(var(--space-1) * 11)" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)", fontWeight: 500, letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--color-ivory)", margin: 0, lineHeight: 1.15 }}>Your Progress</h1>
      </div>

      {/* -- Cycle Ring -------------------------------------------------------- */}
      <div style={{ marginBottom: "var(--space-8)", display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
        <CycleRing
          journalEntries={journals}
          cycleStartDate={user?.cycleTrackingEnabled ? user?.cycleStartDate : null}
          cycleLength={user?.cycleLength}
          today={new Date()}
        />

        {/* -- Index layer: pills, insights, Now ------------------------------ */}
        <ProgressIndex
          index={buildProgressIndex({
            journalEntries: journals,
            checkIns,
            rampProducts,
            rampCheckins,
            cycleStartDate: user?.cycleStartDate,
            cycleLength: user?.cycleLength,
            cycleTrackingOn: !!user?.cycleTrackingEnabled,
            today: new Date(),
          })}
          onNow={(item) => {
            if (item.kind === "journal") setShowJournal(true);
            else if (item.kind === "checkin") setShowCheckIn(true);
            else if (item.kind === "ramp") {
              setOpenSheet("introduce");
              setPendingScrollId(`ramp-${item.productId}`);
            }
          }}
        />
      </div>

      {/* -- Tracker grid -------------------------------------------------- */}
      <div style={{ marginBottom: "calc(var(--space-1) * 7)" }}>
        <TrackerGrid attention={trackerAttention} onOpen={setOpenSheet} introduceDimmed={introduceDimmed} />
      </div>

      {showCheckIn && (
        <CheckInModal
          onSubmit={data => { setCheckIns(p => [...p, data]); setShowCheckIn(false); }}
          onClose={() => setShowCheckIn(false)}
        />
      )}

      {showJournal && (
        <SkinJournalModal
          existing={journals.find(j => j.date === localDateKey()) || null}
          onSubmit={data => {
            setJournals(prev => upsertJournalEntry(prev, data));
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

      {/* AskCygne modal lives inside Progress because askCygneQuestion is
          local state declared at the top of this function. It used to be
          orphaned inside LocationManager's render — which compiles fine
          but throws `ReferenceError: askCygneQuestion is not defined`
          the moment LocationManager is mounted standalone (e.g. from
          ProfileSheet, which imports LocationManager separately). */}
      {askCygneQuestion && (
        <AskCygneModal
          initialQuestion={askCygneQuestion.q}
          context={askCygneQuestion.ctx}
          onClose={() => setAskCygneQuestion(null)}
        />
      )}

      {/* -- Tracker detail sheets ------------------------------------------ */}
      {/* Each case below is the exact same SectionShell-wrapped JSX that
          used to render inline on the page — only the wrapper (a sheet
          instead of a stacked page section) changed. */}
      {openSheet && (
        <DetailSheet title={SHEET_TITLES[openSheet]} onClose={() => setOpenSheet(null)}>
          {openSheet === "journal" && (
            <>
              {/* Ritual Check-in sits directly above Your Journal, per spec. */}
              <SectionShell text="Ritual Check-in" tone="ivory" showRule={false}>
              {dueCheckin ? (
                <button onClick={() => setShowCheckIn(true)}
                  style={{
                    width: "100%",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "var(--space-5) 0",
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px solid rgba(var(--rgb-ink), 0.32)",
                    cursor: "pointer", textAlign: "left",
                    WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
                  }}>
                  <div>
                    <p style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-md)", fontWeight: 400, letterSpacing: "var(--tracking-label)", color: "var(--color-ink)", margin: "0 0 var(--space-1)", lineHeight: 1 }}>How did your skin respond?</p>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--color-stone)", margin: 0 }}>
                      {daysSince === null ? "Log your first check-in to start tracking." : "Last check-in " + daysSince + " day" + (daysSince !== 1 ? "s" : "") + " ago."}
                    </p>
                  </div>
                  <span aria-hidden="true" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)", fontWeight: 400, color: "var(--color-ink)", flexShrink: 0, marginLeft: "var(--space-3)", lineHeight: 1 }}>→</span>
                </button>
              ) : (
                <div style={{
                  display: "flex", alignItems: "center", gap: "var(--space-3)",
                  padding: "var(--space-4) 0",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid rgba(var(--rgb-ink), 0.32)",
                }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--color-inky-moss)", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--color-ink)" }}>
                      Checked in {daysSince === 0 ? "today" : daysSince + " day" + (daysSince !== 1 ? "s" : "") + " ago"}
                    </span>
                    {lastCheckIn && lastCheckIn.irritation && lastCheckIn.irritation !== "none" && (
                      <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--color-stone)", marginLeft: "var(--space-2)", opacity: 0.85 }}>{lastCheckIn.irritation} irritation</span>
                    )}
                  </div>
                  <button onClick={() => setShowCheckIn(true)} aria-label="Update check-in" style={{ display: "inline-flex", alignItems: "center", fontFamily: "var(--font-display)", fontSize: "var(--text-lg)", fontWeight: 400, color: "var(--color-ink)", background: "none", border: "none", padding: 0, cursor: "pointer", WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent", lineHeight: 1 }}>→</button>
                </div>
              )}
              </SectionShell>

              <SectionShell text="Your Journal" tone="dark">
              {(() => {
                const today = localDateKey();
                const todayEntry = journals.find(j => j.date === today);
                const pastEntries = [...journals].filter(j => j.date !== today).sort((a, b) => b.date.localeCompare(a.date));
                const visiblePast = pastEntries.slice(0, 3);
                const cond = todayEntry ? SKIN_CONDITIONS.find(c => c.key === todayEntry.condition) : null;
                return (
                  <div>
                    {/* Today's featured card */}
                    {!todayEntry ? (
                      <button onClick={() => setShowJournal(true)}
                        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--space-4) var(--space-5)", background: "rgba(var(--rgb-moss), 0.08)", border: "1px solid rgba(var(--rgb-moss), 0.16)", borderRadius: "var(--radius)", cursor: "pointer" }}>
                        <div style={{ textAlign: "left" }}>
                          <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 var(--space-1)" }}>Skin Journal</p>
                          <p style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-md)", fontWeight: 400, letterSpacing: "var(--tracking-label)", color: "var(--parchment)", margin: 0 }}>How is your skin today?</p>
                        </div>
                        <span aria-hidden="true" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)", fontWeight: 400, color: "var(--color-ivory, #faf9f4)", lineHeight: 1 }}>→</span>
                      </button>
                    ) : (
                      <div onClick={() => setShowJournal(true)}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--space-3) var(--space-5)", background: "var(--color-ivory-shadow)", border: "none", borderRadius: "var(--radius)", cursor: "pointer" }}>
                        <div>
                          <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 var(--space-1)" }}>Today</p>
                          <p style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-md)", fontWeight: 400, letterSpacing: "var(--tracking-label)", color: cond ? cond.color : "var(--parchment)", margin: 0 }}>{cond ? cond.label : todayEntry.condition}</p>
                        </div>
                        <div style={{ display: "flex", gap: "var(--space-2)" }}>
                          {todayEntry.sleep && <span style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--clay)", background: "var(--ink)", padding: "var(--space-1) var(--space-2)", borderRadius: "var(--radius-pill)" }}>Sleep {todayEntry.sleep}</span>}
                          {todayEntry.stress && <span style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--clay)", background: "var(--ink)", padding: "var(--space-1) var(--space-2)", borderRadius: "var(--radius-pill)" }}>Stress {todayEntry.stress}</span>}
                        </div>
                      </div>
                    )}

                    {/* Previous entries (max 3) */}
                    {visiblePast.length > 0 && (
                      <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)", margin: "var(--space-4) 0 var(--space-2)", opacity: 0.7 }}>Previous entries</p>
                    )}
                    {visiblePast.map(j => {
                      const c = SKIN_CONDITIONS.find(x => x.key === j.condition);
                      const d = new Date(j.date + "T12:00:00");
                      const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                      return (
                        <div key={j.date} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-3) var(--space-5)", background: "var(--color-ivory-shadow)", border: "none", marginTop: -1, borderRadius: 0 }}>
                          <div style={{ width: 7, height: 7, borderRadius: "50%", background: c ? c.color : "var(--clay)", flexShrink: 0 }} />
                          <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", flex: 1 }}>{label}</span>
                          <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: c ? c.color : "var(--parchment)", fontWeight: 400 }}>{c ? c.label : j.condition}</span>
                          {j.notes && <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", opacity: 0.5, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.notes}</span>}
                        </div>
                      );
                    })}

                    {/* View all link — arrow-only affordance, text left, arrow flush right */}
                    {pastEntries.length > 0 && (
                      <button onClick={() => setJournalFullView(true)}
                        style={{ width: "100%", padding: "var(--space-3) var(--space-5)", background: "var(--color-ivory-shadow)", border: "none", borderTop: "none", marginTop: -1, borderRadius: "0 0 var(--radius) var(--radius)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--color-ivory, #faf9f4)" }}>
                        <span>All {journals.length} entries</span>
                        <span aria-hidden="true" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)", fontWeight: 400, lineHeight: 1 }}>→</span>
                      </button>
                    )}
                  </div>
                );
              })()}
              </SectionShell>
            </>
          )}

          {openSheet === "face" && (
            <SectionShell text="Inflammation Map" tone="dark" showRule={false}>
            <div style={{ marginBottom: consistencyPct !== null ? "var(--space-6)" : 0 }}>
              <FaceHeatMap checkIns={checkIns} onAskCygne={(q, ctx) => setAskCygneQuestion({ q, ctx })} />
            </div>

            {/* Hero number treatment — centered pull-quote composition
                matching the home page's seasonal / weekend headline blocks
                (32px vertical padding, stacked eyebrow-under-headline reading
                order). The label sits BELOW the numeral in Fungis caps so the
                numeral carries the moment and "RITUAL HEALTH" identifies it
                without competing for the horizontal axis. */}
            {consistencyPct !== null && (
              <div style={{ padding: "var(--space-8) 0", textAlign: "center" }}>
                <div style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 112, fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: "var(--color-ivory, #faf9f4)",
                  lineHeight: 0.92,
                  margin: 0,
                }}>{consistencyPct}</div>
                <div style={{
                  fontFamily: "var(--font-display)", fontWeight: 700,
                  fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase",
                  color: "var(--color-ivory, #faf9f4)", opacity: 0.7,
                  marginTop: "var(--space-5)",
                }}>Ritual Health</div>
                <div style={{
                  height: 1, background: "rgba(var(--rgb-ivory), 0.32)",
                  margin: "var(--space-6) auto var(--space-4)",
                  maxWidth: 220,
                  position: "relative",
                }}>
                  <div style={{
                    width: consistencyPct + "%", height: 1,
                    background: "var(--color-ivory, #faf9f4)",
                    transition: "width 0.6s ease",
                  }} />
                </div>
                <div style={{
                  fontFamily: "var(--font-body)", fontSize: "var(--text-xs)",
                  letterSpacing: "var(--tracking-display)", textTransform: "uppercase",
                  color: "var(--color-ivory, #faf9f4)", opacity: 0.6,
                  marginBottom: "var(--space-4)",
                }}>From {checkIns.length} check-in{checkIns.length !== 1 ? "s" : ""}</div>
                <p style={{
                  fontFamily: "var(--font-body)", fontSize: "var(--text-xs)",
                  color: "var(--color-ivory, #faf9f4)", opacity: 0.82,
                  margin: "0 auto", lineHeight: 1.65,
                  maxWidth: 320,
                }}>
                  {consistencyPct >= 85 ? "Strong adherence — your ritual is building compounding benefit." :
                   consistencyPct >= 70 ? "Mostly consistent. Fewer irritation days will improve this score." :
                   "Irregularity detected. Consistent application is what drives visible results."}
                </p>
              </div>
            )}
            </SectionShell>
          )}

          {openSheet === "cycle" && (
            // Sheet title carries the full name ("Cycle Tracking"); this
            // section's own header is hidden via hideHeader so it isn't
            // repeated inside the sheet.
            <SectionShell text="Cycle Tracking" tone="ivory" bottom="var(--space-5)" showRule={false} hideHeader>
              <CycleTracker products={products} activeMap={activeMap} cycleDay={user && user.cycleDay ? user.cycleDay : 14} onSetCycleDay={d => onUpdateUser && onUpdateUser({ ...user, cycleDay: d })} user={user} onUpdateUser={onUpdateUser} />
            </SectionShell>
          )}

          {openSheet === "introduce" && (
            // Sheet title carries the full name ("Introduce Slowly"); this
            // section's own header is hidden via hideHeader in both
            // branches so it isn't repeated inside the sheet.
            /acute/i.test(pausePhase?.label) ? (
              <SectionShell text="Introduce Slowly" tone="ivory" showRule={false} hideHeader>
                <p style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", color: "var(--color-stone)", textAlign: "center", margin: "var(--space-4) 0" }}>
                  Paused while you recover.
                </p>
              </SectionShell>
            ) : (
              <SectionShell text="Introduce Slowly" tone="ivory" showRule={false} hideHeader>
                {reintroActives.length > 0 && pauseTreatment && pausePhase && (
                  <div style={{
                    padding: "var(--space-4) 0",
                    borderTop: "1px solid rgba(var(--rgb-ink), 0.32)",
                    borderBottom: "1px solid rgba(var(--rgb-ink), 0.32)",
                    marginBottom: "var(--space-2)",
                  }}>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--color-inky-moss)", margin: "0 0 var(--space-1)" }}>Reintroducing after recovery</p>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--color-ink)", margin: 0, lineHeight: 1.55 }}>
                      You're in the {pausePhase.label.toLowerCase()} phase. {reintroActives.join(", ")} can return — but build slowly from week 1 to avoid overwhelming skin that's still settling.
                    </p>
                  </div>
                )}
                {rampProducts.length > 0 ? (
                  rampProducts.map((p, i) => {
                    const activeKey = p.category === "Toning Pad"
                      ? "toning pad"
                      : RAMP_ACTIVES.find(a => detectActives(p.ingredients || [])[a]);
                    // Concern-aware schedule — sensitivity-tier users get
                    // an extended timeline via getRampSchedule. schedulePaced
                    // tells the card to surface a soft "paced more gradually"
                    // caption so the user understands why the shape differs
                    // from the standard schedule.
                    const schedule = getRampSchedule(activeKey, user?.concerns);
                    if (!schedule) return null;
                    const schedulePaced = isSchedulePaced(user?.concerns);
                    const weekNumber = getRampWeek(p);
                    const checkinDue = weekNumber > (p.lastCheckinWeek || 0);
                    // Derive per-product suggestion signals from the
                    // ramp_checkins history hydrated by App.jsx and merge
                    // with the global cycle-phase signal. Cycle only counts
                    // when there's an active check-in context for this
                    // week — either the check-in is due, or the user
                    // submitted for this exact week already. Both signals
                    // combine into a single message per card via
                    // buildHoldSuggestion.
                    const { suggestHold: checkinSuggestsHold, recentTrend } = deriveRampSignals(rampCheckins, p.id, weekNumber);
                    const activeCheckinContext = checkinDue || (Number(p.lastCheckinWeek) === weekNumber);
                    const holdSuggestion = buildHoldSuggestion({
                      fromCheckin: checkinSuggestsHold,
                      fromCycle: cycleSuggestsHold && activeCheckinContext,
                    });
                    // Single combined card per product — the check-in flow
                    // renders inline inside IntroduceSlowlyCard when checkinDue
                    // is true. Card outer container was removed in the ivory
                    // flattening pass; each product now reads as an editorial
                    // section separated by hair rules from its neighbours.
                    return (
                      // scrollMarginTop clears the sheet's own header when the
                      // Now card scrolls here.
                      <div key={p.id} id={`ramp-${p.id}`} style={{ scrollMarginTop: "var(--space-4)" }}>
                      <IntroduceSlowlyCard
                        product={p}
                        schedule={schedule}
                        weekNumber={weekNumber}
                        onResetStart={onResetRampStart}
                        onAdvance={onAdvanceRamp}
                        onHold={onHoldRamp}
                        checkinDue={checkinDue}
                        onCheckinSave={(responseState, note) => onRampCheckinSave(p.id, weekNumber, responseState, note)}
                        onCheckinDone={() => onRampCheckinDone(p.id, weekNumber)}
                        isLast={i === rampProducts.length - 1}
                        holdSuggestion={holdSuggestion}
                        recentTrend={recentTrend}
                        schedulePaced={schedulePaced}
                      />
                      </div>
                    );
                  })
                ) : (
                  <div style={{
                    padding: "var(--space-4) 0",
                    borderTop: "1px solid rgba(var(--rgb-ink), 0.32)",
                    borderBottom: "1px solid rgba(var(--rgb-ink), 0.32)",
                  }}>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--color-stone)", margin: 0, lineHeight: 1.65 }}>
                      Nothing in ramp-up yet. Add a retinol, AHA, BHA, vitamin C, or toning pad to your vanity and Cygne will walk you through its introduction here.
                    </p>
                  </div>
                )}
              </SectionShell>
            )
          )}

          {openSheet === "treatments" && (
            // Sheet title carries the name ("Treatments"); this section's
            // own header is hidden via hideHeader so it isn't repeated.
            <SectionShell text="Treatments" tone="dark" hideHeader>
              <TreatmentSection treatments={treatments} saveTreatment={saveTreatment} removeTreatment={removeTreatment} updateTreatmentDate={updateTreatmentDate} products={products} activeMap={activeMap} />
            </SectionShell>
          )}

          {openSheet === "body" && (
            <BodyAcneTracker products={products} activeMap={activeMap} user={user} onUpdateUser={onUpdateUser} triggerLog={triggerLog} setTriggerLog={setTriggerLog} forceZonesExpanded hideZonesHeader />
          )}
        </DetailSheet>
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
      <div style={{ background: "var(--color-ivory-shadow)", border: "none", borderRadius: "var(--radius)", padding: "var(--space-4) var(--space-5)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <span style={{ color: "var(--clay)", opacity: 0.6, display: "inline-flex" }}><Icon name="target" size={14} /></span>
            <div>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", color: "var(--parchment)", margin: "0 0 2px", fontWeight: 400 }}>{locationData.city}{locationData.country ? `, ${locationData.country}` : ""}</p>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: 0 }}>{locationData.lat.toFixed(3)}°, {locationData.lon.toFixed(3)}°</p>
            </div>
          </div>
          <button onClick={requestLocation}
            style={{ padding: "var(--space-2) var(--space-3)", background: "none", border: "1px solid var(--border)", borderRadius: "var(--radius-pill)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", cursor: "pointer", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--color-inky-moss)"; e.currentTarget.style.color = "var(--color-inky-moss)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--clay)"; }}>
            {loading ? "..." : "Update"}
          </button>
        </div>
        {error && <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--color-bronze)", margin: "var(--space-3) 0 0" }}>{error}</p>}
      </div>
    );
  }

  return (
    <div style={{ background: "var(--color-ivory-shadow)", border: "none", borderRadius: "var(--radius)", padding: "var(--space-4) var(--space-5)" }}>
      <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: "0 0 var(--space-4)", lineHeight: 1.65 }}>
        {locationDenied
          ? "Location was previously denied. You can grant access in your browser settings, then try again."
          : "Share your location so Cygne can read local humidity, UV index, and temperature — and adjust your ritual advice accordingly."}
      </p>
      <button onClick={requestLocation}
        style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "var(--space-3) var(--space-5)", background: "rgba(var(--rgb-ivory), 0.08)", border: "1px solid rgba(var(--rgb-moss), 0.32)", borderRadius: "var(--radius)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 400, color: "var(--color-ivory, #faf9f4)", cursor: "pointer", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", transition: "all 0.2s" }}
        onMouseEnter={e => e.currentTarget.style.background = "rgba(var(--rgb-moss), 0.16)"}
        onMouseLeave={e => e.currentTarget.style.background = "rgba(var(--rgb-ivory), 0.08)"}>
        {loading ? "Requesting..." : locationDenied ? "Try Again" : "Enable Location"}
      </button>
      {error && <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--color-bronze)", margin: "var(--space-3) 0 0" }}>{error}</p>}
    </div>
  );
}

// Wrap the screen-level Progress export in an ErrorBoundary so a render
// crash inside its (large) component tree degrades to the in-app fallback
// instead of unmounting React. Sub-exports (CheckInModal, SkinJournalModal,
// helpers) are left as-is — their own callers can wrap if needed.
function Progress(props) {
  return (
    <ErrorBoundary>
      <ProgressInner {...props} />
    </ErrorBoundary>
  );
}

export { Progress, CheckInModal, SkinJournalModal, LocationManager, getTreatmentPhase, TreatmentRecoveryCard, getCyclePhase, getActivePauseState };