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

function buildRoutine(products) {
  products = products.filter(p => p.inRoutine !== false);
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

    // Category-based session lock (matches getLockedSession in productmodal)
    if (p.category === "SPF")          { am.push(p); return; }
    if (p.category === "Prescription") { pm.push(p); return; }

    // Ingredient auto-detection fallback
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
  const sort = arr => { const seen = new Set(); return arr.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; }).sort((a, b) => layerIndex(a.category) - layerIndex(b.category)); };
  return { am: sort(am), pm: sort(pm), periodic };
}

// Many toning pads list their acid blend on the box but not in app data.
// Treat anything categorized as a toning pad / pad-named product as having
// at minimum BHA-like exfoliating action, and surface AHA when "aha" or
// "glycolic" appears in the name.
const PAD_NAME_RE = /\b(pad|peel|scrub|exfolian)/i;
export function isExfoliantLike(product) {
  if (!product) return false;
  if (product.category === "Exfoliant") return true;
  if (product.category === "Toning Pad") return true;
  if (PAD_NAME_RE.test(product.name || "")) return true;
  const a = detectActives(product.ingredients || []);
  return !!(a.AHA || a.BHA || a.PHA);
}

// Like detectActives, but also infers an exfoliant signature from the
// product's category and name when the ingredient list doesn't list explicit
// acids. Used by conflict detection so toning pads still get flagged when
// stacked with retinol or other exfoliants.
export function detectActivesFromProduct(product) {
  if (!product) return {};
  const actives = { ...detectActives(product.ingredients || []) };
  const name = (product.name || "").toLowerCase();
  const isPadCategory = product.category === "Toning Pad";
  const looksLikePad = PAD_NAME_RE.test(product.name || "");
  if ((isPadCategory || looksLikePad) && !actives.AHA && !actives.BHA && !actives.PHA) {
    // Default an unspecified pad to BHA — most clarifying pads are salicylic.
    actives.BHA = true;
  }
  if (/\baha\b|glycolic|lactic|mandelic/i.test(name) && !actives.AHA) actives.AHA = true;
  if (/\bbha\b|salicylic/i.test(name) && !actives.BHA) actives.BHA = true;
  if (/\bpha\b|gluconolactone|lactobionic|polyhydroxy/i.test(name) && !actives.PHA) actives.PHA = true;
  if (/retinol|retinaldehyde|tretinoin/i.test(name) && !actives.retinol) actives.retinol = true;
  if (/benzoyl peroxide|\bbpo\b/i.test(name) && !actives["benzoyl peroxide"]) actives["benzoyl peroxide"] = true;
  return actives;
}

function detectConflicts(products) {
  const pam = products.map(p => ({ product: p, actives: Object.keys(detectActivesFromProduct(p)) }));
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
  const exfCount = products.filter(p => isExfoliantLike(p)).length;
  if (exfCount > 1) flags.push({ severity: "warning", label: `${exfCount} exfoliants detected`, detail: "Multiple exfoliants — including toning pads — risk barrier damage. Alternate days, never layer in the same session." });
  if (!products.some(p => p.category === "SPF" || p.category === "SPF Moisturizer" || detectActives(p.ingredients || []).SPF)) flags.push({ severity: "missing", label: "No SPF in your vanity", detail: "Daily SPF is non-negotiable — even indoors, even in winter." });
  if (!products.some(p => p.category === "Moisturizer" || p.category === "SPF Moisturizer" || p.category === "Oil")) flags.push({ severity: "missing", label: "No moisturizer detected", detail: "A moisturizer is a foundational step in every ritual." });
  return { activeMap, flags };
}

function calcSpending(products) {
  const total = products.reduce((s, p) => s + (p.price || 0), 0);
  const byCategory = {};
  products.forEach(p => { byCategory[p.category] = (byCategory[p.category] || 0) + (p.price || 0); });
  return { total, byCategory };
}


// Humectant-forward products absorb best on damp skin (Essence/HA Serum/etc).
const DAMP_KEYWORDS = ["hyaluronic", "sodium hyaluronate", "glycerin", "panthenol", "sodium pca", "urea", "propylene glycol", "butylene glycol"];
const DAMP_CATEGORIES = ["Essence", "Toner", "Mist"];
export function isDampSkinProduct(product) {
  if (!product) return false;
  if (DAMP_CATEGORIES.includes(product.category)) return true;
  const ingArr = Array.isArray(product.ingredients)
    ? product.ingredients
    : typeof product.ingredients === "string"
      ? product.ingredients.split(",").map(s => s.trim()).filter(Boolean)
      : [];
  const lower = ingArr.map(i => i.toLowerCase());
  return DAMP_KEYWORDS.some(k => lower.some(ing => ing.includes(k)));
}

// Returns the conflict rules a single product participates in, given the
// full product list. Used by Vanity cards to surface per-product warnings.
export function getProductConflicts(product, products = []) {
  if (!product) return [];
  return detectConflicts(products).filter(c =>
    (c.productsA || []).some(p => p.id === product.id) ||
    (c.productsB || []).some(p => p.id === product.id)
  );
}

export { isScheduledToday, getNextUseLabel, getCurrentSession, detectActives, buildRoutine, detectConflicts, analyzeShelf, calcSpending };

export function hasSPFCoverage(products, activeMap) {
  return products.some(p => p.category === "SPF" || p.category === "SPF Moisturizer" || (p.ingredients && detectActives(p.ingredients).SPF));
}
