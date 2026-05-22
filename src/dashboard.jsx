import { lazy, Suspense, useState, useEffect } from "react";
import { Icon, Section, SwanIcon } from "./components.jsx";
import { analyzeShelf, detectConflicts, buildRoutine, calcSpending, getCurrentSession } from "./engine.js";
import { getSwanSensePredictions } from "./swansense.jsx";
import { SwanSongCard, FlightModeModal } from "./ritual.jsx";
import { ShopScanModal } from "./shopscan.jsx";
import { useWeather } from "./environment.jsx";
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

function Dashboard({ products, setTab, checkIns, swanPopupDismissed, onDismissSwanPopup, treatments, locationData, user, notifPermission, onRequestNotif, notifDismissed, onDismissNotif, journals, setCheckIns, triggerLog = [] }) {
  const conflicts = detectConflicts(products);
  // Surface only irreconcilable conflicts (the molecule-level deactivation
  // pairs flagged in constants.js). Everything else is handled silently
  // by the routine engine via AM/PM split + alternating-night sequencing.
  const irreconcilable = conflicts.filter(c => c.irreconcilable);
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
  const { env: weather } = useWeather(locationData, user?.tempUnit || "C");

  // LLM-generated daily Swan Sense line — fetched once per (user, day), cached
  // in localStorage + the server-side ask_cygne_cache table. Falls back to the
  // rule-based prediction when missing / loading.
  const { line: swanDailyLine, loading: swanLoading, failed: swanFailed } = useSwanSenseDaily({
    user,
    products,
    journals,
    checkIns,
    triggerLog,
    cycleDay: currentCycleDay,
  });

  return (
    <div>
      {/* Hero — editorial greeting in ivory + Fungis Normal wide tracking */}
      {(() => {
        const h = new Date().getHours();
        const slot = h >= 5 && h < 12 ? "morning" : h >= 12 && h < 17 ? "afternoon" : "evening";
        const greeting = slot === "morning" ? "Good Morning" : slot === "afternoon" ? "Good Afternoon" : "Good Evening";
        const firstName = user?.name?.split(" ")[0] || "";
        return (
          <div style={{ marginBottom: products.length === 0 ? 20 : 24 }}>
            <p style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: 14, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--color-ivory, #faf9f4)", margin: "0 0 8px", lineHeight: 1, opacity: 0.75 }}>
              {greeting}{firstName ? "," : "."}
            </p>
            {firstName && (
              <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 28, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-ivory, #faf9f4)", margin: 0, lineHeight: 1.05 }}>
                {firstName}
              </p>
            )}
            {products.length === 0 && (
              <p style={{ fontFamily: "var(--font-body)", fontSize: 14, letterSpacing: "0.04em", color: "var(--color-ivory, #faf9f4)", opacity: 0.7, margin: "10px 0 0", lineHeight: 1.5 }}>
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
              <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--clay)", margin: 0, lineHeight: 1.6 }}>
                Your ritual lives here. Let's build it around you.
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
              {emptySteps.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 14, padding: "16px 18px", background: "var(--color-ivory-shadow)", border: "none", borderRadius: 8 }}>
                  <span style={{ color: "var(--clay)", flexShrink: 0, marginTop: 2, display: "inline-flex" }}><Icon name={s.icon} size={18} /></span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontFamily: "var(--font-body), sans-serif", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--clay)", opacity: 0.5 }}>Step {i + 1}</span>
                    <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: 13, fontWeight: 400, color: "var(--parchment)", margin: "4px 0", lineHeight: 1.3 }}>{s.label}</p>
                    <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: 11, color: "var(--clay)", margin: s.cta ? "0 0 10px" : 0, lineHeight: 1.6 }}>{s.sub}</p>
                    {s.cta && (
                      <button onClick={s.action} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-body), sans-serif", fontSize: 11, fontWeight: 400, color: "#6e8a72", background: "rgba(122,144,112,0.1)", border: "1px solid rgba(122,144,112,0.3)", borderRadius: 20, padding: "6px 14px", cursor: "pointer" }}>
                        {s.cta} <Icon name="arrow-right" size={11} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setTab("shelf")}
              style={{ width: "100%", padding: "16px 0", background: "var(--cta)", border: "1px solid rgba(122,144,112,0.35)", borderRadius: 8, fontFamily: "var(--font-body), sans-serif", fontSize: 13, fontWeight: 400, color: "var(--parchment)", cursor: "pointer", letterSpacing: "0.04em", marginBottom: 10 }}>
              Add your first product
            </button>
          </div>
        );
      })()}

      {/* -- Products present -------------------------------------------- */}
      {products.length > 0 && (
        <div>
        {/* Setup strip - shown until user has products + check-in */}
        {products.length > 0 && (() => {
          const hasProducts = products.length > 0;
          const hasCheckin = checkIns.length > 0;
          const allDone = hasProducts && hasCheckin;
          if (allDone) return null;
          const steps = [
            { label: "Add your products", done: hasProducts, action: () => setTab("shelf"), cta: "Vanity" },
            { label: "Log a check-in", done: hasCheckin, action: () => setTab("progress"), cta: "Progress" },
            { label: "Swan Sense activates", done: hasProducts && hasCheckin, action: null, cta: null },
          ];
          return (
            <div style={{ marginBottom: 24, background: "var(--color-ivory-shadow)", border: "none", borderRadius: 8, padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <span style={{ color: "var(--clay)", display: "inline-flex" }}><SwanIcon size={14} /></span>
                <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--clay)", margin: 0 }}>Getting started</p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {steps.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}
                    onClick={s.action || undefined}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, background: s.done ? "#6e8a72" : "var(--ink)", border: "1px solid " + (s.done ? "#6e8a72" : "var(--border)"), display: "flex", alignItems: "center", justifyContent: "center", color: s.done ? "var(--ink)" : "var(--clay)" }}>
                      {s.done && <Icon name="check" size={10} />}
                      {!s.done && <span style={{ fontSize: 9, opacity: 0.5 }}>{i + 1}</span>}
                    </div>
                    <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: 12, color: s.done ? "var(--clay)" : "var(--parchment)", margin: 0, flex: 1, textDecoration: s.done ? "line-through" : "none", opacity: s.done ? 0.5 : 1 }}>{s.label}</p>
                    {!s.done && s.cta && (
                      <button onClick={e => { e.stopPropagation(); s.action(); }}
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-body), sans-serif", fontSize: 10, fontWeight: 400, color: "#6e8a72", background: "rgba(122,144,112,0.1)", border: "1px solid rgba(122,144,112,0.3)", borderRadius: 20, padding: "4px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
                        {s.cta} <Icon name="arrow-right" size={10} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Editorial canvas — sections separated by thin ivory rules rather
            than card containers. Action items use Fungis Heavy uppercase
            with an arrow; the swan video bg + dark canvas make this read
            like the interior of a magazine. */}

        {/* Swan Sense — fully transparent, divides greeting from action list */}
        <div style={{ height: 1, background: "rgba(250,249,244,0.18)", marginBottom: 18 }} />
        <div style={{ marginBottom: 20 }}>
          <SwanSongCard currentSession={currentSession} asPopup={false} user={user} predictions={swanSensePredictions} dailyLine={swanDailyLine} dailyLoading={swanLoading} dailyFailed={swanFailed} variant="ivory-flat" />
        </div>
        <div style={{ textAlign: "right", marginBottom: 24 }}>
          <button
            onClick={() => { setRecapOffset(0); setRecapOpen(true); }}
            style={{
              background: "none", border: "none", padding: 0, cursor: "pointer",
              fontFamily: "var(--font-body)",
              fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase",
              color: "var(--color-ivory, #faf9f4)",
              opacity: 0.65,
              fontWeight: 400,
            }}
          >
            {recapMonthLabel} in review →
          </button>
        </div>

        {/* Begin Your Ritual — editorial line item: rules top + bottom, label
            left, arrow right. No box. */}
        <button
          onClick={() => setTab("routine")}
          style={{
            display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
            padding: "18px 0", marginBottom: 0,
            background: "transparent", border: "none",
            borderTop: "1px solid rgba(250,249,244,0.25)",
            borderBottom: "1px solid rgba(250,249,244,0.25)",
            cursor: "pointer",
            WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
          }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 12, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--color-ivory, #faf9f4)" }}>
            <Icon name={currentSession === "am" ? "sun" : "moon"} size={14} />
            Begin Your Ritual
          </span>
          <span style={{ color: "var(--color-ivory, #faf9f4)", display: "inline-flex" }}>
            <Icon name="arrow-right" size={16} />
          </span>
        </button>

        {/* Ask Cygne — second editorial line item, stacks directly under
            Begin Your Ritual sharing its bottom rule. */}
        <button
          onClick={() => askCygne("", "")}
          style={{
            display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
            padding: "18px 0", marginTop: -1, marginBottom: 16,
            background: "transparent", border: "none",
            borderTop: "1px solid rgba(250,249,244,0.25)",
            borderBottom: "1px solid rgba(250,249,244,0.25)",
            cursor: "pointer",
            WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
          }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--color-ivory, #faf9f4)" }}>
            Ask Cygne
          </span>
          <span style={{ color: "var(--color-ivory, #faf9f4)", display: "inline-flex" }}>
            <Icon name="arrow-right" size={16} />
          </span>
        </button>

        {/* Irreconcilable conflicts — quiet ivory one-liner */}
        {irreconcilable.length > 0 && products.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            {irreconcilable.map((c, i) => (
              <p key={i} style={{
                fontFamily: "var(--font-body)", fontSize: 12,
                letterSpacing: "0.02em",
                color: "var(--color-ivory, #faf9f4)",
                opacity: 0.7,
                lineHeight: 1.6,
                margin: i === 0 ? 0 : "6px 0 0",
              }}>{c.reason}</p>
            ))}
          </div>
        )}

        {/* Travel Edit | Shop Scan — text links separated by a vertical rule. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, marginBottom: 36 }}>
          <button
            onClick={() => setFlightOpen(true)}
            style={{ background: "none", border: "none", padding: "6px 0", cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--color-ivory, #faf9f4)", opacity: 0.85, WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent" }}>
            Travel Edit
          </button>
          <span style={{ width: 1, height: 14, background: "rgba(250,249,244,0.3)", display: "inline-block" }} />
          <button
            onClick={() => setShopScanOpen(true)}
            style={{ background: "none", border: "none", padding: "6px 0", cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--color-ivory, #faf9f4)", opacity: 0.85, WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent" }}>
            Shop Scan
          </button>
        </div>

        {/* 6. Notification nudge — actionable prompt, transitional between
            top-of-page actions and bottom-of-page context. */}
        {!notifDismissed && notifPermission === "default" && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(122,144,112,0.10)", border: "1px solid rgba(122,144,112,0.25)", borderRadius: 8, padding: "12px 14px", marginBottom: 20 }}>
            <span style={{ color: "#6e8a72", flexShrink: 0, display: "inline-flex" }}><Icon name="bell" size={16} /></span>
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: 12, fontWeight: 400, color: "var(--parchment)", margin: "0 0 2px" }}>Stay on ritual</p>
              <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: 11, color: "var(--clay)", margin: 0 }}>Get AM & PM reminders so your ritual stays consistent.</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button onClick={onRequestNotif} style={{ fontFamily: "var(--font-body), sans-serif", fontSize: 11, fontWeight: 400, background: "rgba(122,144,112,0.25)", border: "1px solid rgba(122,144,112,0.4)", borderRadius: 8, color: "var(--parchment)", padding: "6px 12px", cursor: "pointer" }}>Enable</button>
              <button onClick={onDismissNotif} aria-label="Dismiss notification prompt" style={{ background: "transparent", border: "none", color: "var(--clay)", cursor: "pointer", padding: "6px 4px", display: "inline-flex" }}><Icon name="x" size={12} /></button>
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
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(122,144,112,0.08)", border: "1px solid rgba(122,144,112,0.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 20 }}>
              <span style={{ color: "#6e8a72", display: "inline-flex" }}><Icon name="sparkle" size={12} /></span>
              <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: 11, color: "var(--clay)", margin: 0 }}>{label}</p>
              <button onClick={onDismissNotif} aria-label="Dismiss" style={{ marginLeft: "auto", background: "transparent", border: "none", color: "var(--clay)", cursor: "pointer", display: "inline-flex", padding: 4 }}><Icon name="x" size={12} /></button>
            </div>
          );
        })()}

        {/* Seasonal + Weekend — editorial line items, stacked sharing rules */}
        <div style={{ marginBottom: 28 }}>
          <SeasonalNudgeCard products={products} activeMap={activeMap} locationData={locationData} user={user} lineMode />
          <WeekendNudgeCard products={products} activeMap={activeMap} lineMode />
        </div>

        {/* 9. Treatment recovery — only when a recovery window is active */}
        {treatments.filter(t => { const r = getTreatmentPhase(t); return r && r.phase && r.phase.label !== "Cleared"; }).map(t => (
          <div key={t.id} style={{ marginBottom: 20 }}>
            <TreatmentRecoveryCard treatment={t} products={products} activeMap={activeMap} onDismiss={() => {}} />
          </div>
        ))}

        {/* 10. Unified context footer — cycle phase, last check-in and
            local weather sit in a single ivory-shadow strip so they read
            as a quiet data footer instead of three competing pills. */}
        {(() => {
          const phase = user?.cycleTrackingEnabled && currentCycleDay ? getCyclePhase(currentCycleDay) : null;
          const last = checkIns.length ? checkIns.reduce((a, b) => new Date(a.date) > new Date(b.date) ? a : b) : null;
          const daysSince = last ? daysBetweenLocal(last.date) : null;
          const checkInMsg = daysSince === null
            ? "No check-ins"
            : daysSince === 0 ? "Checked in today"
            : daysSince < 7 ? `Checked in ${daysSince}d ago`
            : "Check-in overdue";
          const tempUnit = user?.tempUnit || "C";
          const hasWeather = weather && (weather.temp !== null || weather.uvIndex !== null || weather.humidity !== null);

          if (!phase && !hasWeather && daysSince === null) return null;

          const txtSt = { fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 400, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-ivory, #faf9f4)", opacity: 0.75, whiteSpace: "nowrap" };
          const btnSt = { display: "inline-flex", alignItems: "center", gap: 6, padding: 0, background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent" };

          return (
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              rowGap: 8,
              columnGap: 16,
              padding: "16px 0 0",
              borderTop: "1px solid rgba(250,249,244,0.18)",
              marginBottom: 20,
              fontFamily: "var(--font-body)",
            }}>
              {phase && (
                <button onClick={() => setCycleExpanded(true)} style={btnSt}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--color-ivory, #faf9f4)", opacity: 0.7, display: "inline-block", flexShrink: 0 }} />
                  <span style={txtSt}>{phase.name} · Day {currentCycleDay}</span>
                </button>
              )}
              <button onClick={() => setTab("progress")} style={btnSt}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--color-ivory, #faf9f4)", opacity: 0.45, display: "inline-block", flexShrink: 0 }} />
                <span style={txtSt}>{checkInMsg}</span>
              </button>
              {hasWeather && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
                  {weather.temp !== null && <span style={txtSt}>{Math.round(tempUnit === "F" ? (weather.temp * 9 / 5 + 32) : weather.temp)}°{tempUnit}</span>}
                  {weather.uvIndex !== null && <span style={txtSt}>UV {weather.uvIndex}</span>}
                  {weather.humidity !== null && <span style={txtSt}>{weather.humidity}%</span>}
                  {locationData?.city && <span style={{ ...txtSt, opacity: 0.5 }}>{locationData.city}</span>}
                </div>
              )}
            </div>
          );
        })()}

        {/* Cycle phase expanded modal — fixed overlay, position-independent */}
        {cycleExpanded && user?.cycleTrackingEnabled && currentCycleDay && (() => {
          const phase = getCyclePhase(currentCycleDay);
          return (
            <div onClick={() => setCycleExpanded(false)}
              style={{ position: "fixed", inset: 0, background: "var(--overlay)", backdropFilter: "blur(6px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 22 }}>
              <div onClick={e => e.stopPropagation()}
                style={{ background: "var(--ink)", border: `1px solid ${phase.border}`, borderRadius: 8, padding: "24px 22px", maxWidth: 440, width: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: phase.dot }} />
                  <span style={{ fontFamily: "var(--font-body), sans-serif", fontSize: 14, fontWeight: 400, color: "var(--parchment)" }}>{phase.name} Phase</span>
                  <span style={{ fontFamily: "var(--font-body), sans-serif", fontSize: 11, color: "var(--clay)", opacity: 0.7, marginLeft: "auto" }}>Day {currentCycleDay}</span>
                  <button onClick={() => setCycleExpanded(false)} aria-label="Close cycle detail" style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", marginLeft: 6, display: "inline-flex", padding: 2 }}><Icon name="x" size={14} /></button>
                </div>
                <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: 12, color: "var(--clay)", margin: "0 0 14px", lineHeight: 1.65 }}>{phase.description}</p>
                <div style={{ padding: "12px 14px", background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
                  <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: 11, color: "var(--parchment)", margin: 0, lineHeight: 1.6 }}>{phase.nudge}</p>
                </div>
              </div>
            </div>
          );
        })()}

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
            triggerLog={triggerLog}
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
