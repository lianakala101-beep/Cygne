import { useState } from "react";
import { Icon } from "./components.jsx";
import { hasSPFCoverage } from "./engine.js";

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
    accent: "#2d3d2b",
    bg: "rgba(45,61,43,0.07)",
    border: "rgba(45,61,43,0.2)",
    headline: "Skin is recovering. UV is rising.",
    body: "Barrier resilience returns as humidity climbs. Spring is the right window to reintroduce or increase actives — but SPF becomes non-negotiable.",
    shelfNudge: (products, activeMap) => {
      const hasSPF     = hasSPFCoverage(products, activeMap);
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
      const hasSPF       = hasSPFCoverage(products, activeMap);
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

// Pre-empts the season-specific shelf nudge with climate + environment
// signals from onboarding when those create a more pressing message than
// the seasonal default. Returns null if no profile context applies, in
// which case the seasonal nudge is used as-is.
function getProfileNudge(season, products, activeMap, user) {
  const skinProfile = user?.skinProfile || {};
  const climate = (skinProfile.climate || "").toLowerCase();
  const environment = (skinProfile.environment || "").toLowerCase();
  const hasHA = !!activeMap["hyaluronic acid"]?.length;
  const hasCeramides = products.some(p => (p.ingredients || []).some(i => i.includes("ceramide")));
  const hasSPF = hasSPFCoverage(products, activeMap);

  // Outdoor lifestyle is the strongest override — UV beats every other angle.
  if (environment === "outdoors" && !hasSPF) {
    return "You spend most of your day outdoors and there's no SPF in your vanity. UV exposure compounds — this is the single most consequential gap in your routine right now.";
  }

  // Dry/cold climate compounds winter dryness — call it out specifically.
  if (season === "winter" && (climate === "dry" || climate === "cold") && !hasCeramides && !hasHA) {
    return `Winter on top of a ${climate} climate means barrier loss accelerates. A humectant + ceramide pairing should outrank any active introduction until skin stabilizes.`;
  }

  // Tropical/humid climate in summer — lean lighter textures.
  if (season === "summer" && (climate === "tropical" || climate === "humid")) {
    if (!hasSPF) return "Tropical summer with no SPF is the highest-risk combination for cumulative UV damage. SPF first, every other change second.";
    return "Your humid climate doesn't need heavy occlusives in summer. Lean on hydrating gels and lightweight SPF — your skin's own sebum is doing more sealing than you think.";
  }

  // Indoor + dry climate often means HVAC dehydration year-round.
  if (environment === "indoors" && climate === "dry" && !hasHA) {
    return "Indoor heating or AC plus a dry climate dehydrates skin year-round, not just in winter. A hyaluronic-acid layer applied on damp skin compounds with whatever else you're using.";
  }

  return null;
}

function SeasonalNudgeCard({ products, activeMap, user, lineMode = false }) {
  const season = getSeason();
  const cfg = SEASON_CONFIG[season];
  const [open, setOpen] = useState(false);

  const profileNudge = getProfileNudge(season, products, activeMap, user);
  const nudge = profileNudge || cfg.shelfNudge(products, activeMap);

  // Editorial line treatment for the dark homepage canvas — no card chrome,
  // just label + headline + thin ivory rule, with the body content
  // revealing inline on tap.
  if (lineMode) {
    return (
      <div style={{ borderTop: "1px solid rgba(250,249,244,0.25)", borderBottom: "1px solid rgba(250,249,244,0.25)", marginTop: -1, padding: "18px 0" }}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          style={{
            display: "flex", width: "100%", textAlign: "center",
            flexDirection: "column", gap: 8,
            background: "none", border: "none", padding: 0, cursor: "pointer",
            WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
            position: "relative",
          }}>
          <span style={{
            fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 11,
            letterSpacing: "0.22em", textTransform: "uppercase",
            color: "var(--color-ivory, #faf9f4)",
            whiteSpace: "nowrap",
          }}>{cfg.label}</span>
          <span style={{
            width: "100%",
            fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 400,
            letterSpacing: "0.04em",
            color: "var(--color-ivory, #faf9f4)",
            opacity: 0.85,
            lineHeight: 1.4,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{cfg.headline}</span>
          <span style={{
            position: "absolute", right: 0, top: "50%", transform: `translateY(-50%) ${open ? "rotate(90deg)" : "none"}`,
            color: "var(--color-ivory, #faf9f4)", opacity: 0.7,
            transition: "transform 0.2s",
            display: "inline-flex",
          }}><Icon name="chevron" size={11} /></span>
        </button>
        {open && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(250,249,244,0.18)", textAlign: "center" }}>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--color-ivory, #faf9f4)", opacity: 0.85, margin: "0 0 8px", lineHeight: 1.65 }}>{cfg.body}</p>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--color-ivory, #faf9f4)", opacity: 0.85, margin: 0, lineHeight: 1.65 }}>{nudge}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      background: "var(--color-inky-moss, #2d3d2b)",
      border: "none",
      borderRadius: 8,
      padding: "14px 16px",
      marginBottom: 20,
      position: "relative",
      overflow: "hidden",
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{
          display: "flex", width: "100%", textAlign: "left",
          alignItems: "center", gap: 12,
          background: "none", border: "none", padding: 0,
          cursor: "pointer",
          WebkitAppearance: "none", appearance: "none",
          WebkitTapHighlightColor: "transparent",
        }}>
        <span style={{
          fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 11,
          letterSpacing: "0.22em", textTransform: "uppercase",
          color: "var(--color-ivory, #faf9f4)",
          background: "rgba(250,249,244,0.15)",
          padding: "3px 8px", borderRadius: 2,
          flexShrink: 0, whiteSpace: "nowrap",
        }}>{cfg.label}</span>
        <span style={{
          flex: 1, minWidth: 0,
          fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 400,
          letterSpacing: "0.02em",
          color: "var(--color-ivory, #faf9f4)",
          lineHeight: 1.4,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{cfg.headline}</span>
        <span style={{
          color: "var(--color-ivory, #faf9f4)", opacity: 0.7,
          transform: open ? "rotate(90deg)" : "none",
          transition: "transform 0.2s",
          display: "inline-flex", flexShrink: 0,
        }}><Icon name="chevron" size={11} /></span>
      </button>
      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(250,249,244,0.18)" }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--color-ivory, #faf9f4)", margin: "0 0 8px", lineHeight: 1.65 }}>{cfg.body}</p>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--color-ivory, #faf9f4)", margin: 0, lineHeight: 1.65 }}>{nudge}</p>
        </div>
      )}
    </div>
  );
}


export { SeasonalNudgeCard, getSeason, getSeasonForUser };