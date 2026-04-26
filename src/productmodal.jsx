import { useState, useRef, useEffect } from "react";
import { Icon, Section } from "./components.jsx";
import { detectActives, analyzeShelf } from "./engine.js";
import { CATEGORIES, FREQUENCIES } from "./constants.js";
import { DEFER_TAG_CONFIG } from "./modals.jsx";
import { compressImage } from "./utils.jsx";
import { supabase, invokeEdgeFunction } from "./supabase.js";

function RoutineFitSheet({ product, assessment, onAddNow, onDefer, onClose }) {
  const isDefer = assessment.verdict === "defer";
  const tagCfg = isDefer ? DEFER_TAG_CONFIG[assessment.deferTag] : null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(8,10,9,0.82)", backdropFilter: "blur(10px)", zIndex: 110, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "var(--ink)", width: "100%", maxWidth: 520, borderRadius: "20px 20px 0 0", padding: "28px 24px 48px", border: "1px solid var(--border)", borderBottom: "none" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
          <div>
            <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 5px" }}>Ritual Fit</p>
            <h2 style={{ fontFamily: "Pinyon Script, cursive", fontSize: 22, fontWeight: 400, color: "var(--parchment)", margin: 0 }}>{product.name}</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", padding: 4 }}><Icon name="x" size={17} /></button>
        </div>

        {/* Positive read — shown on both add and defer */}
        {assessment.positiveRead && (
          <div style={{ background: "rgba(122,144,112,0.08)", border: "1px solid rgba(122,144,112,0.2)", borderRadius: 12, padding: "13px 16px", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#6e8a72", marginTop: 5, flexShrink: 0 }} />
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 12, color: "var(--parchment)", margin: 0, lineHeight: 1.6 }}>{assessment.positiveRead}</p>
            </div>
          </div>
        )}

        {/* Defer reason card */}
        {isDefer && (
          <div style={{ background: tagCfg.bg, border: `1px solid ${tagCfg.color}40`, borderRadius: 12, padding: "14px 16px", marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ padding: "2px 9px", borderRadius: 20, background: `${tagCfg.color}20`, border: `1px solid ${tagCfg.color}50`, fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: tagCfg.color }}>
                {tagCfg.label}
              </span>
              <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, fontWeight: 600, color: "var(--parchment)" }}>{assessment.reason}</span>
            </div>
            <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 12, color: "var(--clay)", margin: 0, lineHeight: 1.65 }}>{assessment.detail}</p>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {isDefer ? (
            <>
              <button onClick={onDefer}
                style={{ width: "100%", padding: "14px 0", background: "#6e8a72", color: "#0d0f0d", border: "none", borderRadius: 10, fontFamily: "Space Grotesk, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer" }}>
                Save for Later
              </button>
              <button onClick={onAddNow}
                style={{ width: "100%", padding: "13px 0", background: "transparent", color: "var(--clay)", border: "1px solid var(--border)", borderRadius: 10, fontFamily: "Space Grotesk, sans-serif", fontSize: 11, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>
                Add to Ritual Anyway
              </button>
            </>
          ) : (
            <button onClick={onAddNow}
              style={{ width: "100%", padding: "14px 0", background: "#6e8a72", color: "#0d0f0d", border: "none", borderRadius: 10, fontFamily: "Space Grotesk, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer" }}>
              Add to Ritual
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// FINISH MODAL

function getLockedSession(product) {
  const actives = Object.keys(detectActives(product.ingredients || []));
  if (product.category === "SPF")
    return { session: "am", reason: "Sunscreen is an AM-only step — it protects against UV during the day." };
  if (product.category === "Prescription")
    return { session: "pm", reason: "Prescription treatments containing retinoids or other actives are photosensitive — always PM." };
  if (actives.includes("vitamin C"))
    return { session: "am", reason: "Vitamin C pairs with SPF to neutralise free radicals. AM only." };
  if (actives.includes("benzoyl peroxide"))
    return { session: "am", reason: "Benzoyl peroxide degrades in UV and can bleach pillowcases — AM only." };
  if (actives.includes("retinol"))
    return { session: "pm", reason: "Retinoids are photosensitive and break down in sunlight. PM only." };
  if (actives.includes("AHA"))
    return { session: "pm", reason: "AHAs increase UV sensitivity — apply at night to avoid sun exposure." };
  if (actives.includes("BHA"))
    return { session: "pm", reason: "BHAs exfoliate inside the pore — PM lets skin recover overnight." };
  if (actives.includes("peptides"))
    return { session: "pm", reason: "Peptides support overnight repair and work best without UV interference." };
  return null;
}

// Soft auto-assignment: returns { session, reason } for products that aren't
// hard-locked.  The user sees this as the default but can override freely.
function getAutoSession(product) {
  const cat = product.category || "Serum";
  const actives = Object.keys(detectActives(product.ingredients || []));

  // SPF categories — always AM
  if (cat === "SPF" || cat === "SPF Moisturizer")
    return { session: "am", reason: "SPF protects against daytime UV — AM only." };

  // Prescription — PM
  if (cat === "Prescription")
    return { session: "pm", reason: "Prescription actives work best overnight." };

  // Active-driven
  if (actives.includes("vitamin C"))
    return { session: "am", reason: "Vitamin C pairs with SPF for daytime antioxidant protection." };
  if (actives.includes("retinol"))
    return { session: "pm", reason: "Retinol is photosensitive — PM only." };
  if (actives.includes("AHA"))
    return { session: "pm", reason: "AHAs increase sun sensitivity — best used at night." };
  if (actives.includes("BHA"))
    return { session: "pm", reason: "BHA exfoliates inside the pore — PM lets skin recover." };
  if (actives.includes("peptides"))
    return { session: "pm", reason: "Peptides support overnight repair." };
  if (actives.includes("benzoyl peroxide"))
    return { session: "am", reason: "Benzoyl peroxide can bleach pillowcases — AM is safer." };

  // Category-driven defaults
  if (["Cleanser", "Moisturizer", "Toner", "Essence", "Eye Cream", "Mist"].includes(cat))
    return { session: "both", reason: "A foundational step — use morning and night." };
  if (cat === "Oil" || cat === "Balm")
    return { session: "pm", reason: "Rich occlusives seal everything in overnight." };
  if (cat === "Exfoliant" || cat === "Toning Pad")
    return { session: "pm", reason: "Exfoliating steps are best used at night." };
  if (cat === "Mask")
    return { session: "pm", reason: "Masks work best in the evening on clean skin." };

  // Hydrating serums with HA/ceramides/niacinamide — both
  if (actives.includes("hyaluronic acid") || actives.includes("ceramides") || actives.includes("niacinamide"))
    return { session: "both", reason: "Hydrating actives benefit from twice-daily use." };

  // Default serum/treatment — both
  return { session: "both", reason: null };
}

// --- FREQUENCY SUGGESTION -------------------------------------------------------

function getSuggestedFrequency(product, user = {}) {
  const cat = product.category || "Serum";
  const actives = Object.keys(detectActives(product.ingredients || []));
  const ing = Array.isArray(product.ingredients) ? product.ingredients : typeof product.ingredients === "string" ? product.ingredients.split(",").map(s => s.trim()).filter(Boolean) : [];
  const lower = ing.map(i => i.toLowerCase());
  const isSensitive = user.skinType === "Sensitive" || (user.medicalHistory?.sensitivities?.length > 0);
  const onTret = user.medicalHistory?.onTretinoin;

  // --- SPF: always daily AM ---
  if (cat === "SPF" || cat === "SPF Moisturizer")
    return { id: "daily", reason: "Every morning without exception — SPF is non-negotiable." };

  // --- Prescription ---
  if (cat === "Prescription")
    return { id: "alternating", reason: "Start slow as prescribed — every other night, then build up." };

  // --- Exfoliant ---
  if (cat === "Exfoliant") {
    // Check for high-strength AHA (>10%)
    const pctMatch = lower.find(i => /glycolic|lactic|mandelic/.test(i) && /\d{2,}%/.test(i));
    if (pctMatch)
      return { id: "weekly", reason: "High-strength AHA — once a week max to protect your barrier." };
    if (isSensitive)
      return { id: "weekly", reason: "Sensitive skin does best with weekly exfoliation." };
    return { id: "2-3x", reason: "2-3 times per week gives your barrier time to recover between uses." };
  }

  // --- Mask ---
  if (cat === "Mask")
    return { id: "weekly", reason: "1-2 times per week is ideal — masks are a treat, not a daily step." };

  // --- Toning Pad ---
  if (cat === "Toning Pad") {
    if (isSensitive)
      return { id: "2-3x", reason: "Start at 2-3x per week — sensitive skin needs time to adjust." };
    return { id: "daily", reason: "Toning pads can be used daily — back off if you notice tightness." };
  }

  // --- Oil ---
  if (cat === "Oil")
    return { id: "daily", reason: "Facial oils work best as a nightly seal — daily PM use." };

  // --- Cleanser with actives ---
  if (cat === "Cleanser") {
    if (actives.includes("AHA") || actives.includes("BHA"))
      return { id: "2-3x", reason: "Exfoliating cleansers are best limited to 2-3x per week." };
    return { id: "daily", reason: "Gentle cleanser — use morning and night." };
  }

  // --- Retinol serums/treatments ---
  if (actives.includes("retinol")) {
    if (onTret)
      return { id: "alternating", reason: "On tretinoin — start every other night and build tolerance slowly." };
    if (isSensitive)
      return { id: "2-3x", reason: "Sensitive skin + retinol — start at 2x per week and build up." };
    return { id: "alternating", reason: "Start every other night — retinol needs time for your skin to adapt." };
  }

  // --- Vitamin C ---
  if (actives.includes("vitamin C"))
    return { id: "daily", reason: "Vitamin C works best with consistent daily AM use alongside SPF." };

  // --- AHA/BHA serums ---
  if (actives.includes("AHA")) {
    if (isSensitive)
      return { id: "weekly", reason: "AHA on sensitive skin — start once a week, increase if tolerated." };
    return { id: "2-3x", reason: "AHA serums 2-3 times per week — never layer with other exfoliants." };
  }
  if (actives.includes("BHA")) {
    if (isSensitive)
      return { id: "2-3x", reason: "BHA on sensitive skin — 2-3 times per week to start." };
    return { id: "daily", reason: "BHA is generally gentle enough for daily use — reduce if irritated." };
  }

  // --- Benzoyl peroxide ---
  if (actives.includes("benzoyl peroxide"))
    return { id: "daily", reason: "Daily use is standard — apply PM, and always follow with moisturizer." };

  // --- Default by category ---
  if (["Moisturizer", "Eye Cream", "Toner", "Essence", "Mist"].includes(cat))
    return { id: "daily", reason: "A foundational step — use daily, morning and night." };

  if (cat === "Serum") {
    if (actives.includes("peptides"))
      return { id: "daily", reason: "Peptides work best with consistent daily PM use." };
    return { id: "daily", reason: "Daily use — serums are most effective with consistent application." };
  }

  return { id: "daily", reason: null };
}

// Frequency ordering for overuse comparison (lower = less frequent)
const FREQ_RANK = { "weekly": 1, "as-needed": 1, "2-3x": 2, "alternating": 3, "daily": 4 };

function getOveruseWarning(chosenFreq, suggested, product) {
  const chosenRank = FREQ_RANK[chosenFreq] || 0;
  const suggestedRank = FREQ_RANK[suggested.id] || 0;
  if (chosenRank <= suggestedRank) return null;

  const actives = Object.keys(detectActives(product.ingredients || []));
  const cat = product.category || "Serum";
  const isHarsh = actives.includes("retinol") || actives.includes("AHA") || actives.includes("BHA") || cat === "Exfoliant" || cat === "Prescription";
  if (!isHarsh) return null;

  if (actives.includes("retinol"))
    return "Daily retinol can cause irritation and peeling. Consider alternating nights while your skin builds tolerance.";
  if (actives.includes("AHA"))
    return "Daily use of AHA may compromise your barrier over time. Consider alternating nights.";
  if (actives.includes("BHA") && cat === "Exfoliant")
    return "Daily exfoliation can over-strip your skin. Give your barrier recovery time between uses.";
  if (cat === "Exfoliant")
    return "Daily exfoliation risks barrier damage. Most skin does better with 2-3 uses per week.";
  if (cat === "Prescription")
    return "Increasing frequency beyond your prescribed schedule can cause irritation. Follow your provider's guidance.";
  return "Using this more frequently than recommended may irritate your skin. Adjust based on how your skin responds.";
}

// --- SESSION PICKER -----------------------------------------------------------

function ShelfLifeSection({ form, set }) {
  const [open, setOpen] = useState(false);
  const labelSt = { fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--clay)", display: "block", marginBottom: 5 };
  const inputSt2 = { width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", color: "var(--parchment)", fontFamily: "Space Grotesk, sans-serif", fontSize: 12, outline: "none", boxSizing: "border-box" };
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: "0 0 10px", cursor: "pointer" }}>
        <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--clay)", opacity: 0.6 }}>Shelf life & expiry</span>
        <span style={{ color: "var(--clay)", opacity: 0.4, display: "inline-flex", transform: open ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform 0.18s" }}><Icon name="chevron" size={10} /></span>
      </button>
      {open && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div><label style={labelSt}>Expiry date</label><input style={inputSt2} type="date" value={form.expiryDate || ""} onChange={e => set("expiryDate", e.target.value)} /></div>
            <div><label style={labelSt}>Opened on</label><input style={inputSt2} type="date" value={form.openedDate || ""} onChange={e => set("openedDate", e.target.value)} /></div>
          </div>
          <label style={labelSt}>PAO</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {[null, 3, 6, 9, 12, 18, 24].map(m => {
              const active = (form.paoMonths ?? null) === m;
              return (
                <button key={m ?? "none"} onClick={() => set("paoMonths", m)}
                  style={{ padding: "6px 13px", borderRadius: 20, border: "1px solid " + (active ? "var(--sage)" : "var(--border)"), background: active ? "rgba(122,144,112,0.18)" : "transparent", color: active ? "var(--parchment)" : "var(--clay)", fontFamily: "Space Grotesk, sans-serif", fontSize: 11, cursor: "pointer" }}>
                  {m === null ? "—" : m + "M"}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ProductModal({ product, onSave, onClose, user }) {
  const [form, setForm] = useState(product || { brand: "", name: "", category: "Serum", price: "", ingredients: "" });
  const [analyzing, setAnalyzing] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [modalStep, setModalStep] = useState(product && (product.id || product.brand) ? "form" : "choose");
  const fileRef = useRef();
  const isEdit = !!(product && product.id);
  const [freqTouched, setFreqTouched] = useState(isEdit);
  const [sessionTouched, setSessionTouched] = useState(isEdit);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Frequency suggestion based on category + ingredients + user profile
  const freqSuggestion = getSuggestedFrequency(form, user);
  const prevSuggestionRef = useRef(freqSuggestion.id);

  // Session auto-assignment based on category + ingredients
  const locked = getLockedSession({ ...form, id: product ? product.id : null });
  const autoSession = getAutoSession(form);
  // Resolve current effective session: locked > explicit user pick > auto
  const effectiveSession = locked ? locked.session : (form.session && form.session !== "auto") ? form.session : autoSession.session;
  const prevAutoRef = useRef(autoSession.session);

  // Auto-apply frequency suggestion when it changes (new products only)
  useEffect(() => {
    if (isEdit) return;
    if (freqSuggestion.id !== prevSuggestionRef.current) {
      prevSuggestionRef.current = freqSuggestion.id;
      if (!freqTouched) set("frequency", freqSuggestion.id);
    }
  }, [freqSuggestion.id]);

  // Auto-apply session when it changes (new products, or user hasn't manually picked)
  useEffect(() => {
    if (isEdit) return;
    if (autoSession.session !== prevAutoRef.current) {
      prevAutoRef.current = autoSession.session;
      if (!sessionTouched) set("session", autoSession.session);
    }
  }, [autoSession.session]);

  // Set initial frequency + session for new products
  useEffect(() => {
    if (!isEdit && !form.frequency) set("frequency", freqSuggestion.id);
    if (!isEdit && (!form.session || form.session === "auto")) set("session", autoSession.session);
  }, []);

  const overuseWarning = getOveruseWarning(form.frequency || "daily", freqSuggestion, form);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const searchTimeout = useRef(null);

  const OBF_CATEGORY_MAP = {
    "en:cleansers": "Cleanser", "en:face-cleansers": "Cleanser",
    "en:moisturizers": "Moisturizer", "en:face-creams": "Moisturizer",
    "en:serums": "Serum", "en:face-serums": "Serum",
    "en:sunscreens": "SPF", "en:sun-care": "SPF",
    "en:toners": "Toner", "en:face-toners": "Toner",
    "en:eye-creams": "Eye Cream", "en:face-oils": "Oil",
    "en:face-masks": "Mask", "en:exfoliants": "Exfoliant",
    "en:essences": "Essence",
  };

  const guessCategory = (tags) => {
    if (!tags) return null;
    for (var j = 0; j < tags.length; j++) {
      if (OBF_CATEGORY_MAP[tags[j]]) return OBF_CATEGORY_MAP[tags[j]];
    }
    return null;
  };

  const runSearch = async (q) => {
    if (!q || q.trim().length < 2) { setSearchResults([]); setSearchDone(false); return; }
    setSearching(true); setSearchDone(false);
    try {
      const url = "https://world.openbeautyfacts.org/cgi/search.pl?search_terms=" + encodeURIComponent(q) + "&search_simple=1&action=process&json=1&page_size=6&fields=product_name,brands,categories_tags,ingredients_text";
      const res = await fetch(url);
      const data = await res.json();
      setSearchResults((data.products || []).filter(p => p.product_name && p.brands).slice(0, 5));
    } catch (e) { setSearchResults([]); }
    setSearching(false); setSearchDone(true);
  };

  const handleSearchInput = (val) => {
    setSearchQuery(val);
    clearTimeout(searchTimeout.current);
    if (val.trim().length >= 2) searchTimeout.current = setTimeout(() => runSearch(val), 500);
    else { setSearchResults([]); setSearchDone(false); }
  };

  const applyResult = (p) => {
    const cat = guessCategory(p.categories_tags);
    const ingredients = p.ingredients_text
      ? p.ingredients_text.replace(/\*|\[|\]/g, "").split(/,|;/).map(s => s.trim().toLowerCase()).filter(Boolean).join(", ")
      : "";
    setForm(f => ({
      ...f,
      brand: (p.brands || "").split(",")[0].trim() || f.brand,
      name: (p.product_name || "").trim() || f.name,
      ...(cat ? { category: cat } : {}),
      ...(ingredients ? { ingredients } : {}),
    }));
    setSearchQuery(""); setSearchResults([]); setSearchDone(false);
    setModalStep("form");
  };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    console.log("[Cygne scan] 1. image selected:", file.name, "size:", file.size, "type:", file.type);
    setAnalyzing(true);
    setScanError(null);
    try {
      // Step 2: compress image
      console.log("[Cygne scan] 2. compressing image...");
      const base64 = await compressImage(file);
      console.log("[Cygne scan] 3. compressed base64 length:", base64.length, "(~" + Math.round(base64.length * 0.75 / 1024) + "KB)");

      // Step 3: call edge function via direct fetch (full error visibility)
      console.log("[Cygne scan] 4. calling rapid-action...");
      const data = await invokeEdgeFunction("rapid-action", {
        model: "claude-sonnet-4-20250514", max_tokens: 1500, messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
          { type: "text", text: "You are an international skincare product analyst with expertise across K-beauty, J-beauty, French pharmacy, Australian, British, and Western brands. Identify the product from this image. Fully support: KOREAN (COSRX, Beauty of Joseon, Anua, Some By Mi, Isntree, Innisfree, Laneige, Sulwhasoo, Missha, Etude House, Tirtir, Torriden, Mixsoon, Haruharu Wonder, Round Lab, Skin1004, Klairs, Purito, Iunik, Abib, Axis-Y, By Wishtrend, Medicube, Numbuzin, Rovectin, Pyunkang Yul, Dr. Ceuracle, Dr. Jart, I'm From, Benton, Sioris, Ma:nyo, Hanyul, Sum37, Belif, Neogen, Mediheal). JAPANESE (SK-II, Hada Labo, DHC, Shiseido, Tatcha, Rohto, Curel, Kose, Minon, Albion, Decorté, Sekkisei, Kanebo). FRENCH PHARMACY/LUXURY (La Roche-Posay, Avène, Bioderma, Vichy, Uriage, A-Derma, Caudalie, Nuxe, Embryolisse, Filorga, Biotherm, Clarins, Sisley, Darphin). AUSTRALIAN (Aesop, Ultra Violette, Sand & Sky, Jurlique, Grown Alchemist, Frank Body, Bondi Sands, Alpha-H, Rationale, Medik8). BRITISH/EUROPEAN (The Ordinary, NIOD, Deciem, Pai, Emma Hardie, Liz Earle, Eve Lom, Weleda, Dr. Hauschka, Eucerin, Allies of Skin). Read Hangul, Kanji/Hiragana/Katakana, French, and English text on packaging. CATEGORIZATION RULES — INGREDIENT-FIRST. Texture and ingredient profile ALWAYS override the product name. Priority: (1) primary active / functional ingredient, (2) format & texture, (3) product name LAST. INGREDIENT DECISION TREE: (a) Primary active is hyaluronic acid, niacinamide, vitamin C / ascorbic acid, retinol / retinoid, peptides, AHA, or BHA → Serum. A lightweight/watery HA-dominant 'lotion' or 'milk' is a SERUM, not a Moisturizer. (b) Primary base is ceramides, shea butter, squalane, or fatty acids in a THICK occlusive base → Moisturizer. (c) Lightweight with mostly humectants (glycerin, HA, panthenol) and no heavy active → Serum or Essence (Essence if watery/toner-adjacent, Serum if targeted). (d) Contains SPF 30+ → SPF (pure sunscreen) or SPF Moisturizer (combined with heavy hydration). (e) Contains surfactants / cleansing agents (sulfates, glucosides, betaines, micellar, amino-acid surfactants) → Cleanser. ASIAN FORMAT MAPPINGS (apply AFTER the ingredient tree): Korean/Japanese 'lotion', 'milky lotion', 'milk', '乳液/nyuueki', or '유액' with hydrating ingredients → Essence if watery, Moisturizer if creamy, Serum if HA/niacinamide-dominant — NEVER Cleanser. Korean 'skin' or 'softener' → Toner. 'Ampoule' → Serum. 'Emulsion' → lightweight Moisturizer. When uncertain, pick the category that best matches the ingredient profile. NEVER default to Serum without ingredient justification. SPF LOGIC: SPF 30+ pure sunscreen → 'SPF'; SPF 15 or lower in a moisturizer where hydration is primary → 'Moisturizer' (put SPF value in 'spf' field); SPF 30+ marketed as both moisturizer and sunscreen with heavy hydrating ingredients (ceramides, hyaluronic acid, shea butter, squalane, 'SPF moisturizer', 'day cream SPF', 'hydrating sunscreen') → 'SPF Moisturizer'. Return ONLY a JSON object with these exact fields: brand (string), name (string), category (one of: Cleanser/Toner/Essence/Serum/Eye Cream/Moisturizer/SPF Moisturizer/SPF/Oil/Exfoliant/Mask/Sleeping Mask/Sheet Mask/Treatment/Mist/Lip Care/Micellar Water), spf (numeric SPF level if present, else null), ingredients (comma-separated string of all visible ingredients, normalized to INCI English — oxyde de zinc → zinc oxide, acide hyaluronique → hyaluronic acid, melaleuca → tea tree oil, eau thermale → thermal spring water, galactomyces/pitera → Galactomyces Ferment Filtrate, snail mucin → snail secretion filtrate, centella asiatica, madecassoside, mugwort → Artemisia, propolis, rice ferment, birch sap, niacinamide, fullerenes, kakadu plum → Terminalia ferdinandiana), flags (comma-separated string of informational notes about US-restricted ingredients common abroad — Tinosorb S, Tinosorb M, Mexoryl SX, Mexoryl XL, Uvinul A Plus/T 150, Enzacamene, hydroquinone, tranexamic acid — these are notes NOT warnings). No markdown, no explanation, just the JSON object." }
        ]}]
      });
      console.log("[Cygne scan] 5. response:", JSON.stringify(data).slice(0, 500));

      // Step 6: parse response — handle both direct Anthropic format and wrapped
      let text;
      if (data && data.content && Array.isArray(data.content)) {
        text = data.content.map(c => c.text || "").join("");
      } else if (typeof data === "string") {
        text = data;
      } else {
        text = JSON.stringify(data);
      }
      console.log("[Cygne scan] 7. extracted text:", text.slice(0, 300));

      const clean = text.replace(/```json|```/g, "").trim();
      const jsonStart = clean.indexOf("{");
      const jsonEnd = clean.lastIndexOf("}");
      if (jsonStart < 0 || jsonEnd < 0) {
        console.error("[Cygne scan] 8. NO JSON found in response:", clean.slice(0, 200));
        setScanError("Scan returned unexpected format. Check console.");
        setModalStep("form"); setAnalyzing(false); return;
      }
      const jsonStr = clean.slice(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonStr);
      console.log("[Cygne scan] 8. parsed product:", parsed);
      const ing = Array.isArray(parsed.ingredients) ? parsed.ingredients.join(", ") : (parsed.ingredients || "");
      setForm(f => ({
        ...f,
        brand: parsed.brand || f.brand,
        name: parsed.name || f.name,
        category: parsed.category || f.category,
        spf: parsed.spf || f.spf || null,
        ingredients: ing || f.ingredients,
      }));
      setModalStep("form");
    } catch (err) {
      console.error("[Cygne scan] EXCEPTION:", err);
      console.error("[Cygne scan] stack:", err.stack);
      setScanError("Scan failed: " + (err.message || "unknown error"));
      setModalStep("form");
    }
    setAnalyzing(false);
  };

  const save = () => {
    if (!form.brand || !form.name) return;
    const ingArr = typeof form.ingredients === "string" ? form.ingredients.split(",").map(s => s.trim().toLowerCase()).filter(Boolean) : (form.ingredients || []);
    onSave({ ...form, id: product && product.id ? product.id : Date.now().toString(), ingredients: ingArr, price: parseFloat(form.price) || 0 });
  };

  const labelSt = { fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--clay)", display: "block", marginBottom: 5 };
  const inputSt = { width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontFamily: "Space Grotesk, sans-serif", fontSize: 13, color: "var(--parchment)", outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--overlay)", backdropFilter: "blur(8px)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: "var(--ink)", width: "100%", maxWidth: 520, borderRadius: "20px 20px 0 0", padding: "28px 24px 48px", maxHeight: "92vh", overflowY: "auto", border: "1px solid var(--border)", borderBottom: "none" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {modalStep === "form" && !(product && product.id) && (
              <button onClick={() => setModalStep("choose")} style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", padding: "0 8px 0 0", opacity: 0.6, display: "inline-flex" }}><Icon name="arrow-left" size={16} /></button>
            )}
            <h2 style={{ fontFamily: "Pinyon Script, cursive", fontSize: 28, fontWeight: 400, color: "var(--parchment)", margin: 0 }}>
              {product && product.id ? "Edit Product" : modalStep === "choose" ? "Add a Product" : "Product Details"}
            </h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", padding: 4 }}><Icon name="x" size={18} /></button>
        </div>

        {modalStep === "choose" && (
          <div>
            <div style={{ marginBottom: 12, position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 11, padding: "12px 16px" }}>
                <Icon name="search" size={16} color="var(--clay)" />
                <input value={searchQuery} onChange={e => handleSearchInput(e.target.value)} placeholder="Search by product name…" autoFocus
                  style={{ flex: 1, background: "none", border: "none", outline: "none", fontFamily: "Space Grotesk, sans-serif", fontSize: 14, color: "var(--parchment)" }} />
                {searching && <div style={{ width: 14, height: 14, borderRadius: "50%", border: "1.5px solid var(--sage)", borderTopColor: "transparent", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />}
                {searchQuery && !searching && <button onClick={() => { setSearchQuery(""); setSearchResults([]); setSearchDone(false); }} style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", padding: 0 }}><Icon name="x" size={12} /></button>}
              </div>
              {searchResults.length > 0 && (
                <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "var(--ink)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", zIndex: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
                  {searchResults.map((p, idx) => (
                    <button key={idx} onClick={() => applyResult(p)}
                      style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "flex-start", padding: "12px 16px", background: "none", border: "none", borderBottom: idx < searchResults.length - 1 ? "1px solid var(--border)" : "none", cursor: "pointer", textAlign: "left" }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--surface)"}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}>
                      <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 13, color: "var(--parchment)", lineHeight: 1.3 }}>{p.product_name}</span>
                      <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: "var(--clay)", marginTop: 2 }}>
                        {(p.brands || "").split(",")[0].trim()}
                        {guessCategory(p.categories_tags) ? " · " + guessCategory(p.categories_tags) : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {searchDone && searchResults.length === 0 && (
                <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: "8px 0 0", opacity: 0.6 }}>No results — try entering manually.</p>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--clay)", opacity: 0.5 }}>or</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>

            <div onClick={() => fileRef.current.click()}
              style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 20px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, cursor: "pointer", marginBottom: 10 }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(122,144,112,0.5)"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(122,144,112,0.12)", border: "1px solid rgba(122,144,112,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {analyzing ? <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, color: "var(--sage)" }}>…</span> : <Icon name="camera" size={16} color="var(--sage)" />}
              </div>
              <div>
                <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 13, fontWeight: 600, color: "var(--parchment)", margin: "0 0 2px" }}>{analyzing ? "Analysing…" : "Scan a photo"}</p>
                <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: 0 }}>Point at the product — Cygne reads the label.</p>
              </div>
            </div>

            {scanError && (
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "#8b7355", margin: "0 0 10px", padding: "8px 12px", background: "rgba(139,115,85,0.08)", border: "1px solid rgba(139,115,85,0.2)", borderRadius: 8 }}>{scanError}</p>
            )}

            <button onClick={() => setModalStep("form")}
              style={{ width: "100%", padding: "13px 0", background: "none", border: "1px solid var(--border)", borderRadius: 14, fontFamily: "Space Grotesk, sans-serif", fontSize: 12, color: "var(--clay)", cursor: "pointer", marginTop: 4 }}>
              Enter manually
            </button>
          </div>
        )}

        {modalStep === "form" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
              <div style={{ gridColumn: "1/-1" }}><label style={labelSt}>Brand *</label><input style={inputSt} value={form.brand || ""} onChange={e => set("brand", e.target.value)} placeholder="e.g. CeraVe" /></div>
              <div style={{ gridColumn: "1/-1" }}><label style={labelSt}>Product Name *</label><input style={inputSt} value={form.name || ""} onChange={e => set("name", e.target.value)} placeholder="e.g. Hydrating Cleanser" /></div>
              <div>
                <label style={labelSt}>Category</label>
                <select style={{ ...inputSt, appearance: "none" }} value={form.category || "Serum"} onChange={e => set("category", e.target.value)}>
                  {CATEGORIES.map(c => <option key={c} style={{ background: "var(--ink)" }}>{c}</option>)}
                </select>
              </div>
              <div><label style={labelSt}>Est. Price ($)</label><input style={inputSt} type="number" value={form.price || ""} onChange={e => set("price", e.target.value)} placeholder="0" /></div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelSt}>Ingredients</label>
              {form.category === "Prescription" ? (() => {
                const RX_ACTIVES = [
                  { name: "Tretinoin", key: "tretinoin", options: ["0.025%", "0.05%", "0.1%"] },
                  { name: "Clindamycin phosphate", key: "clindamycin phosphate", options: ["1%"] },
                  { name: "Azelaic acid", key: "azelaic acid", options: ["10%", "15%", "20%"] },
                  { name: "Niacinamide", key: "niacinamide", options: ["2%", "4%", "10%"] },
                  { name: "Zinc pyrithione", key: "zinc pyrithione", options: ["0.25%", "1%"] },
                  { name: "Benzoyl peroxide", key: "benzoyl peroxide", options: ["2.5%", "5%", "10%"] },
                  { name: "Metronidazole", key: "metronidazole", options: ["0.75%", "1%"] },
                  { name: "Ivermectin", key: "ivermectin", options: ["1%"] },
                  { name: "Spironolactone", key: "spironolactone", options: ["1%", "2%"] },
                  { name: "Tranexamic acid", key: "tranexamic acid", options: ["2%", "3%", "5%"] },
                ];
                // Parse current ingredients to find selected actives
                const currentIng = typeof form.ingredients === "string"
                  ? form.ingredients : (form.ingredients || []).join(", ");
                const lowerIng = currentIng.toLowerCase();

                const toggleActive = (key, pct) => {
                  const current = typeof form.ingredients === "string"
                    ? form.ingredients.split(",").map(s => s.trim()).filter(Boolean)
                    : (form.ingredients || []);
                  const withoutKey = current.filter(i => !i.toLowerCase().includes(key));
                  const isSelected = lowerIng.includes(key);
                  if (isSelected) {
                    set("ingredients", withoutKey.join(", "));
                  } else {
                    set("ingredients", [...withoutKey, key + " " + pct].join(", "));
                  }
                };

                const getSelected = (key) => {
                  const match = lowerIng.match(new RegExp(key + "\\s*([\\d.]+%?)"));
                  return match ? match[1] : null;
                };

                return (
                  <div>
                    <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: "var(--clay)", margin: "0 0 10px", lineHeight: 1.5, opacity: 0.7 }}>
                      Tap each active in your formula, then select the percentage.
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {RX_ACTIVES.map(active => {
                        const selected = getSelected(active.key);
                        const isOn = !!selected;
                        return (
                          <div key={active.key} style={{ background: isOn ? "rgba(122,144,112,0.08)" : "var(--surface)", border: "1px solid " + (isOn ? "rgba(122,144,112,0.35)" : "var(--border)"), borderRadius: 11, padding: "10px 14px" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isOn ? 8 : 0 }}>
                              <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 12, color: isOn ? "var(--parchment)" : "var(--clay)", fontWeight: isOn ? 600 : 400 }}>{active.name}</span>
                              <button onClick={() => {
                                if (isOn) {
                                  const current = typeof form.ingredients === "string"
                                    ? form.ingredients.split(",").map(s => s.trim()).filter(Boolean)
                                    : (form.ingredients || []);
                                  set("ingredients", current.filter(i => !i.toLowerCase().includes(active.key)).join(", "));
                                } else {
                                  toggleActive(active.key, active.options[0]);
                                }
                              }}
                                style={{ width: 22, height: 22, borderRadius: "50%", border: "1px solid " + (isOn ? "#6e8a72" : "var(--border)"), background: isOn ? "#6e8a72" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, color: "var(--ink)" }}>
                                {isOn && <Icon name="check" size={11} />}
                              </button>
                            </div>
                            {isOn && (
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                                {active.options.map(pct => (
                                  <button key={pct} onClick={() => toggleActive(active.key, pct)}
                                    style={{ padding: "4px 12px", borderRadius: 20, border: "1px solid " + (selected === pct ? "#6e8a72" : "var(--border)"), background: selected === pct ? "rgba(122,144,112,0.18)" : "transparent", fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: selected === pct ? "var(--parchment)" : "var(--clay)", cursor: "pointer" }}>
                                    {pct}
                                  </button>
                                ))}
                                <input
                                  placeholder="custom %"
                                  defaultValue={selected && !active.options.includes(selected) ? selected : ""}
                                  onBlur={e => { if (e.target.value.trim()) toggleActive(active.key, e.target.value.trim()); }}
                                  style={{ width: 72, padding: "4px 10px", borderRadius: 20, border: "1px solid var(--border)", background: "transparent", fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", outline: "none" }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {currentIng && (
                      <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: "var(--clay)", margin: "10px 0 0", opacity: 0.5, lineHeight: 1.5 }}>
                        Formula: {currentIng}
                      </p>
                    )}
                  </div>
                );
              })() : (
                <textarea style={{ ...inputSt, resize: "vertical", minHeight: 72 }}
                  value={typeof form.ingredients === "string" ? form.ingredients : (form.ingredients || []).join(", ")}
                  onChange={e => set("ingredients", e.target.value)} placeholder="Paste ingredient list…" />
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelSt}>Use frequency</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {FREQUENCIES.map(f => {
                  const active = (form.frequency || "daily") === f.id;
                  const isSuggested = f.id === freqSuggestion.id && !active;
                  return (
                    <button key={f.id} onClick={() => { setFreqTouched(true); set("frequency", f.id); }}
                      style={{ padding: "7px 14px", borderRadius: 20, border: "1px solid " + (active ? "var(--sage)" : isSuggested ? "rgba(122,144,112,0.35)" : "var(--border)"), background: active ? "rgba(122,144,112,0.18)" : "transparent", color: active ? "var(--parchment)" : "var(--clay)", fontFamily: "Space Grotesk, sans-serif", fontSize: 11, cursor: "pointer", position: "relative" }}>
                      {f.label}
                    </button>
                  );
                })}
              </div>
              {freqSuggestion.reason && (
                <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--sage)", margin: "10px 0 0", lineHeight: 1.6, opacity: 0.85 }}>
                  {freqSuggestion.reason}
                </p>
              )}
              {overuseWarning && (
                <div style={{ display: "flex", gap: 10, marginTop: 10, padding: "10px 14px", background: "rgba(139,115,85,0.08)", border: "1px solid rgba(139,115,85,0.25)", borderRadius: 10 }}>
                  <span style={{ color: "#8b7355", flexShrink: 0, marginTop: 1, display: "inline-flex" }}><Icon name="warning" size={13} /></span>
                  <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "#8b7355", margin: 0, lineHeight: 1.6 }}>{overuseWarning}</p>
                </div>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelSt}>Session</label>
              {locked ? (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ padding: "5px 14px", borderRadius: 20, background: locked.session === "am" ? "rgba(122,144,112,0.14)" : "rgba(232,226,217,0.10)", border: "1px solid " + (locked.session === "am" ? "rgba(122,144,112,0.4)" : "rgba(232,226,217,0.3)"), fontFamily: "Space Grotesk, sans-serif", fontSize: 10, fontWeight: 700, color: locked.session === "am" ? "var(--sage)" : "#e8e2d9" }}>{locked.session === "am" ? "AM only" : "PM only"}</span>
                    <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: "var(--clay)", opacity: 0.6 }}>locked by ingredients</span>
                  </div>
                  <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: 0, lineHeight: 1.5, opacity: 0.7 }}>{locked.reason}</p>
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[{ id: "am", label: "AM only" }, { id: "pm", label: "PM only" }, { id: "both", label: "AM + PM" }].map(s => {
                      const active = effectiveSession === s.id;
                      return (
                        <button key={s.id} onClick={() => { setSessionTouched(true); set("session", s.id); }}
                          style={{ flex: 1, padding: "8px 0", borderRadius: 20, border: "1px solid " + (active ? "var(--sage)" : "var(--border)"), background: active ? "rgba(122,144,112,0.18)" : "transparent", color: active ? "var(--parchment)" : "var(--clay)", fontFamily: "Space Grotesk, sans-serif", fontSize: 10, fontWeight: active ? 600 : 400, cursor: "pointer" }}>
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                  {autoSession.reason && (
                    <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: "8px 0 0", lineHeight: 1.5, opacity: 0.6 }}>{autoSession.reason}</p>
                  )}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 20, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
              <ShelfLifeSection form={form} set={set} />
            </div>

            <button onClick={save}
              style={{ width: "100%", padding: "14px 0", background: "var(--sage)", border: "none", borderRadius: 12, fontFamily: "Space Grotesk, sans-serif", fontSize: 13, fontWeight: 600, color: "var(--ink)", cursor: "pointer", opacity: (!form.brand || !form.name) ? 0.4 : 1 }}>
              Save to Vanity
            </button>
          </div>
        )}

      </div>
    </div>
  );
}


// --- SESSION LOCKED BY INGREDIENTS -------------------------------------------

export { RoutineFitSheet, ProductModal, ShelfLifeSection, getLockedSession, getAutoSession };