import { useState } from "react";
import { Icon } from "./components.jsx";
import { analyzeShelf } from "./engine.js";
import { getSeason } from "./seasonal.jsx";
import { getCurrentCycleDay } from "./utils.jsx";

// --- SWAN SENSE — PREDICTIVE SKIN ENGINE -------------------------------------

function getSwanSensePredictions(products, checkIns = [], user = {}, locationData = null, journals = []) {
  const predictions = [];
  const season = getSeason();
  const cycleDay = getCurrentCycleDay(user);
  const activeMap = analyzeShelf(products).activeMap;

  // -- Journal-based predictions ----------------------------------------------
  const recentJournals = journals.slice(-5);
  const poorSleepCount  = recentJournals.filter(j => j.sleep === "poor").length;
  const highStressCount = recentJournals.filter(j => j.stress === "high").length;
  const roughDullCount  = recentJournals.filter(j => j.condition === "rough" || j.condition === "dull").length;
  const glowingCount    = recentJournals.filter(j => j.condition === "glowing" || j.condition === "good").length;
  const lastJournal     = journals[journals.length - 1];
  const hasActives      = !!(activeMap["retinol"]?.length || activeMap["AHA"]?.length || activeMap["BHA"]?.length);

  if (poorSleepCount >= 3) {
    predictions.push({
      type: "sleep_deficit",
      level: "caution",
      headline: "Sleep deficit building",
      detail: `${poorSleepCount} of your last ${recentJournals.length} nights logged as poor sleep. Cortisol disrupts the skin barrier — keep your ritual gentle and hold actives until you've had a few good nights.`,
    });
  } else if (poorSleepCount >= 2 && hasActives) {
    predictions.push({
      type: "sleep_actives_caution",
      level: "caution",
      headline: "Poor sleep + actives — watch your barrier",
      detail: "Two recent nights of poor sleep weaken barrier recovery. If you notice dryness or sensitivity after actives, consider a rest night.",
    });
  }

  if (highStressCount >= 3) {
    predictions.push({
      type: "stress_streak",
      level: "caution",
      headline: "High stress pattern detected",
      detail: `Stress elevates cortisol, which increases sebum and slows barrier repair. ${roughDullCount > 0 ? "Your recent skin condition entries reflect this." : "Keep your ritual consistent — it's one thing you can control right now."}`,
    });
  }

  if (lastJournal?.sleep === "poor" && lastJournal?.stress === "high") {
    predictions.push({
      type: "rough_night",
      level: "caution",
      headline: "Last night was rough — adjust tonight",
      detail: "Poor sleep and high stress together spike cortisol and strip moisture. A gentle, hydration-focused ritual tonight will do more than actives.",
    });
  }

  if (glowingCount >= 3 && recentJournals.length >= 3) {
    predictions.push({
      type: "skin_momentum",
      level: "positive",
      headline: "Good skin momentum this week",
      detail: "Three or more recent journal entries logged as good or glowing. Whatever you're doing is working — stay consistent.",
    });
  }
  const hasRetinol = !!(activeMap["retinol"]?.length);
  const hasAHA = !!(activeMap["AHA"]?.length);
  const hasBHA = !!(activeMap["BHA"]?.length);
  const onTretinoin = user?.medicalHistory?.prescriptions?.some(p => /tretinoin|retin-a/i.test(p.name));
  const recent = checkIns.slice(-5);
  const recentDates = recent.map(c => c.date).sort();

  // -- Active streak risk ------------------------------------------------------
  // Count how many of the last 3 check-ins had strong actives logged
  // We approximate by checking if retinol/AHA products are in routine + recent check-ins exist
  if ((hasRetinol || hasAHA || onTretinoin) && recentDates.length >= 3) {
    const last3 = recentDates.slice(-3);
    const allWithin4Days = last3.length === 3 && (() => {
      const d0 = new Date(last3[0]), d2 = new Date(last3[2]);
      return (d2 - d0) / 86400000 <= 4;
    })();
    const hasRecentIrritation = recent.some(c => c.irritation === "mild" || c.irritation === "moderate");
    if (allWithin4Days && !hasRecentIrritation) {
      predictions.push({
        id: "active_streak",
        headline: "Active use streak — irritation risk rising.",
        detail: onTretinoin
          ? "Tretinoin is cumulative. After consecutive nights, the skin barrier can become compromised even before visible irritation appears. Consider a rest night."
          : "Strong actives used multiple nights in a row. Your skin may not show irritation yet, but risk is elevated — a rest night tonight can prevent it.",
        level: "caution",
        color: "#8b7355",
        bg: "rgba(139,115,85,0.07)",
        border: "rgba(139,115,85,0.2)",
      });
    }
  }

  // -- Cycle predictions -------------------------------------------------------
  if (cycleDay) {
    const daysUntilLuteal = (() => {
      // Luteal: days 15–28
      if (cycleDay < 15) return 15 - cycleDay;
      if (cycleDay <= 28) return 0; // currently in luteal
      return null;
    })();
    const daysUntilMenstrual = (() => {
      // Menstrual: days 1–5 (or 27–35 approaching next cycle)
      if (cycleDay >= 27) return Math.max(0, 29 - cycleDay);
      if (cycleDay <= 5) return 0;
      return null;
    })();

    if (daysUntilMenstrual !== null && daysUntilMenstrual > 0 && daysUntilMenstrual <= 4) {
      predictions.push({
        id: "cycle_menstrual_approaching",
        headline: `Sensitivity window in ~${daysUntilMenstrual} day${daysUntilMenstrual === 1 ? "" : "s"}.`,
        detail: "Approaching menstruation, progesterone drops and barrier permeability increases. Consider easing up on exfoliants and actives over the next few days.",
        level: "cycle",
        color: "#8b7355",
        bg: "rgba(139,115,85,0.07)",
        border: "rgba(139,115,85,0.2)",
      });
    } else if (daysUntilMenstrual === 0 && cycleDay <= 5) {
      predictions.push({
        id: "cycle_menstrual_now",
        headline: "Elevated skin sensitivity right now.",
        detail: "During menstruation, barrier permeability is at its highest. Breakouts and irritation are more likely. A gentler ritual is recommended.",
        level: "cycle",
        color: "#8b7355",
        bg: "rgba(139,115,85,0.07)",
        border: "rgba(139,115,85,0.2)",
      });
    }

    if (daysUntilLuteal !== null && daysUntilLuteal > 0 && daysUntilLuteal <= 3 && hasBHA) {
      predictions.push({
        id: "cycle_luteal_approaching",
        headline: `Oil surge likely in ~${daysUntilLuteal} day${daysUntilLuteal === 1 ? "" : "s"}.`,
        detail: "Progesterone rise during luteal phase drives up sebum production. Your BHA will be especially useful this week — keep it consistent.",
        level: "cycle",
        color: "#8b7355",
        bg: "rgba(139,115,85,0.07)",
        border: "rgba(139,115,85,0.2)",
      });
    }

    if (daysUntilLuteal === null && cycleDay >= 20 && cycleDay <= 28) {
      const hasRecentBreakout = recent.some(c => c.breakout);
      if (hasRecentBreakout) {
        predictions.push({
          id: "cycle_breakout_risk",
          headline: "Elevated breakout risk — late luteal phase.",
          detail: "Sebum is peaking and your recent check-ins flagged congestion. This is the highest-risk window. BHA and a lighter moisturiser will help.",
          level: "alert",
          color: "#8b7355",
          bg: "rgba(139,115,85,0.08)",
          border: "rgba(139,115,85,0.22)",
        });
      }
    }

    if ((hasRetinol || hasAHA) && !onTretinoin) {
      // Follicular window opening
      const daysUntilFollicular = (() => {
        if (cycleDay >= 6 && cycleDay <= 13) return 0; // in follicular
        if (cycleDay < 6) return 6 - cycleDay;
        return null;
      })();
      if (daysUntilFollicular !== null && daysUntilFollicular > 0 && daysUntilFollicular <= 2) {
        predictions.push({
          id: "cycle_follicular_opening",
          headline: "Resilience window opening soon.",
          detail: "Follicular phase starts in a couple of days — your skin will be at peak tolerance for retinol and AHA. A good moment to be consistent with actives.",
          level: "positive",
          color: "#7a9070",
          bg: "rgba(122,144,112,0.07)",
          border: "rgba(122,144,112,0.2)",
        });
      }
    }
  }

  // -- Weather / barrier risk --------------------------------------------------
  if (season === "winter" || season === "fall") {
    const hasOcclusive = products.some(p =>
      (p.ingredients || []).some(i => /squalane|petrolatum|shea|ceramide|lanolin/i.test(i)) && p.inRoutine !== false
    );
    const hasMoisturiser = products.some(p => p.category === "Moisturizer" && p.inRoutine !== false);
    if (!hasOcclusive && hasMoisturiser) {
      predictions.push({
        id: "winter_barrier",
        headline: season === "winter" ? "Barrier risk this week." : "Barrier risk as temperatures drop.",
        detail: "Cold air strips moisture faster than summer. Without an occlusive layer, your moisturiser's benefits will evaporate quickly. Consider adding a facial oil or balm as a final step.",
        level: "caution",
        color: "#8b7355",
        bg: "rgba(139,115,85,0.07)",
        border: "rgba(139,115,85,0.2)",
      });
    }
  }

  // -- Recent irritation trend -------------------------------------------------
  const irritationCount = recent.filter(c => c.irritation === "mild" || c.irritation === "moderate").length;
  if (irritationCount >= 2) {
    predictions.push({
      id: "irritation_trend",
      headline: "Recurring irritation detected.",
      detail: "Two or more recent check-ins have flagged irritation. This may indicate an active is accumulating, a product isn't suiting you, or the barrier is compromised. A reset ritual for 3–5 nights can help identify the cause.",
      level: "alert",
      color: "#8b7355",
      bg: "rgba(139,115,85,0.08)",
      border: "rgba(139,115,85,0.22)",
    });
  }

  // -- Baseline — always show something if there are ritual products ----------
  if (predictions.length === 0) {
    const ritualProducts = products.filter(p => p.inRoutine !== false);
    const hasActives = hasRetinol || hasAHA || hasBHA || onTretinoin;
    if (!cycleDay && hasActives) {
      predictions.push({
        id: "baseline_cycle",
        headline: "Set your cycle day to unlock predictions.",
        detail: "Swan Sense can predict sensitivity windows, oil surges, and ideal active nights — but needs your cycle day to do it. Add it in the Progress tab.",
        level: "positive",
        color: "#7a9070",
        bg: "rgba(122,144,112,0.07)",
        border: "rgba(122,144,112,0.2)",
      });
    } else if (season === "winter" || season === "fall") {
      predictions.push({
        id: "baseline_season",
        headline: season === "winter" ? "Winter is tough on skin barriers." : "Cooler air arriving — barrier watch.",
        detail: "As temperatures drop, transepidermal water loss increases. Check that you have a moisturiser and ideally an occlusive as your final PM step.",
        level: "caution",
        color: "#8b7355",
        bg: "rgba(139,115,85,0.07)",
        border: "rgba(139,115,85,0.2)",
      });
    } else {
      predictions.push({
        id: "baseline_checkin",
        headline: "Log your first check-in to activate predictions.",
        detail: "Swan Sense learns from your skin over time. After a few check-ins, it can flag irritation trends, barrier risk, and optimal active windows before they happen.",
        level: "positive",
        color: "#7a9070",
        bg: "rgba(122,144,112,0.07)",
        border: "rgba(122,144,112,0.2)",
      });
    }
  }

  // -- Professional treatment window predictions --------------------------------
  const onRetinoid = hasRetinol || !!(activeMap["AHA"]?.length);
  const retinoidWeeks = (() => {
    // Estimate weeks on retinoid from ramp schedule if available
    const retinoidProducts = (activeMap["retinol"] || []);
    if (retinoidProducts.length > 0 && retinoidProducts[0].routineStartDate) {
      const start = new Date(retinoidProducts[0].routineStartDate);
      return Math.floor((Date.now() - start.getTime()) / (7 * 86400000));
    }
    return null;
  })();

  const recentIrritation = checkIns.slice(-6).filter(c => c.irritation !== "none").length;
  const persistentCongestion = checkIns.slice(-8).filter(c => c.breakout).length >= 4;
  const persistentDullness = recentJournals.filter(j => j.condition === "dull" || j.condition === "rough").length >= 3;
  const inGoodWindow = cycleDay && (cycleDay >= 6 && cycleDay <= 13); // follicular
  const inBadWindow = cycleDay && (cycleDay >= 24 || cycleDay <= 5);  // late luteal or menstrual

  // Chemical peel readiness
  if (onRetinoid && retinoidWeeks !== null && retinoidWeeks >= 10 && recentIrritation <= 1) {
    if (inGoodWindow) {
      predictions.push({
        type: "peel_window_open",
        level: "positive",
        headline: "Good window for a chemical peel",
        detail: "You've been consistent with your retinoid for " + retinoidWeeks + " weeks and your skin is in its most resilient phase right now. If you've been considering a light peel, this is a good time to book it. Pause retinoids 5–7 days before.",
      });
    } else if (!inBadWindow) {
      predictions.push({
        type: "peel_readiness",
        level: "positive",
        headline: "Your skin is building peel readiness",
        detail: retinoidWeeks + " weeks of consistent retinoid use suggests your skin cell turnover is primed. When your follicular phase opens (around day 6–13), that's your optimal window for a light chemical peel consultation.",
      });
    }
  }

  // Microneedling readiness
  if (onRetinoid && retinoidWeeks !== null && retinoidWeeks >= 12 && persistentDullness && recentIrritation <= 1) {
    predictions.push({
      type: "microneedling_readiness",
      level: "positive",
      headline: "Microneedling worth considering",
      detail: "Persistent dullness alongside " + retinoidWeeks + " weeks of retinoid use is a signal your at-home routine is doing what it can. Microneedling could meaningfully address texture and radiance from here. Pause retinoids 1 week before and after.",
    });
  }

  // Persistent congestion — professional help signal
  if (persistentCongestion && recentIrritation >= 2) {
    predictions.push({
      type: "professional_consult",
      level: "caution",
      headline: "Persistent breakouts — worth a derm visit",
      detail: "Frequent breakouts over the past few weeks alongside irritation suggests your current routine may need professional input. A dermatologist can assess whether a prescription treatment or in-clinic procedure would move the needle faster than at-home actives.",
    });
  }

  // Bad window warning for anyone considering a treatment
  if (inBadWindow && (persistentDullness || persistentCongestion)) {
    predictions.push({
      type: "treatment_timing_caution",
      level: "caution",
      headline: "Not the right week for in-clinic treatments",
      detail: "Your skin is more reactive and slower to heal in the late luteal and menstrual phases. If you have a peel or microneedling appointment coming up, consider rescheduling to your follicular phase (days 6–13) for better results and less downtime.",
    });
  }

  // Return top 3, prioritising alert > caution > cycle > positive
  const order = { alert: 0, caution: 1, cycle: 2, positive: 3 };
  return predictions.sort((a, b) => (order[a.level] ?? 4) - (order[b.level] ?? 4)).slice(0, 3);
}

function SwanSenseCard({ products, checkIns = [], user = {}, locationData = null, journals = [] }) {
  const predictions = getSwanSensePredictions(products, checkIns, user, locationData, journals);
  const [expanded, setExpanded] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [feedback, setFeedback] = useState({});

  if (dismissed || predictions.length === 0) return null;

  const giveFeedback = (type, value, e) => {
    e.stopPropagation();
    setFeedback(f => ({ ...f, [type]: f[type] === value ? null : value }));
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ color: "var(--clay)", fontSize: 14 }}>🦢</span>
        <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--clay)" }}>Swan Sense</span>
        <div style={{ flex: 1, height: 1, background: "var(--border)", marginLeft: 4 }} />
        <button onClick={() => setDismissed(true)} style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", opacity: 0.4, padding: 4 }}><Icon name="x" size={12} /></button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {predictions.map(p => {
          const fb = feedback[p.type];
          const isExpanded = expanded === p.type;
          return (
            <div key={p.type}
              onClick={() => setExpanded(isExpanded ? null : p.type)}
              style={{ background: fb === "up" ? "rgba(122,144,112,0.1)" : p.bg, border: `1px solid ${fb ? "rgba(122,144,112,0.3)" : p.border}`, borderRadius: 12, padding: "13px 15px", cursor: "pointer", position: "relative", overflow: "hidden", transition: "all 0.2s" }}>
              <div style={{ position: "absolute", bottom: 6, right: 12, opacity: 0.06, fontSize: 36, pointerEvents: "none" }}>🦢</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: fb === "up" ? "#7a9070" : p.color, flexShrink: 0 }} />
                <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 12, color: "var(--parchment)", margin: 0, flex: 1, lineHeight: 1.4 }}>{p.headline}</p>
                <span style={{ color: "var(--clay)", opacity: 0.4, flexShrink: 0, transition: "transform 0.18s", transform: isExpanded ? "rotate(-90deg)" : "rotate(90deg)", display: "inline-flex" }}><Icon name="chevron" size={10} /></span>
              </div>
              {isExpanded && (
                <div>
                  <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: "10px 0 0", lineHeight: 1.65, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>{p.detail}</p>
                  {p.type && !(p.id && p.id.startsWith("baseline_")) && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
                    <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay)", opacity: 0.5, marginRight: 4 }}>
                      {fb ? (fb === "up" ? "Marked as helpful" : "Noted") : "Was this helpful?"}
                    </span>
                    <button onClick={e => giveFeedback(p.type, "up", e)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, background: fb === "up" ? "rgba(122,144,112,0.25)" : "transparent", border: `1px solid ${fb === "up" ? "rgba(122,144,112,0.5)" : "var(--border)"}`, borderRadius: 20, padding: "4px 10px", cursor: "pointer", fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: fb === "up" ? "#7a9070" : "var(--clay)", transition: "all 0.15s" }}>
                      <Icon name="arrow-up" size={10} /> Yes
                    </button>
                    <button onClick={e => giveFeedback(p.type, "down", e)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, background: fb === "down" ? "rgba(139,115,85,0.15)" : "transparent", border: `1px solid ${fb === "down" ? "rgba(139,115,85,0.4)" : "var(--border)"}`, borderRadius: 20, padding: "4px 10px", cursor: "pointer", fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: fb === "down" ? "#8b7355" : "var(--clay)", transition: "all 0.15s" }}>
                      <Icon name="arrow-down" size={10} /> Not really
                    </button>
                  </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
export { getSwanSensePredictions, SwanSenseCard };