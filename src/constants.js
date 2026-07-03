// --- CONSTANTS ----------------------------------------------------------------

const CATEGORIES = ["Cleanser", "Toner", "Toning Pad", "Essence", "Serum", "Eye Cream", "Moisturizer", "Oil", "SPF", "Exfoliant", "Mask", "Mist", "Prescription", "Lip"];

const FREQUENCIES = [
  { id: "daily",       label: "Daily" },
  { id: "alternating", label: "Alternating nights" },
  { id: "2-3x",        label: "2–3× per week" },
  { id: "weekly",      label: "Once a week" },
  { id: "as-needed",   label: "As needed" },
];

// Helper: is a product scheduled for today given its frequency + start date?
function isScheduledToday(product) {
  const freq = product.frequency || "daily";
  if (freq === "daily") return true;
  if (freq === "as-needed") return false;
  const start = product.routineStartDate ? new Date(product.routineStartDate) : new Date();
  const today = new Date();
  const dayDiff = Math.floor((today - start) / 86400000);
  if (freq === "alternating") return dayDiff % 2 === 0;
  if (freq === "2-3x") return [0, 2, 4].includes(dayDiff % 7);
  if (freq === "weekly") return dayDiff % 7 === 0;
  return true;
}

// Helper: get a human label for when product is next due
function getNextUseLabel(product) {
  const freq = product.frequency || "daily";
  if (freq === "daily") return "Every day";
  if (freq === "as-needed") return "As needed";
  const start = product.routineStartDate ? new Date(product.routineStartDate) : new Date();
  const today = new Date();
  const dayDiff = Math.floor((today - start) / 86400000);
  if (freq === "alternating") {
    return dayDiff % 2 === 0 ? "Tonight" : "Tomorrow night";
  }
  if (freq === "2-3x") {
    const slot = dayDiff % 7;
    if ([0, 2, 4].includes(slot)) return "Today";
    const daysUntil = [0, 2, 4].map(s => (s - slot + 7) % 7).sort((a, b) => a - b)[0];
    return daysUntil === 1 ? "Tomorrow" : `In ${daysUntil} days`;
  }
  if (freq === "weekly") {
    const rem = dayDiff % 7;
    if (rem === 0) return "Today";
    return rem === 6 ? "Tomorrow" : `In ${7 - rem} days`;
  }
  return "";
}

const LAYER_ORDER = {
  Cleanser: 1, Toner: 2, "Toning Pad": 2.3, Mist: 2.5, Essence: 3, Exfoliant: 4,
  Serum: 5, Treatment: 5, Eye_Cream: 6, Moisturizer: 7, Oil: 8, SPF: 9,
  Mask: 10, Lip: 11,
};
const layerIndex = (cat) => LAYER_ORDER[cat.replace(" ", "_")] ?? 6;

const ACTIVE_RULES = {
  // Clinical-safety detection list. Any true retinoid must land on this
  // key so the PM-only session lock in getLockedSession/getAutoSession
  // fires and the non-daily frequency default (alternating / 2-3x) is
  // suggested — retinoids degrade in UV and are cumulative on the skin
  // barrier, so an AM-daily default is actively harmful. Keep in sync
  // with the name-based fallback in engine.js detectActivesFromProduct
  // and the server-side ingredient normalization in api/ask-cygne.js +
  // api/swan-sense-daily.js. bakuchiol is a plant-based retinol
  // alternative that isn't photosensitive, but we keep it under the
  // same key so its scheduling defaults match — conservative rather
  // than clinically strict.
  retinol:           { keywords: ["retinol", "retinal", "retinaldehyde", "retinyl palmitate", "retinoid", "retinoic acid", "tretinoin", "adapalene", "granactive retinoid", "hydroxypinacolone retinoate", "bakuchiol"], pmOnly: true },
  niacinamide:       { keywords: ["niacinamide", "nicotinamide"], pmOnly: false },
  "vitamin C":       { keywords: ["ascorbic acid", "l-ascorbic acid", "ascorbyl glucoside", "sodium ascorbyl phosphate", "magnesium ascorbyl phosphate", "ascorbyl tetraisopalmitate"], pmOnly: false },
  AHA:               { keywords: ["glycolic acid", "lactic acid", "mandelic acid", "malic acid", "tartaric acid", "alpha hydroxy acid", "aha"], pmOnly: true, dailyPadSafe: true },
  BHA:               { keywords: ["salicylic acid", "betaine salicylate", "beta hydroxy acid", "bha"], pmOnly: true, dailyPadSafe: true },
  PHA:               { keywords: ["gluconolactone", "lactobionic acid", "galactose", "polyhydroxy"], pmOnly: false, dailyPadSafe: true },
  "hyaluronic acid": { keywords: ["hyaluronic acid", "sodium hyaluronate"], pmOnly: false },
  peptides:          { keywords: ["palmitoyl", "acetyl hexapeptide", "matrixyl", "argireline", "copper peptide", "tripeptide"], pmOnly: false },
  "benzoyl peroxide":{ keywords: ["benzoyl peroxide"], pmOnly: false },
  SPF:               { keywords: ["zinc oxide", "titanium dioxide", "avobenzone", "octinoxate", "octocrylene", "uvinul", "tinosorb", "uvasorb"], pmOnly: false },
  ceramides:         { keywords: ["ceramide np", "ceramide ap", "ceramide elp", "ceramide eg"], pmOnly: false },
};

const ACTIVE_SESSION = {
  retinol: "pm", AHA: "pm", BHA: "pm", "vitamin C": "am", SPF: "am",
  niacinamide: "both", "hyaluronic acid": "both", peptides: "pm", ceramides: "both",
};

// `irreconcilable: true` flags pairs that can't be safely scheduled around —
// the molecules deactivate each other on contact, so even alternating nights
// leaves residue that affects the other product. These are the only pairs
// the UI surfaces as a one-line note; everything else is handled silently
// by the routine engine via AM/PM splits and alternating-night sequencing.
const CONFLICT_RULES = [
  { pair: ["retinol", "vitamin C"],         severity: "warning", reason: "These degrade each other and heighten irritation. Use Vitamin C in the morning, retinol at night." },
  { pair: ["retinol", "AHA"],               severity: "warning", reason: "Retinol + AHA together risks barrier damage. Alternate on separate evenings." },
  { pair: ["retinol", "BHA"],               severity: "warning", reason: "Retinol + BHA is too active at once. Rotate to different nights." },
  { pair: ["retinol", "PHA"],               severity: "caution", reason: "PHA is gentler than AHA/BHA but still exfoliating. Alternate evenings with retinol to avoid stacking." },
  { pair: ["vitamin C", "niacinamide"],     severity: "caution", reason: "At high concentrations these may reduce each other's efficacy. Apply with a gap, or use on alternating days." },
  // Both sit around pH 3–4 and are acid-forward — stacking on the same
  // application can compound acidity, sting a compromised barrier, and
  // reduce the antioxidant benefit of Vitamin C. Auto-scheduling already
  // routes VitC to AM and AHA to PM in most cases (so detectConflicts'
  // shares-session gate self-suppresses this rule for the default setup);
  // the caution surfaces only when the user has manually forced both into
  // the same session, which is the shape where the harm actually lands.
  { pair: ["AHA", "vitamin C"],             severity: "caution", reason: "Both are acid-forward — layering on the same application can sting a compromised barrier and reduce Vitamin C's antioxidant benefit. Best split: Vitamin C AM, AHA PM." },
  { pair: ["AHA", "BHA"],                   severity: "caution", reason: "Daily AHA + BHA risks chronic over-exfoliation. Alternate days or use one per session." },
  { pair: ["AHA", "PHA"],                   severity: "caution", reason: "Layering PHA on top of AHA compounds exfoliation. Use one per session." },
  { pair: ["BHA", "PHA"],                   severity: "caution", reason: "Layering PHA on top of BHA compounds exfoliation. Use one per session." },
  { pair: ["retinol", "benzoyl peroxide"],  severity: "warning", irreconcilable: true, reason: "Benzoyl peroxide oxidizes and deactivates retinol. Keep these in entirely separate rituals." },
  { pair: ["vitamin C", "benzoyl peroxide"],severity: "warning", irreconcilable: true, reason: "Benzoyl peroxide oxidizes Vitamin C and degrades both. Use in separate sessions — Vitamin C AM, BP at a different time." },
];

export { CATEGORIES, FREQUENCIES, LAYER_ORDER, layerIndex, ACTIVE_RULES, ACTIVE_SESSION, CONFLICT_RULES, isScheduledToday, getNextUseLabel };