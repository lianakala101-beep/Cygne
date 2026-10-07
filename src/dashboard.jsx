import { lazy, Suspense, useState, useEffect } from "react";
import { Icon, Section } from "./components.jsx";
import { analyzeShelf, detectConflicts, buildRoutine, calcSpending, getCurrentSession } from "./engine.js";
import { getSwanSensePredictions, buildNoProductsSwanLine } from "./swansense.jsx";
import { FlightModeModal, getSwanSenseLine, renderInsightLines } from "./ritual.jsx";
import { ShopScanModal } from "./shopscan.jsx";
import { useWeather } from "./environment.jsx";
import { WeekendNudgeCard } from "./weekend.jsx";
import { SeasonalNudgeCard, getSeasonForUser } from "./seasonal.jsx";
import { getTreatmentPhase, TreatmentRecoveryCard, getCyclePhase, SkinJournalModal } from "./progress.jsx";
import { getCurrentCycleDay, isCycleStale, CYCLE_STALE_MESSAGE, daysBetweenLocal, getAskCygneAccess } from "./utils.jsx";
import { localDateKey, upsertJournalEntry } from "./lib/journal.js";
import { AskCygneButton } from "./AskCygne.jsx";
import { useSwanSenseDaily } from "./hooks/useSwanSenseDaily.js";
import { buildSkinIndex } from "./lib/skinIndex.js";
import { glassCard } from "./lib/ui.js";

// Code-split: both overlays only render on user action, so let Vite ship them
// in their own chunks instead of in the dashboard's initial paint bundle.
const AskCygneModal = lazy(() => import("./components/AskCygneModal.jsx").then(m => ({ default: m.AskCygneModal })));
const MonthlyRecap  = lazy(() => import("./components/MonthlyRecap.jsx").then(m => ({ default: m.MonthlyRecap })));

const RECAP_MONTH_NAMES = ["january","february","march","april","may","june","july","august","september","october","november","december"];

// Shared "Swan Sense" eyebrow spec — same values as ritual.jsx's
// ivory-flat variant used before this card replaced it, and the same
// spec DailySkinIndexCard's own header already matched. Reused for
// both the Swan Sense eyebrow and the Daily Skin Index label so the
// two section headers inside the card read as one family.
const TODAY_EYEBROW_STYLE = {
  fontFamily: "var(--font-display)",
  fontSize: "var(--text-xs)", fontWeight: 700,
  letterSpacing: "var(--tracking-display)", textTransform: "uppercase",
  color: "var(--color-ivory, #faf9f4)",
  opacity: 0.75,
  margin: 0,
};

// Tone → chip background tint. Border stays a fixed ivory/0.32 on every
// chip (the card's own spec), so tone comes through as a subtle fill
// instead — label/value text stays uniform ivory for contrast, the same
// choice DailySkinIndexCard's own tone system already settled on (see
// that file's TONE_STYLES comment) rather than tinting small text at
// --text-xs size.
const TODAY_CHIP_TONE_BG = {
  caution: "rgba(var(--rgb-bronze), 0.08)",
  positive: "rgba(var(--rgb-sage), 0.08)",
  neutral: "rgba(var(--rgb-ivory), 0.08)",
};

// One glassCard combining the Swan Sense line, the Daily Skin Index
// readout, and a collapsed tips row — replaces the separate SwanSongCard
// (ivory-flat) + DailySkinIndexCard that used to stack here. Derivation
// logic is untouched: getSwanSenseLine is the exact same precedence
// SwanSongCard uses, buildSkinIndex is the exact same function
// DailySkinIndexCard calls — only the presentation is new.
function TodayCard({ user, predictions, dailyLine, dailyLoading, dailyFailed, hasProducts, noProductsLine, cyclePhaseName, weather, tipsExpanded, onToggleTips }) {
  const { line } = getSwanSenseLine({ user, predictions, dailyLine, dailyLoading, dailyFailed, hasProducts, noProductsLine });
  const hasSwanLine = !!(line && String(line).trim());
  const { items, actions } = buildSkinIndex({ cyclePhaseName, weather });

  if (!hasSwanLine && items.length === 0) return null;

  return (
    <div style={{ ...glassCard, padding: "var(--space-4)", marginBottom: "var(--space-5)" }}>
      {hasSwanLine && (
        <div>
          <p style={TODAY_EYEBROW_STYLE}>Swan Sense</p>
          <p style={{
            fontFamily: "var(--font-body)",
            fontSize: "var(--text-md)", fontWeight: 400,
            lineHeight: 1.5, letterSpacing: "0.01em",
            color: "var(--color-ivory, #faf9f4)",
            margin: "var(--space-3) 0 0",
          }}>
            {renderInsightLines(line)}
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div style={{ marginTop: hasSwanLine ? "var(--space-4)" : 0 }}>
          {hasSwanLine && (
            <div style={{ height: 1, background: "rgba(var(--rgb-ivory), 0.16)", marginBottom: "var(--space-4)" }} />
          )}
          <p style={{ ...TODAY_EYEBROW_STYLE, margin: "0 0 var(--space-3)" }}>Daily Skin Index</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
            {items.map((item, i) => {
              const tone = TODAY_CHIP_TONE_BG[item.tone] || TODAY_CHIP_TONE_BG.neutral;
              // An unpaired trailing chip (odd item count) spans both
              // columns and centers itself, rather than sitting flush
              // left in its own half-empty row.
              const isTrailingOdd = items.length % 2 === 1 && i === items.length - 1;
              const chip = (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)",
                  padding: "var(--space-2)",
                  background: tone,
                  border: "1px solid rgba(var(--rgb-ivory), 0.32)",
                  borderRadius: "var(--radius-pill)",
                  width: isTrailingOdd ? "auto" : "100%",
                  minWidth: isTrailingOdd ? 160 : undefined,
                }}>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "var(--tracking-label)", color: "rgba(var(--rgb-ivory), 0.6)" }}>{item.label}</span>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "var(--tracking-label)", color: "var(--color-ivory, #faf9f4)" }}>{item.value}</span>
                </div>
              );
              return isTrailingOdd ? (
                <div key={item.key} style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "center" }}>
                  {chip}
                </div>
              ) : (
                <div key={item.key}>{chip}</div>
              );
            })}
          </div>
        </div>
      )}

      {actions.length > 0 && (
        <div style={{ marginTop: "var(--space-4)" }}>
          <div style={{ height: 1, background: "rgba(var(--rgb-ivory), 0.16)", marginBottom: "var(--space-3)" }} />
          <button
            type="button"
            onClick={onToggleTips}
            aria-expanded={tipsExpanded}
            style={{
              display: "flex", width: "100%", alignItems: tipsExpanded ? "flex-start" : "center",
              justifyContent: "space-between", gap: "var(--space-3)",
              background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left",
              WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
            }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {tipsExpanded ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                  {actions.map((action, i) => (
                    <p key={i} style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "rgba(var(--rgb-ivory), 0.85)", lineHeight: 1.55, margin: 0 }}>{action}</p>
                  ))}
                </div>
              ) : (
                <p style={{
                  fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "rgba(var(--rgb-ivory), 0.85)",
                  lineHeight: 1.55, margin: 0,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>{actions[0]}</p>
              )}
            </div>
            <span style={{
              color: "rgba(var(--rgb-ivory), 0.56)", flexShrink: 0, marginTop: tipsExpanded ? 2 : 0,
              transform: tipsExpanded ? "rotate(90deg)" : "none",
              transition: "transform 0.18s", display: "inline-flex",
            }}>
              <Icon name="chevron" size={11} />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

function Dashboard({ products, setTab, checkIns, swanPopupDismissed, onDismissSwanPopup, treatments, updateTreatmentDate, locationData, user, notifPermission, onRequestNotif, notifDismissed, onDismissNotif, journals, setJournals, setCheckIns, triggerLog = [], daysSinceLastActive = null, skinGoals = [], onMarkSkinGoalMet, onAddSkinGoal, onRemoveSkinGoal, reflections = [] }) {
  const [showJournal, setShowJournal] = useState(false);
  // Today card's tips row — collapsed by default, remembered only for
  // this Dashboard mount (not persisted), shared by whichever branch
  // (zero-products or has-products) renders the card.
  const [tipsExpanded, setTipsExpanded] = useState(false);
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
  // Tracking is on but the start date is more than 45 days old — cycle
  // displays show CYCLE_STALE_MESSAGE instead of a day/phase.
  const cycleStale = isCycleStale(user);
  const { activeMap } = analyzeShelf(products);
  const swanSensePredictions = getSwanSensePredictions(products, checkIns, user, locationData, journals);
  const { env: weather } = useWeather(locationData, user?.tempUnit || "C");
  // Same gate used for every other cycle-data consumer on this
  // screen (the context footer below, the expanded cycle modal) — no
  // fallback assumption when tracking isn't enabled or the day can't
  // be computed. Feeds the Daily Skin Index card's sebum-trend item.
  const cyclePhase = user?.cycleTrackingEnabled && currentCycleDay ? getCyclePhase(currentCycleDay) : null;
  // Rule-based floor for zero-product users — cycle phase + season, in
  // Swan Sense's voice. Only ever used by SwanSongCard when there's no
  // LLM line and no meaningful rule-based prediction (see its own
  // precedence comment), so computing it unconditionally here is harmless
  // for users who already have products.
  const noProductsLine = buildNoProductsSwanLine({ cyclePhaseName: cyclePhase?.name || null, season: getSeasonForUser(locationData) });

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
    daysSinceLastActive,
  });

  return (
    <div>
      {/* Hero — editorial greeting in ivory + Fungis Normal wide tracking.
          "Welcome back" copy replaces the empty-vanity welcome line for
          3-6 day gaps (soft) and 7+ day gaps (longer, more supportive).
          Under 3 days = normal greeting. Never mentions streaks or lost
          progress — see task brief for tone requirements. */}
      {(() => {
        const h = new Date().getHours();
        const slot = h >= 5 && h < 12 ? "morning" : h >= 12 && h < 17 ? "afternoon" : "evening";
        const greeting = slot === "morning" ? "Good Morning" : slot === "afternoon" ? "Good Afternoon" : "Good Evening";
        const [greetingFirst, greetingSecond] = greeting.split(" ");
        const firstName = user?.name?.split(" ")[0] || "";
        const gap = typeof daysSinceLastActive === "number" ? daysSinceLastActive : null;
        const welcomeBackLine = gap == null ? null
          : gap >= 7 ? "It's been a little while — your skin might be adjusting to changes in routine. Let's pick back up gently."
          : gap >= 3 ? "Welcome back. Let's ease back into your ritual."
          : null;
        return (
          // paddingTop adds breathing room below the sticky logo header
          // (App.jsx's shared content wrapper only gives 32px, which read
          // as a near-collision above the greeting) — scoped to the
          // dashboard's own greeting block rather than the shared
          // wrapper, so no other tab's top spacing changes. Applies
          // identically across all three greeting slots (morning/
          // afternoon/evening) since they share this one block.
          <div style={{ paddingTop: "var(--space-4)", marginBottom: products.length === 0 || welcomeBackLine ? "var(--space-5)" : "var(--space-6)" }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: "var(--text-2xl)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--color-ivory, #faf9f4)", margin: "0 0 var(--space-2)", lineHeight: 1.05 }}>
              {greetingFirst}<br />{greetingSecond}{firstName ? "," : "."}
            </h1>
            {firstName && (
              <p style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "var(--text-sm)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--color-ivory, #faf9f4)", opacity: 0.7, margin: 0, lineHeight: 1.1 }}>
                {firstName}
              </p>
            )}
            {welcomeBackLine ? (
              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", letterSpacing: "0.02em", color: "var(--color-ivory)", margin: "var(--space-4) 0 0", lineHeight: 1.55, maxWidth: 360 }}>
                {welcomeBackLine}
              </p>
            ) : products.length === 0 && (
              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", letterSpacing: "0.04em", color: "var(--color-ivory)", margin: "var(--space-3) 0 0", lineHeight: 1.5 }}>
                Welcome.
              </p>
            )}
          </div>
        );
      })()}

      {/* -- Empty state ------------------------------------------------- */}
      {products.length === 0 && (() => {
        const emptySteps = [
          // Primary: the one thing to do right now (10 seconds, no setup
          // required) — solid ivory/moss, same treatment as Begin Your
          // Ritual, so it reads as THE action on first run.
          { label: "Log how your skin feels today", sub: "Sleep, stress, skin condition — takes about 10 seconds.", action: () => setShowJournal(true), cta: "Log now", ctaVariant: "primary" },
          { label: "Add your first three products", sub: "Start with a cleanser, moisturizer and SPF. Add the rest anytime.", action: () => setTab("shelf"), cta: "Go to Vanity", ctaVariant: "secondary" },
          { label: "Swan Sense wakes up", sub: "Once your vanity is set, Cygne starts predicting - cycle windows, active streaks, barrier warnings.", action: null, cta: null },
        ];
        return (
          <div>
            <div style={{ marginBottom: "calc(var(--space-1) * 7)" }}>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", color: "var(--color-ivory)", margin: 0, lineHeight: 1.6 }}>
                Your ritual lives here. Let's build it around you.
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginBottom: "calc(var(--space-1) * 7)" }}>
              {emptySteps.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: "var(--space-4)", padding: "var(--space-4) var(--space-5)", ...glassCard }}>
                  {/* Step numeral sits where the icon used to be. Fungis
                      Heavy, helper-alpha ivory — large enough to read as
                      structural numbering without competing with the
                      step label for emphasis. */}
                  <span style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "var(--text-xl)", fontWeight: 700, letterSpacing: "0.04em",
                    color: "rgba(var(--rgb-ivory), 0.32)",
                    lineHeight: 1,
                    flexShrink: 0,
                    minWidth: 36,
                    alignSelf: "flex-start",
                    marginTop: 2,
                  }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-sm)", fontWeight: 400, color: "var(--color-ivory)", margin: "0 0 var(--space-1)", lineHeight: 1.3 }}>{s.label}</p>
                    <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", color: "var(--color-ivory)", opacity: 0.75, margin: s.cta ? "0 0 var(--space-3)" : 0, lineHeight: 1.6 }}>{s.sub}</p>
                    {s.cta && (
                      <button onClick={s.action} style={{
                        display: "inline-flex", alignItems: "center", gap: "var(--space-2)",
                        fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", fontWeight: 400,
                        borderRadius: "var(--radius-pill)", padding: "var(--space-2) var(--space-4)", cursor: "pointer",
                        ...(s.ctaVariant === "primary"
                          ? { color: "var(--color-inky-moss, #2d3d2b)", background: "var(--color-ivory, #faf9f4)", border: "none" }
                          : { color: "rgba(var(--rgb-ivory), 0.9)", background: "rgba(var(--rgb-ivory), 0.08)", border: "1px solid rgba(var(--rgb-ivory), 0.32)" }),
                      }}>
                        {s.cta} <Icon name="arrow-right" size={11} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Today card — both Swan Sense and the Daily Skin Index are
                product-independent (cycle phase / season / weather only),
                so a zero-product user gets a real reading instead of
                staring at an empty screen until their vanity is built.
                hasProducts=false gates the line to the rule-based
                cycle/season floor — see getSwanSenseLine's precedence
                comment in ritual.jsx. */}
            <div style={{ height: 1, background: "rgba(var(--rgb-ivory), 0.16)", marginBottom: "var(--space-5)" }} />
            <TodayCard
              user={user} predictions={swanSensePredictions}
              dailyLine={swanDailyLine} dailyLoading={swanLoading} dailyFailed={swanFailed}
              hasProducts={false} noProductsLine={noProductsLine}
              cyclePhaseName={cyclePhase?.name || null} weather={weather}
              tipsExpanded={tipsExpanded} onToggleTips={() => setTipsExpanded(e => !e)}
            />
          </div>
        );
      })()}

      {showJournal && (
        <SkinJournalModal
          existing={(journals || []).find(j => j.date === localDateKey()) || null}
          onSubmit={data => {
            setJournals?.(prev => upsertJournalEntry(prev, data));
            setShowJournal(false);
          }}
          onClose={() => setShowJournal(false)}
        />
      )}

      {/* -- Products present -------------------------------------------- */}
      {products.length > 0 && (
        <div>
        {/* Action first: Begin Your Ritual is the very next thing after
            the greeting — no divider between them, a solid button reads
            as its own distinct block without a hairline rule competing
            for attention right above it. */}
        <button
          onClick={() => setTab("routine")}
          style={{
            display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
            padding: "var(--space-5) var(--space-6)", marginBottom: "var(--space-5)",
            background: "var(--color-ivory, #faf9f4)", border: "none",
            borderRadius: "var(--radius)",
            cursor: "pointer",
            WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
          }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-3)", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-md)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--color-inky-moss, #2d3d2b)" }}>
            <Icon name={currentSession === "am" ? "sun" : "moon"} size={14} />
            Begin Your Ritual
          </span>
          <span style={{ color: "var(--color-inky-moss, #2d3d2b)", display: "inline-flex" }}>
            <Icon name="arrow-right" size={16} />
          </span>
        </button>

        {/* Today card — Swan Sense line + Daily Skin Index + tips,
            replacing the separate SwanSongCard (ivory-flat) +
            DailySkinIndexCard that used to stack here. */}
        <TodayCard
          user={user} predictions={swanSensePredictions}
          dailyLine={swanDailyLine} dailyLoading={swanLoading} dailyFailed={swanFailed}
          hasProducts={true} noProductsLine={noProductsLine}
          cyclePhaseName={cyclePhase?.name || null} weather={weather}
          tipsExpanded={tipsExpanded} onToggleTips={() => setTipsExpanded(e => !e)}
        />

        {_now.getDate() >= 14 && (
          <div style={{ textAlign: "right", marginBottom: "var(--space-6)" }}>
            <button
              onClick={() => { setRecapOffset(0); setRecapOpen(true); }}
              style={{
                background: "none", border: "none", padding: 0, cursor: "pointer",
                fontFamily: "var(--font-body)",
                fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase",
                color: "var(--color-ivory, #faf9f4)",
                opacity: 0.65,
                fontWeight: 400,
              }}
            >
              {recapMonthLabel} in review →
            </button>
          </div>
        )}

        {/* Ask Cygne — editorial line item. Age-gated: hidden for
            under-17 (see utils.jsx:getAskCygneAccess); shows a "fill in
            your birth year" prompt when birthYear is missing. The
            conservative-estimate fallback (Jan 1 if no month/day) and
            the dynamic recompute on every render are both in the
            helper, so this site is just a switch on the returned
            state. */}
        {(() => {
          const askAccess = getAskCygneAccess(user);
          if (askAccess === "underage") return null;
          if (askAccess === "unknown") {
            return (
              <div style={{
                width: "100%", padding: "var(--space-5) 0", marginBottom: "var(--space-4)",
                borderTop: "1px solid rgba(var(--rgb-ivory), 0.32)",
                borderBottom: "1px solid rgba(var(--rgb-ivory), 0.32)",
              }}>
                <p style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--text-xs)", letterSpacing: "0.06em", lineHeight: 1.6,
                  color: "rgba(var(--rgb-ivory), 0.56)",
                  margin: 0,
                }}>
                  Add your birth year in Profile to unlock Ask Cygne.
                </p>
              </div>
            );
          }
          return (
            <button
              onClick={() => askCygne("", "")}
              style={{
                display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
                padding: "var(--space-5) 0", marginBottom: "var(--space-4)",
                background: "transparent", border: "none",
                borderTop: "1px solid rgba(var(--rgb-ivory), 0.32)",
                borderBottom: "1px solid rgba(var(--rgb-ivory), 0.32)",
                cursor: "pointer",
                WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
              }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-md)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--color-ivory, #faf9f4)" }}>
                Ask Cygne
              </span>
              <span style={{ color: "var(--color-ivory, #faf9f4)", display: "inline-flex" }}>
                <Icon name="arrow-right" size={16} />
              </span>
            </button>
          );
        })()}

        {/* Setup strip - shown until user has products + check-in. Moved
            here (was above Begin Your Ritual) so the primary action is
            the first thing after the greeting — "action first." */}
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
            <div style={{ marginBottom: "var(--space-6)", ...glassCard, padding: "var(--space-4) var(--space-5)" }}>
              <div style={{ marginBottom: "var(--space-4)" }}>
                <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)", margin: 0 }}>Getting started</p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {steps.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}
                    onClick={s.action || undefined}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, background: s.done ? "var(--color-sage)" : "var(--ink)", border: "1px solid " + (s.done ? "var(--color-sage)" : "var(--border)"), display: "flex", alignItems: "center", justifyContent: "center", color: s.done ? "var(--ink)" : "var(--clay)" }}>
                      {s.done && <Icon name="check" size={10} />}
                      {!s.done && <span style={{ fontSize: "var(--text-xs)", opacity: 0.5 }}>{i + 1}</span>}
                    </div>
                    <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", color: s.done ? "var(--clay)" : "var(--parchment)", margin: 0, flex: 1, textDecoration: s.done ? "line-through" : "none", opacity: s.done ? 0.5 : 1 }}>{s.label}</p>
                    {!s.done && s.cta && (
                      <button onClick={e => { e.stopPropagation(); s.action(); }}
                        style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", fontWeight: 400, color: "var(--color-sage)", background: "rgba(var(--rgb-sage), 0.08)", border: "1px solid rgba(var(--rgb-sage), 0.32)", borderRadius: "var(--radius-pill)", padding: "var(--space-1) var(--space-3)", cursor: "pointer", whiteSpace: "nowrap" }}>
                        {s.cta} <Icon name="arrow-right" size={10} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Irreconcilable conflicts — quiet ivory one-liner */}
        {irreconcilable.length > 0 && products.length > 0 && (
          <div style={{ marginBottom: "var(--space-5)" }}>
            {irreconcilable.map((c, i) => (
              <p key={i} style={{
                fontFamily: "var(--font-body)", fontSize: "var(--text-xs)",
                letterSpacing: "0.02em",
                color: "var(--color-ivory)",
                lineHeight: 1.6,
                margin: i === 0 ? 0 : "var(--space-2) 0 0",
              }}>{c.reason}</p>
            ))}
          </div>
        )}

        {/* Travel Edit and Shop Scan — two individually-outlined pills.
            The prior "|"-divided text links read as one string; giving
            each its own soft rounded outline (1px low-opacity ivory
            border, faint ivory fill) makes them tap-distinct without
            introducing solid-button emphasis that would compete with
            "Begin Your Ritual" above. Outline pattern matches the
            existing style used on Enter Cygne / Continue in onboarding. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--space-3)", marginBottom: "calc(var(--space-1) * 15)" }}>
          <button
            onClick={() => setFlightOpen(true)}
            style={{
              background: "rgba(var(--rgb-ivory), 0.08)",
              border: "1px solid rgba(var(--rgb-ivory), 0.32)",
              borderRadius: "var(--radius-pill)",
              padding: "var(--space-3) var(--space-6)",
              cursor: "pointer",
              fontFamily: "var(--font-display)", fontWeight: 700,
              fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase",
              color: "var(--color-ivory, #faf9f4)",
              WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
              transition: "background 0.18s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(var(--rgb-ivory), 0.16)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(var(--rgb-ivory), 0.08)"; }}
          >
            Travel Edit
          </button>
          <button
            onClick={() => setShopScanOpen(true)}
            style={{
              background: "rgba(var(--rgb-ivory), 0.08)",
              border: "1px solid rgba(var(--rgb-ivory), 0.32)",
              borderRadius: "var(--radius-pill)",
              padding: "var(--space-3) var(--space-6)",
              cursor: "pointer",
              fontFamily: "var(--font-display)", fontWeight: 700,
              fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase",
              color: "var(--color-ivory, #faf9f4)",
              WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
              transition: "background 0.18s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(var(--rgb-ivory), 0.16)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(var(--rgb-ivory), 0.08)"; }}
          >
            Shop Scan
          </button>
        </div>

        {/* 6. Notification nudge — actionable prompt, transitional between
            top-of-page actions and bottom-of-page context. */}
        {!notifDismissed && notifPermission === "default" && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", background: "rgba(var(--rgb-sage), 0.08)", border: "1px solid rgba(var(--rgb-sage), 0.32)", borderRadius: "var(--radius)", padding: "var(--space-3) var(--space-4)", marginBottom: "var(--space-5)" }}>
            <span style={{ color: "var(--color-sage)", flexShrink: 0, display: "inline-flex" }}><Icon name="bell" size={16} /></span>
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", fontWeight: 400, color: "var(--parchment)", margin: "0 0 2px" }}>Stay on ritual</p>
              <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", color: "var(--clay)", margin: 0 }}>Get AM & PM reminders so your ritual stays consistent.</p>
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
              <button onClick={onRequestNotif} style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", fontWeight: 400, background: "rgba(var(--rgb-sage), 0.32)", border: "1px solid rgba(var(--rgb-sage), 0.32)", borderRadius: "var(--radius-pill)", color: "var(--parchment)", padding: "var(--space-2) var(--space-3)", cursor: "pointer" }}>Enable</button>
              <button onClick={onDismissNotif} aria-label="Dismiss notification prompt" style={{ background: "transparent", border: "none", color: "var(--clay)", cursor: "pointer", padding: "var(--space-2) var(--space-1)", display: "inline-flex" }}><Icon name="x" size={12} /></button>
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
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", background: "rgba(var(--rgb-sage), 0.08)", border: "1px solid rgba(var(--rgb-sage), 0.16)", borderRadius: "var(--radius)", padding: "var(--space-3) var(--space-4)", marginBottom: "var(--space-5)" }}>
              <span style={{ color: "var(--color-sage)", display: "inline-flex" }}><Icon name="sparkle" size={12} /></span>
              <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", color: "var(--clay)", margin: 0 }}>{label}</p>
              <button onClick={onDismissNotif} aria-label="Dismiss" style={{ marginLeft: "auto", background: "transparent", border: "none", color: "var(--clay)", cursor: "pointer", display: "inline-flex", padding: "var(--space-1)" }}><Icon name="x" size={12} /></button>
            </div>
          );
        })()}

        {/* Seasonal + Weekend — editorial line items, stacked sharing rules.
            marginBottom adds clear breathing room before the bottom context
            strip so it doesn't feel pinched against the last seasonal row. */}
        <div style={{ marginBottom: "calc(var(--space-1) * 13)" }}>
          <SeasonalNudgeCard products={products} activeMap={activeMap} locationData={locationData} user={user} lineMode />
          <WeekendNudgeCard products={products} activeMap={activeMap} lineMode />
        </div>

        {/* 9. Treatment recovery — only when a recovery window is active */}
        {treatments.filter(t => { const r = getTreatmentPhase(t); return r && r.phase && r.phase.label !== "Cleared"; }).map(t => (
          <div key={t.id} style={{ marginBottom: "var(--space-5)" }}>
            <TreatmentRecoveryCard treatment={t} products={products} activeMap={activeMap} onDismiss={() => {}} onResetDate={updateTreatmentDate ? (newIso) => updateTreatmentDate(t.id, newIso) : undefined} />
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

          if (!phase && !cycleStale && !hasWeather && daysSince === null) return null;

          const txtSt = { fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 400, letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--color-ivory, #faf9f4)", opacity: 0.75, whiteSpace: "nowrap" };
          const btnSt = { display: "inline-flex", alignItems: "center", gap: "var(--space-2)", padding: 0, background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent" };

          return (
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              rowGap: "var(--space-2)",
              columnGap: "var(--space-4)",
              padding: "var(--space-4) 0 0",
              borderTop: "1px solid rgba(var(--rgb-ivory), 0.16)",
              marginBottom: "var(--space-5)",
              fontFamily: "var(--font-body)",
            }}>
              {phase && (
                <button onClick={() => setCycleExpanded(true)} style={btnSt}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--color-ivory, #faf9f4)", opacity: 0.7, display: "inline-block", flexShrink: 0 }} />
                  <span style={txtSt}>{phase.name} · Day {currentCycleDay}</span>
                </button>
              )}
              {cycleStale && (
                <button onClick={() => setTab("progress")} style={btnSt}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--color-ivory, #faf9f4)", opacity: 0.7, display: "inline-block", flexShrink: 0 }} />
                  <span style={txtSt}>{CYCLE_STALE_MESSAGE}</span>
                </button>
              )}
              <button onClick={() => setTab("progress")} style={btnSt}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--color-ivory, #faf9f4)", opacity: 0.45, display: "inline-block", flexShrink: 0 }} />
                <span style={txtSt}>{checkInMsg}</span>
              </button>
              {hasWeather && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-3)", marginLeft: "auto" }}>
                  {weather.temp !== null && <span style={txtSt}>{Math.round(tempUnit === "F" ? (weather.temp * 9 / 5 + 32) : weather.temp)}°{tempUnit}</span>}
                  {weather.uvIndex !== null && <span style={txtSt}>UV {Math.round(weather.uvIndex)}</span>}
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
              style={{ position: "fixed", inset: 0, background: "var(--overlay)", backdropFilter: "blur(6px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--space-6)" }}>
              <div onClick={e => e.stopPropagation()}
                style={{ background: "var(--ink)", border: `1px solid ${phase.border}`, borderRadius: "var(--radius)", padding: "var(--space-6) var(--space-6)", maxWidth: 440, width: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: phase.dot }} />
                  <span style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-sm)", fontWeight: 400, color: "var(--parchment)" }}>{phase.name} Phase</span>
                  <span style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", color: "var(--clay)", opacity: 0.7, marginLeft: "auto" }}>Day {currentCycleDay}</span>
                  <button onClick={() => setCycleExpanded(false)} aria-label="Close cycle detail" style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", marginLeft: "var(--space-2)", display: "inline-flex", padding: 2 }}><Icon name="x" size={14} /></button>
                </div>
                <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", color: "var(--clay)", margin: "0 0 var(--space-4)", lineHeight: 1.65 }}>{phase.description}</p>
                <div style={{ padding: "var(--space-3) var(--space-4)", background: "rgba(var(--rgb-ink), 0.16)", borderRadius: "var(--radius)" }}>
                  <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", color: "var(--parchment)", margin: 0, lineHeight: 1.6 }}>{phase.nudge}</p>
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
            cycleDay={currentCycleDay}
            skinGoals={skinGoals}
            onMarkSkinGoalMet={onMarkSkinGoalMet}
            onAddSkinGoal={onAddSkinGoal}
            onRemoveSkinGoal={onRemoveSkinGoal}
            reflections={reflections}
            onClose={() => setRecapOpen(false)}
          />
        )}
      </Suspense>
    </div>
  );
}

export { Dashboard };
