import { useState } from "react";
import { Icon, Section, FlagCard } from "./components.jsx";
import { detectActives, analyzeShelf, buildRoutine, detectConflicts, getCurrentSession, isScheduledToday } from "./engine.js";
import { FREQUENCIES } from "./constants.js";
import { buildRecommendations, buildRefinements, RecommendationCard, RefinementItem } from "./intelligence.jsx";
import { RoutineStep } from "./ritual.jsx";
import { CheckInModal } from "./progress.jsx";
import { getCyclePhase } from "./progress.jsx";
import { getNextUseLabel } from "./constants.js";
import { getSeason } from "./seasonal.jsx";

const RITUAL_MODES = {
  travel: {
    name: "travel ritual",
    tagline: "Simplified for the road.",
    color: "#9a9688",
    bg: "rgba(154,150,136,0.08)",
    border: "rgba(154,150,136,0.22)",
    filterSteps: (steps) => steps.filter(p =>
      ["Cleanser","Moisturizer","SPF","Eye Cream"].includes(p.category)
    ),
    guidance: "Strip back to the essentials. Travel stress, recycled air, and different water are enough for your skin to manage — no need to push actives.",
  },
  recovery: {
    name: "recovery ritual",
    tagline: "Let your barrier breathe.",
    color: "#c06060",
    bg: "rgba(192,96,96,0.08)",
    border: "rgba(192,96,96,0.22)",
    filterSteps: (steps) => steps.filter(p =>
      !["Exfoliant","Toning Pad"].includes(p.category) &&
      !["retinol","AHA","BHA","benzoyl peroxide"].some(a =>
        (p.ingredients||[]).some(i => i.toLowerCase().includes(a.split(" ")[0].toLowerCase()))
      )
    ),
    guidance: "Your skin is reacting. Pause actives and exfoliants tonight — focus on cleanse, hydrate, seal. Let recovery do the work.",
  },
  barrier_repair: {
    name: "barrier repair ritual",
    tagline: "Rebuild, don't strip.",
    color: "#c4a060",
    bg: "rgba(196,160,96,0.08)",
    border: "rgba(196,160,96,0.22)",
    filterSteps: (steps) => steps.filter(p =>
      ["Cleanser","Essence","Moisturizer","Oil","Eye Cream"].includes(p.category) ||
      (p.ingredients||[]).some(i => /ceramide|hyaluronic|squalane|panthenol/i.test(i))
    ),
    guidance: "Cold, dry air depletes the barrier faster than any active can repair it. Lean into occlusion and ceramides tonight.",
  },
  menstrual: {
    name: "gentle ritual",
    tagline: "Your skin is more sensitive right now.",
    color: "#b06060",
    bg: "rgba(176,96,96,0.07)",
    border: "rgba(176,96,96,0.2)",
    filterSteps: (steps) => steps.filter(p =>
      !["Exfoliant","Toning Pad"].includes(p.category) &&
      !(p.ingredients||[]).some(i => /retinol|retinyl|tretinoin|glycolic|lactic|salicylic/i.test(i))
    ),
    guidance: "Progesterone is low, barrier permeability is up. Skip exfoliants and actives — your skin absorbs and reacts to everything more intensely right now.",
  },
  luteal: {
    name: "oil control ritual",
    tagline: "Sebum is peaking. Get ahead of it.",
    color: "#c49040",
    bg: "rgba(196,144,64,0.08)",
    border: "rgba(196,144,64,0.22)",
    filterSteps: (steps) => steps,
    guidance: "Progesterone is driving up sebum production this week. Prioritise your BHA if you have one, keep moisturiser lighter, and watch for congestion.",
  },
  follicular: {
    name: "actives ritual",
    tagline: "Your skin is resilient right now.",
    color: "#7a9070",
    bg: "rgba(122,144,112,0.08)",
    border: "rgba(122,144,112,0.22)",
    filterSteps: (steps) => steps,
    guidance: "Rising estrogen means higher resilience and better absorption. This is your best window for retinol and AHA — your skin can handle it.",
  },
  winter: {
    name: "winter ritual",
    tagline: "Moisture in, barrier up.",
    color: "#7a9aaa",
    bg: "rgba(122,154,170,0.08)",
    border: "rgba(122,154,170,0.22)",
    filterSteps: (steps) => steps,
    guidance: "Cold strips moisture and weakens the barrier. Swap any foaming cleansers for cream formulas tonight if you can, and lock everything in with an occlusive.",
  },
  summer: {
    name: "minimal ritual",
    tagline: "Light layers, consistent SPF.",
    color: "#c4a060",
    bg: "rgba(196,160,96,0.07)",
    border: "rgba(196,160,96,0.2)",
    filterSteps: (steps) => steps.filter(p => p.category !== "Oil"),
    guidance: "Heat and humidity mean your skin retains more moisture naturally. Oils and heavy occlusives can congest — keep it light and make SPF the hero.",
  },
  reset: {
    name: "reset ritual",
    tagline: "Back to basics.",
    color: "#9a9688",
    bg: "rgba(154,150,136,0.08)",
    border: "rgba(154,150,136,0.22)",
    filterSteps: (steps) => steps.filter(p =>
      ["Cleanser","Moisturizer","SPF"].includes(p.category)
    ),
    guidance: "When skin is off and you can't tell why, strip everything back for a few nights. Cleanser, moisturiser, SPF. Let the noise clear.",
  },
  standard: {
    name: null, // no named mode — just show normal steps
    tagline: null,
    color: "#7a9070",
    bg: "rgba(122,144,112,0.07)",
    border: "rgba(122,144,112,0.18)",
    filterSteps: (steps) => steps,
    guidance: null,
  },
};

function getRitualMode(products, checkIns = [], user = {}, cycleDay = null, isFlightMode = false) {
  const season = getSeason();
  const recentCheckIns = checkIns.slice(-3);
  const hasModerateIrritation = recentCheckIns.some(c => c.irritation === "moderate");
  const hasMildIrritation = recentCheckIns.some(c => c.irritation === "mild");
  const hasBreakout = recentCheckIns.some(c => c.breakout);
  const activeMap = analyzeShelf(products).activeMap;
  const hasBHA = !!(activeMap["BHA"]?.length);
  const hasRetinol = !!(activeMap["retinol"]?.length);
  const hasAHA = !!(activeMap["AHA"]?.length);

  // Cycle phase signals
  let cycleMode = null;
  let cyclePhaseName = null;
  if (cycleDay) {
    const phase = getCyclePhase(cycleDay);
    cyclePhaseName = phase.name;
    if (phase.name === "Menstrual") cycleMode = "menstrual";
    else if (phase.name === "Luteal") cycleMode = "luteal";
    else if (phase.name === "Follicular") cycleMode = "follicular";
  }

  // Priority order: travel > recovery > barrier repair > cycle > season
  if (isFlightMode) return { mode: RITUAL_MODES.travel, key: "travel", cyclePhase: cyclePhaseName };

  if (hasModerateIrritation || (hasBreakout && hasModerateIrritation)) {
    return { mode: RITUAL_MODES.recovery, key: "recovery", cyclePhase: cyclePhaseName };
  }

  if (hasMildIrritation && (season === "winter" || season === "fall")) {
    return { mode: RITUAL_MODES.barrier_repair, key: "barrier_repair", cyclePhase: cyclePhaseName };
  }

  // Tretinoin in user medical history → never suggest actives ritual, treat like standard
  const onTretinoin = user?.medicalHistory?.prescriptions?.some(p => /tretinoin|retin-a/i.test(p.name));

  if (cycleMode === "menstrual") return { mode: RITUAL_MODES.menstrual, key: "menstrual", cyclePhase: cyclePhaseName };
  if (cycleMode === "luteal" && hasBHA) return { mode: RITUAL_MODES.luteal, key: "luteal", cyclePhase: cyclePhaseName };
  if (cycleMode === "follicular" && (hasRetinol || hasAHA) && !onTretinoin) {
    return { mode: RITUAL_MODES.follicular, key: "follicular", cyclePhase: cyclePhaseName };
  }

  if (season === "winter") return { mode: RITUAL_MODES.winter, key: "winter", cyclePhase: cyclePhaseName };
  if (season === "summer") return { mode: RITUAL_MODES.summer, key: "summer", cyclePhase: cyclePhaseName };

  return { mode: RITUAL_MODES.standard, key: "standard", cyclePhase: cyclePhaseName };
}

function getSwanGuidingLine(products, checkIns = [], user = {}, cycleDay = null, ritualKey = "standard", session = "pm", journals = []) {
  const recent = checkIns.slice(-3);
  const hasModerateIrritation = recent.some(c => c.irritation === "moderate");
  const hasMildIrritation = recent.some(c => c.irritation === "mild");
  const hasBreakout = recent.some(c => c.breakout);
  const hasTight = recent.some(c => c.tight);
  const lastClear = recent.length > 0 && recent.every(c => c.irritation === "none" && !c.breakout && !c.tight);
  const activeMap = analyzeShelf(products).activeMap;
  const hasRetinol = !!(activeMap["retinol"]?.length);
  const hasAHA = !!(activeMap["AHA"]?.length);
  const onTretinoin = user?.medicalHistory?.prescriptions?.some(p => /tretinoin|retin-a/i.test(p.name));
  const season = getSeason();

  // Journal context — last entry
  const lastJournal = journals[journals.length - 1];
  const today = new Date().toISOString().split("T")[0];
  const isToday = lastJournal?.date === today;
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const isRecent = lastJournal && (lastJournal.date === today || lastJournal.date === yesterday);
  const poorSleepRecent = isRecent && lastJournal.sleep === "poor";
  const highStressRecent = isRecent && lastJournal.stress === "high";
  const recentJournals = journals.slice(-5);
  const poorSleepStreak = recentJournals.filter(j => j.sleep === "poor").length >= 3;

  // Ritual-mode-specific lines take priority
  if (ritualKey === "travel")        return "Essentials only tonight. Your skin travels better light.";
  if (ritualKey === "recovery")      return "Step back tonight. Calm, cleanse, seal — let the barrier recover.";
  if (ritualKey === "barrier_repair") return "Rebuild before you push. Your barrier comes first.";
  if (ritualKey === "menstrual")     return "Gentler than usual tonight. Your skin is more reactive right now.";
  if (ritualKey === "luteal")        return "Sebum is peaking this week. Stay consistent with your BHA.";
  if (ritualKey === "follicular")    return session === "pm"
    ? (hasRetinol || onTretinoin ? "Good window for actives. Your skin is at its most resilient right now." : "Follicular phase — your skin is ready if you want to push.")
    : "Your skin is resilient this morning. Make the most of it.";
  if (ritualKey === "winter")        return "Cold air is working against you. Lock moisture in tonight.";
  if (ritualKey === "summer")        return "Light layers tonight. Let your skin breathe.";

  // Journal-informed lines — sleep and stress context
  if (poorSleepStreak)              return "Three nights of poor sleep in a row. Gentle ritual only — your barrier needs recovery more than actives right now.";
  if (poorSleepRecent && highStressRecent) return "Poor sleep and high stress take a toll on the barrier. Keep it simple tonight.";
  if (poorSleepRecent && (hasRetinol || hasAHA)) return "You logged poor sleep recently. Consider resting your actives tonight — barrier recovery slows when sleep does.";
  if (poorSleepRecent)              return "Sleep affects your skin more than most products. A simple ritual and an early night will do more than anything on the shelf.";
  if (highStressRecent && (hasRetinol || hasAHA)) return "High stress elevates cortisol and sensitizes skin. A gentle night is worth more than pushing actives.";
  if (highStressRecent)             return "Stress shows up on skin before anywhere else. Be easy with yourself tonight.";

  // Skin-state lines from check-ins
  if (hasModerateIrritation)  return "Your skin is telling you something. Keep it simple and listen.";
  if (hasMildIrritation && hasBreakout) return "A little reactive right now. Gentle tonight, actives can wait.";
  if (hasMildIrritation)      return "Mild irritation noted recently. Stay consistent, hold the actives.";
  if (hasBreakout)            return "Breakout flagged. BHA tonight if you have it, nothing heavy.";
  if (hasTight)               return "Tightness in your last check-in. Lean into hydration tonight.";

  // Positive momentum
  if (lastClear && (hasRetinol || hasAHA || onTretinoin)) {
    return session === "pm"
      ? "Skin is clear. Good night for actives — stay consistent."
      : "Clear skin, morning momentum. SPF is your most important step today.";
  }
  if (lastClear) return "Your skin is settled. Keep doing what you're doing.";

  // Session defaults
  if (session === "am") return "Start with a clean face. SPF is the step that earns everything else.";

  // Seasonal PM defaults
  if (season === "winter") return "Cold night. Don't skip the last occlusive step.";
  if (season === "summer") return "Warm night. Lighter layers will serve you better than heavy ones.";

  return "Your ritual is ready. Take your time with it.";
}

function MyRoutine({ products, user = {}, cycleDay = null, isFlightMode = false, journals = [], checkIns = [], setCheckIns = () => {}, completedSteps: completedStepsProp, setCompletedSteps: setCompletedStepsProp, onUpdateUser, setTab = () => {}, setModal = () => {}, dismissedSuggestions = [], onDismissSuggestion = () => {} }) {
  const session = getCurrentSession();
  const { am, pm, periodic } = buildRoutine(products);
  const conflicts = detectConflicts(products);
  const { flags, activeMap } = analyzeShelf(products);
  const [recTab, setRecTab] = useState("additions");
  const today = new Date().toISOString().split("T")[0];
  // Use persisted completed steps scoped to today, fall back to local state
  const todaySteps = completedStepsProp?.date === today ? completedStepsProp.steps : [];
  const [ritualDismissed, setRitualDismissed] = useState(false);
  const [showRitualCheckIn, setShowRitualCheckIn] = useState(false);
  const todayCheckedIn = checkIns.some(c => c.date === today);
  const completedSteps = todaySteps;
  const toggleStep = (id) => {
    const updated = completedSteps.includes(id) ? completedSteps.filter(x => x !== id) : [...completedSteps, id];
    const newState = { date: today, steps: updated };
    if (setCompletedStepsProp) setCompletedStepsProp(newState);
    // Sync to Supabase via user metadata
    if (onUpdateUser && user) onUpdateUser({ ...user, completedSteps: newState });
  };

  const { mode: ritualMode, key: ritualKey, cyclePhase } = getRitualMode(products, [], user, cycleDay, isFlightMode);
  const baseSteps = session === "am" ? am : pm;
  const steps = ritualMode.filterSteps(baseSteps);
  const filteredOut = baseSteps.filter(s => !steps.find(x => x.id === s.id));
  const allDone = steps.length > 0 && steps.every(s => completedSteps.includes(s.id));
  const sessionLabel = session === "am" ? "Morning" : "Evening";
  const sessionIcon  = session === "am" ? "sun" : "moon";

  const recs = buildRecommendations(products, activeMap, conflicts, user);
  const refinements = buildRefinements(products, activeMap, conflicts);
  const dismissed = new Set(dismissedSuggestions);
  const additions = recs.filter(r => r.type === "addition" && !dismissed.has(r.trigger));
  const swaps     = recs.filter(r => r.type === "swap"     && !dismissed.has(r.trigger));
  const simplifications = recs.filter(r => r.type === "simplify" && !dismissed.has(r.trigger));
  const visibleRefinements = refinements.filter(r => !dismissed.has(r.trigger));
  const totalRecs = additions.length + swaps.length + simplifications.length + visibleRefinements.length;

  const onAdd = (category) => {
    setTab("shelf");
    setModal({ brand: "", name: "", category, price: "", ingredients: "" });
  };
  const onEdit = (product) => {
    setModal(product);
  };

  const refineVerbStyle = {
    "Remove":           { color: "#c06060", bg: "rgba(192,96,96,0.08)",  border: "rgba(192,96,96,0.28)" },
    "Reduce Frequency": { color: "#c49040", bg: "rgba(196,144,64,0.08)", border: "rgba(196,144,64,0.28)" },
    "Replace":          { color: "#7a9070", bg: "rgba(122,144,112,0.08)",border: "rgba(122,144,112,0.28)" },
    "Add":              { color: "#7a9070", bg: "rgba(122,144,112,0.08)", border: "rgba(122,144,112,0.28)" },
  };

  const guidingLine = getSwanGuidingLine(products, [], user, cycleDay, ritualKey, session, journals);

  return (
    <div>

      {/* -- Header ----------------------------------------------------------- */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 42, fontWeight: 400, letterSpacing: "0.02em", color: "var(--parchment)", margin: 0, lineHeight: 1 }}>{user?.name ? `${user.name.split(" ")[0]}'s Ritual` : "Your Ritual"}</h1>
      </div>

      {/* -- Swan guiding line ---------------------------------------------- */}
      {guidingLine && (
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 22 }}>
          <span style={{ fontSize: 13, lineHeight: 1, flexShrink: 0 }}>🦢</span>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 400, color: "var(--clay)", margin: 0, lineHeight: 1.4, letterSpacing: "0.01em" }}>{guidingLine}</p>
        </div>
      )}

      {/* -- Ritual Mode Card ---------------------------------------------- */}
      {ritualMode.name && !ritualDismissed && (
        <div style={{ background: ritualMode.bg, border: `1px solid ${ritualMode.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 22, position: "relative" }}>
          <button onClick={() => setRitualDismissed(true)}
            style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", color: "var(--clay)", cursor: "pointer", opacity: 0.5, padding: 2 }}>
            <Icon name="x" size={13} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ color: "var(--clay)", opacity: 0.6 }}><Icon name={sessionIcon} size={13} /></span>
            <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--clay)" }}>tonight</span>
            {cyclePhase && (
              <span style={{ marginLeft: "auto", fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: ritualMode.color, opacity: 0.8 }}>{cyclePhase} phase</span>
            )}
          </div>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 400, color: "var(--parchment)", margin: "0 0 2px", letterSpacing: "0.02em" }}>{ritualMode.name}</p>
          <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: "0 0 10px", opacity: 0.7 }}>{ritualMode.tagline}</p>
          <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 12, color: "var(--clay)", margin: 0, lineHeight: 1.65 }}>{ritualMode.guidance}</p>
          {filteredOut.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${ritualMode.border}` }}>
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: ritualMode.color, margin: "0 0 6px", letterSpacing: "0.06em", opacity: 0.85 }}>Paused tonight</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {filteredOut.map(p => (
                  <span key={p.id} style={{ padding: "3px 10px", borderRadius: 20, background: "var(--ink)", border: "1px solid var(--border)", fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: "var(--clay)" }}>{p.name}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Session header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <span style={{ color: "var(--clay)", opacity: 0.55 }}><Icon name={sessionIcon} size={15} /></span>
        <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--clay)" }}>{sessionLabel} Ritual</span>
        <span style={{ fontSize: 9, fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#7a9070", background: "rgba(122,144,112,0.14)", padding: "2px 8px", borderRadius: 20 }}>Now</span>
      </div>

      {/* Steps */}
      {steps.length > 0
        ? <Section title={`${steps.length} steps — apply in this order`} icon="layers">
            <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", opacity: 0.5, margin: "-4px 0 16px", lineHeight: 1.6, letterSpacing: "0.02em" }}>
              Tap the circle next to each step to check it off as you go.
            </p>
            <div>{steps.map((p, i) => <RoutineStep key={p.id} step={p} index={i} isLast={i === steps.length - 1} checked={completedSteps.includes(p.id)} onCheck={() => toggleStep(p.id)} />)}</div>
          </Section>
        : <div style={{ padding: "32px 0 16px" }}><div style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 8 }}><span style={{ fontSize: 15, lineHeight: 1.4, flexShrink: 0 }}>🦢</span><p style={{ fontFamily: "var(--font-display)", fontSize: 19, color: "var(--clay)", margin: 0, lineHeight: 1.4 }}>Your ritual is waiting. Add products to your vanity and they'll appear here.</p></div></div>}
      {allDone && steps.length > 0 && (
        <div style={{ margin: "16px 0", padding: "18px 18px", background: "rgba(122,144,112,0.10)", border: "1px solid rgba(122,144,112,0.3)", borderRadius: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: todayCheckedIn ? 0 : 14 }}>
            <span style={{ fontSize: 16 }}>🦢</span>
            <div>
              <p style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--parchment)", margin: "0 0 2px" }}>Ritual complete.</p>
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: 0 }}>
                {todayCheckedIn ? "Check-in logged. Rest well." : `Your ${sessionLabel.toLowerCase()} ritual is done — how did your skin feel today?`}
              </p>
            </div>
          </div>
          {!todayCheckedIn && (
            <button onClick={() => setShowRitualCheckIn(true)}
              style={{ width: "100%", padding: "12px 0", background: "var(--cta)", border: "1px solid rgba(122,144,112,0.35)", borderRadius: 11, fontFamily: "Space Grotesk, sans-serif", fontSize: 12, fontWeight: 600, color: "var(--parchment)", cursor: "pointer", letterSpacing: "0.04em" }}>
              Log a check-in →
            </button>
          )}
        </div>
      )}

      {showRitualCheckIn && (
        <CheckInModal
          onSubmit={data => { setCheckIns(p => [...p, data]); setShowRitualCheckIn(false); }}
          onClose={() => setShowRitualCheckIn(false)}
        />
      )}

      {/* Alternating products — shown with tonight/tomorrow context */}
      {(() => {
        const alternating = [...am, ...pm].filter((p, i, arr) => p.frequency === "alternating" && arr.findIndex(x => x.id === p.id) === i);
        if (alternating.length === 0) return null;
        return (
          <Section title="Alternating" icon="clock">
            {alternating.map(p => {
              const scheduledTonight = isScheduledToday(p);
              const label = scheduledTonight ? "Tonight" : "Tomorrow night";
              const labelColor = scheduledTonight ? "#7a9070" : "var(--clay)";
              return (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 16px", background: "var(--surface)", border: `1px solid ${scheduledTonight ? "rgba(122,144,112,0.35)" : "var(--border)"}`, borderRadius: 12, marginBottom: 8, opacity: scheduledTonight ? 1 : 0.6 }}>
                  <div>
                    <p style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--parchment)", margin: "0 0 1px" }}>{p.name}</p>
                    <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: 0 }}>{p.brand}</p>
                  </div>
                  <span style={{ fontSize: 9, fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: labelColor, background: scheduledTonight ? "rgba(122,144,112,0.12)" : "transparent", padding: "3px 8px", borderRadius: 20, border: scheduledTonight ? "1px solid rgba(122,144,112,0.25)" : "none" }}>{label}</span>
                </div>
              );
            })}
          </Section>
        );
      })()}

      {/* Periodic — weekly / 2-3x / as-needed */}
      {periodic.length > 0 && (
        <Section title="Not every day" icon="clock">
          {periodic.map(p => {
            const nextLabel = getNextUseLabel(p);
            const freqLabel = FREQUENCIES.find(f => f.id === (p.frequency || (["Exfoliant","Mask"].includes(p.category) ? "2-3x" : "as-needed")))?.label || "Periodic";
            return (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, marginBottom: 8 }}>
                <div>
                  <p style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--parchment)", margin: "0 0 1px" }}>{p.name}</p>
                  <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: 0 }}>{p.brand} · {freqLabel}</p>
                </div>
                <span style={{ fontSize: 9, fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clay)" }}>{nextLabel}</span>
              </div>
            );
          })}
        </Section>
      )}


      {/* Conflicts */}
      {conflicts.length > 0 && (
        <Section title={`${conflicts.length} conflict${conflicts.length > 1 ? "s" : ""} detected`} icon="warning">
          {conflicts.map((c, i) => (
            <div key={i} style={{ padding: "15px 17px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 13, marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--parchment)", flexShrink: 0, boxShadow: "0 0 6px rgba(232,227,214,0.4)" }} />
                <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, fontWeight: 700, color: "var(--parchment)", letterSpacing: "0.13em", textTransform: "uppercase" }}>{c.pair.join(" + ")}</span>
                <span style={{ marginLeft: "auto", fontSize: 9, fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.11em", textTransform: "uppercase", color: "var(--clay)", opacity: 0.65 }}>{c.severity}</span>
              </div>
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 12, color: "var(--clay)", margin: "0 0 9px", lineHeight: 1.6 }}>{c.reason}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {[...c.productsA, ...c.productsB].filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i).map(p => (
                  <span key={p.id} style={{ fontSize: 10, fontFamily: "Space Grotesk, sans-serif", color: "var(--clay)", background: "var(--surface)", padding: "3px 8px", borderRadius: 20, border: "1px solid var(--border)" }}>{p.name}</span>
                ))}
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Shelf flags */}
      {flags.length > 0 && (
        <Section title="Observations" icon="info">
          {flags.map((f, i) => <FlagCard key={i} f={f} />)}
        </Section>
      )}

      {/* -- CYGNE INTELLIGENCE ----------------------------------------------- */}
      {totalRecs > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <span style={{ color: "var(--clay)", opacity: 0.7 }}><Icon name="sparkle" size={13} /></span>
            <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--clay)" }}>Cygne Intelligence</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)", marginLeft: 8 }} />
            <span style={{ fontSize: 9, fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clay)", opacity: 0.65 }}>{totalRecs} suggestion{totalRecs !== 1 ? "s" : ""}</span>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { id: "additions", label: "Add",      count: additions.length,      icon: "plus" },
              { id: "swaps",     label: "Swap",     count: swaps.length,          icon: "layers" },
              { id: "simplify",  label: "Simplify", count: simplifications.length, icon: "drop" },
              { id: "refine",    label: "Refine",   count: visibleRefinements.length, icon: "sparkle" },
            ].filter(t => t.count > 0).map(t => (
              <button key={t.id} onClick={() => setRecTab(t.id)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 20, border: `1px solid ${recTab === t.id ? "#7a9070" : "var(--border)"}`, background: recTab === t.id ? "rgba(122,144,112,0.11)" : "transparent", color: recTab === t.id ? "#7a9070" : "var(--clay)", fontFamily: "Space Grotesk, sans-serif", fontSize: 10, fontWeight: recTab === t.id ? 700 : 400, cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase", transition: "all 0.16s" }}>
                <Icon name={t.icon} size={11} />
                {t.label}
                <span style={{ fontSize: 9, background: recTab === t.id ? "rgba(122,144,112,0.2)" : "rgba(255,255,255,0.05)", borderRadius: 10, padding: "1px 5px" }}>{t.count}</span>
              </button>
            ))}
          </div>

          <div>
            {recTab === "additions"  && additions.map((r, i) => <RecommendationCard key={r.trigger || i} rec={r} onAdd={onAdd} onDismiss={r.trigger ? () => onDismissSuggestion(r.trigger) : undefined} />)}
            {recTab === "swaps"      && swaps.map((r, i) => <RecommendationCard key={r.trigger || i} rec={r} onDismiss={r.trigger ? () => onDismissSuggestion(r.trigger) : undefined} />)}
            {recTab === "simplify"   && simplifications.map((r, i) => <RecommendationCard key={r.trigger || i} rec={r} onDismiss={r.trigger ? () => onDismissSuggestion(r.trigger) : undefined} />)}
            {recTab === "refine"     && visibleRefinements.map((r, i) => {
              const vs = refineVerbStyle[r.verb] || { color: "#7a9070", bg: "rgba(122,144,112,0.08)", border: "rgba(122,144,112,0.28)" };
              return <RefinementItem key={r.trigger || i} r={r} vs={vs} onEdit={onEdit} onDismiss={r.trigger ? () => onDismissSuggestion(r.trigger) : undefined} />;
            })}
          </div>

        </div>
      )}

      {conflicts.length === 0 && flags.length === 0 && totalRecs === 0 && products.length > 0 && (
        <div style={{ display: "flex", gap: 11, padding: "13px 16px", background: "rgba(107,120,95,0.07)", borderRadius: 12, border: "1px solid rgba(107,120,95,0.18)" }}>
          <span style={{ color: "#7a9070" }}><Icon name="check" size={14} /></span>
          <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 13, color: "var(--parchment)", margin: 0 }}>No conflicts. Your ritual is well-balanced.</p>
        </div>
      )}
    </div>
  );
}


// --- SHELF --------------------------------------------------------------------

export { MyRoutine };