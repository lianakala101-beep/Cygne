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
  before: { label: "The Weekend Is Near", headline: "Prep your skin before the night." },
  during: { label: "Weekend",             headline: "A few things worth remembering." },
  after:  { label: "Recovery Day",        headline: "Your skin needs a quiet day." },
};

function WeekendNudgeCard({ products, activeMap }) {
  const phase = getWeekendPhase();
  if (!phase) return null;

  const cfg = WEEKEND_PHASE_CONFIG[phase];
  const advice = buildWeekendAdvice(phase, products, activeMap);

  return (
    <div style={{
      background: "radial-gradient(circle at 85% 15%, rgba(45,61,43,0.06) 0%, rgba(45,61,43,0.02) 35%, transparent 65%), var(--color-ivory-shadow)",
      border: "1px solid rgba(192,192,192,0.25)",
      borderRadius: 12,
      boxShadow: "0 4px 24px rgba(0,0,0,0.05)",
      padding: "14px 16px",
      marginBottom: 20,
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <span style={{
          fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 9,
          letterSpacing: "0.22em", textTransform: "uppercase",
          color: "var(--color-inky-moss)",
          background: "rgba(45,61,43,0.10)",
          padding: "3px 8px", borderRadius: 2,
          flexShrink: 0, whiteSpace: "nowrap",
        }}>{cfg.label}</span>
        <span style={{
          flex: 1, minWidth: 0,
          fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 400,
          letterSpacing: "0.02em",
          color: "var(--color-inky-moss)",
          lineHeight: 1.4,
        }}>{cfg.headline}</span>
      </div>
      {advice.skip.map((s, i) => (
        <p key={"s" + i} style={{
          fontFamily: "var(--font-body)", fontSize: 12,
          color: "var(--color-inky-moss)", margin: i === 0 ? "0 0 8px" : "0 0 8px",
          lineHeight: 1.65,
        }}>{s}</p>
      ))}
      {advice.do.map((s, i) => (
        <p key={"d" + i} style={{
          fontFamily: "var(--font-body)", fontSize: 12,
          color: "var(--color-inky-moss)",
          margin: i === advice.do.length - 1 ? 0 : "0 0 8px",
          lineHeight: 1.65,
        }}>{s}</p>
      ))}
    </div>
  );
}

export { WeekendNudgeCard };