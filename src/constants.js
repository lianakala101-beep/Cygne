// --- CONSTANTS ----------------------------------------------------------------

const CATEGORIES = ["Cleanser", "Toner", "Toning Pad", "Essence", "Serum", "Eye Cream", "Moisturizer", "SPF Moisturizer", "Oil", "SPF", "Exfoliant", "Mask", "Mist", "Treatment", "Prescription", "Lip"];

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
  "Cleanser": 1, "Toner": 2, "Toning Pad": 2.3, "Mist": 2.5, "Essence": 3, "Exfoliant": 4,
  "Serum": 5, "Treatment": 5.4, "Prescription": 5.5,
  "Eye Cream": 6, "Moisturizer": 7, "SPF Moisturizer": 7.5, "Oil": 8,
  "SPF": 9, "Mask": 10, "Lip": 11,
};
const layerIndex = (cat) => LAYER_ORDER[cat] ?? 6;

const ACTIVE_RULES = {
  retinol:           { keywords: ["retinol", "retinyl palmitate", "tretinoin", "retinaldehyde", "bakuchiol"], pmOnly: true },
  niacinamide:       { keywords: ["niacinamide", "nicotinamide"], pmOnly: false },
  "vitamin C":       { keywords: ["ascorbic acid", "l-ascorbic acid", "ascorbyl glucoside", "sodium ascorbyl phosphate", "magnesium ascorbyl phosphate", "ascorbyl tetraisopalmitate"], pmOnly: false },
  AHA:               { keywords: ["glycolic acid", "lactic acid", "mandelic acid", "malic acid", "tartaric acid"], pmOnly: true, dailyPadSafe: true },
  BHA:               { keywords: ["salicylic acid", "betaine salicylate"], pmOnly: true, dailyPadSafe: true },
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

const CONFLICT_RULES = [
  { pair: ["retinol", "vitamin C"],       severity: "warning", reason: "These degrade each other and heighten irritation. Use Vitamin C in the morning, retinol at night." },
  { pair: ["retinol", "AHA"],             severity: "warning", reason: "Retinol + AHA together risks barrier damage. Alternate on separate evenings." },
  { pair: ["retinol", "BHA"],             severity: "warning", reason: "Retinol + BHA is too active at once. Rotate to different nights." },
  { pair: ["vitamin C", "niacinamide"],   severity: "caution", reason: "At high concentrations these may reduce each other's efficacy. Apply with a gap, or use on alternating days." },
  { pair: ["AHA", "BHA"],                severity: "caution", reason: "Daily AHA + BHA risks chronic over-exfoliation. Alternate days or use one per session." },
  { pair: ["retinol", "benzoyl peroxide"],severity: "warning", reason: "Benzoyl peroxide oxidizes and deactivates retinol. Keep these in entirely separate rituals." },
];

const SAMPLE_PRODUCTS = [
  { id: "1", brand: "La Roche-Posay", name: "Toleriane Hydrating Gentle Cleanser", category: "Cleanser", price: 15.99, ingredients: ["water", "glycerin", "ceramide np", "ceramide ap", "ceramide elp", "niacinamide", "sodium hyaluronate"], dateAdded: "2024-11-01" },
  { id: "2", brand: "Paula's Choice", name: "2% BHA Liquid Exfoliant", category: "Exfoliant", price: 34.00, ingredients: ["butylene glycol", "salicylic acid", "methylpropanediol"], dateAdded: "2024-11-10" },
  { id: "3", brand: "The Ordinary", name: "Niacinamide 10% + Zinc 1%", category: "Serum", price: 6.50, ingredients: ["niacinamide", "zinc pca", "aqua", "glycerin"], dateAdded: "2024-10-15" },
  { id: "4", brand: "Tatcha", name: "The Dewy Skin Cream", category: "Moisturizer", price: 68.00, ingredients: ["water", "glycerin", "squalane", "niacinamide", "japanese purple rice", "uva ursi leaf extract"], dateAdded: "2024-12-01" },
  { id: "5", brand: "Supergoop!", name: "Unseen Sunscreen SPF 40", category: "SPF", price: 38.00, ingredients: ["avobenzone", "homosalate", "octisalate", "octocrylene", "glycerin", "squalane"], dateAdded: "2024-11-20" },
  { id: "6", brand: "COSRX", name: "Snail 96 Mucin Power Essence", category: "Serum", price: 24.00, ingredients: ["snail secretion filtrate", "sodium hyaluronate", "betaine", "glycerin"], dateAdded: "2024-10-01" },
  { id: "7", brand: "The Ordinary", name: "Retinol 0.5% in Squalane", category: "Treatment", price: 11.90, ingredients: ["squalane", "retinol", "solanum lycopersicum"], dateAdded: "2024-12-10" },
];


export { CATEGORIES, FREQUENCIES, LAYER_ORDER, layerIndex, ACTIVE_RULES, ACTIVE_SESSION, CONFLICT_RULES, SAMPLE_PRODUCTS, isScheduledToday, getNextUseLabel };