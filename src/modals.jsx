import { useState, useRef, useEffect } from "react";
import { Icon, Section, FlagCard } from "./components.jsx";
import { detectActives, analyzeShelf } from "./engine.js";
import { getSeason } from "./seasonal.jsx";
import { supabase, invokeEdgeFunction } from "./supabase.js";
import { compressImage, withAlpha } from "./utils.jsx";
import { RAPID_ACTION_MODEL } from "./config.js";

// Visually hidden but DOM-present input style — see shopscan.jsx for the
// iOS rationale. display:none drops programmatic .click() on iOS Safari.
const HIDDEN_INPUT_STYLE = {
  position: "absolute",
  width: 1, height: 1,
  padding: 0, margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
  opacity: 0,
  pointerEvents: "none",
};

// SCAN MODAL
function ScanModal({ products, onAddToShelf, onClose }) {
  const [mode, setMode] = useState("choose"); // choose | search | scan | scanning | result
  const [imgPreview, setImgPreview] = useState(null);
  const [scanned, setScanned] = useState(null);
  const [verdict, setVerdict] = useState(null);
  const [saved, setSaved] = useState(false);
  const [scanError, setScanError] = useState(null);
  const fileRef = useRef();
  const { activeMap } = analyzeShelf(products);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const searchTimeout = useRef(null);

  const verdictConfig = {
    pass:    { color: "var(--color-ivory, #faf9f4)", bg: "rgba(var(--rgb-ivory), 0.08)", border: "rgba(var(--rgb-moss), 0.32)", label: "Good fit" },
    caution: { color: "var(--color-bronze)", bg: "rgba(var(--rgb-bronze), 0.08)",  border: "rgba(var(--rgb-bronze), 0.32)",  label: "Use with care" },
    skip:    { color: "var(--color-bronze)", bg: "rgba(var(--rgb-bronze), 0.08)",   border: "rgba(var(--rgb-bronze), 0.32)",   label: "Skip this one" },
  };
  const vc = verdictConfig[verdict] || verdictConfig.pass;

  const reset = () => {
    setMode("choose"); setScanned(null); setVerdict(null);
    setImgPreview(null); setSaved(false);
    setSearchQuery(""); setSearchResults([]); setSearchDone(false);
  };

  const handleSearchInput = (val) => {
    setSearchQuery(val);
    clearTimeout(searchTimeout.current);
    if (val.trim().length >= 2) {
      searchTimeout.current = setTimeout(async () => {
        setSearching(true); setSearchDone(false);
        try {
          const url = "https://world.openbeautyfacts.org/cgi/search.pl?search_terms=" + encodeURIComponent(val) + "&search_simple=1&action=process&json=1&page_size=5&fields=product_name,brands,categories_tags,ingredients_text";
          const res = await fetch(url);
          const data = await res.json();
          setSearchResults((data.products || []).filter(p => p.product_name && p.brands).slice(0, 5));
        } catch { setSearchResults([]); }
        setSearching(false); setSearchDone(true);
      }, 500);
    } else { setSearchResults([]); setSearchDone(false); }
  };

  const assessProduct = (name, brand, ingredients) => {
    const ingArr = typeof ingredients === "string"
      ? ingredients.split(/,|;/).map(s => s.trim().toLowerCase()).filter(Boolean)
      : (ingredients || []);
    const actives = Object.keys(detectActives(ingArr));
    const conflicts = [];
    const duplicates = [];

    // Check conflicts with existing vanity
    if (actives.includes("retinol") && activeMap["AHA"]?.length) conflicts.push("AHA + Retinol — use on alternating nights");
    if (actives.includes("vitamin C") && activeMap["retinol"]?.length) conflicts.push("Vitamin C best in AM, retinol PM — keep separate");
    if (actives.includes("benzoyl peroxide") && activeMap["retinol"]?.length) conflicts.push("Benzoyl peroxide deactivates retinol");

    // Check duplicates
    const newCats = ingArr.includes("salicylic acid") ? ["BHA"] : actives;
    products.forEach(p => {
      const pActives = Object.keys(detectActives(p.ingredients || []));
      if (pActives.some(a => actives.includes(a)) && actives.length > 0) {
        duplicates.push(p.name);
      }
    });

    const v = conflicts.length > 0 ? "skip" : duplicates.length > 0 ? "caution" : "pass";
    const headline = v === "pass"
      ? (actives.length > 0 ? "Looks good. No conflicts with your vanity." : "Clean product. Safe to add.")
      : v === "caution"
      ? "Already covered. You have something similar."
      : "Conflict detected. Not recommended right now.";

    return { brand, name, ingredients: ingArr, actives, conflicts, duplicates, verdict: v, headline, reason: conflicts[0] || (duplicates.length > 0 ? "You already have " + duplicates[0] + " covering this." : "Works with your current routine.") };
  };

  const applySearchResult = (p) => {
    const ingredients = p.ingredients_text || "";
    const brand = (p.brands || "").split(",")[0].trim();
    const name = p.product_name || "";
    const result = assessProduct(name, brand, ingredients);
    setScanned(result);
    setVerdict(result.verdict);
    setMode("result");
  };

  const analyze = async (file) => {
    setMode("scanning");
    setScanError(null);
    console.log("[Cygne vanity-scan] 1. image selected:", file.name, "size:", file.size, "type:", file.type);
    try {
      console.log("[Cygne vanity-scan] 2. compressing image...");
      const base64 = await compressImage(file);
      console.log("[Cygne vanity-scan] 3. compressed base64 length:", base64.length, "(~" + Math.round(base64.length * 0.75 / 1024) + "KB)");

      const shelfSummary = products.map(p => ({ name: p.name, category: p.category, actives: Object.keys(detectActives(p.ingredients || [])) }));
      console.log("[Cygne vanity-scan] 4. calling rapid-action...");
      const data = await invokeEdgeFunction("rapid-action", {
        model: RAPID_ACTION_MODEL, max_tokens: 1500, messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
          { type: "text", text: "Analyze this skincare product image. You are an international product expert. Fully support: KOREAN (COSRX, Innisfree, Laneige, Sulwhasoo, Anua, Beauty of Joseon, Skin1004, Torriden, Tirtir, Numbuzin, Round Lab, Abib, Isntree, Mixsoon, Haruharu Wonder, Axis-Y, Some By Mi, Medicube, Dr. Jart, I'm From, Klairs, Purito, Benton, Mediheal) — read Hangul. JAPANESE (SK-II, Hada Labo, DHC, Shiseido, Tatcha, Rohto, Curel, Kose, Minon, Kanebo, Kiehl's Japan, Albion, Decorté, Kose Sekkisei) — read Kanji/Hiragana/Katakana. FRENCH PHARMACY/LUXURY (La Roche-Posay, Avène, Bioderma, Vichy, Uriage, A-Derma, Caudalie, Nuxe, Embryolisse, Filorga, Biotherm, Clarins, Sisley, Darphin). AUSTRALIAN (Aesop, Ultra Violette, Sand & Sky, Jurlique, Grown Alchemist, Frank Body, Bondi Sands, Alpha-H, Rationale, Medik8). BRITISH/EUROPEAN (The Ordinary, NIOD, Deciem, Pai, Emma Hardie, Liz Earle, Eve Lom, Weleda, Dr. Hauschka, Eucerin, Hydraluron, Allies of Skin). Recognize international categories: Korean essence/ampoule/sleeping mask/sheet mask/softener, Japanese milky lotion (nyuueki)/lotion (keshouisui, actually a hydrating toner)/emulsion, French eau thermale/eau micellaire (micellar water)/lait/crème, Australian SPF serums. INGREDIENT NORMALIZATION — map local names to INCI English: oxyde de zinc → zinc oxide, eau thermale → thermal spring water, acide hyaluronique → hyaluronic acid, melaleuca → tea tree oil, kakadu plum → Terminalia ferdinandiana, quandong → Santalum acuminatum, galactomyces/pitera → Galactomyces Ferment Filtrate, placenta extract → placental protein, fullerene → fullerenes, snail mucin → snail secretion filtrate, centella asiatica → Centella Asiatica Extract, madecassoside, asiaticoside, heartleaf → Houttuynia Cordata, mugwort → Artemisia, propolis, rice ferment → Rice Ferment Filtrate, birch sap → Betula Alba Juice, niacinamide, bifida ferment lysate. FLAG (do not warn) ingredients restricted in the US but common abroad: Tinosorb S/Bemotrizinol, Tinosorb M/Bisoctrizole, Mexoryl SX/Ecamsule, Mexoryl XL/Drometrizole Trisiloxane, Uvinul A Plus, Uvinul T 150, Enzacamene, Iscotrizinol, hydroquinone >2%, tranexamic acid (prescription in US). Add these to a 'flags' array as informational notes, NOT conflicts. CATEGORIZATION RULES — INGREDIENT-FIRST. Texture and ingredient profile ALWAYS override the product name. Priority: (1) primary active / functional ingredient, (2) format & texture, (3) product name LAST. INGREDIENT DECISION TREE: (a) Primary active is hyaluronic acid, niacinamide, vitamin C / ascorbic acid, retinol / retinoid, peptides, AHA, or BHA → Serum. A lightweight/watery HA-dominant 'lotion' or 'milk' is a SERUM, not a Moisturizer. (b) Primary base is ceramides, shea butter, squalane, or fatty acids in a THICK occlusive base → Moisturizer. (c) Lightweight with mostly humectants (glycerin, HA, panthenol) and no heavy active → Serum or Essence (Essence if watery/toner-adjacent, Serum if targeted). (d) Contains SPF 30+ → SPF (pure sunscreen) or SPF Moisturizer (combined with heavy hydration). (e) Contains surfactants / cleansing agents (sulfates, glucosides, betaines, micellar, amino-acid surfactants) → Cleanser. ASIAN FORMAT MAPPINGS (apply AFTER the ingredient tree): Korean/Japanese 'lotion', 'milky lotion', 'milk', '乳液/nyuueki', or '유액' with hydrating ingredients → Essence if watery, Moisturizer if creamy, Serum if HA/niacinamide-dominant — NEVER Cleanser. Korean 'skin' or 'softener' → Toner. 'Ampoule' → Serum. 'Emulsion' → lightweight Moisturizer. When uncertain, pick the category that best matches the ingredient profile. NEVER default to Serum without ingredient justification. SPF LOGIC: (1) If SPF 30+ and the product is primarily a sunscreen with minimal moisturizing claims → 'SPF'. (2) If SPF 15 or lower and the product is primarily a moisturizer with incidental sun protection → 'Moisturizer' (put the SPF value in the 'spf' field). (3) If SPF 30+ AND the product is marketed as a moisturizer/day cream with heavy hydration (ceramides, hyaluronic acid, shea butter, squalane, 'hydrating', 'moisturizing sunscreen', 'day cream SPF', 'SPF moisturizer') → 'SPF Moisturizer'. User's vanity: " + JSON.stringify(shelfSummary) + ". Return ONLY valid JSON (no markdown) with fields: brand, name, category (Cleanser/Toner/Essence/Serum/Eye Cream/Moisturizer/SPF Moisturizer/SPF/Oil/Exfoliant/Mask/Sleeping Mask/Sheet Mask/Treatment/Mist/Lip Care/Micellar Water), spf (numeric SPF level if present, else null), ingredients (array of INCI English strings), actives (array), verdict (pass/caution/skip), headline, reason, conflicts (array), duplicates (array), flags (array of informational notes)." }
        ]}]
      });
      console.log("[Cygne vanity-scan] 5. response:", JSON.stringify(data).slice(0, 500));

      let text;
      if (data && data.content && Array.isArray(data.content)) {
        text = data.content.map(c => c.text || "").join("");
      } else if (typeof data === "string") {
        text = data;
      } else {
        text = JSON.stringify(data);
      }
      console.log("[Cygne vanity-scan] 7. extracted text:", text.slice(0, 300));

      const clean = text.replace(/```json|```/g, "").trim();
      const jsonStart = clean.indexOf("{");
      const jsonEnd = clean.lastIndexOf("}");
      if (jsonStart < 0 || jsonEnd < 0) {
        console.error("[Cygne vanity-scan] 8. NO JSON in response:", clean.slice(0, 200));
        setScanError("Unexpected response format. Check console.");
        setMode("scan"); return;
      }
      const jsonStr = clean.slice(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonStr);
      console.log("[Cygne vanity-scan] 8. parsed result:", parsed);
      setScanned(parsed);
      setVerdict(parsed.verdict || "pass");
      setMode("result");
    } catch(err) {
      console.error("[Cygne vanity-scan] EXCEPTION:", err);
      console.error("[Cygne vanity-scan] stack:", err.stack);
      setScanError("Scan failed: " + (err.message || "unknown error"));
      setMode("scan");
    }
  };

  const handleFile = (e) => {
    const file = e.target.files && e.target.files[0];
    // Reset so the same photo can be re-selected after an aborted scan.
    if (e.target) e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setImgPreview(ev.target.result);
    reader.readAsDataURL(file);
    analyze(file);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(var(--rgb-ink), 0.82)", backdropFilter: "blur(12px)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: "var(--ink)", width: "100%", maxWidth: 520, borderRadius: "var(--radius-sheet)", padding: "var(--space-6) var(--space-6) var(--space-12)", maxHeight: "92vh", overflowY: "auto", border: "1px solid var(--border)", borderBottom: "none" }}>
        {/* Always-mounted file input so the ref is live in any mode and the
            button onClick can call .click() synchronously inside the user
            gesture. iOS Safari rejects deferred clicks (setTimeout, async). */}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" aria-label="Scan a product label" style={HIDDEN_INPUT_STYLE} onChange={handleFile} />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--space-5)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            {mode !== "choose" && (
              <button onClick={reset} style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", padding: "0 var(--space-2) 0 0", opacity: 0.6, display: "inline-flex" }}><Icon name="arrow-left" size={16} /></button>
            )}
            <div>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 var(--space-1)" }}>Shop Scan</p>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)", fontWeight: 700, letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--parchment)", margin: 0 }}>
                {mode === "choose" ? "Does this work for you?" :
                 mode === "search" ? "Search by name" :
                 mode === "scan" || mode === "scanning" ? "Scan the label" :
                 scanned ? scanned.brand + " " + scanned.name : "Result"}
              </h2>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", padding: "var(--space-1)" }}><Icon name="x" size={17} /></button>
        </div>

        {/* CHOOSE MODE */}
        {mode === "choose" && (
          <div>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: "0 0 var(--space-5)", lineHeight: 1.6 }}>
              Check if a product works with your vanity before you buy. Search by name or scan the label.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <button onClick={() => setMode("search")}
                style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", padding: "var(--space-5) var(--space-5)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", cursor: "pointer", textAlign: "left" }}>
                <div style={{ width: 40, height: 40, borderRadius: "var(--radius)", background: "rgba(var(--rgb-moss), 0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon name="search" size={16} color="var(--sage)" />
                </div>
                <div>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", fontWeight: 400, color: "var(--parchment)", margin: "0 0 2px" }}>Search by name</p>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: 0 }}>Type the product name — fastest in store.</p>
                </div>
              </button>
              <button onClick={() => { fileRef.current && fileRef.current.click(); setMode("scan"); }}
                style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", padding: "var(--space-5) var(--space-5)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", cursor: "pointer", textAlign: "left" }}>
                <div style={{ width: 40, height: 40, borderRadius: "var(--radius)", background: "rgba(var(--rgb-moss), 0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon name="camera" size={16} color="var(--sage)" />
                </div>
                <div>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", fontWeight: 400, color: "var(--parchment)", margin: "0 0 2px" }}>Scan the label</p>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: 0 }}>Point at the ingredient list — AI reads it.</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* SEARCH MODE */}
        {mode === "search" && (
          <div>
            <div style={{ position: "relative", marginBottom: "var(--space-2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "var(--space-3) var(--space-4)" }}>
                <Icon name="search" size={16} color="var(--clay)" />
                <input value={searchQuery} onChange={e => handleSearchInput(e.target.value)} placeholder="CeraVe, The Ordinary, Paula's Choice…" autoFocus
                  style={{ flex: 1, background: "none", border: "none", outline: "none", fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", color: "var(--parchment)" }} />
                {searching && <div style={{ width: 14, height: 14, borderRadius: "50%", border: "1.5px solid var(--sage)", borderTopColor: "transparent", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />}
                {searchQuery && !searching && <button onClick={() => { setSearchQuery(""); setSearchResults([]); setSearchDone(false); }} style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", padding: 0 }}><Icon name="x" size={12} /></button>}
              </div>
              {searchResults.length > 0 && (
                <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "var(--ink)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", zIndex: 10, boxShadow: "0 8px 24px rgba(var(--rgb-ink), 0.32)" }}>
                  {searchResults.map((p, idx) => (
                    <button key={idx} onClick={() => applySearchResult(p)}
                      style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "flex-start", padding: "var(--space-3) var(--space-4)", background: "none", border: "none", borderBottom: idx < searchResults.length - 1 ? "1px solid var(--border)" : "none", cursor: "pointer", textAlign: "left" }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--surface)"}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}>
                      <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", color: "var(--parchment)", lineHeight: 1.3 }}>{p.product_name}</span>
                      <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", marginTop: 2 }}>{(p.brands || "").split(",")[0].trim()}</span>
                    </button>
                  ))}
                </div>
              )}
              {searchDone && searchResults.length === 0 && (
                <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: "var(--space-2) 0 0", opacity: 0.6 }}>Not found — try scanning the label instead.</p>
              )}
            </div>
            {searchDone && searchResults.length === 0 && (
              <button onClick={() => setMode("scan")}
                style={{ width: "100%", marginTop: "var(--space-3)", padding: "var(--space-3) 0", background: "none", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", cursor: "pointer" }}>
                Scan the label instead
              </button>
            )}
          </div>
        )}

        {/* SCAN MODE */}
        {mode === "scan" && (
          <div>
            {scanError && (
              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--color-bronze)", margin: "0 0 var(--space-3)", padding: "var(--space-2) var(--space-3)", background: "rgba(var(--rgb-bronze), 0.08)", border: "1px solid rgba(var(--rgb-bronze), 0.16)", borderRadius: "var(--radius)" }}>{scanError}</p>
            )}
            <button onClick={() => fileRef.current && fileRef.current.click()}
              style={{ width: "100%", padding: "var(--space-8) 0", background: "rgba(var(--rgb-ivory), 0.08)", border: "1px dashed rgba(var(--rgb-moss), 0.32)", borderRadius: "var(--radius)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-3)" }}>
              <Icon name="camera" size={28} color="var(--sage)" />
              <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", letterSpacing: "0.06em" }}>Tap to open camera</span>
              <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", opacity: 0.5 }}>Point at the ingredient list for best results</span>
            </button>
          </div>
        )}

        {/* SCANNING */}
        {mode === "scanning" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "var(--space-8) 0 var(--space-6)", gap: "var(--space-4)" }}>
            {imgPreview && <img src={imgPreview} alt="" style={{ width: 100, height: 100, objectFit: "cover", borderRadius: "var(--radius)", opacity: 0.7 }} />}
            <div style={{ width: 28, height: 28, border: "2px solid var(--color-inky-moss)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: 0 }}>Reading the label…</p>
          </div>
        )}

        {/* RESULT */}
        {mode === "result" && scanned && (
          <div>
            {/* Verdict card */}
            <div style={{ background: vc.bg, border: "1px solid " + vc.border, borderRadius: "var(--radius)", padding: "var(--space-5) var(--space-5)", marginBottom: "var(--space-4)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: vc.color, flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: vc.color, fontWeight: 400 }}>{vc.label}</span>
              </div>
              <p style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)", fontWeight: 400, letterSpacing: "var(--tracking-label)", color: "var(--parchment)", margin: "0 0 var(--space-2)" }}>{scanned.headline}</p>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: 0, lineHeight: 1.6 }}>{scanned.reason}</p>
            </div>

            {/* Conflicts */}
            {scanned.conflicts && scanned.conflicts.length > 0 && (
              <div style={{ padding: "var(--space-3) var(--space-4)", background: "rgba(var(--rgb-bronze), 0.08)", borderRadius: "var(--radius)", border: "1px solid rgba(var(--rgb-bronze), 0.16)", marginBottom: "var(--space-3)" }}>
                <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--color-bronze)", margin: "0 0 var(--space-2)" }}>Conflicts</p>
                {scanned.conflicts.map((c, i) => (
                  <div key={i} style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start", marginBottom: i < scanned.conflicts.length - 1 ? "var(--space-1)" : 0 }}>
                    <div style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--color-bronze)", marginTop: "var(--space-2)", flexShrink: 0 }} />
                    <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", lineHeight: 1.5 }}>{c}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Duplicates */}
            {scanned.duplicates && scanned.duplicates.length > 0 && (
              <div style={{ padding: "var(--space-3) var(--space-4)", background: "rgba(var(--rgb-bronze), 0.08)", borderRadius: "var(--radius)", border: "1px solid rgba(var(--rgb-bronze), 0.32)", marginBottom: "var(--space-3)" }}>
                <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--color-bronze)", margin: "0 0 var(--space-2)" }}>Already covered by</p>
                {scanned.duplicates.map((d, i) => (
                  <div key={i} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                    <div style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--color-bronze)", flexShrink: 0 }} />
                    <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)" }}>{d}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Actives */}
            {scanned.actives && scanned.actives.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}>
                {scanned.actives.map((a, i) => (
                  <span key={i} style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", color: "var(--color-ivory, #faf9f4)", background: "rgba(var(--rgb-moss), 0.08)", padding: "var(--space-1) var(--space-3)", borderRadius: "var(--radius-pill)", border: "1px solid rgba(var(--rgb-moss), 0.32)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase" }}>{a}</span>
                ))}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-1)" }}>
              {!saved ? (
                <button onClick={() => { onAddToShelf(scanned); setSaved(true); }}
                  style={{ flex: 1, padding: "var(--space-3) 0", background: verdict === "skip" ? "var(--surface)" : "var(--sage)", color: verdict === "skip" ? "var(--clay)" : "var(--ink)", border: "1px solid " + (verdict === "skip" ? "var(--border)" : "transparent"), borderRadius: "var(--radius)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 400, cursor: "pointer" }}>
                  {verdict === "skip" ? "Add anyway" : "Save to Vanity"}
                </button>
              ) : (
                <div style={{ flex: 1, padding: "var(--space-3) 0", background: "rgba(var(--rgb-moss), 0.08)", border: "1px solid rgba(var(--rgb-moss), 0.32)", borderRadius: "var(--radius)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "var(--space-2)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--color-ivory, #faf9f4)" }}>
                  <Icon name="check" size={12} /> Saved to Vanity
                </div>
              )}
              <button onClick={reset}
                style={{ padding: "var(--space-3) var(--space-5)", background: "none", color: "var(--clay)", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", cursor: "pointer" }}>
                Check another
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function assessRoutineFit(product, products, checkIns = [], user = {}) {
  const actives = detectActives(product.ingredients || []);
  const hasActive = Object.keys(actives).length > 0;
  const season = getSeason();
  const routineProducts = products.filter(p => p.inRoutine);
  const existingActives = {};
  routineProducts.forEach(p => Object.assign(existingActives, detectActives(p.ingredients || [])));
  const ramping = routineProducts.filter(p => p.rampWeek && p.rampWeek < 4);
  const recentCheckIns = checkIns.slice(-3);
  const hasRecentIrritation = recentCheckIns.some(c => c.irritation === "moderate" || c.irritation === "mild");
  const hasRecentBreakout = recentCheckIns.some(c => c.breakout);
  const cat = product.category || "";
  const isHeavyOcclusive = ["Oil", "Moisturizer"].includes(cat) && (product.ingredients || []).some(i => /shea|petrolatum|lanolin|squalane/i.test(i));
  const isLightGel = cat === "Moisturizer" && (product.ingredients || []).some(i => /aloe|gel|water/i.test(i));

  // -- Positive fit reads ----------------------------------------------------
  const gaps = [];
  if (!existingActives["vitamin C"] && actives["vitamin C"]) gaps.push("Vitamin C fills your AM antioxidant gap nicely.");
  if (!existingActives["hyaluronic acid"] && actives["hyaluronic acid"]) gaps.push("Adds hydration support your ritual is currently missing.");
  if (!existingActives["ceramides"] && actives["ceramides"]) gaps.push("Ceramides will strengthen your barrier — a gap in your current lineup.");
  if (!existingActives["BHA"] && actives["BHA"]) gaps.push("A BHA is a smart add for keeping pores clear between exfoliation sessions.");
  if (!routineProducts.some(p => p.category === "SPF" || p.category === "SPF Moisturizer") && cat === "SPF") gaps.push("You don't have SPF in your ritual yet — this fills a real gap.");
  if (!routineProducts.some(p => p.category === "Moisturizer" || p.category === "SPF Moisturizer") && cat === "Moisturizer") gaps.push("Your ritual is missing a moisturizer — this completes your barrier step.");

  // -- Defer reasons ---------------------------------------------------------
  // Season
  if (isHeavyOcclusive && (season === "summer" || season === "spring")) {
    return {
      verdict: "defer",
      deferTag: "season",
      reason: "Save for autumn",
      detail: `Heavy occlusives tend to feel congesting in ${season}. Your skin will thank you for this come October.`,
      positiveRead: gaps[0] || null,
    };
  }
  if (isLightGel && (season === "winter" || season === "fall")) {
    return {
      verdict: "defer",
      deferTag: "season",
      reason: "Save for warmer months",
      detail: "This lightweight gel formula will perform better when your skin isn't fighting the cold. Worth holding for spring.",
      positiveRead: gaps[0] || null,
    };
  }

  // Ritual overload — already ramping actives
  if (hasActive && ramping.length >= 2) {
    const rampingNames = ramping.map(p => p.name).join(" and ");
    return {
      verdict: "defer",
      deferTag: "ramp",
      reason: "Ritual at capacity",
      detail: `You're mid-ramp on ${rampingNames}. Adding another active now makes it hard to isolate any reactions. Give it 3–4 more weeks.`,
      positiveRead: gaps[0] || null,
    };
  }
  if (hasActive && ramping.length === 1) {
    const rampingName = ramping[0].name;
    return {
      verdict: "defer",
      deferTag: "ramp",
      reason: "Already introducing an active",
      detail: `You're still ramping ${rampingName}. Introducing another active at the same time clouds the picture. Worth waiting until that ramp completes.`,
      positiveRead: gaps[0] || null,
    };
  }

  // Skin state — recent irritation or breakouts
  if (hasActive && hasRecentIrritation) {
    return {
      verdict: "defer",
      deferTag: "skin",
      reason: "Skin is reacting right now",
      detail: "Your recent check-ins show some irritation. Let your barrier settle before layering in a new active — usually 1–2 weeks is enough.",
      positiveRead: gaps[0] || null,
    };
  }
  if (hasActive && hasRecentBreakout) {
    return {
      verdict: "defer",
      deferTag: "skin",
      reason: "Wait for skin to stabilise",
      detail: "You've had breakouts recently. Starting a new active mid-flare can make it harder to read how your skin is responding.",
      positiveRead: gaps[0] || null,
    };
  }

  // Redundancy — overlapping actives
  const overlaps = Object.keys(actives).filter(a => existingActives[a]);
  if (overlaps.length > 0) {
    const overlap = overlaps[0];
    const existing = routineProducts.find(p => detectActives(p.ingredients || [])[overlap]);
    return {
      verdict: "defer",
      deferTag: "overlap",
      reason: "Overlaps with what you have",
      detail: `You already have ${overlap} in ${existing?.name || "your ritual"}. A second source of the same active adds irritation risk without extra benefit. Save this for when you cycle off.`,
      positiveRead: null,
    };
  }

  // -- All clear — positive read ---------------------------------------------
  return {
    verdict: "add",
    deferTag: null,
    reason: null,
    detail: null,
    positiveRead: gaps[0] || (hasActive ? "This looks like a good fit for your current ritual." : "No conflicts detected — looks good to add."),
  };
}

const DEFER_TAG_CONFIG = {
  season:  { color: "var(--color-ivory)",  bg: withAlpha("ivory", 0.08),  tint: withAlpha("ivory", 0.16),  border: withAlpha("ivory", 0.32),  label: "Seasonal hold" },
  ramp:    { color: "var(--color-bronze)", bg: withAlpha("bronze", 0.08), tint: withAlpha("bronze", 0.16), border: withAlpha("bronze", 0.32), label: "Ritual at capacity" },
  skin:    { color: "var(--color-bronze)", bg: withAlpha("bronze", 0.08), tint: withAlpha("bronze", 0.16), border: withAlpha("bronze", 0.32), label: "Skin recovery" },
  overlap: { color: "var(--color-bronze)", bg: withAlpha("bronze", 0.08), tint: withAlpha("bronze", 0.16), border: withAlpha("bronze", 0.32), label: "Redundant active" },
};


export { ScanModal, assessRoutineFit, DEFER_TAG_CONFIG };