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
  // SPF logic: a dedicated SPF product satisfies the requirement. An SPF
  // Moisturizer also satisfies it — unless its stated SPF is 15 or lower, in
  // which case we still recommend a dedicated SPF for adequate protection.
  const parseSpfValue = (p) => {
    const m = (p.name || "").match(/SPF\s*(\d+)/i);
    return m ? parseInt(m[1], 10) : null;
  };
  const hasDedicatedSPF = cats.has("SPF") || !!activeMap["SPF"];
  const spfMoisturizers = products.filter(p => p.category === "SPF Moisturizer");
  const hasAdequateSpfMoisturizer = spfMoisturizers.some(p => {
    const lvl = parseSpfValue(p);
    return lvl === null || lvl > 15;
  });
  const hasSPF = hasDedicatedSPF || hasAdequateSpfMoisturizer;
  // An SPF Moisturizer (at any SPF level) satisfies the moisturizer slot.
  const hasMoisturizer = cats.has("Moisturizer") || spfMoisturizers.length > 0;
  const hasCleanser = cats.has("Cleanser");
  const hasEyeCream = cats.has("Eye Cream");
  const hasPeptides = !!activeMap["peptides"];
  const hasExfoliant = cats.has("Exfoliant") || hasAHA || hasBHA;

  const ESSENTIAL_TAUPE = "#8b7355";

  // -- ADDITIONS -------------------------------------------------------------
  if (!hasSPF) recs.push({
    id: "add-spf",
    type: "addition", priority: 1,
    title: "Add daily SPF",
    body: "No sun protection found. SPF is the single most evidence-backed step for preventing premature aging and skin damage — it belongs in every AM ritual.",
    tag: "Essential",
    tagColor: ESSENTIAL_TAUPE,
    cygne: true,
    addCategory: "SPF",
    note: "Look for SPF 30–50, broad spectrum. Mineral or chemical — find one you'll actually use daily.",
  });

  if (!hasCleanser) recs.push({
    id: "add-cleanser",
    type: "addition", priority: 2,
    title: "Add a gentle cleanser",
    body: "No cleanser detected. A pH-balanced cleanser removes pollutants and preps skin so your actives absorb properly — without stripping the barrier.",
    tag: "Essential",
    tagColor: ESSENTIAL_TAUPE,
    cygne: true,
    addCategory: "Cleanser",
    note: "Choose a low-pH, sulfate-free formula. Gel for oilier skin, cream or milk for drier.",
  });

  if (!hasMoisturizer) recs.push({
    id: "add-moisturizer",
    type: "addition", priority: 3,
    title: "Add a moisturizer",
    body: "Without a moisturizer, actives can over-penetrate and cause irritation. A moisturizer seals in hydration and supports the skin barrier after every step.",
    tag: "Essential",
    tagColor: ESSENTIAL_TAUPE,
    cygne: true,
    addCategory: "Moisturizer",
    note: "A fragrance-free ceramide cream or gel moisturizer works for most skin types.",
  });

  if (!hasVitC && products.length >= 2) recs.push({
    id: "add-vitc",
    type: "addition", priority: 4,
    title: "Consider a Vitamin C serum (AM)",
    body: "No antioxidant protection detected in your ritual. A stable Vitamin C serum each morning shields against free radical damage and supports brightness over time.",
    tag: "Recommended",
    tagColor: "#6e8a72",
    cygne: true,
    addCategory: "Serum",
    note: "Apply after cleansing, before moisturizer and SPF. Start with 10–15% L-ascorbic acid.",
  });

  if (!hasRetinol && products.length >= 3) recs.push({
    id: "add-retinoid",
    type: "addition", priority: 5,
    title: "Consider a retinoid (PM)",
    body: "No retinoid detected. Retinoids remain the most studied active for cell turnover, texture, fine lines, and long-term skin health. Worth building into a PM ritual.",
    tag: "Recommended",
    tagColor: "#6e8a72",
    cygne: true,
    addCategory: "Treatment",
    note: "Start with retinol 0.025–0.1% two nights per week. Introduce gradually to avoid purging.",
  });

  if ((hasRetinol || hasAHA || hasBHA) && !hasHA && !hasCeramides) recs.push({
    id: "add-barrier",
    type: "addition", priority: 6,
    title: "Add a barrier-support serum",
    body: "You're using active exfoliants or retinoids without any humectant or ceramide support. This increases transepidermal water loss (TEWL) and may slowly compromise your barrier.",
    tag: "Recommended",
    tagColor: "#6e8a72",
    cygne: true,
    addCategory: "Serum",
    note: "A hyaluronic acid or ceramide serum applied before moisturizer on active nights.",
  });

  if (!hasEyeCream && products.length >= 4) recs.push({
    id: "add-eye-cream",
    type: "addition", priority: 7,
    title: "Consider an eye cream",
    body: "The skin around the eyes is significantly thinner. A dedicated eye product prevents milia and accidental irritation from actives that migrate during application.",
    tag: "Optional",
    tagColor: "#8b7355",
    cygne: true,
    addCategory: "Eye Cream",
    note: "Apply with your ring finger using a gentle tapping motion. Peptide or caffeine formulas work well.",
  });

  // -- SWAPS -----------------------------------------------------------------
  const vitCRetinolConflict = conflicts.some(c => c.pair.includes("retinol") && c.pair.includes("vitamin C"));
  if (vitCRetinolConflict) recs.push({
    type: "swap", priority: 1,
    title: "Split Vitamin C and Retinol by session",
    body: "You have both in your ritual — they work better and safer apart. Vitamin C is a morning antioxidant. Retinol is a nighttime regenerator. Layering them wastes both.",
    tag: "Conflict Fix",
    tagColor: "#8b7355",
    action: "Move Vitamin C exclusively to AM. Use retinol PM only. Never layer same session.",
    cygne: false,
  });

  const ahaRetinolConflict = conflicts.some(c => c.pair.includes("retinol") && (c.pair.includes("AHA") || c.pair.includes("BHA")));
  if (ahaRetinolConflict) recs.push({
    type: "swap", priority: 2,
    title: "Alternate retinol and exfoliant nights",
    body: "Retinol and acid exfoliants on the same night will over-process your skin. Each is effective alone — combined nightly, they break down barrier integrity.",
    tag: "Conflict Fix",
    tagColor: "#8b7355",
    action: "Retinol Mon / Wed / Fri. Exfoliant Tue / Thu. Leave weekends barrier-free.",
    cygne: false,
  });

  if (serumCount > 3) recs.push({
    type: "swap", priority: 3,
    title: "Consolidate your serum stack",
    body: `You have ${serumCount} serums. Layering more than 2–3 active serums causes pilling, reduces absorption of each, and adds unnecessary actives that can conflict.`,
    tag: "Simplify",
    tagColor: "#6e8a72",
    action: "Identify which actives overlap. Keep the best-formulated product per active. Retire duplicates.",
    cygne: false,
  });

  // -- SKIN TYPE & CONCERN RULES --------------------------------------------
  const skinType = user.skinType || "";
  const concerns = user.concerns || [];

  if (skinType === "Dry" || concerns.includes("Dehydration")) {
    if (!hasCeramides) recs.push({
      id: "add-ceramides-dry",
      type: "addition", priority: 4,
      title: "Add a ceramide moisturizer",
      body: "Dry skin loses moisture faster than it can replenish. Ceramides rebuild the lipid barrier that holds water in — they're not optional for dry skin types.",
      tag: "Dry Skin", tagColor: "#8b7355", cygne: true, addCategory: "Moisturizer",
      note: "Look for ceramides NP, AP, or EOP in the ingredients list. CeraVe, La Roche-Posay, and Avène are reliable.",
    });
  }

  if (skinType === "Oily" || concerns.includes("Acne")) {
    if (!hasBHA) recs.push({
      id: "add-bha-oily",
      type: "addition", priority: 4,
      title: "Add a BHA exfoliant",
      body: "Salicylic acid is oil-soluble — it penetrates the pore lining where congestion starts. For oily or acne-prone skin it's the most targeted active available OTC.",
      tag: skinType === "Oily" ? "Oily Skin" : "Acne", tagColor: "#8b7355", cygne: true, addCategory: "Exfoliant",
      note: "2% salicylic acid, used 2–3× per week. Paula's Choice BHA is the benchmark.",
    });
  }

  if (concerns.includes("Hyperpigmentation")) {
    if (!hasVitC) recs.push({
      id: "add-vitc-hyperpig",
      type: "addition", priority: 4,
      title: "Add Vitamin C for hyperpigmentation",
      body: "Vitamin C inhibits melanin production at the source. For hyperpigmentation concerns it's the most evidence-backed brightening active — especially paired with SPF.",
      tag: "Hyperpigmentation", tagColor: "#8b7355", cygne: true, addCategory: "Serum",
      note: "L-ascorbic acid 10–20% is most effective. Keep it in the fridge and replace when it turns orange.",
    });
    if (!hasSPF) recs.push({
      id: "add-spf-hyperpig",
      type: "addition", priority: 1,
      title: "SPF is essential for hyperpigmentation",
      body: "Without daily SPF, UV exposure reverses brightening progress every morning. SPF is not optional when treating pigmentation — it's half the treatment.",
      tag: "Essential", tagColor: ESSENTIAL_TAUPE, cygne: true, addCategory: "SPF",
      note: "SPF 50 broad-spectrum. Reapply every 2 hours outdoors.",
    });
  }

  if (skinType === "Sensitive" || concerns.includes("Redness") || concerns.includes("Sensitivity")) {
    const activeCount = Object.keys(activeMap).length;
    if (activeCount >= 3) recs.push({
      id: "simplify-sensitive",
      type: "simplify", priority: 1,
      title: "Reduce active load for sensitive skin",
      body: "Sensitive skin has a lower threshold for irritation. Running multiple actives simultaneously increases the risk of barrier disruption — simplifying is not a step back.",
      tag: "Sensitive Skin", tagColor: "#8b7355",
      note: "Identify your one highest-priority active and hold others until skin is stable.",
    });
    if (!hasCeramides) recs.push({
      id: "add-ceramides-sensitive",
      type: "addition", priority: 4,
      title: "Add ceramides for barrier support",
      body: "Sensitive skin typically has a compromised barrier that allows irritants in. Ceramides are the primary repair ingredient — they rebuild the barrier from the inside out.",
      tag: "Sensitive Skin", tagColor: "#8b7355", cygne: true, addCategory: "Moisturizer",
      note: "Fragrance-free formula essential. CeraVe Moisturizing Cream is a reliable baseline.",
    });
  }

  if (concerns.includes("Fine lines")) {
    if (!hasRetinol) recs.push({
      id: "add-retinoid-lines",
      type: "addition", priority: 4,
      title: "Consider introducing a retinoid",
      body: "Retinoids are the most studied active for fine lines — they accelerate cell turnover and stimulate collagen production. Nothing else comes close in terms of evidence.",
      tag: "Fine Lines", tagColor: "#8b7355", cygne: true, addCategory: "Treatment",
      note: "Start at 0.025–0.05% retinol, 1–2× per week. Expect a 12-week adjustment period.",
    });
  }

  if (concerns.includes("Texture")) {
    if (!hasAHA && !hasBHA) recs.push({
      id: "add-aha-texture",
      type: "addition", priority: 4,
      title: "Add a chemical exfoliant for texture",
      body: "Texture is primarily a cell turnover issue. AHA (glycolic, lactic) dissolves the bonds between dead skin cells and resurfaces the top layer — physical scrubs can't match this.",
      tag: "Texture", tagColor: "#8b7355", cygne: true, addCategory: "Exfoliant",
      note: "Lactic acid 5–10% is gentler and a good starting point. Use 2–3× per week, PM only.",
    });
  }

  // -- SIMPLIFICATIONS -------------------------------------------------------
  const niaCounts = (activeMap["niacinamide"] || []).length;
  if (niaCounts >= 3) recs.push({
    type: "simplify", priority: 1,
    title: `Reduce niacinamide sources (${niaCounts} products)`,
    body: "Niacinamide is beneficial at 2–10%, but accumulating it across multiple products pushes cumulative concentration higher than needed and adds cost without benefit.",
    tag: "Simplify",
    tagColor: "#6e8a72",
    action: "Keep one dedicated niacinamide product. Let others be supporting ingredients elsewhere.",
    cygne: false,
  });

  if (hasAHA && hasBHA) recs.push({
    type: "simplify", priority: 2,
    title: "Choose one exfoliant type",
    body: "AHA (glycolic/lactic acid) works on the skin surface. BHA (salicylic) works inside pores. Both daily is excessive. Rotate, or choose the one that addresses your primary concern.",
    tag: "Simplify",
    tagColor: "#6e8a72",
    action: "Oily / acne-prone: lean BHA. Texture / dullness: lean AHA. Use the other max 1× per week.",
    cygne: false,
  });

  if (hasPeptides && hasRetinol) recs.push({
    type: "simplify", priority: 3,
    title: "Separate peptides from retinol",
    body: "Some research suggests retinol may reduce peptide efficacy when layered. They're both valuable — but work better in different sessions or on alternating nights.",
    tag: "Optimize",
    tagColor: "#6e8a72",
    action: "Use peptides AM or on non-retinol nights for maximum benefit from both.",
    cygne: false,
  });

  return recs.sort((a, b) => {
    const typeOrder = { addition: 0, swap: 1, simplify: 2 };
    return (typeOrder[a.type] - typeOrder[b.type]) || (a.priority - b.priority);
  });
}

// --- MY ROUTINE ---------------------------------------------------------------

function RecommendationCard({ rec, onAdd, onDismiss, onEdit }) {
  const [expanded, setExpanded] = useState(false);
  const typeIcon = { addition: "plus", swap: "layers", simplify: "drop" };
  const typeLabelMap = { addition: "Add", swap: "Swap", simplify: "Simplify" };

  const handleAdd = (e) => {
    e.stopPropagation();
    if (rec.type === "addition" && onAdd) onAdd(rec.addCategory || "Serum");
    else if (onEdit) onEdit();
  };
  const handleDismiss = (e) => {
    e.stopPropagation();
    if (onDismiss) onDismiss(rec.id || rec.title);
  };

  return (
    <div onClick={() => setExpanded(e => !e)}
      style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "15px 17px", marginBottom: 8, cursor: "pointer", transition: "border-color 0.2s" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(122,144,112,0.4)"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(122,144,112,0.10)", border: "1px solid rgba(122,144,112,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#6e8a72", marginTop: 1 }}>
          <Icon name={typeIcon[rec.type]} size={12} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 9, fontFamily: "var(--font-body)", fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: rec.tagColor, background: `${rec.tagColor}18`, padding: "2px 7px", borderRadius: 20 }}>{rec.tag}</span>
            <span style={{ fontSize: 9, fontFamily: "var(--font-body)", letterSpacing: "0.11em", textTransform: "uppercase", color: "var(--clay)", opacity: 0.55 }}>{typeLabelMap[rec.type]}</span>
          </div>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--parchment)", margin: 0, fontWeight: 500, lineHeight: 1.35 }}>{rec.title}</p>
        </div>
      </div>
      {expanded && (
        <div style={{ marginTop: 13, paddingTop: 13, borderTop: "1px solid var(--border)" }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--clay)", margin: "0 0 10px", lineHeight: 1.65 }}>{rec.body}</p>
          {rec.action && (
            <div style={{ display: "flex", gap: 8, padding: "9px 12px", background: "rgba(122,144,112,0.06)", borderRadius: 9, border: "1px solid rgba(122,144,112,0.14)", marginBottom: 8 }}>
              <span style={{ color: "#6e8a72", flexShrink: 0, marginTop: 1 }}><Icon name="check" size={11} /></span>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--parchment)", margin: 0, lineHeight: 1.6 }}>{rec.action}</p>
            </div>
          )}
          {rec.note && (
            <div style={{ display: "flex", gap: 8, padding: "9px 12px", background: "var(--surface)", borderRadius: 9, border: "1px solid var(--border)", marginBottom: 8 }}>
              <span style={{ color: "var(--clay)", opacity: 0.45, flexShrink: 0, marginTop: 1 }}><Icon name="info" size={11} /></span>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: 0, lineHeight: 1.6 }}>{rec.note}</p>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {rec.type === "addition" && onAdd && (
              <button onClick={handleAdd}
                style={{ flex: 1, padding: "10px 14px", background: "rgba(122,144,112,0.15)", border: "1px solid rgba(122,144,112,0.35)", borderRadius: 10, fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, color: "#6e8a72", cursor: "pointer", letterSpacing: "0.06em" }}>
                + Add {rec.addCategory || "to vanity"}
              </button>
            )}
            {onDismiss && (
              <button onClick={handleDismiss}
                style={{ padding: "10px 14px", background: "transparent", border: "1px solid var(--border)", borderRadius: 10, fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", cursor: "pointer", letterSpacing: "0.04em" }}>
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// -- Refinements Engine ------------------------------------------------------
function buildRefinements(products, activeMap, conflicts) {
  const cats = products.reduce((acc, p) => { acc[p.category] = (acc[p.category] || []); acc[p.category].push(p); return acc; }, {});
  const refinements = [];

  // -- 1. REMOVE -------------------------------------------------------------
  // Duplicate categories
  Object.entries(cats).forEach(([cat, prods]) => {
    if (prods.length > 1 && !["Serum"].includes(cat)) {
      refinements.push({
        verb: "Remove",
        verbColor: "#8b7355",
        icon: "trash",
        title: `${prods.length} ${cat}s in your ritual`,
        body: `You have ${prods.map(p => `${p.brand} ${p.name}`).join(" and ")}. Layering two ${cat.toLowerCase()}s adds no benefit and can overload the skin.`,
        action: `Keep your preferred ${cat.toLowerCase()}. Remove the other — or save it for travel.`,
        trigger: "duplicate",
        productIds: prods.map(p => p.id),
      });
    }
  });
  // Severe conflicts → suggest removing one product
  conflicts.filter(c => c.severity === "warning").forEach(c => {
    const conflictProducts = [...(c.productsA || []), ...(c.productsB || [])];
    refinements.push({
      verb: "Remove",
      verbColor: "#8b7355",
      icon: "trash",
      title: `Resolve ${c.pair[0]} + ${c.pair[1]} conflict`,
      body: `These two actives are fighting each other in the same ritual. The combination can compromise your barrier and diminish both ingredients' effectiveness.`,
      action: `Remove or re-home one. ${c.reason}`,
      trigger: "conflict",
      productIds: conflictProducts.map(p => p.id),
    });
  });
  // Barrier overload — 3+ actives
  const activeCount = Object.keys(activeMap).filter(a => ["retinol","AHA","BHA","vitamin C","benzoyl peroxide"].includes(a)).length;
  if (activeCount >= 3) {
    refinements.push({
      verb: "Remove",
      verbColor: "#8b7355",
      icon: "trash",
      title: "Active overload detected",
      body: `Your vanity contains ${activeCount} potent actives. Running them all simultaneously overwhelms the barrier's ability to recover between sessions.`,
      action: "Prioritize 1–2 actives per session. Rotate the others on separate days or evenings.",
      trigger: "overload",
    });
  }

  // -- 2. REDUCE FREQUENCY ---------------------------------------------------
  const hasRetinol = !!activeMap["retinol"];
  const hasAHA = !!activeMap["AHA"];
  const hasBHA = !!activeMap["BHA"];
  const exfoliants = products.filter(p => p.category === "Exfoliant" || hasAHA || hasBHA);

  if (hasRetinol && (hasAHA || hasBHA)) {
    refinements.push({
      verb: "Reduce Frequency",
      verbColor: "#8b7355",
      icon: "clock",
      title: "Retinoid + exfoliant stacking",
      body: "Using a retinoid and an exfoliant in the same session — or even on back-to-back nights — is the most common cause of compromised skin barriers.",
      action: "Retinol: Mon / Wed / Fri. Exfoliant: Tue / Thu. Weekends: barrier-only. Never same night.",
      trigger: "stacking",
    });
  }
  if (exfoliants.length > 1 || (hasAHA && hasBHA)) {
    refinements.push({
      verb: "Reduce Frequency",
      verbColor: "#8b7355",
      icon: "clock",
      title: "Multiple exfoliant sources",
      body: "AHA and BHA used together — or multiple exfoliant products — is excessive for most skin types and causes chronic low-grade barrier disruption over time.",
      action: "Use one exfoliant type, 2–3× per week. Let the barrier fully recover between sessions.",
      trigger: "exfoliant-stack",
    });
  }
  if (activeCount >= 2 && hasRetinol) {
    refinements.push({
      verb: "Reduce Frequency",
      verbColor: "#8b7355",
      icon: "clock",
      title: "High active intensity schedule",
      body: "Your current stack means your skin is processing potent actives most nights. This compounds risk of sensitization over weeks without visible day-to-day symptoms.",
      action: "Build in 2 'rest' nights per week — cleanser, moisturizer, SPF only. Your barrier will respond better.",
      trigger: "intensity",
    });
  }

  // -- 3. REPLACE ------------------------------------------------------------
  // Redundant products (same active, weaker formulation implied by lower price)
  const serums = products.filter(p => p.category === "Serum");
  if (serums.length > 2) {
    const overlap = serums.filter(p => {
      const a = Object.keys(detectActives(p.ingredients));
      return serums.some(other => other.id !== p.id && Object.keys(detectActives(other.ingredients)).some(act => a.includes(act)));
    });
    if (overlap.length > 0) {
      refinements.push({
        verb: "Replace",
        verbColor: "#6e8a72",
        icon: "layers",
        title: "Overlapping serum actives",
        body: `${overlap.map(p => p.name).join(", ")} share active ingredients. A multi-active serum covering the same ground in one product would simplify your ritual and reduce layering risk.`,
        action: "Look for a single well-formulated serum combining your key actives. Retire the duplicates.",
        trigger: "serum-overlap",
        cygne: true,
        productIds: overlap.map(p => p.id),
      });
    }
  }
  // Ingredient instability flag — Vitamin C if no dedicated AM slot
  if (activeMap["vitamin C"] && hasRetinol && !products.find(p => detectActives(p.ingredients)["vitamin C"] && p.category !== "Treatment")) {
    refinements.push({
      verb: "Replace",
      verbColor: "#6e8a72",
      icon: "layers",
      title: "Vitamin C stability concern",
      body: "L-Ascorbic acid is unstable and degrades when exposed to heat, air, and especially alongside retinol. If your Vitamin C isn't in a dedicated AM product, it may not be delivering.",
      action: "Swap to a stabilized Vitamin C derivative (ascorbyl glucoside, SAP) or ensure it's used AM-only in an airtight formula.",
      trigger: "vitc-instability",
      cygne: true,
    });
  }

  // -- 4. ADD (progress essentials) -----------------------------------------
  // An SPF Moisturizer satisfies both the SPF and moisturizer slots, unless
  // its stated SPF is 15 or under (in which case dedicated SPF is still recommended).
  const parseSpfValue = (p) => {
    const m = (p.name || "").match(/SPF\s*(\d+)/i);
    return m ? parseInt(m[1], 10) : null;
  };
  const spfMoisturizers = cats["SPF Moisturizer"] || [];
  const hasAdequateSpfMoisturizer = spfMoisturizers.some(p => {
    const lvl = parseSpfValue(p);
    return lvl === null || lvl > 15;
  });
  const hasSPF = !!cats["SPF"] || !!activeMap["SPF"] || hasAdequateSpfMoisturizer;
  const hasMoisturizer = !!cats["Moisturizer"] || spfMoisturizers.length > 0;
  const hasCleanser = !!cats["Cleanser"];

  if (!hasSPF) {
    refinements.push({
      verb: "Add",
      verbColor: "#8b7355",
      icon: "plus",
      title: "No SPF in AM ritual",
      body: "SPF is non-negotiable. Every active you apply — retinol, AHA, Vitamin C — becomes significantly less effective (and potentially harmful) without UV protection the following morning.",
      action: "Add a broad-spectrum SPF 30–50 as your final AM step, every day.",
      trigger: "missing-spf",
      cygne: true,
      addCategory: "SPF",
    });
  }
  if (!hasMoisturizer) {
    refinements.push({
      verb: "Add",
      verbColor: "#8b7355",
      icon: "plus",
      title: "No moisturizer detected",
      body: "Skipping moisturizer while using actives is a common mistake. Actives thin the barrier — moisturizer rebuilds it. Without it, you're in a constant cycle of damage.",
      action: "Apply a ceramide or hyaluronic acid moisturizer after serums, before SPF.",
      trigger: "missing-moisturizer",
      cygne: true,
      addCategory: "Moisturizer",
    });
  }
  if (!hasCleanser) {
    refinements.push({
      verb: "Add",
      verbColor: "#8b7355",
      icon: "plus",
      title: "No cleanser in ritual",
      body: "Starting with unwashed skin means actives are applying on top of pollution, sebum, and residue — blocking absorption and increasing irritation risk.",
      action: "Add a gentle, pH-balanced cleanser as step one, AM and PM.",
      trigger: "missing-cleanser",
      cygne: true,
      addCategory: "Cleanser",
    });
  }

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
    "Remove":           { color: "#8b7355", bg: "rgba(139,115,85,0.08)",  border: "rgba(139,115,85,0.28)" },
    "Reduce Frequency": { color: "#8b7355", bg: "rgba(139,115,85,0.08)", border: "rgba(139,115,85,0.28)" },
    "Replace":          { color: "#6e8a72", bg: "rgba(122,144,112,0.08)",border: "rgba(122,144,112,0.28)" },
    "Add":              { color: "#8b7355", bg: "rgba(139,115,85,0.08)",  border: "rgba(139,115,85,0.28)" },
  };

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Header trigger */}
      <button onClick={() => setOpen(o => !o)}
        style={{ width: "100%", background: open ? "var(--surface)" : "var(--ink)", border: `1px solid ${open ? "var(--border)" : "var(--border)"}`, borderRadius: open ? "14px 14px 0 0" : 14, padding: "15px 18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "all 0.2s" }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.borderColor = "rgba(122,144,112,0.4)"; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.borderColor = "var(--border)"; }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#8b7355", flexShrink: 0 }} />
          <span style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--parchment)", letterSpacing: "0.02em" }}>Refine Your Ritual</span>
          <span style={{ fontSize: 10, fontFamily: "var(--font-body)", background: "rgba(139,115,85,0.14)", color: "#8b7355", padding: "2px 8px", borderRadius: 20, letterSpacing: "0.06em" }}>{refinements.length}</span>
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
              style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${activeVerb === null ? "var(--sage)" : "var(--border)"}`, background: activeVerb === null ? "rgba(122,144,112,0.10)" : "transparent", color: activeVerb === null ? "var(--parchment)" : "var(--clay)", fontFamily: "var(--font-body)", fontSize: 9, fontWeight: activeVerb === null ? 700 : 400, cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase", transition: "all 0.15s" }}>
              All
            </button>
            {verbs.map(v => {
              const vs = verbStyle[v] || { color: "#6e8a72", bg: "transparent", border: "var(--border)" };
              const isActive = activeVerb === v;
              return (
                <button key={v} onClick={() => setActiveVerb(isActive ? null : v)}
                  style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${isActive ? vs.border : "var(--border)"}`, background: isActive ? vs.bg : "transparent", color: isActive ? vs.color : "var(--clay)", fontFamily: "var(--font-body)", fontSize: 9, fontWeight: isActive ? 700 : 400, cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase", transition: "all 0.15s" }}>
                  {v}
                </button>
              );
            })}
          </div>

          {/* Refinement items */}
          {displayed.map((r, i) => {
            const vs = verbStyle[r.verb] || { color: "#6e8a72", bg: "transparent", border: "var(--border)" };
            return (
              <RefinementItem key={i} r={r} vs={vs} />
            );
          })}
        </div>
      )}
    </div>
  );
}

function RefinementItem({ r, vs }) {
  const [open, setOpen] = useState(false);
  return (
    <div onClick={() => setOpen(o => !o)}
      style={{ background: "var(--ink)", border: `1px solid var(--border)`, borderRadius: 12, padding: "13px 15px", marginBottom: 8, cursor: "pointer", transition: "border-color 0.18s" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = vs.border}
      onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 9, fontFamily: "var(--font-body)", fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: vs.color, background: `${vs.color}18`, padding: "3px 8px", borderRadius: 20, flexShrink: 0 }}>{r.verb}</span>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--parchment)", margin: 0, flex: 1, fontWeight: 500, lineHeight: 1.3 }}>{r.title}</p>
        <span style={{ color: "var(--clay)", opacity: 0.5, flexShrink: 0, display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
          <Icon name="chevron" size={12} />
        </span>
      </div>
      {open && (
        <div style={{ marginTop: 11, paddingTop: 11, borderTop: "1px solid var(--border)" }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: "0 0 9px", lineHeight: 1.65 }}>{r.body}</p>
          {r.action && (
            <div style={{ display: "flex", gap: 8, padding: "9px 11px", background: `${vs.color}0d`, borderRadius: 8, border: `1px solid ${vs.color}28` }}>
              <span style={{ color: vs.color, flexShrink: 0, marginTop: 1 }}><Icon name="check" size={11} /></span>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--parchment)", margin: 0, lineHeight: 1.55 }}>{r.action}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// --- RITUAL GUIDANCE ENGINE ---------------------------------------------------


export { buildRecommendations, RecommendationCard, buildRefinements, RefinementsCard };