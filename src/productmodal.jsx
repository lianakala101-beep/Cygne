import { useState, useRef, useEffect } from "react";
import { Icon, Section } from "./components.jsx";
import { detectActives, analyzeShelf } from "./engine.js";
import { CATEGORIES, FREQUENCIES } from "./constants.js";
import { DEFER_TAG_CONFIG } from "./modals.jsx";

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
            <h2 style={{ fontFamily: "Reenie Beanie, cursive", fontSize: 22, fontWeight: 400, color: "var(--parchment)", margin: 0 }}>{product.name}</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", padding: 4 }}><Icon name="x" size={17} /></button>
        </div>

        {/* Positive read — shown on both add and defer */}
        {assessment.positiveRead && (
          <div style={{ background: "rgba(122,144,112,0.08)", border: "1px solid rgba(122,144,112,0.2)", borderRadius: 12, padding: "13px 16px", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#7a9070", marginTop: 5, flexShrink: 0 }} />
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
                style={{ width: "100%", padding: "14px 0", background: "#7a9070", color: "#0d0f0d", border: "none", borderRadius: 10, fontFamily: "Space Grotesk, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer" }}>
                Save for Later
              </button>
              <button onClick={onAddNow}
                style={{ width: "100%", padding: "13px 0", background: "transparent", color: "var(--clay)", border: "1px solid var(--border)", borderRadius: 10, fontFamily: "Space Grotesk, sans-serif", fontSize: 11, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>
                Add to Ritual Anyway
              </button>
            </>
          ) : (
            <button onClick={onAddNow}
              style={{ width: "100%", padding: "14px 0", background: "#7a9070", color: "#0d0f0d", border: "none", borderRadius: 10, fontFamily: "Space Grotesk, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer" }}>
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

// --- SESSION PICKER -----------------------------------------------------------

function ShelfLifeSection({ form, set }) {
  const [open, setOpen] = useState(false);
  const labelSt = { fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--clay)", display: "block", marginBottom: 5 };
  const inputSt2 = { width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", color: "var(--parchment)", fontFamily: "Space Grotesk, sans-serif", fontSize: 12, outline: "none", boxSizing: "border-box" };
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: "0 0 10px", cursor: "pointer" }}>
        <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--clay)", opacity: 0.6 }}>Shelf life & expiry</span>
        <span style={{ color: "var(--clay)", opacity: 0.4, fontSize: 10, display: "inline-block" }}>{open ? "▴" : "▾"}</span>
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
  const [modalStep, setModalStep] = useState(product && product.id ? "form" : "choose");
  const fileRef = useRef();
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

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
    const reader = new FileReader();
    reader.onload = ev => {};
    reader.readAsDataURL(file);
    setAnalyzing(true);
    try {
      const base64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
      const resp = await fetch("https://mxcefgbaaylddnyxrnao.supabase.co/functions/v1/rapid-action", {
        method: "POST", headers: { "Content-Type": "application/json", "apikey": "sb_publishable_6kUbORFpskKo-zg6r0MZtA_x5ppPvin", "Authorization": "Bearer sb_publishable_6kUbORFpskKo-zg6r0MZtA_x5ppPvin" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: file.type, data: base64 } },
          { type: "text", text: "You are a skincare product analyst. Look at this product image and return ONLY a JSON object with these exact fields: brand (string), name (string), category (one of: Cleanser/Toner/Serum/Eye Cream/Moisturizer/SPF/Oil/Exfoliant/Mask/Treatment), ingredients (comma-separated string of ingredients if visible). No markdown, no explanation, just the JSON object." }
        ]}] })
      });
      const data = await resp.json();
      const text = (data.content || []).map(c => c.text || "").join("") || "{}";
      const clean = text.replace(/\x60\x60\x60json|\x60\x60\x60/g, "").trim();
      const jsonStart = clean.indexOf("{");
      const jsonEnd = clean.lastIndexOf("}");
      const jsonStr = jsonStart >= 0 && jsonEnd >= 0 ? clean.slice(jsonStart, jsonEnd + 1) : "{}";
      const parsed = JSON.parse(jsonStr);
      setForm(f => ({
        ...f,
        brand: parsed.brand || f.brand,
        name: parsed.name || f.name,
        category: parsed.category || f.category,
        ingredients: parsed.ingredients || f.ingredients,
      }));
      setModalStep("form");
    } catch (err) { console.error(err); setModalStep("form"); }
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
              <button onClick={() => setModalStep("choose")} style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", padding: "0 8px 0 0", opacity: 0.6, fontSize: 16 }}>←</button>
            )}
            <h2 style={{ fontFamily: "Reenie Beanie, cursive", fontSize: 28, fontWeight: 400, color: "var(--parchment)", margin: 0 }}>
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
                  set("ingredients", [...withoutKey, key + " " + pct].join(", "));
                };

                const setActivePercent = (key, pct) => {
                  if (!pct.trim()) return;
                  const current = typeof form.ingredients === "string"
                    ? form.ingredients.split(",").map(s => s.trim()).filter(Boolean)
                    : (form.ingredients || []);
                  const withoutKey = current.filter(i => !i.toLowerCase().includes(key));
                  set("ingredients", [...withoutKey, key + " " + pct.trim()].join(", "));
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
                                style={{ width: 22, height: 22, borderRadius: "50%", border: "1px solid " + (isOn ? "#7a9070" : "var(--border)"), background: isOn ? "#7a9070" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                                {isOn && <span style={{ color: "var(--ink)", fontSize: 11, fontWeight: 700 }}>✓</span>}
                              </button>
                            </div>
                            {isOn && (
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                                {active.options.map(pct => (
                                  <button key={pct} onClick={() => toggleActive(active.key, pct)}
                                    style={{ padding: "4px 12px", borderRadius: 20, border: "1px solid " + (selected === pct ? "#7a9070" : "var(--border)"), background: selected === pct ? "rgba(122,144,112,0.18)" : "transparent", fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: selected === pct ? "var(--parchment)" : "var(--clay)", cursor: "pointer" }}>
                                    {pct}
                                  </button>
                                ))}
                                <input
                                  placeholder="custom %"
                                  value={selected && !active.options.includes(selected) ? selected : ""}
                                  onChange={e => setActivePercent(active.key, e.target.value)}
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
                {FREQUENCIES.map(f => (
                  <button key={f.id} onClick={() => set("frequency", f.id)}
                    style={{ padding: "7px 14px", borderRadius: 20, border: "1px solid " + ((form.frequency || "daily") === f.id ? "var(--sage)" : "var(--border)"), background: (form.frequency || "daily") === f.id ? "rgba(122,144,112,0.18)" : "transparent", color: (form.frequency || "daily") === f.id ? "var(--parchment)" : "var(--clay)", fontFamily: "Space Grotesk, sans-serif", fontSize: 11, cursor: "pointer" }}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelSt}>Session</label>
              {(() => {
                const locked = getLockedSession({ ...form, id: product ? product.id : null });
                if (locked) {
                  const isAM = locked.session === "am";
                  return (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ padding: "5px 14px", borderRadius: 20, background: isAM ? "rgba(196,144,64,0.12)" : "rgba(100,90,160,0.12)", border: "1px solid " + (isAM ? "rgba(196,144,64,0.35)" : "rgba(100,90,160,0.3)"), fontFamily: "Space Grotesk, sans-serif", fontSize: 10, fontWeight: 700, color: isAM ? "#c49040" : "#9490c8" }}>{isAM ? "AM only" : "PM only"}</span>
                        <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: "var(--clay)", opacity: 0.6 }}>locked by ingredients</span>
                      </div>
                      <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: 0, lineHeight: 1.5, opacity: 0.7 }}>{locked.reason}</p>
                    </div>
                  );
                }
                return (
                  <div style={{ display: "flex", gap: 8 }}>
                    {[{ id: "am", label: "AM" }, { id: "pm", label: "PM" }, { id: "both", label: "Both" }, { id: "auto", label: "Auto" }].map(s => {
                      const active = (form.session || "auto") === s.id;
                      return (
                        <button key={s.id} onClick={() => set("session", s.id)}
                          style={{ flex: 1, padding: "8px 0", borderRadius: 20, border: "1px solid " + (active ? "var(--sage)" : "var(--border)"), background: active ? "rgba(122,144,112,0.18)" : "transparent", color: active ? "var(--parchment)" : "var(--clay)", fontFamily: "Space Grotesk, sans-serif", fontSize: 10, fontWeight: active ? 600 : 400, cursor: "pointer" }}>
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
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

export { RoutineFitSheet, ProductModal, ShelfLifeSection, getLockedSession };