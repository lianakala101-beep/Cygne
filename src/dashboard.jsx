import { useState } from "react";
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

function Dashboard({ products, setTab, checkIns, swanPopupDismissed, onDismissSwanPopup, treatments, locationData, user, theme, notifPermission, onRequestNotif, notifDismissed, onDismissNotif, journals, setCheckIns, onLoadDemo }) {
  const { flags } = analyzeShelf(products);
  const conflicts = detectConflicts(products);
  const { am, pm } = buildRoutine(products);
  const spending = calcSpending(products);
  const currentSession = getCurrentSession();
  const [flightOpen, setFlightOpen] = useState(false);
  const [shopScanOpen, setShopScanOpen] = useState(false);
  const [cycleExpanded, setCycleExpanded] = useState(false);
  const currentCycleDay = getCurrentCycleDay(user);
  const { activeMap } = analyzeShelf(products);
  const swanSensePredictions = getSwanSensePredictions(products, checkIns, user, locationData, journals);

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
      <div style={{ marginBottom: products.length === 0 ? 28 : 36, paddingTop: 44 }}>
        <p style={{ fontFamily: "var(--heading)", fontSize: 9, letterSpacing: "0.28em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 12px", opacity: 0.8 }}>
          {(() => {
            const h = new Date().getHours();
            if (h >= 5  && h < 12) return user?.name ? `Good morning, ${user.name.split(" ")[0]}.` : "Good morning.";
            if (h >= 12 && h < 17) return user?.name ? `Good afternoon, ${user.name.split(" ")[0]}.` : "Good afternoon.";
            return user?.name ? `Good evening, ${user.name.split(" ")[0]}.` : "Good evening.";
          })()}
        </p>
        <h1 style={{ fontFamily: "var(--heading)", fontSize: 46, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--parchment)", margin: "0 0 4px", lineHeight: 1.15 }}>
          {products.length === 0 ? "Welcome." : "Your Ritual."}
        </h1>
      </div>

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
              <p style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 400, letterSpacing: "0.05em", color: "var(--clay)", margin: 0, lineHeight: 1.7 }}>
                Your ritual lives here. Let's build it around you.
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
              {emptySteps.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 14, padding: "16px 18px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14 }}>
                  <span style={{ color: "var(--clay)", flexShrink: 0, marginTop: 2, display: "inline-flex" }}><Icon name={s.icon} size={18} /></span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--clay)", opacity: 0.5 }}>Step {i + 1}</span>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--parchment)", margin: "4px 0", lineHeight: 1.3 }}>{s.label}</p>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: s.cta ? "0 0 10px" : 0, lineHeight: 1.6 }}>{s.sub}</p>
                    {s.cta && (
                      <button onClick={s.action} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, color: "#6e8a72", background: "rgba(122,144,112,0.1)", border: "1px solid rgba(122,144,112,0.3)", borderRadius: 20, padding: "6px 14px", cursor: "pointer" }}>
                        {s.cta} <Icon name="arrow-right" size={11} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setTab("shelf")}
              style={{ width: "100%", padding: "16px 0", background: "var(--cta)", border: "1px solid rgba(122,144,112,0.35)", borderRadius: 14, fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--parchment)", cursor: "pointer", letterSpacing: "0.04em", marginBottom: 10 }}>
              Add your first product
            </button>
            {onLoadDemo && (
              <button onClick={onLoadDemo}
                style={{ width: "100%", padding: "13px 0", background: "transparent", border: "1px solid var(--border)", borderRadius: 14, fontFamily: "var(--font-body)", fontSize: 12, color: "var(--clay)", cursor: "pointer", letterSpacing: "0.04em" }}>
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
                <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--clay)", margin: 0 }}>Getting started</p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {steps.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}
                    onClick={s.action || undefined}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, background: s.done ? "#6e8a72" : "var(--ink)", border: "1px solid " + (s.done ? "#6e8a72" : "var(--border)"), display: "flex", alignItems: "center", justifyContent: "center", color: s.done ? "var(--ink)" : "var(--clay)" }}>
                      {s.done && <Icon name="check" size={10} />}
                      {!s.done && <span style={{ fontSize: 9, opacity: 0.5 }}>{i + 1}</span>}
                    </div>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: s.done ? "var(--clay)" : "var(--parchment)", margin: 0, flex: 1, textDecoration: s.done ? "line-through" : "none", opacity: s.done ? 0.5 : 1 }}>{s.label}</p>
                    {!s.done && s.cta && (
                      <button onClick={e => { e.stopPropagation(); s.action(); }}
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 600, color: "#6e8a72", background: "rgba(122,144,112,0.1)", border: "1px solid rgba(122,144,112,0.3)", borderRadius: 20, padding: "4px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
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
        <div className="cygne-swansong-intro" style={{ marginBottom: 20 }}>
          <SwanSongCard currentSession={currentSession} asPopup={false} user={user} predictions={swanSensePredictions} />
        </div>

        {/* 2. Cycle phase — ambient pill, tap to expand */}
        {user?.cycleTrackingEnabled && currentCycleDay && (() => {
          const phase = getCyclePhase(currentCycleDay);
          return (
            <button
              onClick={() => setCycleExpanded(true)}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 13px", background: phase.bg, border: `1px solid ${phase.border}`, borderRadius: 999, marginBottom: 20, cursor: "pointer", fontFamily: "inherit" }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: phase.dot, flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 500, color: "var(--parchment)", letterSpacing: "0.02em" }}>{phase.name} Phase · Day {currentCycleDay}</span>
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
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600, color: "var(--parchment)" }}>{phase.name} Phase</span>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", opacity: 0.7, marginLeft: "auto" }}>Day {currentCycleDay}</span>
                  <button onClick={() => setCycleExpanded(false)} style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", marginLeft: 6, display: "inline-flex", padding: 2 }}><Icon name="x" size={14} /></button>
                </div>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--clay)", margin: "0 0 14px", lineHeight: 1.65 }}>{phase.description}</p>
                <div style={{ padding: "12px 14px", background: "rgba(0,0,0,0.2)", borderRadius: 10 }}>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--parchment)", margin: 0, lineHeight: 1.6 }}>{phase.nudge}</p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 3. Check-in signal + reminders */}
        {(() => {
          const last = checkIns.length ? checkIns.reduce((a, b) => new Date(a.date) > new Date(b.date) ? a : b) : null;
          const daysSince = last ? daysBetweenLocal(last.date) : null;
          const due = daysSince === null || daysSince >= 7;
          const msg = daysSince === null
            ? "No check-ins yet - log your first in Progress."
            : daysSince === 0 ? "Check-in logged today."
            : daysSince < 7 ? `Last check-in ${daysSince}d ago.`
            : "Check-in overdue.";
          const color = due ? (daysSince === null ? "var(--clay)" : "#8b7355") : "#6e8a72";
          return (
            <button onClick={() => setTab("progress")}
              style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, background: "none", border: "none", padding: "4px 0", cursor: "pointer", fontFamily: "inherit" }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", letterSpacing: "0.03em", textDecoration: "underline", textDecorationColor: "rgba(139,115,85,0.3)", textUnderlineOffset: 3 }}>{msg}</span>
              <span style={{ color: "var(--clay)", opacity: 0.6, display: "inline-flex" }}><Icon name="chevron" size={10} /></span>
            </button>
          );
        })()}

        {/* Notification nudge banner */}
        {!notifDismissed && notifPermission === "default" && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(122,144,112,0.10)", border: "1px solid rgba(122,144,112,0.25)", borderRadius: 12, padding: "12px 14px", marginBottom: 20 }}>
            <span style={{ color: "#6e8a72", flexShrink: 0, display: "inline-flex" }}><Icon name="bell" size={16} /></span>
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--parchment)", margin: "0 0 2px" }}>Stay on ritual</p>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: 0 }}>Get AM & PM reminders so your ritual stays consistent.</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button onClick={onRequestNotif} style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, background: "rgba(122,144,112,0.25)", border: "1px solid rgba(122,144,112,0.4)", borderRadius: 8, color: "var(--parchment)", padding: "6px 12px", cursor: "pointer" }}>Enable</button>
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
              <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: 0 }}>{label}</p>
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
          <SeasonalNudgeCard products={products} activeMap={activeMap} locationData={locationData} />
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
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--clay)" }}>{label} Routine</span>
                  <span style={{ marginLeft: "auto", fontSize: 9, fontFamily: "var(--font-body)", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6e8a72", background: "rgba(232,226,217,0.25)", padding: "3px 9px", borderRadius: 20 }}>Now</span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 64, fontWeight: 200, color: "var(--parchment)", lineHeight: 0.9, letterSpacing: "-0.03em" }}>{steps.length}</span>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--clay)", paddingBottom: 8, letterSpacing: "0.04em" }}>step{steps.length !== 1 ? "s" : ""} in order</span>
                </div>
                {steps.length > 0 && (
                  <p style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-body)", fontSize: 11, color: "#6e8a72", margin: "0 0 18px", letterSpacing: "0.06em" }}>
                    {steps[0].category} <Icon name="arrow-right" size={11} /> {steps[steps.length - 1].category}
                  </p>
                )}
                {steps.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {steps.map((s, i) => (
                      <span key={s.id} style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clay)", background: "var(--surface)", border: "1px solid rgba(255,255,255,0.07)", padding: "3px 9px", borderRadius: 20 }}>
                        {i + 1}. {s.category}
                      </span>
                    ))}
                  </div>
                )}
                {steps.length === 0 && (
                  <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--clay)", margin: 0, opacity: 0.6 }}>Add products to build your ritual.</p>
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
            <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--parchment)", margin: 0 }}>No conflicts detected. Your ritual is clean.</p>
          </div>
        )}

        {/* 5. Travel Edit + Shop Scan — utility buttons at bottom */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <button onClick={() => setFlightOpen(true)}
            style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: "var(--cta)", border: "1px solid rgba(122,144,112,0.25)", borderRadius: 14, cursor: "pointer", transition: "background 0.2s", textAlign: "left" }}
            onMouseEnter={e => e.currentTarget.style.background = "#444d3d"}
            onMouseLeave={e => e.currentTarget.style.background = "var(--color-ivory)"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(232,227,214,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/>
            </svg>
            <div>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "rgba(232,227,214,0.95)", fontWeight: 600, margin: "0 0 2px", letterSpacing: "0.06em", textTransform: "uppercase" }}>Travel Edit</p>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 9, color: "rgba(232,227,214,0.45)", margin: 0, letterSpacing: "0.02em" }}>Pack & skip</p>
            </div>
          </button>
          <button onClick={() => setShopScanOpen(true)}
            style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: "var(--cta)", border: "1px solid rgba(122,144,112,0.25)", borderRadius: 14, cursor: "pointer", transition: "background 0.2s", textAlign: "left" }}
            onMouseEnter={e => e.currentTarget.style.background = "#444d3d"}
            onMouseLeave={e => e.currentTarget.style.background = "var(--color-ivory)"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(232,227,214,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
            </svg>
            <div>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "rgba(232,227,214,0.95)", fontWeight: 600, margin: "0 0 2px", letterSpacing: "0.06em", textTransform: "uppercase" }}>Shop Scan</p>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 9, color: "rgba(232,227,214,0.45)", margin: 0, letterSpacing: "0.02em" }}>Would my skin like this?</p>
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
    </div>
  );
}

export { Dashboard };
