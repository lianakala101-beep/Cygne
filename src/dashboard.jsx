import { lazy, Suspense, useState, useEffect } from "react";
import { Icon, Section, FlagCard, SwanIcon } from "./components.jsx";
import { analyzeShelf, detectConflicts, buildRoutine, calcSpending, getCurrentSession } from "./engine.js";
import { getSwanSensePredictions } from "./swansense.jsx";
import { SwanSongCard, FlightModeModal } from "./ritual.jsx";
import { ShopScanModal } from "./shopscan.jsx";
import { EnvironmentStrip } from "./environment.jsx";
import { WeekendNudgeCard } from "./weekend.jsx";
import { SeasonalNudgeCard } from "./seasonal.jsx";
import { getTreatmentPhase, TreatmentRecoveryCard, getCyclePhase } from "./progress.jsx";
import { getCurrentCycleDay, daysBetweenLocal } from "./utils.jsx";
import { AskCygneButton } from "./AskCygne.jsx";
import { useSwanSenseDaily } from "./hooks/useSwanSenseDaily.js";

// Code-split: both overlays only render on user action, so let Vite ship them
// in their own chunks instead of in the dashboard's initial paint bundle.
const AskCygneModal = lazy(() => import("./components/AskCygneModal.jsx").then(m => ({ default: m.AskCygneModal })));
const MonthlyRecap  = lazy(() => import("./components/MonthlyRecap.jsx").then(m => ({ default: m.MonthlyRecap })));

const RECAP_MONTH_NAMES = ["january","february","march","april","may","june","july","august","september","october","november","december"];

function Dashboard({ products, setTab, checkIns, swanPopupDismissed, onDismissSwanPopup, treatments, locationData, user, notifPermission, onRequestNotif, notifDismissed, onDismissNotif, journals, setCheckIns, onLoadDemo }) {
  const { flags } = analyzeShelf(products);
  const conflicts = detectConflicts(products);
  const { am, pm } = buildRoutine(products);
  const spending = calcSpending(products);
  const currentSession = getCurrentSession();
  const [flightOpen, setFlightOpen] = useState(false);
  const [shopScanOpen, setShopScanOpen] = useState(false);
  const [cycleExpanded, setCycleExpanded] = useState(false);
  const [askState, setAskState] = useState(null); // { question, context } | null
  const askCygne = (question, context) => setAskState({ question: question || "", context: context || "" });

  // Month-in-Review state.
  // recapOffset 0 = current month, -1 = previous month (used by the auto-show on the 1st).
  const [recapOpen, setRecapOpen] = useState(false);
  const [recapOffset, setRecapOffset] = useState(0);
  const _now = new Date();
  const recapMonthLabel = RECAP_MONTH_NAMES[_now.getMonth()];
  // Auto-show on the 1st of the month — but only once per (year, month). The
  // recap on the 1st reviews the month that just ended, so we offset to -1.
  useEffect(() => {
    if (_now.getDate() !== 1) return;
    const prev = new Date(_now.getFullYear(), _now.getMonth() - 1, 1);
    const key = `recap_shown_${prev.getFullYear()}_${String(prev.getMonth() + 1).padStart(2, "0")}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch { /* ignore quota */ }
    setRecapOffset(-1);
    setRecapOpen(true);
  }, []);
  const currentCycleDay = getCurrentCycleDay(user);
  const { activeMap } = analyzeShelf(products);
  const swanSensePredictions = getSwanSensePredictions(products, checkIns, user, locationData, journals);

  // LLM-generated daily Swan Sense line — fetched once per (user, day), cached
  // in localStorage + the server-side ask_cygne_cache table. Falls back to the
  // rule-based prediction when missing / loading.
  const { line: swanDailyLine } = useSwanSenseDaily({
    user,
    products,
    journals,
    checkIns,
    cycleDay: currentCycleDay,
  });

  const allAlerts = [
    ...conflicts.map(c => ({ severity: c.severity, label: `${c.pair[0]} + ${c.pair[1]}`, detail: c.reason })),
    ...flags,
    ...products.flatMap(p => {
      const now = Date.now();
      const alerts = [];
      if (p.expiryDate) {
        const days = Math.ceil((new Date(p.expiryDate) - now) / 86400000);
        if (days <= 0) alerts.push({ severity: "high", label: `${p.name} - expired`, detail: `Expiry date was ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago. Discard or replace.` });
        else if (days <= 30) alerts.push({ severity: "medium", label: `${p.name} - expiring soon`, detail: `Expires in ${days} day${days === 1 ? "" : "s"}.` });
      }
      if (p.paoMonths && p.openedDate) {
        const paoExp = new Date(p.openedDate);
        paoExp.setMonth(paoExp.getMonth() + p.paoMonths);
        const days = Math.ceil((paoExp - now) / 86400000);
        if (days <= 0) alerts.push({ severity: "high", label: `${p.name} - PAO exceeded`, detail: `This product was opened ${p.paoMonths}M ago and is past its period after opening. Its efficacy and safety may be compromised.` });
        else if (days <= 30) alerts.push({ severity: "medium", label: `${p.name} - PAO ending soon`, detail: `${days} day${days === 1 ? "" : "s"} left within its ${p.paoMonths}M period after opening.` });
      }
      return alerts;
    }),
  ];

  return (
    <div>
      {/* Hero */}
      {(() => {
        const h = new Date().getHours();
        const slot = h >= 5 && h < 12 ? "morning" : h >= 12 && h < 17 ? "afternoon" : "evening";
        const titleText = slot === "morning" ? "Good Morning." : slot === "afternoon" ? "Good Afternoon." : "Good Evening.";
        const firstName = user?.name?.split(" ")[0] || "";
        const subline = firstName ? `good ${slot}, ${firstName}` : `good ${slot}`;
        return (
          <div style={{ marginBottom: products.length === 0 ? 20 : 16 }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 44, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-inky-moss, #2d3d2b)", margin: "0 0 4px", lineHeight: 1.05 }}>
              {titleText}
            </h1>
            <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-stone, #5a5a5a)", margin: 0, lineHeight: 1.2 }}>
              {subline}
            </p>
            {products.length === 0 && (
              <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--clay)", margin: "10px 0 0", lineHeight: 1.5 }}>
                Welcome.
              </p>
            )}
          </div>
        );
      })()}

      {/* -- Empty state ------------------------------------------------- */}
      {products.length === 0 && (() => {
        const emptySteps = [
          { icon: "box", label: "Add your products", sub: "Search by name or scan a photo - Cygne builds your ritual from what you already have.", action: () => setTab("shelf"), cta: "Go to Vanity" },
          { icon: "swan", label: "Swan Sense wakes up", sub: "Once your vanity is set, Cygne starts predicting - cycle windows, active streaks, barrier warnings.", action: null, cta: null },
          { icon: "book", label: "Log your first journal entry", sub: "Sleep, stress, skin condition. Takes 10 seconds and makes every prediction smarter.", action: () => setTab("progress"), cta: "Go to Progress" },
        ];
        return (
          <div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 28 }}>
              <span style={{ color: "var(--clay)", flexShrink: 0, marginTop: 6, display: "inline-flex" }}><SwanIcon size={18} /></span>
              <p style={{ fontFamily: "var(--font-body)", fontStyle: "italic", fontSize: 14, color: "var(--clay)", margin: 0, lineHeight: 1.6 }}>
                Your ritual lives here. Let's build it around you.
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
              {emptySteps.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 14, padding: "16px 18px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14 }}>
                  <span style={{ color: "var(--clay)", flexShrink: 0, marginTop: 2, display: "inline-flex" }}><Icon name={s.icon} size={18} /></span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--clay)", opacity: 0.5 }}>Step {i + 1}</span>
                    <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 13, fontWeight: 400, color: "var(--parchment)", margin: "4px 0", lineHeight: 1.3 }}>{s.label}</p>
                    <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: s.cta ? "0 0 10px" : 0, lineHeight: 1.6 }}>{s.sub}</p>
                    {s.cta && (
                      <button onClick={s.action} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "Space Grotesk, sans-serif", fontSize: 11, fontWeight: 400, color: "#6e8a72", background: "rgba(122,144,112,0.1)", border: "1px solid rgba(122,144,112,0.3)", borderRadius: 20, padding: "6px 14px", cursor: "pointer" }}>
                        {s.cta} <Icon name="arrow-right" size={11} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setTab("shelf")}
              style={{ width: "100%", padding: "16px 0", background: "var(--cta)", border: "1px solid rgba(122,144,112,0.35)", borderRadius: 14, fontFamily: "Space Grotesk, sans-serif", fontSize: 13, fontWeight: 400, color: "var(--parchment)", cursor: "pointer", letterSpacing: "0.04em", marginBottom: 10 }}>
              Add your first product
            </button>
            {onLoadDemo && (
              <button onClick={onLoadDemo}
                style={{ width: "100%", padding: "13px 0", background: "transparent", border: "1px solid var(--border)", borderRadius: 14, fontFamily: "Space Grotesk, sans-serif", fontSize: 12, color: "var(--clay)", cursor: "pointer", letterSpacing: "0.04em" }}>
                Load demo products
              </button>
            )}
          </div>
        );
      })()}

      {/* -- Products present -------------------------------------------- */}
      {products.length > 0 && (
        <div>
        {/* Setup strip - shown until user has products + check-in */}
        {products.length > 0 && (() => {
          const hasProducts = products.filter(p => !p.isDemo).length > 0;
          const hasCheckin = checkIns.length > 0;
          const allDone = hasProducts && hasCheckin;
          if (allDone) return null;
          const steps = [
            { label: "Add your products", done: hasProducts, action: () => setTab("shelf"), cta: "Vanity" },
            { label: "Log a check-in", done: hasCheckin, action: () => setTab("progress"), cta: "Progress" },
            { label: "Swan Sense activates", done: hasProducts && hasCheckin, action: null, cta: null },
          ];
          return (
            <div style={{ marginBottom: 24, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <span style={{ color: "var(--clay)", display: "inline-flex" }}><SwanIcon size={14} /></span>
                <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--clay)", margin: 0 }}>Getting started</p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {steps.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}
                    onClick={s.action || undefined}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, background: s.done ? "#6e8a72" : "var(--ink)", border: "1px solid " + (s.done ? "#6e8a72" : "var(--border)"), display: "flex", alignItems: "center", justifyContent: "center", color: s.done ? "var(--ink)" : "var(--clay)" }}>
                      {s.done && <Icon name="check" size={10} />}
                      {!s.done && <span style={{ fontSize: 9, opacity: 0.5 }}>{i + 1}</span>}
                    </div>
                    <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 12, color: s.done ? "var(--clay)" : "var(--parchment)", margin: 0, flex: 1, textDecoration: s.done ? "line-through" : "none", opacity: s.done ? 0.5 : 1 }}>{s.label}</p>
                    {!s.done && s.cta && (
                      <button onClick={e => { e.stopPropagation(); s.action(); }}
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "Space Grotesk, sans-serif", fontSize: 10, fontWeight: 400, color: "#6e8a72", background: "rgba(122,144,112,0.1)", border: "1px solid rgba(122,144,112,0.3)", borderRadius: 20, padding: "4px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
                        {s.cta} <Icon name="arrow-right" size={10} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* 1. Swan Song card (intelligence) — always fully visible */}
        <div className="cygne-swansong-intro" style={{ marginBottom: 8 }}>
          <SwanSongCard currentSession={currentSession} asPopup={false} user={user} predictions={swanSensePredictions} dailyLine={swanDailyLine} />
        </div>
        <div style={{ textAlign: "right", marginBottom: 18 }}>
          <button
            onClick={() => { setRecapOffset(0); setRecapOpen(true); }}
            style={{
              background: "none", border: "none", padding: 0, cursor: "pointer",
              fontFamily: "var(--font-body)",
              fontSize: 10, letterSpacing: "0.04em",
              color: "var(--color-pebble, #7a7a7a)",
              fontWeight: 400,
            }}
          >
            {recapMonthLabel} in review →
          </button>
        </div>

        {/* 2. Cycle phase — ambient pill, tap to expand */}
        {user?.cycleTrackingEnabled && currentCycleDay && (() => {
          const phase = getCyclePhase(currentCycleDay);
          return (
            <button
              onClick={() => setCycleExpanded(true)}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 13px", background: phase.bg, border: `1px solid ${phase.border}`, borderRadius: 999, marginBottom: 20, cursor: "pointer", fontFamily: "inherit" }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: phase.dot, flexShrink: 0 }} />
              <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, fontWeight: 400, color: "var(--parchment)", letterSpacing: "0.02em" }}>{phase.name} Phase · Day {currentCycleDay}</span>
              <span style={{ color: "var(--clay)", opacity: 0.6, marginLeft: 2, display: "inline-flex" }}><Icon name="chevron" size={10} /></span>
            </button>
          );
        })()}

        {/* Cycle phase expanded modal */}
        {cycleExpanded && user?.cycleTrackingEnabled && currentCycleDay && (() => {
          const phase = getCyclePhase(currentCycleDay);
          return (
            <div onClick={() => setCycleExpanded(false)}
              style={{ position: "fixed", inset: 0, background: "var(--overlay)", backdropFilter: "blur(6px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 22 }}>
              <div onClick={e => e.stopPropagation()}
                style={{ background: "var(--ink)", border: `1px solid ${phase.border}`, borderRadius: 18, padding: "24px 22px", maxWidth: 440, width: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: phase.dot }} />
                  <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 14, fontWeight: 400, color: "var(--parchment)" }}>{phase.name} Phase</span>
                  <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", opacity: 0.7, marginLeft: "auto" }}>Day {currentCycleDay}</span>
                  <button onClick={() => setCycleExpanded(false)} style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", marginLeft: 6, display: "inline-flex", padding: 2 }}><Icon name="x" size={14} /></button>
                </div>
                <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 12, color: "var(--clay)", margin: "0 0 14px", lineHeight: 1.65 }}>{phase.description}</p>
                <div style={{ padding: "12px 14px", background: "rgba(0,0,0,0.2)", borderRadius: 10 }}>
                  <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--parchment)", margin: 0, lineHeight: 1.6 }}>{phase.nudge}</p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 3. Check-in signal — pill styled to match the cycle phase pill */}
        {(() => {
          const last = checkIns.length ? checkIns.reduce((a, b) => new Date(a.date) > new Date(b.date) ? a : b) : null;
          const daysSince = last ? daysBetweenLocal(last.date) : null;
          const due = daysSince === null || daysSince >= 7;
          const msg = daysSince === null
            ? "No check-ins yet"
            : daysSince === 0 ? "Check-in logged today"
            : daysSince < 7 ? `Last check-in ${daysSince}d ago`
            : "Check-in overdue";
          // Tone tracks the dot color so the pill, dot, and text all live in
          // the same hue family — same visual structure as the cycle pill.
          const tone = !due
            ? { dot: "rgba(122,144,112,0.85)", bg: "rgba(122,144,112,0.10)", border: "rgba(122,144,112,0.30)" }
            : daysSince === null
              ? { dot: "rgba(139,115,85,0.7)",  bg: "rgba(139,115,85,0.06)", border: "rgba(139,115,85,0.22)" }
              : { dot: "rgba(139,115,85,0.85)", bg: "rgba(139,115,85,0.10)", border: "rgba(139,115,85,0.30)" };
          return (
            <button onClick={() => setTab("progress")}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 13px", background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 999, marginBottom: 20, cursor: "pointer", fontFamily: "inherit" }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: tone.dot, flexShrink: 0 }} />
              <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, fontWeight: 400, color: "var(--parchment)", letterSpacing: "0.02em" }}>{msg}</span>
              <span style={{ color: "var(--clay)", opacity: 0.6, marginLeft: 2, display: "inline-flex" }}><Icon name="chevron" size={10} /></span>
            </button>
          );
        })()}

        {/* Notification nudge banner */}
        {!notifDismissed && notifPermission === "default" && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(122,144,112,0.10)", border: "1px solid rgba(122,144,112,0.25)", borderRadius: 12, padding: "12px 14px", marginBottom: 20 }}>
            <span style={{ color: "#6e8a72", flexShrink: 0, display: "inline-flex" }}><Icon name="bell" size={16} /></span>
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 12, fontWeight: 400, color: "var(--parchment)", margin: "0 0 2px" }}>Stay on ritual</p>
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: 0 }}>Get AM & PM reminders so your ritual stays consistent.</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button onClick={onRequestNotif} style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, fontWeight: 400, background: "rgba(122,144,112,0.25)", border: "1px solid rgba(122,144,112,0.4)", borderRadius: 8, color: "var(--parchment)", padding: "6px 12px", cursor: "pointer" }}>Enable</button>
              <button onClick={onDismissNotif} style={{ background: "transparent", border: "none", color: "var(--clay)", cursor: "pointer", padding: "6px 4px", display: "inline-flex" }}><Icon name="x" size={12} /></button>
            </div>
          </div>
        )}
        {notifPermission === "granted" && !notifDismissed && (() => {
          const amTime = user?.amReminderTime || "7:30";
          const pmTime = user?.pmReminderTime || "9:00";
          const amOn = user?.amReminderEnabled !== false;
          const pmOn = user?.pmReminderEnabled !== false;
          const parts = [amOn && `${amTime}am`, pmOn && `${pmTime}pm`].filter(Boolean);
          const label = parts.length > 0 ? `Reminders on — ${parts.join(" & ")} daily.` : "Reminders enabled.";
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(122,144,112,0.08)", border: "1px solid rgba(122,144,112,0.2)", borderRadius: 12, padding: "10px 14px", marginBottom: 20 }}>
              <span style={{ color: "#6e8a72", display: "inline-flex" }}><Icon name="sparkle" size={12} /></span>
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: 0 }}>{label}</p>
              <button onClick={onDismissNotif} style={{ marginLeft: "auto", background: "transparent", border: "none", color: "var(--clay)", cursor: "pointer", display: "inline-flex", padding: 4 }}><Icon name="x" size={12} /></button>
            </div>
          );
        })()}

        {/* 4. Recovery / daily tips / environment */}
        <div style={{ marginBottom: 20 }}>
          <EnvironmentStrip products={products} activeMap={activeMap} locationData={locationData} tempUnit={user?.tempUnit || "C"} />
        </div>

        <div style={{ marginBottom: 20 }}>
          <WeekendNudgeCard products={products} activeMap={activeMap} />
        </div>

        {treatments.filter(t => { const r = getTreatmentPhase(t); return r && r.phase && r.phase.label !== "Cleared"; }).map(t => (
          <div key={t.id} style={{ marginBottom: 20 }}>
            <TreatmentRecoveryCard treatment={t} products={products} activeMap={activeMap} onDismiss={() => {}} />
          </div>
        ))}

        <div style={{ marginBottom: 20 }}>
          <SeasonalNudgeCard products={products} activeMap={activeMap} locationData={locationData} user={user} />
        </div>

        {/* Current session routine card */}
        {(() => {
          const isAM = currentSession === "am";
          const steps = isAM ? am : pm;
          const label = isAM ? "Morning" : "Evening";
          const icon  = isAM ? "sun" : "moon";
          return (
            <div onClick={() => setTab("routine")} style={{ marginBottom: 36 }}>
              <div
                style={{ background: "rgba(122,144,112,0.10)", border: "1px solid rgba(122,144,112,0.45)", borderRadius: 18, padding: "28px 26px", cursor: "pointer", transition: "border-color 0.2s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(122,144,112,0.75)"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(122,144,112,0.45)"}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 22 }}>
                  <span style={{ color: "#6e8a72", opacity: 0.8 }}><Icon name={icon} size={15} /></span>
                  <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--clay)" }}>{label} Routine</span>
                  <span style={{ marginLeft: "auto", fontSize: 9, fontFamily: "Space Grotesk, sans-serif", fontWeight: 400, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6e8a72", background: "rgba(232,226,217,0.25)", padding: "3px 9px", borderRadius: 20 }}>Now</span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 64, fontWeight: 200, color: "var(--parchment)", lineHeight: 0.9, letterSpacing: "-0.03em" }}>{steps.length}</span>
                  <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 14, color: "var(--clay)", paddingBottom: 8, letterSpacing: "0.04em" }}>step{steps.length !== 1 ? "s" : ""} in order</span>
                </div>
                {steps.length > 0 && (
                  <p style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "#6e8a72", margin: "0 0 18px", letterSpacing: "0.06em" }}>
                    {steps[0].category} <Icon name="arrow-right" size={11} /> {steps[steps.length - 1].category}
                  </p>
                )}
                {steps.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {steps.map((s, i) => (
                      <span key={s.id} style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clay)", background: "var(--surface)", border: "1px solid rgba(255,255,255,0.07)", padding: "3px 9px", borderRadius: 20 }}>
                        {i + 1}. {s.category}
                      </span>
                    ))}
                  </div>
                )}
                {steps.length === 0 && (
                  <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 12, color: "var(--clay)", margin: 0, opacity: 0.6 }}>Add products to build your ritual.</p>
                )}
              </div>
            </div>
          );
        })()}

        {/* Alerts */}
        {allAlerts.length > 0 && products.some(p => !p.isDemo) && (
          <Section title={`${allAlerts.length} alert${allAlerts.length > 1 ? "s" : ""}`} icon="warning">
            {allAlerts.map((f, i) => <FlagCard key={i} f={f} />)}
          </Section>
        )}
        {allAlerts.length === 0 && products.some(p => !p.isDemo) && (
          <div style={{ display: "flex", gap: 12, padding: "14px 16px", background: "rgba(122,144,112,0.08)", borderRadius: 12, border: "1px solid rgba(122,144,112,0.2)", marginBottom: 24 }}>
            <span style={{ color: "#6e8a72" }}><Icon name="check" size={15} /></span>
            <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 13, color: "var(--parchment)", margin: 0 }}>No conflicts detected. Your ritual is clean.</p>
          </div>
        )}

        {/* Ask Cygne — standalone entry point above the utility buttons */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <AskCygneButton onClick={() => askCygne("", "")} />
        </div>

        {/* 5. Travel Edit + Shop Scan — utility buttons at bottom.
            Travel Edit is hidden when the user told onboarding they travel
            rarely — keeps the dashboard quieter for users who don't need it. */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          {(user?.skinProfile?.travel || "").toLowerCase() !== "rarely" && (
          <button onClick={() => setFlightOpen(true)}
            style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: "var(--cta)", border: "1px solid rgba(122,144,112,0.25)", borderRadius: 14, cursor: "pointer", transition: "background 0.2s", textAlign: "left" }}
            onMouseEnter={e => e.currentTarget.style.background = "#444d3d"}
            onMouseLeave={e => e.currentTarget.style.background = "#323d30"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(232,227,214,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/>
            </svg>
            <div>
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: "rgba(232,227,214,0.95)", fontWeight: 400, margin: "0 0 2px", letterSpacing: "0.06em", textTransform: "uppercase" }}>Travel Edit</p>
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, color: "rgba(232,227,214,0.45)", margin: 0, letterSpacing: "0.02em" }}>Pack & skip</p>
            </div>
          </button>
          )}
          <button onClick={() => setShopScanOpen(true)}
            style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: "var(--cta)", border: "1px solid rgba(122,144,112,0.25)", borderRadius: 14, cursor: "pointer", transition: "background 0.2s", textAlign: "left" }}
            onMouseEnter={e => e.currentTarget.style.background = "#444d3d"}
            onMouseLeave={e => e.currentTarget.style.background = "#323d30"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(232,227,214,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
            </svg>
            <div>
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: "rgba(232,227,214,0.95)", fontWeight: 400, margin: "0 0 2px", letterSpacing: "0.06em", textTransform: "uppercase" }}>Shop Scan</p>
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, color: "rgba(232,227,214,0.45)", margin: 0, letterSpacing: "0.02em" }}>Would my skin like this?</p>
            </div>
          </button>
        </div>

        </div>
      )}

      {/* Modals */}
      {shopScanOpen && <ShopScanModal products={products} user={user} onClose={() => setShopScanOpen(false)} />}
      {flightOpen && (
        <FlightModeModal products={products} activeMap={activeMap} onClose={() => setFlightOpen(false)} />
      )}
      <Suspense fallback={null}>
        {askState && (
          <AskCygneModal
            initialQuestion={askState.question}
            context={askState.context}
            user={user}
            products={products}
            journals={journals}
            checkIns={checkIns}
            onClose={() => setAskState(null)}
          />
        )}
        {recapOpen && (
          <MonthlyRecap
            offset={recapOffset}
            journals={journals}
            checkIns={checkIns}
            treatments={treatments}
            products={products}
            user={user}
            onClose={() => setRecapOpen(false)}
          />
        )}
      </Suspense>
    </div>
  );
}

export { Dashboard };
