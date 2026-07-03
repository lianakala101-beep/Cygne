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
  // Kept in sync with ACTIVE_RULES.retinol.keywords in constants.js. The
  // `retin(ol|al|oid|yl|oic)` group covers the retinol/retinal/retinoid/
  // retinyl/retinoic-acid family in one alternation.
  if (/retin(ol|al|oid|yl|oic)|tretinoin|adapalene|granactive|hydroxypinacolone/i.test(name) && !actives.retinol) actives.retinol = true;
  if (/benzoyl peroxide|\bbpo\b/i.test(name) && !actives["benzoyl peroxide"]) actives["benzoyl peroxide"] = true;
  return actives;
}

// Returns the sessions a product is scheduled into. Mirrors buildRoutine's
// daily auto-assignment so periodic products (exfoliants/masks) and shelf
// products without an explicit session still resolve to the slot they'd
// land in if used. Used by detectConflicts so we only flag pairs that
// actually share a session.
export function getProductSessions(product) {
  if (!product) return new Set();
  if (product.session === "am")   return new Set(["am"]);
  if (product.session === "pm")   return new Set(["pm"]);
  if (product.session === "both") return new Set(["am", "pm"]);
  if (product.category === "SPF")          return new Set(["am"]);
  if (product.category === "Prescription") return new Set(["pm"]);
  const actives = detectActives(product.ingredients || []);
  if (product.category === "Toning Pad") {
    if (actives.AHA && !actives.BHA) return new Set(["pm"]);
    return new Set(["am", "pm"]);
  }
  const hasPMOnly = Object.keys(actives).some(a => ACTIVE_RULES[a]?.pmOnly);
  const hasAMPref = Object.keys(actives).some(a => ACTIVE_SESSION[a] === "am");
  if (hasPMOnly) return new Set(["pm"]);
  if (hasAMPref) {
    if (["Cleanser", "Moisturizer", "Toner", "Essence", "Mist"].includes(product.category)) return new Set(["am", "pm"]);
    return new Set(["am"]);
  }
  return new Set(["am", "pm"]);
}

function detectConflicts(products) {
  const pam = products.map(p => ({ product: p, actives: Object.keys(detectActivesFromProduct(p)) }));
  return CONFLICT_RULES.reduce((acc, rule) => {
    const [a, b] = rule.pair;
    const pA = pam.filter(p => p.actives.includes(a)).map(p => p.product);
    const pB = pam.filter(p => p.actives.includes(b)).map(p => p.product);
    if (!pA.length || !pB.length) return acc;

    // Only flag the pair when at least one product on each side lands in
    // the same session. If retinol is auto-scheduled to PM and vitamin C
    // to AM, the routine engine has already resolved the incompatibility
    // by splitting them — surfacing a warning would be a false positive.
    const sharesSession = pA.some(prodA => {
      const aSes = getProductSessions(prodA);
      return pB.some(prodB => {
        if (prodA.id === prodB.id) return false;
        const bSes = getProductSessions(prodB);
        for (const s of aSes) if (bSes.has(s)) return true;
        return false;
      });
    });
    if (!sharesSession) return acc;

    // Non-daily frequency (alternating / 2-3x / weekly / as-needed) means
    // the products may only overlap on some nights — but even one shared
    // night is enough for a barrier-damaging combo like retinol + AHA to
    // land. Prior behaviour was to suppress the whole flag when any
    // involved product was non-daily; that hid real risk from users who
    // were technically "spacing" one active but layering the other on
    // shared nights (e.g. retinol on alternating + AHA on daily → they
    // stack every other PM). Under-warning here is worse than a soft
    // over-warn, so surface the flag and append an intermittency note so
    // the copy matches the shape of the risk. Pass `intermittent` through
    // on the returned rule so consumers that render their own copy can
    // still choose different phrasing.
    const anyNonDaily = [...pA, ...pB].some(p => p.frequency && p.frequency !== "daily");
    const reason = anyNonDaily
      ? `${rule.reason} On nights you use both, the interaction still applies — the non-daily schedule only reduces how often it happens, not whether it happens.`
      : rule.reason;

    acc.push({ ...rule, reason, productsA: pA, productsB: pB, intermittent: anyNonDaily });
    return acc;
  }, []);
}

function analyzeShelf(products) {
  const activeMap = {};
  const flags = [];
  // Use the product-aware detector so toning pads (and pad-named or
  // active-named products with sparse ingredient lists) participate in
  // activeMap. This is what every downstream consumer — intelligence,
  // swansense, treatment recovery — already expects.
  products.forEach(p => { Object.keys(detectActivesFromProduct(p)).forEach(a => { if (!activeMap[a]) activeMap[a] = []; activeMap[a].push(p); }); });
  for (const [active, prods] of Object.entries(activeMap)) {
    if (prods.length > 1 && !["hyaluronic acid", "ceramides"].includes(active)) {
      if (active === "niacinamide" && prods.length <= 2) continue;
      // Stacking two retinoids (retinol + tretinoin, adapalene + retinol,
      // any true retinoid + bakuchiol under our conservative grouping)
      // multiplies cumulative irritation and barrier compromise beyond
      // what an "N products share this active" caution communicates. When
      // any of the involved products are in-routine, upgrade to a hard
      // warning with retinoid-specific copy pointing to the actual harm
      // rather than the generic "you have duplicates" framing.
      if (active === "retinol") {
        const inRoutine = prods.filter(p => p?.inRoutine !== false);
        if (inRoutine.length >= 2) {
          flags.push({
            severity: "warning",
            label: `${inRoutine.length} retinoids in your ritual`,
            detail: `Stacking retinoids multiplies irritation and barrier stress — even at different strengths. Keep one in your active ritual and rest the other. Involved: ${inRoutine.map(p => p.name).join(", ")}.`,
          });
          continue;
        }
      }
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

// Trim an ordered step list to match the user's stated routine philosophy.
// Categories considered "optional" cascade out as the philosophy gets
// shorter:
//   Multi-Step / blank   → keep everything
//   Somewhere In Between → drop Mask + Oil
//   Minimalist           → also drop Eye Cream + Mist + Toning Pad
// Active core layers (Cleanser, Toner, Essence, Serum, Moisturizer, SPF,
// Prescription) are always preserved regardless of philosophy.
export function applyPhilosophy(steps, philosophy = "") {
  if (!Array.isArray(steps) || !steps.length) return steps;
  const p = String(philosophy).toLowerCase();
  if (!p || p.includes("multi-step")) return steps;
  const drop = new Set();
  if (p.includes("somewhere") || p.includes("between")) {
    ["Mask", "Oil"].forEach(c => drop.add(c));
  } else if (p.includes("minimal")) {
    ["Mask", "Oil", "Eye Cream", "Mist", "Toning Pad"].forEach(c => drop.add(c));
  }
  return steps.filter(s => !drop.has(s.category));
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
