import { useState, useRef } from "react";
import { Icon } from "./components.jsx";
import { analyzeShelf, detectActives } from "./engine.js";
import { invokeEdgeFunction } from "./supabase.js";
import { compressImage } from "./utils.jsx";

function ShopScanModal({ products, user = {}, onClose }) {
  const [phase, setPhase] = useState("prompt"); // prompt | scanning | result
  const [imgPreview, setImgPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [scanError, setScanError] = useState(null);
  const fileRef = useRef();
  const { activeMap } = analyzeShelf(products);

  const analyze = async (file) => {
    setPhase("scanning");
    setScanError(null);
    console.log("[Cygne shopscan] 1. image selected:", file.name, "size:", file.size, "type:", file.type);
    try {
      console.log("[Cygne shopscan] 2. compressing image...");
      const base64 = await compressImage(file);
      console.log("[Cygne shopscan] 3. compressed base64 length:", base64.length, "(~" + Math.round(base64.length * 0.75 / 1024) + "KB)");

      const shelfSummary = products.map(p => ({
        name: p.name, category: p.category,
        actives: Object.keys(detectActives(p.ingredients || [])),
      }));

      const skinContext = [
        user.skinType ? `Skin type: ${user.skinType}` : null,
        user.concerns?.length ? `Concerns: ${user.concerns.join(", ")}` : null,
        user.skinAgeBracket ? `Skin age bracket: ${user.skinAgeBracket}` : null,
        Object.keys(activeMap).length ? `Current actives: ${Object.keys(activeMap).join(", ")}` : null,
      ].filter(Boolean).join(". ");

      console.log("[Cygne shopscan] 4. calling rapid-action...");
      const respData = await invokeEdgeFunction("rapid-action", {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
            { type: "text", text: "You are an international skincare expert helping someone decide whether to buy a product. Fully support: KOREAN (COSRX, Innisfree, Laneige, Sulwhasoo, Anua, Beauty of Joseon, Skin1004, Torriden, Tirtir, Numbuzin, Round Lab, Abib, Isntree, Mixsoon, Haruharu Wonder, Axis-Y, Some By Mi, Medicube, Dr. Jart, I'm From, Klairs, Purito, Benton, Mediheal) — read Hangul. JAPANESE (SK-II, Hada Labo, DHC, Shiseido, Tatcha, Rohto, Curel, Kose, Minon, Albion, Decorté, Sekkisei) — read Kanji/Kana. FRENCH PHARMACY/LUXURY (La Roche-Posay, Avène, Bioderma, Vichy, Uriage, A-Derma, Caudalie, Nuxe, Embryolisse, Filorga, Biotherm, Clarins, Sisley, Darphin). AUSTRALIAN (Aesop, Ultra Violette, Sand & Sky, Jurlique, Grown Alchemist, Frank Body, Bondi Sands, Alpha-H, Rationale, Medik8). BRITISH/EUROPEAN (The Ordinary, NIOD, Deciem, Pai, Emma Hardie, Liz Earle, Eve Lom, Weleda, Dr. Hauschka, Eucerin, Allies of Skin). Recognize international categories: Korean essence/ampoule/sleeping mask/sheet mask/softener, Japanese milky lotion/emulsion/keshouisui toner, French eau thermale/micellar water/lait/crème, Australian SPF serums. Normalize ingredients to INCI English: oxyde de zinc → zinc oxide, acide hyaluronique → hyaluronic acid, melaleuca → tea tree, kakadu plum, galactomyces/pitera → Galactomyces Ferment Filtrate, placenta extract, fullerenes, snail mucin → snail secretion filtrate, centella asiatica, madecassoside, mugwort → Artemisia, propolis, rice ferment, birch sap. FLAG (not warn) US-restricted filters common abroad: Tinosorb S/Bemotrizinol, Tinosorb M/Bisoctrizole, Mexoryl SX/Ecamsule, Mexoryl XL, Uvinul A Plus, Uvinul T 150, Enzacamene, Iscotrizinol, hydroquinone, tranexamic acid — put in 'flags' array as informational notes, NOT conflicts. CATEGORIZATION RULES — INGREDIENT-FIRST. Texture and ingredient profile ALWAYS override the product name. Priority: (1) primary active / functional ingredient, (2) format & texture, (3) product name LAST. INGREDIENT DECISION TREE: (a) Primary active is hyaluronic acid, niacinamide, vitamin C / ascorbic acid, retinol / retinoid, peptides, AHA, or BHA → Serum. A lightweight/watery HA-dominant 'lotion' or 'milk' is a SERUM, not a Moisturizer. (b) Primary base is ceramides, shea butter, squalane, or fatty acids in a THICK occlusive base → Moisturizer. (c) Lightweight with mostly humectants (glycerin, HA, panthenol) and no heavy active → Serum or Essence (Essence if watery/toner-adjacent, Serum if targeted). (d) Contains SPF 30+ → SPF (pure sunscreen) or SPF Moisturizer (combined with heavy hydration). (e) Contains surfactants / cleansing agents (sulfates, glucosides, betaines, micellar, amino-acid surfactants) → Cleanser. ASIAN FORMAT MAPPINGS (apply AFTER the ingredient tree): Korean/Japanese 'lotion', 'milky lotion', 'milk', '乳液/nyuueki', or '유액' with hydrating ingredients → Essence if watery, Moisturizer if creamy, Serum if HA/niacinamide-dominant — NEVER Cleanser. Korean 'skin' or 'softener' → Toner. 'Ampoule' → Serum. 'Emulsion' → lightweight Moisturizer. When uncertain, pick the category that best matches the ingredient profile. NEVER default to Serum without ingredient justification. SPF LOGIC: SPF 30+ pure sunscreen → 'SPF'; SPF 15 or lower as secondary in a moisturizer → 'Moisturizer' (put SPF in 'spf' field); SPF 30+ with heavy moisturizing claims (ceramides, hyaluronic acid, shea, 'hydrating sunscreen', 'SPF moisturizer', 'day cream SPF') → 'SPF Moisturizer'. User skin profile: " + (skinContext || "Unknown") + ". Current shelf: " + JSON.stringify(shelfSummary) + ". Analyze this product photo. Return ONLY valid JSON (no markdown) with fields: brand, name, category (Cleanser/Toner/Essence/Serum/Eye Cream/Moisturizer/SPF Moisturizer/SPF/Oil/Exfoliant/Mask/Sleeping Mask/Sheet Mask/Treatment/Mist/Lip Care/Micellar Water), spf (numeric SPF level or null), ingredients array (INCI English), actives array, verdict (love/maybe/skip), headline (max 10 words), reason (2-3 sentences specific to their skin), conflicts array, duplicates array, flags array, skinTypeFit, fillsGap boolean, gap, routineSlot. Verdict: love=good fit no conflicts, maybe=minor concern, skip=conflicts or bad fit. Be direct and personal." }
          ]}]
      });
      console.log("[Cygne shopscan] 5. response:", JSON.stringify(respData).slice(0, 500));

      let text;
      if (respData && respData.content && Array.isArray(respData.content)) {
        text = respData.content.map(c => c.text || "").join("");
      } else if (typeof respData === "string") {
        text = respData;
      } else {
        text = JSON.stringify(respData);
      }
      console.log("[Cygne shopscan] 6. extracted text:", text.slice(0, 300));

      const clean = text.replace(/```json|```/g, "").trim();
      const jsonStart = clean.indexOf("{");
      const jsonEnd = clean.lastIndexOf("}");
      if (jsonStart < 0 || jsonEnd < 0) {
        console.error("[Cygne shopscan] 7. NO JSON in response:", clean.slice(0, 200));
        setScanError("Unexpected response format. Check console.");
        setPhase("prompt"); return;
      }
      const jsonStr = clean.slice(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonStr);
      console.log("[Cygne shopscan] 7. parsed result:", parsed);
      setResult(parsed);
      setPhase("result");
    } catch(err) {
      console.error("[Cygne shopscan] EXCEPTION:", err);
      console.error("[Cygne shopscan] stack:", err.stack);
      setScanError("Scan failed: " + (err.message || "unknown error"));
      setPhase("prompt");
    }
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setImgPreview(ev.target.result);
    reader.readAsDataURL(file);
    analyze(file);
  };

  const verdictConfig = {
    love:  { color: "#6e8a72",  bg: "rgba(122,144,112,0.08)", border: "rgba(122,144,112,0.25)", label: "Your skin would love this" },
    maybe: { color: "#8b7355",      bg: "rgba(139,115,85,0.08)",  border: "rgba(139,115,85,0.25)",  label: "Think twice" },
    skip:  { color: "#8b7355",      bg: "rgba(139,115,85,0.08)",   border: "rgba(139,115,85,0.25)",   label: "Not for you" },
  };
  const vc = result ? (verdictConfig[result.verdict] || verdictConfig.maybe) : null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--overlay)", backdropFilter: "blur(14px)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "var(--ink)", width: "100%", maxWidth: 520, borderRadius: "22px 22px 0 0", border: "1px solid var(--border)", borderBottom: "none", maxHeight: "90vh", overflowY: "auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "24px 24px 0" }}>
          <div>
            <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 4px" }}>Shopping</p>
            <h2 style={{ fontFamily: "Pinyon Script, cursive", fontSize: 32, fontWeight: 400, color: "var(--parchment)", margin: 0, letterSpacing: "0.01em" }}>Would my skin like this?</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", padding: 4, marginTop: 2 }}><Icon name="x" size={17} /></button>
        </div>

        <div style={{ padding: "20px 24px 40px" }}>
          {/* Prompt phase */}
          {phase === "prompt" && (
            <div>
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 12, color: "var(--clay)", margin: "0 0 20px", lineHeight: 1.65 }}>
                Photograph the ingredients list or product label. Cygne will check it against your skin type, concerns, and current vanity.
              </p>
              {scanError && (
                <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "#8b7355", margin: "0 0 12px", padding: "8px 12px", background: "rgba(139,115,85,0.08)", border: "1px solid rgba(139,115,85,0.2)", borderRadius: 8 }}>{scanError}</p>
              )}
              <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleFile} />
              <button onClick={() => fileRef.current?.click()}
                style={{ width: "100%", padding: "36px 20px", border: "1.5px dashed var(--border)", borderRadius: 16, background: "var(--surface)", cursor: "pointer", transition: "border-color 0.2s, background 0.2s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(122,144,112,0.5)"; e.currentTarget.style.background = "rgba(122,144,112,0.06)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface)"; }}>
                <div style={{ color: "var(--clay)", marginBottom: 10, display: "flex", justifyContent: "center" }}><Icon name="camera" size={28} /></div>
                <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 12, color: "var(--parchment)", margin: "0 0 4px", fontWeight: 500 }}>Scan product</p>
                <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: "var(--clay)", margin: 0 }}>Tap to open camera or choose a photo</p>
              </button>
              {/* Skin context preview */}
              {(user.skinType || user.concerns?.length > 0) && (
                <div style={{ marginTop: 16, padding: "12px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
                  <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 6px" }}>Checking against your skin</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {user.skinType && <span style={{ fontSize: 10, fontFamily: "Space Grotesk, sans-serif", color: "#6e8a72", background: "rgba(122,144,112,0.1)", border: "1px solid rgba(122,144,112,0.25)", padding: "2px 9px", borderRadius: 20 }}>{user.skinType}</span>}
                    {(user.concerns || []).map((c, i) => <span key={i} style={{ fontSize: 10, fontFamily: "Space Grotesk, sans-serif", color: "var(--clay)", background: "var(--surface)", border: "1px solid var(--border)", padding: "2px 9px", borderRadius: 20 }}>{c}</span>)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Scanning phase */}
          {phase === "scanning" && (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              {imgPreview && <img src={imgPreview} alt="" style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 12, marginBottom: 20, opacity: 0.6 }} />}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 14, height: 14, border: "1.5px solid #6e8a72", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 12, color: "var(--clay)" }}>Reading the ingredients...</span>
              </div>
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: "var(--clay)", opacity: 0.5, margin: 0 }}>Checking against your skin and vanity</p>
            </div>
          )}

          {/* Result phase */}
          {phase === "result" && result && vc && (
            <div>
              {/* Verdict */}
              <div style={{ padding: "18px 18px", background: vc.bg, border: `1px solid ${vc.border}`, borderRadius: 16, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: vc.color, margin: "0 0 5px" }}>{vc.label}</p>
                    <p style={{ fontFamily: "Pinyon Script, cursive", fontSize: 32, fontWeight: 400, color: "var(--parchment)", margin: 0, lineHeight: 1.2, letterSpacing: "0.01em" }}>{result.headline}</p>
                  </div>
                  {imgPreview && <img src={imgPreview} alt="" style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8, flexShrink: 0, marginLeft: 12 }} />}
                </div>
                <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: 0, lineHeight: 1.65 }}>{result.reason}</p>
              </div>

              {/* Product name */}
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 13, color: "var(--parchment)", margin: "0 0 2px", fontWeight: 500 }}>{result.name || "Product"}</p>
                <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: 0 }}>{result.brand}{result.category ? ` · ${result.category}` : ""}</p>
              </div>

              {/* Skin type fit */}
              {result.skinTypeFit && (
                <div style={{ padding: "11px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, marginBottom: 10 }}>
                  <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 4px" }}>For your skin type</p>
                  <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: 0, lineHeight: 1.6 }}>{result.skinTypeFit}</p>
                </div>
              )}

              {/* Conflicts */}
              {result.conflicts?.length > 0 && (
                <div style={{ padding: "11px 14px", background: "rgba(139,115,85,0.06)", border: "1px solid rgba(139,115,85,0.2)", borderRadius: 10, marginBottom: 10 }}>
                  <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8b7355", margin: "0 0 6px" }}>Conflicts with your vanity</p>
                  {result.conflicts.map((c, i) => <p key={i} style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: "0 0 3px", lineHeight: 1.5 }}>· {c}</p>)}
                </div>
              )}

              {/* Duplicates */}
              {result.duplicates?.length > 0 && (
                <div style={{ padding: "11px 14px", background: "rgba(139,115,85,0.06)", border: "1px solid rgba(139,115,85,0.2)", borderRadius: 10, marginBottom: 10 }}>
                  <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8b7355", margin: "0 0 6px" }}>Already covered</p>
                  {result.duplicates.map((d, i) => <p key={i} style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: "0 0 3px", lineHeight: 1.5 }}>· {d}</p>)}
                </div>
              )}

              {/* Fills a gap */}
              {result.fillsGap && result.gap && (
                <div style={{ padding: "11px 14px", background: "rgba(122,144,112,0.06)", border: "1px solid rgba(122,144,112,0.2)", borderRadius: 10, marginBottom: 10 }}>
                  <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6e8a72", margin: "0 0 4px" }}>Fills a gap</p>
                  <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: 0, lineHeight: 1.6 }}>{result.gap}</p>
                </div>
              )}

              {/* Routine slot */}
              {result.routineSlot && (
                <div style={{ padding: "9px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, marginBottom: 16 }}>
                  <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 3px" }}>Ritual position</p>
                  <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--parchment)", margin: 0 }}>{result.routineSlot}</p>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button onClick={() => { setPhase("prompt"); setResult(null); setImgPreview(null); }}
                  style={{ flex: 1, padding: "12px 0", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: "var(--clay)", cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Scan Another
                </button>
                <button onClick={onClose}
                  style={{ flex: 1, padding: "12px 0", background: "#6e8a72", border: "none", borderRadius: 10, fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: "#0d0f0d", fontWeight: 700, cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- ENVIRONMENT STRIP --------------------------------------------------------

export { ShopScanModal };