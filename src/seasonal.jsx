import { useState } from "react";
import { Icon } from "./components.jsx";

// --- SEASONAL NUDGE -----------------------------------------------------------

function getSeason(hemisphere = "north") {
  const m = new Date().getMonth(); // 0-indexed
  if (hemisphere === "south") {
    // Flip seasons for southern hemisphere
    if (m <= 1 || m === 11) return "summer";
    if (m <= 4)  return "fall";
    if (m <= 7)  return "winter";
    return "spring";
  }
  if (m <= 1 || m === 11) return "winter";
  if (m <= 4)  return "spring";
  if (m <= 7)  return "summer";
  return "fall";
}

function getHemisphere(locationData) {
  // Use latitude from locationData if available
  if (locationData?.lat !== undefined) {
    return locationData.lat >= 0 ? "north" : "south";
  }
  // Try to infer from country code
  const southernCountries = ["AU", "NZ", "AR", "CL", "BR", "ZA", "PE", "BO", "PY", "UY"];
  if (locationData?.country && southernCountries.includes(locationData.country.toUpperCase())) {
    return "south";
  }
  return "north"; // default
}

function getSeasonForUser(locationData) {
  return getSeason(getHemisphere(locationData));
}

const SEASON_CONFIG = {
  winter: {
    label: "Winter",
    iconName: "snow",
    accent: "#8b7355",
    bg: "rgba(139,115,85,0.07)",
    border: "rgba(139,115,85,0.2)",
    headline: "Your barrier works hardest now.",
    body: "Cold air and heating strip moisture faster than any other season. Skin needs more occlusion, less exfoliation.",
    shelfNudge: (products, activeMap) => {
      const exfoliants = products.filter(p => p.category === "Exfoliant" || activeMap["AHA"]?.some(a => a.id === p.id) || activeMap["BHA"]?.some(a => a.id === p.id));
      const hasCeramide = products.some(p => (p.ingredients || []).some(i => i.includes("ceramide")));
      const hasSqualane = products.some(p => (p.ingredients || []).some(i => i.includes("squalane")));
      const hasRetinol  = !!activeMap["retinol"]?.length;
      if (exfoliants.length > 1) return `You have ${exfoliants.length} exfoliants active. Consider dropping to one session per week through winter — barrier recovery is slower in the cold.`;
      if (!hasCeramide && !hasSqualane) return "Your vanity is missing a ceramide or occlusive. Winter is the season they matter most.";
      if (hasRetinol) return "Retinol tolerance drops in winter. If you're seeing more flaking, reduce frequency before increasing strength.";
      return "Your vanity is well-set for winter. Prioritize moisture-first layering — humectant before occlusive, every time.";
    }
  },
  spring: {
    label: "Spring",
    iconName: "leaf",
    accent: "#7a9070",
    bg: "rgba(122,144,112,0.07)",
    border: "rgba(122,144,112,0.2)",
    headline: "Skin is recovering. UV is rising.",
    body: "Barrier resilience returns as humidity climbs. Spring is the right window to reintroduce or increase actives — but SPF becomes non-negotiable.",
    shelfNudge: (products, activeMap) => {
      const hasSPF     = products.some(p => p.category === "SPF") || !!activeMap["SPF"]?.length;
      const hasRetinol = !!activeMap["retinol"]?.length;
      const hasVitC    = !!activeMap["vitamin C"]?.length;
      if (!hasSPF) return "No SPF in your vanity. UV index is climbing — this is the most important product you're missing right now.";
      if (!hasVitC && hasRetinol) return "Spring is an ideal time to add Vitamin C to your AM routine. UV protection compounds with antioxidant coverage.";
      if (hasRetinol) return "If you reduced retinol frequency over winter, spring is the right window to return to your normal schedule.";
      return "Good active coverage for spring. Keep SPF consistent — UV increases 10% per month through to summer.";
    }
  },
  summer: {
    label: "Summer",
    iconName: "sun",
    accent: "#8b7355",
    bg: "rgba(139,115,85,0.07)",
    border: "rgba(139,115,85,0.2)",
    headline: "Heat changes everything.",
    body: "Humidity is up and sebum production rises with temperature. Heavier textures can clog. SPF degrades faster in heat.",
    shelfNudge: (products, activeMap) => {
      const hasSPF       = products.some(p => p.category === "SPF") || !!activeMap["SPF"]?.length;
      const hasHeavyMoisturizer = products.some(p => p.category === "Moisturizer" && (p.price || 0) > 40);
      const hasBHA       = !!activeMap["BHA"]?.length;
      const hasRetinol   = !!activeMap["retinol"]?.length;
      if (!hasSPF) return "No SPF detected. Summer UV is at peak intensity — skip no day.";
      if (hasRetinol && !hasBHA) return "Heat can amplify retinol sensitivity. If you're outdoors often, consider alternating with a BHA to manage congestion without increasing irritation risk.";
      if (hasHeavyMoisturizer) return "If your moisturizer feels heavy in the heat, it's okay to use less or swap to a lighter texture. Your skin's own sebum is compensating.";
      return "Reapply SPF every 2 hours outdoors — no product lasts longer than that in direct sun. Everything else on your vanity looks appropriate for summer.";
    }
  },
  fall: {
    label: "Fall",
    iconName: "moon",
    accent: "#8b7355",
    bg: "rgba(139,115,85,0.07)",
    border: "rgba(139,115,85,0.2)",
    headline: "The transition window.",
    body: "Skin shifts from oily summer mode back toward dry. This is the most strategic season to reintroduce or strengthen actives before winter.",
    shelfNudge: (products, activeMap) => {
      const hasRetinol = !!activeMap["retinol"]?.length;
      const hasAHA     = !!activeMap["AHA"]?.length;
      const hasCeramide = products.some(p => (p.ingredients || []).some(i => i.includes("ceramide")));
      if (!hasRetinol && hasAHA) return "Fall is the ideal window to introduce retinol if you've been considering it. Skin is resilient but UV pressure is easing.";
      if (hasRetinol) return "If you paused or reduced retinol in summer, fall is your window to rebuild frequency before barrier stress peaks in winter.";
      if (!hasCeramide) return "Start adding ceramide coverage now. Barrier support is easier to build before winter than to repair during it.";
      return "Use this window to solidify your ritual. What works well in fall tends to carry you through winter with fewer adjustments.";
    }
  }
};

function SeasonalNudgeCard({ products, activeMap }) {
  const season = getSeason();
  const cfg = SEASON_CONFIG[season];
  const [dismissed, setDismissed] = useState(false);
  const [fading, setFading] = useState(false);

  const nudge = cfg.shelfNudge(products, activeMap);

  const handleDismiss = () => {
    setFading(true);
    setTimeout(() => setDismissed(true), 360);
  };

  if (dismissed) return null;

  return (
    <div style={{
      opacity: fading ? 0 : 1,
      transform: fading ? "translateY(-4px)" : "none",
      transition: "opacity 0.36s ease, transform 0.36s ease",
      marginBottom: 20,
    }}>
      <div style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderRadius: 16,
        padding: "18px 20px 16px",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Subtle season glyph watermark */}
        <div style={{ position: "absolute", top: 8, right: 14, opacity: 0.08, color: cfg.accent, userSelect: "none", pointerEvents: "none", display: "inline-flex" }}><Icon name={cfg.iconName} size={72} /></div>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ color: cfg.accent, opacity: 0.8, display: "inline-flex" }}><Icon name={cfg.iconName} size={11} /></span>
          <span style={{ fontFamily: "var(--sans)", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: cfg.accent }}>{cfg.label}</span>
          <div style={{ flex: 1 }} />
          <button onClick={handleDismiss} style={{ background: "none", border: "none", color: "var(--clay)", opacity: 0.35, cursor: "pointer", padding: "2px 4px", transition: "opacity 0.2s", display: "inline-flex" }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.7"}
            onMouseLeave={e => e.currentTarget.style.opacity = "0.35"}><Icon name="x" size={12} /></button>
        </div>

        {/* Headline */}
        <p style={{ fontFamily: "var(--script)", fontSize: 22, fontWeight: 400, color: "var(--parchment)", margin: "0 0 6px", letterSpacing: "0.01em", lineHeight: 1.3 }}>{cfg.headline}</p>

        {/* Body */}
        <p style={{ fontFamily: "var(--sans)", fontSize: 11, color: "var(--clay)", margin: "0 0 12px", lineHeight: 1.65 }}>{cfg.body}</p>

        {/* Shelf-specific nudge */}
        <div style={{ padding: "11px 14px", background: "rgba(0,0,0,0.12)", borderRadius: 10, borderLeft: "2px solid " + cfg.accent }}>
          <p style={{ fontFamily: "var(--sans)", fontSize: 11, color: "var(--parchment)", margin: 0, lineHeight: 1.65 }}>{nudge}</p>
        </div>
      </div>
    </div>
  );
}


export { SeasonalNudgeCard, getSeason, getSeasonForUser };