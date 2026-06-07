import { useEffect, useState } from "react";
import { Icon, Section } from "./components.jsx";
import { detectActives, analyzeShelf, buildRoutine, detectConflicts, isScheduledToday, applyPhilosophy } from "./engine.js";
import { FREQUENCIES } from "./constants.js";
import { buildRecommendations, buildRefinements } from "./intelligence.jsx";
import { RoutineStep } from "./ritual.jsx";
import { RecommendationCard } from "./intelligence.jsx";
import { SkinJournalModal } from "./progress.jsx";
import { getCyclePhase, getActivePauseState } from "./progress.jsx";
import { getNextUseLabel } from "./constants.js";
import { getSeason } from "./seasonal.jsx";
import { getRitualPeriod, getRitualTimeLabel } from "./utils/ritualPeriod.js";

const RITUAL_MODES = {
  travel: {
    name: "Travel Ritual",
    tagline: "Simplified for the road.",
    color: "#8b7355",
    bg: "rgba(139,115,85,0.08)",
    border: "rgba(139,115,85,0.22)",
    filterSteps: (steps) => steps.filter(p =>
      ["Cleanser","Moisturizer","SPF","Eye Cream"].includes(p.category)
    ),
    guidance: "Strip back to the essentials. Travel stress, recycled air, and different water are enough for your skin to manage — no need to push actives.",
  },
  recovery: {
    name: "Recovery Ritual",
    tagline: "Let your barrier breathe.",
    color: "#8b7355",
    bg: "rgba(139,115,85,0.08)",
    border: "rgba(139,115,85,0.22)",
    filterSteps: (steps) => steps.filter(p =>
      !["Exfoliant","Toning Pad"].includes(p.category) &&
      !["retinol","AHA","BHA","benzoyl peroxide"].some(a =>
        (p.ingredients||[]).some(i => i.toLowerCase().includes(a.split(" ")[0].toLowerCase()))
      )
    ),
    guidance: "Your skin is reacting. Pause actives and exfoliants tonight — focus on cleanse, hydrate, seal. Let recovery do the work.",
  },
  barrier_repair: {
    name: "Barrier Repair Ritual",
    tagline: "Rebuild, don't strip.",
    color: "#8b7355",
    bg: "rgba(139,115,85,0.08)",
    border: "rgba(139,115,85,0.22)",
    filterSteps: (steps) => steps.filter(p =>
      ["Cleanser","Essence","Moisturizer","Oil","Eye Cream"].includes(p.category) ||
      (p.ingredients||[]).some(i => /ceramide|hyaluronic|squalane|panthenol/i.test(i))
    ),
    guidance: "Cold, dry air depletes the barrier faster than any active can repair it. Lean into occlusion and ceramides tonight.",
  },
  menstrual: {
    name: "Gentle Ritual",
    tagline: "Your skin is more sensitive right now.",
    color: "#8b7355",
    bg: "rgba(139,115,85,0.07)",
    border: "rgba(139,115,85,0.2)",
    filterSteps: (steps) => steps.filter(p =>
      !["Exfoliant","Toning Pad"].includes(p.category) &&
      !(p.ingredients||[]).some(i => /retinol|retinyl|tretinoin|glycolic|lactic|salicylic/i.test(i))
    ),
    guidance: "Progesterone is low, barrier permeability is up. Skip exfoliants and actives — your skin absorbs and reacts to everything more intensely right now.",
  },
  luteal: {
    name: "Oil Control Ritual",
    tagline: "Sebum is peaking. Get ahead of it.",
    color: "#8b7355",
    bg: "rgba(139,115,85,0.08)",
    border: "rgba(139,115,85,0.22)",
    filterSteps: (steps) => steps,
    guidance: "Progesterone is driving up sebum production this week. Prioritise your BHA if you have one, keep moisturiser lighter, and watch for congestion.",
  },
  follicular: {
    name: "Actives Ritual",
    tagline: "Your skin is resilient right now.",
    color: "var(--color-ivory, #faf9f4)",
    bg: "rgba(250,249,244,0.08)",
    border: "rgba(45,61,43,0.22)",
    filterSteps: (steps) => steps,
    guidance: "Rising estrogen means higher resilience and better absorption. This is your best window for retinol and AHA — your skin can handle it.",
  },
  winter: {
    name: "Winter Ritual",
    tagline: "Moisture in, barrier up.",
    color: "#8b7355",
    bg: "rgba(139,115,85,0.08)",
    border: "rgba(139,115,85,0.22)",
    filterSteps: (steps) => steps,
    guidance: "Cold strips moisture and weakens the barrier. Swap any foaming cleansers for cream formulas tonight if you can, and lock everything in with an occlusive.",
  },
  summer: {
    name: "Minimal Ritual",
    tagline: "Light layers, consistent SPF.",
    color: "#8b7355",
    bg: "rgba(139,115,85,0.07)",
    border: "rgba(139,115,85,0.2)",
    filterSteps: (steps) => steps.filter(p => p.category !== "Oil"),
    guidance: "Heat and humidity mean your skin retains more moisture naturally. Oils and heavy occlusives can congest — keep it light and make SPF the hero.",
  },
  reset: {
    name: "Reset Ritual",
    tagline: "Back to basics.",
    color: "#8b7355",
    bg: "rgba(139,115,85,0.08)",
    border: "rgba(139,115,85,0.22)",
    filterSteps: (steps) => steps.filter(p =>
      ["Cleanser","Moisturizer","SPF"].includes(p.category)
    ),
    guidance: "When skin is off and you can't tell why, strip everything back for a few nights. Cleanser, moisturiser, SPF. Let the noise clear.",
  },
  standard: {
    name: null, // no named mode — just show normal steps
    tagline: null,
    color: "var(--color-ivory, #faf9f4)",
    bg: "rgba(45,61,43,0.07)",
    border: "rgba(45,61,43,0.18)",
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


// --- BREATH TEXT ------------------------------------------------------------
// Splits a heading into words and fades each one in, staggered, on mount.
// Plays once — subsequent re-renders keep words settled.
function BreathText({ text, style }) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const words = text.split(" ");
  return (
    <h1 style={style}>
      {words.map((w, i) => (
        <span key={i} style={{
          display: "inline-block",
          opacity: revealed ? 1 : 0,
          transition: `opacity 600ms ease-out ${i * 120}ms`,
          marginRight: i < words.length - 1 ? "0.24em" : 0,
        }}>{w}</span>
      ))}
    </h1>
  );
}

function MyRoutine({ products, user = {}, cycleDay = null, isFlightMode = false, journals = [], setJournals = () => {}, checkIns = [], completedSteps: completedStepsProp, setCompletedSteps: setCompletedStepsProp, onUpdateUser, onAddProduct, onEditProduct, treatments = [] }) {
  // Pause actives that are still under recovery from a logged treatment.
  // These products disappear from today's ritual and surface in Introduce
  // Slowly instead so users aren't told to apply retinol while they're
  // still healing from microneedling (etc).
  const { pausedActives, treatment: pauseTreatment, phase: pausePhase } = getActivePauseState(treatments, products);
  const pausedProducts = pausedActives.length > 0
    ? products.filter(p => {
        const actives = detectActives(p.ingredients || []);
        return p.inRoutine !== false && pausedActives.some(a => actives[a]);
      })
    : [];
  const { am, pm, periodic } = buildRoutine(products, { pausedActives });
  const conflicts = detectConflicts(products);
  const { activeMap } = analyzeShelf(products);
  const [recTab, setRecTab] = useState("additions");
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  // Check if AM ritual was fully completed today (drives auto-switch to PM).
  const amKey = `ritual_complete_${today}_AM`;
  const amStepIds = am.map(p => p.id);
  const amCompleted = amStepIds.length > 0 && (() => {
    try { const done = JSON.parse(localStorage.getItem(amKey) || '[]'); return amStepIds.every(id => done.includes(id)); }
    catch { return false; }
  })();

  // Manual period override — persisted with today's date; cleared at midnight.
  const [manualOverride, setManualOverride] = useState(() => {
    try {
      const stored = localStorage.getItem('ritual_manual_override');
      if (!stored) return null;
      const data = JSON.parse(stored);
      return data.date === today ? data.value : null;
    } catch { return null; }
  });

  // Clear stale override at midnight (check every minute).
  useEffect(() => {
    const id = setInterval(() => {
      try {
        const stored = localStorage.getItem('ritual_manual_override');
        if (!stored) return;
        const data = JSON.parse(stored);
        const currentDate = new Date().toISOString().split('T')[0];
        if (data.date !== currentDate) {
          localStorage.removeItem('ritual_manual_override');
          setManualOverride(null);
        }
      } catch { localStorage.removeItem('ritual_manual_override'); setManualOverride(null); }
    }, 60000);
    return () => clearInterval(id);
  }, []);

  // Manual override wins; otherwise use behavior-based period.
  const period = manualOverride || getRitualPeriod(amCompleted);
  const session = period.toLowerCase(); // "am" | "pm"

  const setManualPeriod = (value) => {
    const data = { value, date: today };
    try { localStorage.setItem('ritual_manual_override', JSON.stringify(data)); } catch {}
    setManualOverride(value);
  };

  const sessionKey = `ritual_complete_${today}_${period}`;

  // AM and PM completions live under separate localStorage keys. The useState
  // initializer only runs on first mount, so when the period flips (auto-switch
  // after AM is done, or the user taps "switch to evening") we must re-hydrate
  // from the new key. Otherwise the AM-completed array stays in state, any
  // session:"both" product (cleanser/moisturizer/SPF/etc.) shows pre-checked
  // under PM because the ids match, and the next toggleStep writes the stale
  // AM array into the PM localStorage key.
  const [completedSteps, setCompletedSteps] = useState(() => {
    try {
      const raw = localStorage.getItem(sessionKey);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  useEffect(() => {
    try {
      const raw = localStorage.getItem(sessionKey);
      setCompletedSteps(raw ? JSON.parse(raw) : []);
    } catch { setCompletedSteps([]); }
  }, [sessionKey]);

  const [showSkinJournal, setShowSkinJournal] = useState(false);
  // The post-ritual prompt now opens the skin journal ("How is your skin
  // today?") rather than the weekly check-in (irritation / breakouts /
  // tightness). Journal entries are keyed by YYYY-MM-DD, so a direct
  // string compare works — and once the user has logged today's journal
  // the "Ritual complete" banner auto-dismisses.
  //
  // The weekly check-in flow still exists, but lives in the Progress tab;
  // it is no longer triggered by daily ritual completion.
  const todayJournaled = journals.some(j => j?.date === today);
  const [hintVisible, setHintVisible] = useState(() => !localStorage.getItem("ritual_hint_dismissed"));

  const isStepChecked = (id) => completedSteps.includes(id);

  const toggleStep = (id) => {
    const updated = completedSteps.includes(id)
      ? completedSteps.filter(x => x !== id)
      : [...completedSteps, id];
    setCompletedSteps(updated);
    try {
      localStorage.setItem(sessionKey, JSON.stringify(updated));
    } catch {}
    if (setCompletedStepsProp) setCompletedStepsProp({ date: today, period, steps: updated });
  };

  const { mode: ritualMode, key: ritualKey, cyclePhase } = getRitualMode(products, [], user, cycleDay, isFlightMode);
  const baseSteps = session === "am" ? am : pm;
  const steps = applyPhilosophy(ritualMode.filterSteps(baseSteps), user?.skinProfile?.routinePhilosophy);
  const filteredOut = baseSteps.filter(s => !steps.find(x => x.id === s.id));
  const allDone = steps.length > 0 && steps.every(s => isStepChecked(s.id));
  const sessionLabel = session === "am" ? "Morning" : "Evening";
  const sessionIcon  = session === "am" ? "sun" : "moon";
  // The context card pairs its icon with getRitualTimeLabel() (clock-
  // based), so it must track that label rather than `session` — otherwise
  // a manually-selected AM ritual in the evening renders a sun next to
  // "tonight".
  const timeOfDayLabel = getRitualTimeLabel();
  const timeOfDayIcon  = timeOfDayLabel === "TONIGHT" ? "moon" : "sun";

  const recs = buildRecommendations(products, activeMap, conflicts, user);
  const refinements = buildRefinements(products, activeMap, conflicts);
  const additions = recs.filter(r => r.type === "addition");
  const swaps     = recs.filter(r => r.type === "swap");
  const simplifications = recs.filter(r => r.type === "simplify");
  const totalRecs = recs.length + refinements.length;


  return (
    <div>

      {/* -- Header ----------------------------------------------------------- */}
      <div style={{ marginBottom: 16, paddingTop: 44 }}>
        <BreathText
          text="Your Ritual"
          style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 500, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--color-ivory)", margin: 0, lineHeight: 1.15 }}
        />
      </div>

      {/* -- Ritual Mode Card ---------------------------------------------- */}
      {ritualMode.name && (
        <div style={{ background: "rgba(250, 249, 244, 0.82)", border: "1px solid rgba(250, 249, 244, 0.25)", borderRadius: 8, padding: "19px 19px 16px", marginBottom: 24, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ color: "var(--color-stone, #5a5a5a)" }}><Icon name={timeOfDayIcon} size={13} /></span>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--color-stone, #5a5a5a)" }}>{timeOfDayLabel.toLowerCase()}</span>
            {cyclePhase && (
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-stone, #5a5a5a)" }}>{cyclePhase} phase</span>
            )}
          </div>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, letterSpacing: "0.08em", color: "#1c1c1a", margin: "0 0 2px" }}>{ritualMode.name}</p>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "#5a5a5a", margin: "0 0 10px" }}>{ritualMode.tagline}</p>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#1c1c1a", margin: 0, lineHeight: 1.65 }}>{ritualMode.guidance}</p>
          {filteredOut.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(28,28,26,0.12)" }}>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "#5a5a5a", margin: "0 0 6px", letterSpacing: "0.06em" }}>{"Paused " + getRitualTimeLabel().toLowerCase()}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {filteredOut.map(p => (
                  <span key={p.id} style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(28,28,26,0.04)", border: "1px solid rgba(28,28,26,0.12)", fontFamily: "var(--font-body)", fontSize: 10, color: "#5a5a5a" }}>{p.name}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Treatment recovery pause banner */}
      {pausedProducts.length > 0 && pauseTreatment && pausePhase && (
        <div style={{ marginBottom: 18, padding: "13px 15px", background: "rgba(139,115,85,0.07)", border: "1px solid rgba(139,115,85,0.22)", borderRadius: 8 }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "#8b7355", margin: "0 0 5px" }}>Paused during recovery</p>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--parchment)", margin: "0 0 8px", lineHeight: 1.55 }}>
            {pausedProducts.map(p => p.name).join(", ")} {pausedProducts.length === 1 ? "is" : "are"} held for your {pausePhase.label.toLowerCase()} phase. They'll return via Introduce Slowly once your skin is ready.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {pausedProducts.map(p => (
              <span key={p.id} style={{ padding: "3px 10px", borderRadius: 20, background: "var(--ink)", border: "1px solid var(--border)", fontFamily: "var(--font-body)", fontSize: 10, color: "var(--clay)" }}>{p.name}</span>
            ))}
          </div>
        </div>
      )}

      {/* Session header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <span style={{ color: "var(--clay)", opacity: 0.55 }}><Icon name={sessionIcon} size={15} /></span>
        <span style={{ fontFamily: "var(--font-body)", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--clay)" }}>{sessionLabel} Ritual</span>
        <span style={{ fontSize: 9, fontFamily: "var(--font-body)", fontWeight: 400, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-ivory, #faf9f4)", background: "rgba(45,61,43,0.14)", padding: "2px 8px", borderRadius: 20 }}>Now</span>
      </div>
      <button
        onClick={() => setManualPeriod(period === "AM" ? "PM" : "AM")}
        style={{ background: "none", border: "none", padding: 0, margin: "0 0 20px 25px", cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 9, fontWeight: 400, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(250,249,244,0.6)" }}>
        Switch to {period === "AM" ? "Evening" : "Morning"}
      </button>

      {/* Steps */}
      {steps.length > 0
        ? <div style={{ marginBottom: 8 }}>
            {hintVisible && (
              <button
                onClick={() => { localStorage.setItem("ritual_hint_dismissed", "1"); setHintVisible(false); }}
                style={{
                  display: "block", width: "100%", margin: "0 0 14px",
                  padding: "10px 16px", textAlign: "center",
                  background: "transparent", border: "none",
                  borderRadius: 0, cursor: "pointer",
                  fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 10,
                  letterSpacing: "0.15em", textTransform: "uppercase",
                  color: "var(--color-ivory, #faf9f4)",
                  opacity: 0.45,
                  WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
                }}>
                Tap each step to mark it complete
              </button>
            )}
            <div>
              {steps.map((p, i) => <RoutineStep
                key={p.id}
                step={p}
                index={i}
                isLast={i === steps.length - 1}
                checked={isStepChecked(p.id)}
                onCheck={() => toggleStep(p.id)}
                scheduled={isScheduledToday(p)}
              />)}
            </div>
          </div>
        : <div style={{ padding: "32px 0 16px" }}><p style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 400, letterSpacing: "0.05em", color: "var(--clay)", margin: 0, lineHeight: 1.6 }}>Your ritual is waiting. Add products to your vanity and they'll appear here.</p></div>}
      {allDone && steps.length > 0 && !todayJournaled && (
        <div style={{ margin: "16px 0", padding: "18px 18px", background: "rgba(250,249,244,0.10)", border: "1px solid rgba(45,61,43,0.3)", borderRadius: 8 }}>
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 400, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--parchment)", margin: "0 0 2px" }}>Ritual complete.</p>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: 0 }}>
              {`Your ${sessionLabel.toLowerCase()} ritual is done — how is your skin today?`}
            </p>
          </div>
          <button onClick={() => setShowSkinJournal(true)}
            style={{ width: "100%", padding: "14px 40px", background: "transparent", border: "1.5px solid rgba(250,249,244,0.5)", borderRadius: 0, fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 400, color: "var(--color-ivory)", cursor: "pointer", letterSpacing: "0.2em", textTransform: "uppercase", transition: "all 0.3s ease" }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--color-inky-moss)"; e.currentTarget.style.color = "var(--color-ivory)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-inky-moss)"; }}>
            Log today's journal
          </button>
        </div>
      )}

      {showSkinJournal && (
        <SkinJournalModal
          existing={journals.find(j => j?.date === today) || null}
          onSubmit={data => {
            // De-dupe by date — matches the existing journal flow in
            // progress.jsx so editing today's entry overwrites cleanly.
            setJournals(prev => {
              const filtered = prev.filter(j => j?.date !== data.date);
              return [...filtered, data].sort((a, b) => String(a.date).localeCompare(String(b.date)));
            });
            setShowSkinJournal(false);
          }}
          onClose={() => setShowSkinJournal(false)}
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
              const labelColor = scheduledTonight ? "#2d3d2b" : "var(--clay)";
              return (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 16px", background: "var(--surface)", border: `1px solid ${scheduledTonight ? "rgba(45,61,43,0.35)" : "var(--border)"}`, borderRadius: 8, marginBottom: 8, opacity: scheduledTonight ? 1 : 0.6 }}>
                  <div>
                    <p style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 400, letterSpacing: "0.08em", color: "var(--parchment)", margin: "0 0 1px" }}>{p.name}</p>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: 0 }}>{p.brand}</p>
                  </div>
                  <span style={{ fontSize: 9, fontFamily: "var(--font-body)", fontWeight: 400, letterSpacing: "0.12em", textTransform: "uppercase", color: labelColor, background: scheduledTonight ? "rgba(45,61,43,0.12)" : "transparent", padding: "3px 8px", borderRadius: 20, border: scheduledTonight ? "1px solid rgba(45,61,43,0.25)" : "none" }}>{label}</span>
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
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 16px", background: "var(--color-ivory-shadow)", border: "none", borderRadius: 8, marginBottom: 8 }}>
                <div>
                  <p style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 400, letterSpacing: "0.08em", color: "var(--parchment)", margin: "0 0 1px" }}>{p.name}</p>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: 0 }}>{p.brand} · {freqLabel}</p>
                </div>
                <span style={{ fontSize: 9, fontFamily: "var(--font-body)", fontWeight: 400, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clay)" }}>{nextLabel}</span>
              </div>
            );
          })}
        </Section>
      )}


      {/* Irreconcilable conflicts only — quiet one-liner, no card, no label,
          no header. Schedulable conflicts (retinol+AHA, AHA+BHA, etc.) are
          handled silently by buildRoutine's AM/PM split + alternating-night
          sequencing. */}
      {(() => {
        const irreconcilable = conflicts.filter(c => c.irreconcilable);
        if (irreconcilable.length === 0) return null;
        return (
          <div style={{ marginBottom: 18 }}>
            {irreconcilable.map((c, i) => (
              <p key={i} style={{
                fontFamily: "var(--font-body)", fontSize: 12,
                color: "var(--color-ivory, #faf9f4)",
                lineHeight: 1.6,
                margin: i === 0 ? 0 : "6px 0 0",
              }}>{c.reason}</p>
            ))}
          </div>
        );
      })()}

      {/* -- CYGNE INTELLIGENCE ----------------------------------------------- */}
      {totalRecs > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <span style={{ color: "var(--clay)", opacity: 0.7 }}><Icon name="sparkle" size={13} /></span>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--clay)" }}>Cygne Intelligence</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)", marginLeft: 8 }} />
            <span style={{ fontSize: 9, fontFamily: "var(--font-body)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clay)", opacity: 0.65 }}>{totalRecs} suggestion{totalRecs !== 1 ? "s" : ""}</span>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { id: "additions", label: "Add",      count: additions.length,      icon: "plus" },
              { id: "swaps",     label: "Swap",     count: swaps.length,          icon: "layers" },
              { id: "simplify",  label: "Simplify", count: simplifications.length, icon: "drop" },
              { id: "refine",    label: "Refine",   count: refinements.length,    icon: "sparkle" },
            ].filter(t => t.count > 0).map(t => (
              <button key={t.id} onClick={() => setRecTab(t.id)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 20, border: `1px solid ${recTab === t.id ? "#2d3d2b" : "var(--border)"}`, background: recTab === t.id ? "rgba(45,61,43,0.11)" : "transparent", color: recTab === t.id ? "#2d3d2b" : "var(--clay)", fontFamily: "var(--font-body)", fontSize: 10, fontWeight: recTab === t.id ? 700 : 400, cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase", transition: "all 0.16s" }}>
                <Icon name={t.icon} size={11} />
                {t.label}
                <span style={{ fontSize: 9, background: recTab === t.id ? "rgba(45,61,43,0.2)" : "rgba(255,255,255,0.05)", borderRadius: 8, padding: "1px 5px" }}>{t.count}</span>
              </button>
            ))}
          </div>

          <div>
            {recTab === "additions"  && additions.map((r, i) => <RecommendationCard key={i} rec={r} onAdd={onAddProduct} onEdit={onEditProduct} />)}
            {recTab === "swaps"      && swaps.map((r, i) => <RecommendationCard key={i} rec={r} onAdd={onAddProduct} onEdit={onEditProduct} />)}
            {recTab === "simplify"   && simplifications.map((r, i) => <RecommendationCard key={i} rec={r} onAdd={onAddProduct} onEdit={onEditProduct} />)}
            {recTab === "refine"     && refinements.map((r, i) => {
              const targets = (r.productIds || [])
                .map(id => products.find(p => p.id === id))
                .filter(Boolean);
              return (
                <div key={i} style={{ background: "var(--color-ivory-shadow)", border: "none", borderRadius: 8, padding: "13px 15px", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 9, fontFamily: "var(--font-body)", fontWeight: 400, letterSpacing: "0.13em", textTransform: "uppercase", color: "var(--parchment)", opacity: 0.7 }}>{r.verb}</span>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--parchment)", margin: 0, flex: 1, fontWeight: 400, lineHeight: 1.3 }}>{r.title}</p>
                  </div>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: 0, lineHeight: 1.65 }}>{r.body}</p>
                  {r.action && (
                    <div style={{ display: "flex", gap: 8, padding: "9px 11px", background: "rgba(45,61,43,0.06)", borderRadius: 8, border: "1px solid rgba(45,61,43,0.15)", marginTop: 10 }}>
                      <span style={{ color: "var(--color-ivory, #faf9f4)", flexShrink: 0, marginTop: 1 }}><Icon name="check" size={11} /></span>
                      <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--parchment)", margin: 0, lineHeight: 1.55 }}>{r.action}</p>
                    </div>
                  )}
                  {targets.length > 0 && onEditProduct && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                      {targets.map(p => (
                        <button key={p.id} onClick={() => onEditProduct(p)}
                          style={{ padding: "6px 11px", borderRadius: 20, background: "rgba(45,61,43,0.12)", border: "1px solid rgba(45,61,43,0.3)", fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 400, color: "var(--color-ivory, #faf9f4)", cursor: "pointer", letterSpacing: "0.05em", display: "inline-flex", alignItems: "center", gap: 5 }}>
                          {p.name} <Icon name="chevron" size={10} />
                        </button>
                      ))}
                    </div>
                  )}
                  {targets.length === 0 && r.addCategory && onAddProduct && (
                    <div style={{ marginTop: 10 }}>
                      <button onClick={() => onAddProduct(r.addCategory)}
                        style={{ padding: "8px 14px", borderRadius: 8, background: "rgba(45,61,43,0.15)", border: "1px solid rgba(45,61,43,0.35)", fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 400, color: "var(--color-ivory, #faf9f4)", cursor: "pointer", letterSpacing: "0.05em" }}>
                        + Add {r.addCategory}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      )}

    </div>
  );
}


// --- SHELF --------------------------------------------------------------------

export { MyRoutine };