import { useState } from "react";
import { Icon, Section } from "./components.jsx";
import { detectActives, analyzeShelf } from "./engine.js";


function buildRecommendations(products, activeMap, conflicts, user = {}) {
  const recs = [];
  const cats = new Set(products.map(p => p.category));
  const serumCount = products.filter(p => p.category === "Serum").length;
  const hasRetinol = !!activeMap["retinol"];
  const hasVitC = !!activeMap["vitamin C"];
  const hasAHA = !!activeMap["AHA"];
  const hasBHA = !!activeMap["BHA"];
  const hasHA = !!activeMap["hyaluronic acid"];
  const hasCeramides = !!activeMap["ceramides"];
  const hasSPF = cats.has("SPF") || !!activeMap["SPF"];
  const hasMoisturizer = cats.has("Moisturizer");
  const hasCleanser = cats.has("Cleanser");
  const hasEyeCream = cats.has("Eye Cream");
  const hasPeptides = !!activeMap["peptides"];
  const hasExfoliant = cats.has("Exfoliant") || hasAHA || hasBHA;

  // -- ADDITIONS -------------------------------------------------------------
  if (!hasSPF) recs.push({
    type: "addition", priority: 1,
    title: "Add daily SPF",
    body: "No sun protection found. SPF is the single most evidence-backed step for preventing premature aging and skin damage — it belongs in every AM ritual.",
    tag: "Essential", tagColor: "#c4a060", category: "SPF", trigger: "missing-spf", cygne: true,
    note: "Look for SPF 30–50, broad spectrum. Mineral or chemical — find one you'll actually use daily.",
  });

  if (!hasCleanser) recs.push({
    type: "addition", priority: 2,
    title: "Add a gentle cleanser",
    body: "No cleanser detected. A pH-balanced cleanser removes pollutants and preps skin so your actives absorb properly — without stripping the barrier.",
    tag: "Essential", tagColor: "#c4a060", category: "Cleanser", trigger: "missing-cleanser", cygne: true,
    note: "Choose a low-pH, sulfate-free formula. Gel for oilier skin, cream or milk for drier.",
  });

  if (!hasMoisturizer) recs.push({
    type: "addition", priority: 3,
    title: "Add a moisturizer",
    body: "Without a moisturizer, actives can over-penetrate and cause irritation. A moisturizer seals in hydration and supports the skin barrier after every step.",
    tag: "Essential", tagColor: "#c4a060", category: "Moisturizer", trigger: "missing-moisturizer", cygne: true,
    note: "A fragrance-free ceramide cream or gel moisturizer works for most skin types.",
  });

  if (!hasVitC && products.length >= 2) recs.push({
    type: "addition", priority: 4,
    title: "Consider a Vitamin C serum (AM)",
    body: "No antioxidant protection detected in your ritual. A stable Vitamin C serum each morning shields against free radical damage and supports brightness over time.",
    tag: "Recommended", tagColor: "#7a9070", category: "Serum", trigger: "missing-vitc", cygne: true,
    note: "Apply after cleansing, before moisturizer and SPF. Start with 10–15% L-ascorbic acid.",
  });

  if (!hasRetinol && products.length >= 3) recs.push({
    type: "addition", priority: 5,
    title: "Consider a retinoid (PM)",
    body: "No retinoid detected. Retinoids remain the most studied active for cell turnover, texture, fine lines, and long-term skin health. Worth building into a PM ritual.",
    tag: "Recommended", tagColor: "#7a9070", category: "Serum", trigger: "missing-retinol", cygne: true,
    note: "Start with retinol 0.025–0.1% two nights per week. Introduce gradually to avoid purging.",
  });

  if ((hasRetinol || hasAHA || hasBHA) && !hasHA && !hasCeramides) recs.push({
    type: "addition", priority: 6,
    title: "Add a barrier-support serum",
    body: "You're using active exfoliants or retinoids without any humectant or ceramide support. This increases transepidermal water loss (TEWL) and may slowly compromise your barrier.",
    tag: "Recommended", tagColor: "#7a9070", category: "Serum", trigger: "missing-barrier-serum", cygne: true,
    note: "A hyaluronic acid or ceramide serum applied before moisturizer on active nights.",
  });

  if (!hasEyeCream && products.length >= 4) recs.push({
    type: "addition", priority: 7,
    title: "Consider an eye cream",
    body: "The skin around the eyes is significantly thinner. A dedicated eye product prevents milia and accidental irritation from actives that migrate during application.",
    tag: "Optional", tagColor: "#8a8278", category: "Eye Cream", trigger: "missing-eye-cream", cygne: true,
    note: "Apply with your ring finger using a gentle tapping motion. Peptide or caffeine formulas work well.",
  });

  // -- SWAPS -----------------------------------------------------------------
  const vitCRetinolConflict = conflicts.some(c => c.pair.includes("retinol") && c.pair.includes("vitamin C"));
  if (vitCRetinolConflict) recs.push({
    type: "swap", priority: 1,
    title: "Split Vitamin C and Retinol by session",
    body: "You have both in your ritual — they work better and safer apart. Vitamin C is a morning antioxidant. Retinol is a nighttime regenerator. Layering them wastes both.",
    tag: "Conflict Fix", tagColor: "#c49040", trigger: "vitc-retinol-split",
    action: "Move Vitamin C exclusively to AM. Use retinol PM only. Never layer same session.",
    cygne: false,
  });

  const ahaRetinolConflict = conflicts.some(c => c.pair.includes("retinol") && (c.pair.includes("AHA") || c.pair.includes("BHA")));
  if (ahaRetinolConflict) recs.push({
    type: "swap", priority: 2,
    title: "Alternate retinol and exfoliant nights",
    body: "Retinol and acid exfoliants on the same night will over-process your skin. Each is effective alone — combined nightly, they break down barrier integrity.",
    tag: "Conflict Fix", tagColor: "#c49040", trigger: "aha-retinol-alternate",
    action: "Retinol Mon / Wed / Fri. Exfoliant Tue / Thu. Leave weekends barrier-free.",
    cygne: false,
  });

  if (serumCount > 3) recs.push({
    type: "swap", priority: 3,
    title: "Consolidate your serum stack",
    body: `You have ${serumCount} serums. Layering more than 2–3 active serums causes pilling, reduces absorption of each, and adds unnecessary actives that can conflict.`,
    tag: "Simplify", tagColor: "#7a9070", trigger: "consolidate-serums",
    action: "Identify which actives overlap. Keep the best-formulated product per active. Retire duplicates.",
    cygne: false,
  });

  // -- SKIN TYPE & CONCERN RULES --------------------------------------------
  const skinType = user.skinType || "";
  const concerns = user.concerns || [];

  if (skinType === "Dry" || concerns.includes("Dehydration")) {
    if (!hasCeramides) recs.push({
      type: "addition", priority: 4,
      title: "Add a ceramide moisturizer",
      body: "Dry skin loses moisture faster than it can replenish. Ceramides rebuild the lipid barrier that holds water in — they're not optional for dry skin types.",
      tag: "Dry Skin", tagColor: "#8aa8c4", category: "Moisturizer", trigger: "dry-missing-ceramide", cygne: true,
      note: "Look for ceramides NP, AP, or EOP in the ingredients list. CeraVe, La Roche-Posay, and Avène are reliable.",
    });
  }

  if (skinType === "Oily" || concerns.includes("Acne")) {
    if (!hasBHA) recs.push({
      type: "addition", priority: 4,
      title: "Add a BHA exfoliant",
      body: "Salicylic acid is oil-soluble — it penetrates the pore lining where congestion starts. For oily or acne-prone skin it's the most targeted active available OTC.",
      tag: skinType === "Oily" ? "Oily Skin" : "Acne", tagColor: "#c49040", category: "Exfoliant", trigger: "oily-missing-bha", cygne: true,
      note: "2% salicylic acid, used 2–3× per week. Paula's Choice BHA is the benchmark.",
    });
  }

  if (concerns.includes("Hyperpigmentation")) {
    if (!hasVitC) recs.push({
      type: "addition", priority: 4,
      title: "Add Vitamin C for hyperpigmentation",
      body: "Vitamin C inhibits melanin production at the source. For hyperpigmentation concerns it's the most evidence-backed brightening active — especially paired with SPF.",
      tag: "Hyperpigmentation", tagColor: "#c4a060", category: "Serum", trigger: "hyper-missing-vitc", cygne: true,
      note: "L-ascorbic acid 10–20% is most effective. Keep it in the fridge and replace when it turns orange.",
    });
    if (!hasSPF) recs.push({
      type: "addition", priority: 1,
      title: "SPF is essential for hyperpigmentation",
      body: "Without daily SPF, UV exposure reverses brightening progress every morning. SPF is not optional when treating pigmentation — it's half the treatment.",
      tag: "Hyperpigmentation", tagColor: "#c4a060", category: "SPF", trigger: "hyper-missing-spf", cygne: true,
      note: "SPF 50 broad-spectrum. Reapply every 2 hours outdoors.",
    });
  }

  if (skinType === "Sensitive" || concerns.includes("Redness") || concerns.includes("Sensitivity")) {
    const activeCount = Object.keys(activeMap).length;
    if (activeCount >= 3) recs.push({
      type: "simplify", priority: 1,
      title: "Reduce active load for sensitive skin",
      body: "Sensitive skin has a lower threshold for irritation. Running multiple actives simultaneously increases the risk of barrier disruption — simplifying is not a step back.",
      tag: "Sensitive Skin", tagColor: "#9a8070", trigger: "sensitive-reduce-actives",
      note: "Identify your one highest-priority active and hold others until skin is stable.",
    });
    if (!hasCeramides) recs.push({
      type: "addition", priority: 4,
      title: "Add ceramides for barrier support",
      body: "Sensitive skin typically has a compromised barrier that allows irritants in. Ceramides are the primary repair ingredient — they rebuild the barrier from the inside out.",
      tag: "Sensitive Skin", tagColor: "#9a8070", category: "Moisturizer", trigger: "sensitive-missing-ceramide", cygne: true,
      note: "Fragrance-free formula essential. CeraVe Moisturizing Cream is a reliable baseline.",
    });
  }

  if (concerns.includes("Fine lines")) {
    if (!hasRetinol) recs.push({
      type: "addition", priority: 4,
      title: "Consider introducing a retinoid",
      body: "Retinoids are the most studied active for fine lines — they accelerate cell turnover and stimulate collagen production. Nothing else comes close in terms of evidence.",
      tag: "Fine Lines", tagColor: "#9a8070", category: "Serum", trigger: "finelines-missing-retinol", cygne: true,
      note: "Start at 0.025–0.05% retinol, 1–2× per week. Expect a 12-week adjustment period.",
    });
  }

  if (concerns.includes("Texture")) {
    if (!hasAHA && !hasBHA) recs.push({
      type: "addition", priority: 4,
      title: "Add a chemical exfoliant for texture",
      body: "Texture is primarily a cell turnover issue. AHA (glycolic, lactic) dissolves the bonds between dead skin cells and resurfaces the top layer — physical scrubs can't match this.",
      tag: "Texture", tagColor: "#9a8070", category: "Exfoliant", trigger: "texture-missing-exfoliant", cygne: true,
      note: "Lactic acid 5–10% is gentler and a good starting point. Use 2–3× per week, PM only.",
    });
  }

  // -- SIMPLIFICATIONS -------------------------------------------------------
  const niaCounts = (activeMap["niacinamide"] || []).length;
  if (niaCounts >= 3) recs.push({
    type: "simplify", priority: 1,
    title: `Reduce niacinamide sources (${niaCounts} products)`,
    body: "Niacinamide is beneficial at 2–10%, but accumulating it across multiple products pushes cumulative concentration higher than needed and adds cost without benefit.",
    tag: "Simplify", tagColor: "#7a9070", trigger: "reduce-niacinamide",
    action: "Keep one dedicated niacinamide product. Let others be supporting ingredients elsewhere.",
    cygne: false,
  });

  if (hasAHA && hasBHA) recs.push({
    type: "simplify", priority: 2,
    title: "Choose one exfoliant type",
    body: "AHA (glycolic/lactic acid) works on the skin surface. BHA (salicylic) works inside pores. Both daily is excessive. Rotate, or choose the one that addresses your primary concern.",
    tag: "Simplify", tagColor: "#7a9070", trigger: "choose-exfoliant",
    action: "Oily / acne-prone: lean BHA. Texture / dullness: lean AHA. Use the other max 1× per week.",
    cygne: false,
  });

  if (hasPeptides && hasRetinol) recs.push({
    type: "simplify", priority: 3,
    title: "Separate peptides from retinol",
    body: "Some research suggests retinol may reduce peptide efficacy when layered. They're both valuable — but work better in different sessions or on alternating nights.",
    tag: "Optimize", tagColor: "#7a9070", trigger: "separate-peptides-retinol",
    action: "Use peptides AM or on non-retinol nights for maximum benefit from both.",
    cygne: false,
  });

  return recs.sort((a, b) => {
    const typeOrder = { addition: 0, swap: 1, simplify: 2 };
    return (typeOrder[a.type] - typeOrder[b.type]) || (a.priority - b.priority);
  });
}

// --- MY ROUTINE ---------------------------------------------------------------

function RecommendationCard({ rec, onAdd, onDismiss }) {
  const [expanded, setExpanded] = useState(false);
  const typeIcon = { addition: "plus", swap: "layers", simplify: "drop" };
  const typeLabelMap = { addition: "Add", swap: "Swap", simplify: "Simplify" };

  return (
    <div onClick={() => setExpanded(e => !e)}
      style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "15px 17px", marginBottom: 8, cursor: "pointer", transition: "border-color 0.2s" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(122,144,112,0.4)"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(122,144,112,0.10)", border: "1px solid rgba(122,144,112,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#7a9070", marginTop: 1 }}>
          <Icon name={typeIcon[rec.type]} size={12} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 9, fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: rec.tagColor, background: `${rec.tagColor}18`, padding: "2px 7px", borderRadius: 20 }}>{rec.tag}</span>
            <span style={{ fontSize: 9, fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.11em", textTransform: "uppercase", color: "var(--clay)", opacity: 0.55 }}>{typeLabelMap[rec.type]}</span>
          </div>
          <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 13, color: "var(--parchment)", margin: 0, fontWeight: 500, lineHeight: 1.35 }}>{rec.title}</p>
        </div>
        <span style={{ color: "var(--clay)", opacity: 0.35, flexShrink: 0, marginTop: 5, display: "inline-block", transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
          <Icon name="chevron" size={13} />
        </span>
        {onDismiss && (
          <button onClick={e => { e.stopPropagation(); onDismiss(); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clay)", opacity: 0.3, padding: "0 0 0 2px", flexShrink: 0, marginTop: 3, fontSize: 15, lineHeight: 1 }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.65"}
            onMouseLeave={e => e.currentTarget.style.opacity = "0.3"}
            title="Dismiss">×</button>
        )}
      </div>
      {expanded && (
        <div style={{ marginTop: 13, paddingTop: 13, borderTop: "1px solid var(--border)" }}>
          <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 12, color: "var(--clay)", margin: "0 0 10px", lineHeight: 1.65 }}>{rec.body}</p>
          {rec.action && (
            <div style={{ display: "flex", gap: 8, padding: "9px 12px", background: "rgba(122,144,112,0.06)", borderRadius: 9, border: "1px solid rgba(122,144,112,0.14)", marginBottom: 8 }}>
              <span style={{ color: "#7a9070", flexShrink: 0, marginTop: 1 }}><Icon name="check" size={11} /></span>
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--parchment)", margin: 0, lineHeight: 1.6 }}>{rec.action}</p>
            </div>
          )}
          {rec.note && (
            <div style={{ display: "flex", gap: 8, padding: "9px 12px", background: "var(--surface)", borderRadius: 9, border: "1px solid var(--border)", marginBottom: 8 }}>
              <span style={{ color: "var(--clay)", opacity: 0.45, flexShrink: 0, marginTop: 1 }}><Icon name="info" size={11} /></span>
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: 0, lineHeight: 1.6 }}>{rec.note}</p>
            </div>
          )}
          {rec.type === "addition" && rec.category && onAdd && (
            <button
              onClick={e => { e.stopPropagation(); onAdd(rec.category); }}
              style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, padding: "8px 14px", background: "rgba(122,144,112,0.10)", border: "1px solid rgba(122,144,112,0.30)", borderRadius: 9, cursor: "pointer", transition: "background 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(122,144,112,0.18)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(122,144,112,0.10)"}>
              <Icon name="plus" size={11} color="#7a9070" />
              <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, fontWeight: 600, color: "#7a9070", letterSpacing: "0.08em", textTransform: "uppercase" }}>Add {rec.category} to vanity</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// -- Refinements Engine ------------------------------------------------------
function buildRefinements(products, activeMap, conflicts) {
  const cats = products.reduce((acc, p) => { acc[p.category] = (acc[p.category] || []); acc[p.category].push(p); return acc; }, {});
  const refinements = [];
  const pName = p => p ? [p.brand, p.name].filter(Boolean).join(" ") : null;

  // -- 1. REMOVE -------------------------------------------------------------
  Object.entries(cats).forEach(([cat, prods]) => {
    if (prods.length > 1 && !["Serum"].includes(cat)) {
      const names = prods.map(p => pName(p)).filter(Boolean);
      refinements.push({
        verb: "Remove", verbColor: "#c06060", icon: "trash",
        title: `You have ${prods.length} ${cat.toLowerCase()}s`,
        body: `${names.join(" and ")} are both ${cat.toLowerCase()}s in your ritual. Layering two adds no benefit and can overload the skin — one is always enough.`,
        action: `Keep the one you prefer. Remove the other, or save it for travel.`,
        trigger: `duplicate-${cat.toLowerCase().replace(/\s+/g, "-")}`,
        product: prods[1],
      });
    }
  });

  const overloadActiveKeys = Object.keys(activeMap).filter(a => ["retinol","AHA","BHA","vitamin C","benzoyl peroxide"].includes(a));
  const activeCount = overloadActiveKeys.length;

  conflicts.filter(c => c.severity === "warning").forEach(c => {
    const p0 = (activeMap[c.pair[0]] || [])[0];
    const p1 = (activeMap[c.pair[1]] || [])[0];
    const p0Label = pName(p0) || c.pair[0];
    const p1Label = pName(p1) || c.pair[1];
    refinements.push({
      verb: "Remove", verbColor: "#c06060", icon: "trash",
      title: `${p0Label} and ${p1Label} are fighting each other`,
      body: `${c.pair[0]} and ${c.pair[1]} used in the same ritual reduce each other's efficacy and risk barrier damage. ${c.reason}`,
      action: `Move one to a separate session or remove it entirely — they work much better apart.`,
      trigger: `conflict-${[...c.pair].sort().join("-")}`,
      product: p0 || null,
    });
  });

  if (activeCount >= 3) {
    const activeSummary = overloadActiveKeys
      .map(a => { const p = (activeMap[a] || [])[0]; return pName(p) ? `${pName(p)} (${a})` : a; })
      .join(", ");
    refinements.push({
      verb: "Remove", verbColor: "#c06060", icon: "trash",
      title: `${activeCount} potent actives running simultaneously`,
      body: `You're running ${activeSummary}. That's more than most barriers can recover from between sessions — even without obvious day-to-day reactions.`,
      action: "Run 1–2 actives per session. Rotate the others on separate days or evenings.",
      trigger: "overload",
    });
  }

  // -- 2. REDUCE FREQUENCY ---------------------------------------------------
  const hasRetinol = !!activeMap["retinol"];
  const hasAHA = !!activeMap["AHA"];
  const hasBHA = !!activeMap["BHA"];

  if (hasRetinol && (hasAHA || hasBHA)) {
    const retinolProduct = (activeMap["retinol"] || [])[0];
    const exfoliantKey = hasBHA ? "BHA" : "AHA";
    const exfoliantProduct = (activeMap[exfoliantKey] || [])[0];
    const retinolName = pName(retinolProduct) || "your retinoid";
    const exfoliantName = pName(exfoliantProduct) || `your ${exfoliantKey}`;
    refinements.push({
      verb: "Reduce Frequency", verbColor: "#c49040", icon: "clock",
      title: `${retinolName} and ${exfoliantName} are both PM`,
      body: `Using a retinoid and an exfoliant in the same session — or on back-to-back nights — is the most common cause of barrier compromise. Each needs recovery time before the next use.`,
      action: `${retinolName}: Mon / Wed / Fri. ${exfoliantName}: Tue / Thu. Weekends: cleanser and moisturizer only.`,
      trigger: "stacking",
      product: retinolProduct || null,
    });
  }

  if (hasAHA && hasBHA) {
    const ahaProduct = (activeMap["AHA"] || [])[0];
    const bhaProduct = (activeMap["BHA"] || [])[0];
    const ahaName = pName(ahaProduct) || "your AHA";
    const bhaName = pName(bhaProduct) || "your BHA";
    refinements.push({
      verb: "Reduce Frequency", verbColor: "#c49040", icon: "clock",
      title: `${ahaName} (AHA) and ${bhaName} (BHA) — pick one`,
      body: `AHA resurfaces the top layer of skin. BHA penetrates pores. Using both routinely is excessive for most skin types and causes chronic low-grade barrier disruption.`,
      action: `Oily or acne-prone: lean on ${bhaName}. Texture or dullness: lean on ${ahaName}. Use the other max 1× per week.`,
      trigger: "exfoliant-stack",
      product: ahaProduct || null,
    });
  } else {
    const exfoliantProds = products.filter(p => p.category === "Exfoliant");
    if (exfoliantProds.length > 1) {
      const names = exfoliantProds.map(p => pName(p)).filter(Boolean);
      refinements.push({
        verb: "Reduce Frequency", verbColor: "#c49040", icon: "clock",
        title: `${names.join(" and ")} — two exfoliant products`,
        body: `Multiple exfoliant products used regularly causes chronic low-grade barrier disruption. Each exfoliant session needs recovery time before the next.`,
        action: `Pick one. Use it 2–3× per week and let your barrier fully recover between sessions.`,
        trigger: "exfoliant-stack",
        product: exfoliantProds[1],
      });
    }
  }

  if (activeCount >= 2 && hasRetinol) {
    const intensityNames = overloadActiveKeys
      .map(a => { const p = (activeMap[a] || [])[0]; return pName(p) || a; })
      .join(", ");
    refinements.push({
      verb: "Reduce Frequency", verbColor: "#c49040", icon: "clock",
      title: `${activeCount} actives in rotation — schedule rest nights`,
      body: `Between ${intensityNames}, your skin is processing something potent most evenings. Chronic over-activing accumulates slowly — no dramatic reaction needed for the barrier to degrade.`,
      action: "Pick 2 nights per week to go barrier-only: cleanser, moisturizer, SPF — nothing potent. Your actives will absorb better on the days you use them.",
      trigger: "intensity",
    });
  }

  // -- 3. REPLACE ------------------------------------------------------------
  const serums = products.filter(p => p.category === "Serum");
  if (serums.length > 2) {
    const overlap = serums.filter(p => {
      const a = Object.keys(detectActives(p.ingredients));
      return serums.some(other => other.id !== p.id && Object.keys(detectActives(other.ingredients)).some(act => a.includes(act)));
    });
    if (overlap.length > 0) {
      const overlapNames = overlap.map(p => pName(p)).filter(Boolean);
      refinements.push({
        verb: "Replace", verbColor: "#7a9070", icon: "layers",
        title: `${overlapNames.join(" and ")} share actives`,
        body: `${overlapNames.join(", ")} contain overlapping ingredients. A single well-formulated serum covering the same ground would simplify your ritual and reduce stacking risk.`,
        action: "Look for one serum that combines your key actives. Retire the duplicates.",
        trigger: "serum-overlap",
        product: overlap[0],
        cygne: true,
      });
    }
  }

  if (activeMap["vitamin C"] && hasRetinol && !products.find(p => detectActives(p.ingredients)["vitamin C"])) {
    const vitcProduct = (activeMap["vitamin C"] || [])[0];
    const vitcName = pName(vitcProduct) || "your Vitamin C";
    refinements.push({
      verb: "Replace", verbColor: "#7a9070", icon: "layers",
      title: `${vitcName} may not be delivering`,
      body: `L-Ascorbic acid degrades when exposed to heat, air, and especially alongside retinol. If ${vitcName} isn't AM-only in a sealed, opaque bottle, its potency is likely compromised.`,
      action: "Swap to a stabilized derivative (ascorbyl glucoside or SAP), or confirm it's used AM-only in an airtight formula.",
      trigger: "vitc-instability",
      product: vitcProduct || null,
      cygne: true,
    });
  }

  // -- 4. ADD (progress essentials) -----------------------------------------
  const hasSPF = !!cats["SPF"] || !!activeMap["SPF"];
  const hasMoisturizer = !!cats["Moisturizer"];
  const hasCleanser = !!cats["Cleanser"];

  if (!hasSPF) refinements.push({
    verb: "Add", verbColor: "#7a9070", icon: "plus",
    title: "No SPF in your AM ritual",
    body: "SPF is non-negotiable. Every active you apply — retinol, AHA, Vitamin C — becomes significantly less effective without UV protection the following morning.",
    action: "Add a broad-spectrum SPF 30–50 as your final AM step, every day.",
    trigger: "missing-spf", cygne: true,
  });

  if (!hasMoisturizer) refinements.push({
    verb: "Add", verbColor: "#7a9070", icon: "plus",
    title: "No moisturizer in your ritual",
    body: "Actives thin the barrier — moisturizer rebuilds it. Skipping it while using exfoliants or retinoids puts you in a constant cycle of damage without recovery.",
    action: "Apply a ceramide or hyaluronic acid moisturizer after serums, before SPF.",
    trigger: "missing-moisturizer", cygne: true,
  });

  if (!hasCleanser) refinements.push({
    verb: "Add", verbColor: "#7a9070", icon: "plus",
    title: "No cleanser in your ritual",
    body: "Starting with unwashed skin means actives are layering on top of pollution, sebum, and residue — blocking absorption and increasing irritation risk.",
    action: "Add a gentle, pH-balanced cleanser as step one, AM and PM.",
    trigger: "missing-cleanser", cygne: true,
  });

  return refinements;
}

// Collapsible Refinements Card
function RefinementsCard({ products, activeMap, conflicts }) {
  const [open, setOpen] = useState(false);
  const refinements = buildRefinements(products, activeMap, conflicts);
  const [activeVerb, setActiveVerb] = useState(null);

  if (refinements.length === 0) return null;

  const verbs = [...new Set(refinements.map(r => r.verb))];
  const displayed = activeVerb ? refinements.filter(r => r.verb === activeVerb) : refinements;

  // Verb style map
  const verbStyle = {
    "Remove":           { color: "#c06060", bg: "rgba(192,96,96,0.08)",  border: "rgba(192,96,96,0.28)" },
    "Reduce Frequency": { color: "#c49040", bg: "rgba(196,144,64,0.08)", border: "rgba(196,144,64,0.28)" },
    "Replace":          { color: "#7a9070", bg: "rgba(122,144,112,0.08)",border: "rgba(122,144,112,0.28)" },
    "Add":              { color: "#7a9070", bg: "rgba(122,144,112,0.08)", border: "rgba(122,144,112,0.28)" },
  };

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Header trigger */}
      <button onClick={() => setOpen(o => !o)}
        style={{ width: "100%", background: open ? "var(--surface)" : "var(--ink)", border: `1px solid ${open ? "var(--border)" : "var(--border)"}`, borderRadius: open ? "14px 14px 0 0" : 14, padding: "15px 18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "all 0.2s" }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.borderColor = "rgba(122,144,112,0.4)"; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.borderColor = "var(--border)"; }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#c49040", flexShrink: 0 }} />
          <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 12, fontWeight: 600, color: "var(--parchment)", letterSpacing: "0.02em" }}>Refine Your Ritual</span>
          <span style={{ fontSize: 10, fontFamily: "Space Grotesk, sans-serif", background: "rgba(196,144,64,0.14)", color: "#c49040", padding: "2px 8px", borderRadius: 20, letterSpacing: "0.06em" }}>{refinements.length}</span>
        </div>
        <span style={{ color: "var(--clay)", opacity: 0.6, display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.22s" }}>
          <Icon name="chevron" size={14} />
        </span>
      </button>

      {open && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 14px 14px", padding: "16px 16px 18px" }}>

          {/* Verb filter pills */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            <button onClick={() => setActiveVerb(null)}
              style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${activeVerb === null ? "var(--sage)" : "var(--border)"}`, background: activeVerb === null ? "rgba(122,144,112,0.10)" : "transparent", color: activeVerb === null ? "var(--parchment)" : "var(--clay)", fontFamily: "Space Grotesk, sans-serif", fontSize: 9, fontWeight: activeVerb === null ? 700 : 400, cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase", transition: "all 0.15s" }}>
              All
            </button>
            {verbs.map(v => {
              const vs = verbStyle[v] || { color: "#7a9070", bg: "transparent", border: "var(--border)" };
              const isActive = activeVerb === v;
              return (
                <button key={v} onClick={() => setActiveVerb(isActive ? null : v)}
                  style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${isActive ? vs.border : "var(--border)"}`, background: isActive ? vs.bg : "transparent", color: isActive ? vs.color : "var(--clay)", fontFamily: "Space Grotesk, sans-serif", fontSize: 9, fontWeight: isActive ? 700 : 400, cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase", transition: "all 0.15s" }}>
                  {v}
                </button>
              );
            })}
          </div>

          {/* Refinement items */}
          {displayed.map((r, i) => {
            const vs = verbStyle[r.verb] || { color: "#7a9070", bg: "transparent", border: "var(--border)" };
            return (
              <RefinementItem key={i} r={r} vs={vs} />
            );
          })}
        </div>
      )}
    </div>
  );
}

function RefinementItem({ r, vs, onEdit, onDismiss }) {
  const [open, setOpen] = useState(false);
  return (
    <div onClick={() => setOpen(o => !o)}
      style={{ background: "var(--ink)", border: `1px solid var(--border)`, borderRadius: 12, padding: "13px 15px", marginBottom: 8, cursor: "pointer", transition: "border-color 0.18s" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = vs.border}
      onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 9, fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: vs.color, background: `${vs.color}18`, padding: "3px 8px", borderRadius: 20, flexShrink: 0 }}>{r.verb}</span>
        <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 12, color: "var(--parchment)", margin: 0, flex: 1, fontWeight: 500, lineHeight: 1.3 }}>{r.title}</p>
        <span style={{ color: "var(--clay)", opacity: 0.5, flexShrink: 0, display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
          <Icon name="chevron" size={12} />
        </span>
        {onDismiss && (
          <button onClick={e => { e.stopPropagation(); onDismiss(); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clay)", opacity: 0.3, padding: "0 0 0 2px", flexShrink: 0, fontSize: 15, lineHeight: 1 }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.65"}
            onMouseLeave={e => e.currentTarget.style.opacity = "0.3"}
            title="Dismiss">×</button>
        )}
      </div>
      {open && (
        <div style={{ marginTop: 11, paddingTop: 11, borderTop: "1px solid var(--border)" }}>
          <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: "0 0 9px", lineHeight: 1.65 }}>{r.body}</p>
          {r.action && (
            <div style={{ display: "flex", gap: 8, padding: "9px 11px", background: `${vs.color}0d`, borderRadius: 8, border: `1px solid ${vs.color}28`, marginBottom: r.product && onEdit ? 8 : 0 }}>
              <span style={{ color: vs.color, flexShrink: 0, marginTop: 1 }}><Icon name="check" size={11} /></span>
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--parchment)", margin: 0, lineHeight: 1.55 }}>{r.action}</p>
            </div>
          )}
          {r.product && onEdit && (
            <button
              onClick={e => { e.stopPropagation(); onEdit(r.product); }}
              style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, padding: "8px 14px", background: "rgba(122,144,112,0.10)", border: "1px solid rgba(122,144,112,0.30)", borderRadius: 9, cursor: "pointer", transition: "background 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(122,144,112,0.18)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(122,144,112,0.10)"}>
              <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, fontWeight: 600, color: "#7a9070", letterSpacing: "0.08em", textTransform: "uppercase" }}>Edit {r.product.brand ? `${r.product.brand} ${r.product.name}` : r.product.name}</span>
              <Icon name="chevron" size={11} color="#7a9070" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}


// --- RITUAL GUIDANCE ENGINE ---------------------------------------------------


export { buildRecommendations, RecommendationCard, buildRefinements, RefinementsCard, RefinementItem };