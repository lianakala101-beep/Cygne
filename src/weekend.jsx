import { useState } from "react";
import { Icon } from "./components.jsx";
import { hasSPFCoverage } from "./engine.js";

function getWeekendPhase() {
  const day = new Date().getDay(); // 0=Sun, 1=Mon ... 6=Sat
  const hour = new Date().getHours();
  if (day === 4 && hour >= 17) return "before"; // Thu evening
  if (day === 5) return "before";               // Friday
  if (day === 6) return "during";               // Saturday
  if (day === 0) return "after";                // Sunday
  return null; // not a weekend window
}

function buildWeekendAdvice(phase, products, activeMap) {
  const hasRetinol    = !!activeMap["retinol"]?.length;
  const hasAHA        = !!activeMap["AHA"]?.length;
  const hasExfoliant  = hasAHA || !!activeMap["BHA"]?.length;
  const hasCeramide   = products.some(p => (p.ingredients || []).some(i => i.includes("ceramide")));
  const hasHA         = products.some(p => (p.ingredients || []).some(i => i.includes("hyaluronate") || i.includes("hyaluronic")));
  const hasMoisturizer = products.some(p => p.category === "Moisturizer" || p.category === "SPF Moisturizer");
  const hasCleanser   = products.some(p => p.category === "Cleanser");
  const hasSPF        = hasSPFCoverage(products, activeMap);

  if (phase === "before") {
    const skip = [];
    const do_ = [];
    if (hasRetinol) skip.push("Skip retinol tonight — alcohol amplifies irritation and barrier permeability.");
    if (hasExfoliant) skip.push("Hold off on exfoliants. Your skin will be more reactive.");
    if (hasCeramide || hasMoisturizer) do_.push("Layer your ceramide moisturizer generously before going out. It acts as a buffer.");
    if (hasHA) do_.push("Apply your hyaluronic acid serum on damp skin — pre-hydrating makes a visible difference the next morning.");
    if (!hasCeramide && !hasMoisturizer) do_.push("No ceramide moisturizer detected. Consider adding one — it's your best pre-weekend barrier support.");
    do_.push("Cleanse thoroughly before sleeping no matter how late. This is non-negotiable.");
    return { skip, do: do_ };
  }

  if (phase === "during") {
    return {
      skip: [],
      do: [
        "Match every drink with a glass of water. Dehydration shows on skin within hours.",
        "If you nap or sleep early, remove makeup first — always.",
        hasCleanser ? "Keep your cleanser accessible. A quick cleanse before sleep takes 60 seconds and saves your skin." : "A micellar water or cleansing wipe is better than sleeping in makeup.",
        hasSPF ? "If you're outdoors today, reapply SPF. Alcohol increases UV sensitivity." : "Alcohol increases UV sensitivity — SPF is more important today than usual.",
      ]
    };
  }

  if (phase === "after") {
    const do_ = [];
    if (hasCleanser) do_.push("Gentle cleanse only — skip actives entirely today.");
    if (hasMoisturizer) do_.push("Double up on moisturizer. Alcohol depletes ceramides systemically.");
    if (hasRetinol || hasAHA) do_.push("No retinol or exfoliants today. Give your barrier a full recovery day.");
    if (hasSPF) do_.push("SPF still applies, even on a recovery Sunday.");
    do_.push("Drink water consistently through the day — skin rehydration takes longer than you think.");
    return { skip: [], do: do_ };
  }

  return { skip: [], do: [] };
}

const WEEKEND_PHASE_CONFIG = {
  before: {
    label: "The Weekend Is Near",
    sublabel: "Thursday · Friday",
    headline: "Prep your skin before the night.",
    accent: "#8b7355",
    bg: "rgba(139,115,85,0.07)",
    border: "rgba(139,115,85,0.2)",
  },
  during: {
    label: "Weekend",
    sublabel: "Saturday",
    headline: "A few things worth remembering.",
    accent: "#8b7355",
    bg: "rgba(139,115,85,0.07)",
    border: "rgba(139,115,85,0.2)",
  },
  after: {
    label: "Recovery Day",
    sublabel: "Sunday",
    headline: "Your skin needs a quiet day.",
    accent: "#6e8a72",
    bg: "rgba(122,144,112,0.07)",
    border: "rgba(122,144,112,0.2)",
  },
};

function WeekendNudgeCard({ products, activeMap }) {
  const phase = getWeekendPhase();
  if (!phase) return null;

  const cfg = WEEKEND_PHASE_CONFIG[phase];
  const advice = buildWeekendAdvice(phase, products, activeMap);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div style={{ marginBottom: 20, background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 16, padding: "18px 20px 16px", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: cfg.accent }}>{cfg.label}</span>
          <p style={{ fontFamily: "var(--font-body)", fontStyle: "italic", fontSize: 24, fontWeight: 400, color: "var(--parchment)", margin: "2px 0 0", lineHeight: 1.25, letterSpacing: "0.005em" }}>{cfg.headline}</p>
        </div>
        <button onClick={() => setDismissed(true)} style={{ background: "none", border: "none", color: "var(--clay)", opacity: 0.35, cursor: "pointer", padding: "2px 4px", display: "inline-flex" }}><Icon name="x" size={12} /></button>
      </div>
      {advice.skip.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {advice.skip.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <span style={{ color: "#8b7355", fontSize: 10, flexShrink: 0, marginTop: 1 }}>—</span>
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: 0, lineHeight: 1.6 }}>{s}</p>
            </div>
          ))}
        </div>
      )}
      {advice.do.map((s, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          <span style={{ color: cfg.accent, fontSize: 10, flexShrink: 0, marginTop: 1 }}>+</span>
          <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: 0, lineHeight: 1.6 }}>{s}</p>
        </div>
      ))}
    </div>
  );
}

export { WeekendNudgeCard };