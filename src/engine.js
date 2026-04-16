import { ACTIVE_RULES, ACTIVE_SESSION, CONFLICT_RULES, LAYER_ORDER, layerIndex, isScheduledToday, getNextUseLabel } from "./constants.js";

// --- TIME-OF-DAY --------------------------------------------------------------
function getCurrentSession() {
  const hour = new Date().getHours(); // local time
  return hour >= 5 && hour < 18 ? "am" : "pm";
}

// --- ENGINE -------------------------------------------------------------------

function detectActives(ingredients) {
  const ingArr = Array.isArray(ingredients)
    ? ingredients
    : typeof ingredients === "string"
      ? ingredients.split(",").map(s => s.trim()).filter(Boolean)
      : [];
  const lower = ingArr.map(i => i.toLowerCase());
  const found = {};
  for (const [active, { keywords }] of Object.entries(ACTIVE_RULES)) {
    if (keywords.some(k => lower.some(ing => ing.includes(k)))) found[active] = true;
  }
  return found;
}

// --- DAMP-SKIN DETECTION ----------------------------------------------------
// Products that absorb best when applied to damp skin: essences and
// HA-dominant light serums. We bump them right after toner/essence so they
// sit before heavier serums in the routine order.
const DAMP_HUMECTANTS = [
  "hyaluronic acid", "sodium hyaluronate", "sodium acetylated hyaluronate",
  "hydrolyzed hyaluronic acid", "glycerin", "panthenol", "betaine",
];
function isDampSkinProduct(p) {
  if (!p) return false;
  if (p.applyOnDamp === true) return true;
  if (p.applyOnDamp === false) return false;
  if (p.category === "Essence") return true;
  if (p.category !== "Serum") return false;
  // Serum counts as damp-skin when a humectant (HA, glycerin, panthenol)
  // appears in the first 3 ingredients AND no heavy retinol/AHA/BHA/vitC/peptide.
  const ing = Array.isArray(p.ingredients)
    ? p.ingredients
    : typeof p.ingredients === "string"
      ? p.ingredients.split(",").map(s => s.trim()).filter(Boolean)
      : [];
  const firstThree = ing.slice(0, 3).map(i => i.toLowerCase());
  const hasDampHumectant = firstThree.some(i => DAMP_HUMECTANTS.some(h => i.includes(h)));
  if (!hasDampHumectant) return false;
  const actives = detectActives(ing);
  const hasHeavyActive = ["retinol", "AHA", "BHA", "vitamin C", "peptides"].some(a => actives[a]);
  return !hasHeavyActive;
}

// Effective ordering index. Damp-skin Serums get bumped to 3.7 so they sit
// between Essence (3) and Exfoliant (4) / regular Serum (5).
function effectiveLayer(p, session) {
  const base = layerIndex(p.category);
  if (isDampSkinProduct(p) && base >= 4) return 3.7;
  return base;
}

function buildRoutine(products, { pausedActives = [] } = {}) {
  products = products.filter(p => p.inRoutine !== false);
  // Exclude products whose detected active is currently paused by a
  // treatment recovery phase. The product stays in the vanity and in
  // Introduce Slowly — it just doesn't appear in today's ritual.
  if (pausedActives.length > 0) {
    products = products.filter(p => {
      const actives = detectActives(p.ingredients);
      return !pausedActives.some(a => actives[a]);
    });
  }
  const am = [], pm = [];
  // Periodic = classic exfoliant/mask categories OR any product explicitly set to weekly/2-3x/as-needed
  const periodic = products.filter(p =>
    p.category === "Exfoliant" || p.category === "Mask" ||
    ["2-3x", "weekly", "as-needed"].includes(p.frequency)
  );
  const daily = products.filter(p =>
    !periodic.includes(p)
  ); // includes daily, alternating, toning pads
  daily.forEach(p => {
    // User-specified session overrides all auto-detection
    if (p.session === "am")   { am.push(p); return; }
    if (p.session === "pm")   { pm.push(p); return; }
    if (p.session === "both") { am.push(p); pm.push(p); return; }

    // Auto-detection fallback
    const actives = detectActives(p.ingredients);
    const isToningPad = p.category === "Toning Pad";
    if (isToningPad) {
      const hasBHA = actives["BHA"];
      const hasAHA = actives["AHA"];
      if (hasAHA && !hasBHA) { pm.push(p); }
      else { am.push(p); pm.push(p); }
      return;
    }
    const hasPMOnly = Object.keys(actives).some(a => ACTIVE_RULES[a]?.pmOnly);
    const hasAMPref = Object.keys(actives).some(a => ACTIVE_SESSION[a] === "am");
    if (hasPMOnly) { pm.push(p); }
    else if (hasAMPref) { am.push(p); if (["Cleanser", "Moisturizer", "Toner", "Essence", "Mist"].includes(p.category)) pm.push(p); }
    else { am.push(p); pm.push(p); }
  });
  const sort = (arr, session) => {
    const seen = new Set();
    return arr
      .filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; })
      .sort((a, b) => effectiveLayer(a, session) - effectiveLayer(b, session));
  };
  return { am: sort(am, "am"), pm: sort(pm, "pm"), periodic };
}

function detectConflicts(products) {
  const pam = products.map(p => ({ product: p, actives: Object.keys(detectActives(p.ingredients)) }));
  return CONFLICT_RULES.reduce((acc, rule) => {
    const [a, b] = rule.pair;
    const pA = pam.filter(p => p.actives.includes(a)).map(p => p.product);
    const pB = pam.filter(p => p.actives.includes(b)).map(p => p.product);
    if (pA.length && pB.length) {
      // Suppress conflict if all products on both sides are intentionally alternating —
      // they never share a night so the conflict doesn't apply
      const allAlternating = [...pA, ...pB].every(p => p.frequency === "alternating");
      if (!allAlternating) acc.push({ ...rule, productsA: pA, productsB: pB });
    }
    return acc;
  }, []);
}

function analyzeShelf(products) {
  const activeMap = {};
  const flags = [];
  products.forEach(p => { Object.keys(detectActives(p.ingredients)).forEach(a => { if (!activeMap[a]) activeMap[a] = []; activeMap[a].push(p); }); });
  for (const [active, prods] of Object.entries(activeMap)) {
    if (prods.length > 1 && !["hyaluronic acid", "ceramides"].includes(active)) {
      if (active === "niacinamide" && prods.length <= 2) continue;
      flags.push({ severity: "caution", label: `${active} in ${prods.length} products`, detail: prods.map(p => p.name).join(", ") });
    }
  }
  const exfCount = products.filter(p => { const a = detectActives(p.ingredients); return a.AHA || a.BHA || p.category === "Exfoliant"; }).length;
  if (exfCount > 1) flags.push({ severity: "warning", label: `${exfCount} exfoliants detected`, detail: "Multiple exfoliants risk barrier damage. Alternate days — never layer." });

  // SPF coverage — include dedicated SPF, SPF Moisturizer, or any product with UV filters
  const dedicatedSpf = products.filter(p => p.category === "SPF" || p.category === "SPF Moisturizer");
  const hasAnySpf = dedicatedSpf.length > 0 || products.some(p => detectActives(p.ingredients).SPF);
  if (!hasAnySpf) {
    flags.push({ severity: "missing", label: "No SPF in your vanity", detail: "Daily SPF is non-negotiable — even indoors, even in winter." });
  } else {
    // Only low-SPF moisturizers with SPF <= 15 and no dedicated high-SPF product
    const highSpf = dedicatedSpf.find(p => !p.spf || p.spf >= 30);
    const lowSpfOnly = !highSpf && dedicatedSpf.every(p => p.spf && p.spf <= 15);
    if (dedicatedSpf.length && lowSpfOnly) {
      flags.push({ severity: "caution", label: "Only low SPF detected", detail: "Your only sun protection is SPF 15 or lower. Add a dedicated SPF 30+ for reliable daily protection." });
    }
  }

  // Retinol / AHA / BHA without any SPF
  const hasRetinolOrAcid = products.some(p => { const a = detectActives(p.ingredients); return a.retinol || a.AHA || a.BHA; });
  if (hasRetinolOrAcid && !hasAnySpf) {
    flags.push({ severity: "warning", label: "Actives without SPF", detail: "Retinol, AHAs, and BHAs increase photosensitivity. A dedicated SPF is required in your routine." });
  }

  // Moisturizer coverage — SPF Moisturizer also counts
  if (!products.some(p => p.category === "Moisturizer" || p.category === "SPF Moisturizer")) {
    flags.push({ severity: "missing", label: "No moisturizer detected", detail: "A moisturizer is a foundational step in every ritual." });
  }
  return { activeMap, flags };
}

function calcSpending(products) {
  const total = products.reduce((s, p) => s + (p.price || 0), 0);
  const byCategory = {};
  products.forEach(p => { byCategory[p.category] = (byCategory[p.category] || 0) + (p.price || 0); });
  return { total, byCategory };
}


export { isScheduledToday, getNextUseLabel, getCurrentSession, detectActives, buildRoutine, detectConflicts, analyzeShelf, calcSpending, isDampSkinProduct };