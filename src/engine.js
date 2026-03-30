import { ACTIVE_RULES, CONFLICT_RULES, LAYER_ORDER, isScheduledToday, getNextUseLabel } from "./constants.js";

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
  const sort = arr => { const seen = new Set(); return arr.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; }).sort((a, b) => layerIndex(a.category) - layerIndex(b.category)); };
  return { am: sort(am), pm: sort(pm), periodic };
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
  if (!products.some(p => p.category === "SPF" || detectActives(p.ingredients).SPF)) flags.push({ severity: "missing", label: "No SPF in your vanity", detail: "Daily SPF is non-negotiable — even indoors, even in winter." });
  if (!products.some(p => p.category === "Moisturizer")) flags.push({ severity: "missing", label: "No moisturizer detected", detail: "A moisturizer is a foundational step in every ritual." });
  return { activeMap, flags };
}

function calcSpending(products) {
  const total = products.reduce((s, p) => s + (p.price || 0), 0);
  const byCategory = {};
  products.forEach(p => { byCategory[p.category] = (byCategory[p.category] || 0) + (p.price || 0); });
  return { total, byCategory };
}


export { isScheduledToday, getNextUseLabel, getCurrentSession, detectActives, buildRoutine, detectConflicts, analyzeShelf, calcSpending };