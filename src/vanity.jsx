import { useState, useRef, useEffect } from "react";
import { Icon, Section } from "./components.jsx";
import { detectActives, analyzeShelf, calcSpending } from "./engine.js";
import { AskCygneModal } from "./components/AskCygneModal.jsx";
import { assessRoutineFit, DEFER_TAG_CONFIG } from "./modals.jsx";
import { ProductModal } from "./productmodal.jsx";
import { getAskCygneAccess } from "./utils.jsx";


// Flat product card — 1px ivory-alpha outline on a solid ivory fill.
// Radius dropped to 0 so the card reads as a hard editorial rectangle
// rather than a soft glass tile; matches the flat container spirit
// used elsewhere in the app. Grid still gives visual separation
// between items — the flatness is per-card, not the layout.
const GLASS_CARD = {
  background: "rgba(250, 249, 244, 0.92)",
  border: "1px solid rgba(250, 249, 244, 0.35)",
  borderRadius: 0,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

function GlassProductCard({ product, onEdit, onDelete, onToggleRoutine, onSession, user = {}, onAskCygne }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuOpen]);

  const inRoutine = product.inRoutine !== false;

  return (
    <>
      <div style={{ ...GLASS_CARD, background: "rgba(250, 249, 244, 0.82)" }}>
        {/* Image area — sits directly on the card's single ivory surface
            (no background or divider of its own), so the card reads as one
            unified block. A product photo fills this area when present;
            otherwise an apothecary-label treatment shows the category
            name in bold Fungis type filling the same vertical space —
            no illustrated glyph, no small caption. Reads as a
            typographic label, not decorative art. */}
        <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", background: "transparent", flexShrink: 0, overflow: "hidden" }}>
          {product.imageUrl
            ? <img src={product.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px 12px", boxSizing: "border-box" }}>
                <span
                  aria-label={product.category}
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    fontSize: 30,
                    letterSpacing: "0.02em",
                    lineHeight: 0.95,
                    textTransform: "uppercase",
                    textAlign: "center",
                    color: "#1c1c1a",
                    // Long labels ("SPF MOISTURIZER", "PRESCRIPTION")
                    // wrap onto a second line rather than truncate;
                    // hyphenation stays off so the type reads clean.
                    wordBreak: "normal",
                    overflowWrap: "break-word",
                  }}
                >
                  {product.category}
                </span>
              </div>
            )
          }

          {/* ⋯ menu */}
          <div ref={menuRef} style={{ position: "absolute", top: 6, right: 6 }}>
            <button onClick={() => setMenuOpen(o => !o)} aria-label="Options"
              style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(250,249,244,0.75)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", border: "1px solid rgba(192,192,192,0.35)", color: "#1c1c1a", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, lineHeight: 1, fontFamily: "sans-serif" }}>
              ⋯
            </button>
            {menuOpen && (
              <div style={{ position: "absolute", right: 0, top: "110%", zIndex: 50, minWidth: 170, background: "rgba(250,249,244,0.96)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(192,192,192,0.3)", borderRadius: 8, padding: "6px 0", boxShadow: "0 8px 28px rgba(0,0,0,0.10)" }}>
                <button onClick={() => { setMenuOpen(false); onEdit(product); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 16px", background: "none", border: "none", cursor: "pointer", color: "#1c1c1a", fontFamily: "var(--font-body)", fontSize: 12, textAlign: "left" }}>
                  <Icon name="edit" size={12} /><span>Edit product</span>
                </button>
                <button onClick={() => { setMenuOpen(false); onToggleRoutine(product.id); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 16px", background: "none", border: "none", cursor: "pointer", color: "#1c1c1a", fontFamily: "var(--font-body)", fontSize: 12, textAlign: "left" }}>
                  <Icon name="sparkle" size={12} /><span>{inRoutine ? "Remove from ritual" : "Add to ritual"}</span>
                </button>
                {onAskCygne && getAskCygneAccess(user) === "available" && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      const productName = product.name || "this product";
                      const ingredients = (product.ingredients || []).slice(0, 12).join(", ");
                      const ctxLines = [
                        `Product: ${productName}${product.brand ? ` by ${product.brand}` : ""}.`,
                        `Category: ${product.category || "uncategorized"}.`,
                        ingredients ? `Ingredients: ${ingredients}.` : null,
                        product.session ? `Session: ${product.session}.` : null,
                        product.frequency && product.frequency !== "daily" ? `Frequency: ${product.frequency}.` : null,
                      ].filter(Boolean);
                      onAskCygne(
                        `Tell me about ${productName} and how it works with my other products.`,
                        ctxLines.join(" "),
                      );
                    }}
                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 16px", background: "none", border: "none", cursor: "pointer", color: "#1c1c1a", fontFamily: "var(--font-body)", fontSize: 12, textAlign: "left" }}>
                    <Icon name="swan" size={12} /><span>Ask Cygne</span>
                  </button>
                )}
                <div style={{ height: 1, background: "rgba(192,192,192,0.25)", margin: "4px 12px" }} />
                <button onClick={() => { setMenuOpen(false); setConfirmDelete(true); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 16px", background: "none", border: "none", cursor: "pointer", color: "#8b7355", fontFamily: "var(--font-body)", fontSize: 12, textAlign: "left" }}>
                  <Icon name="trash" size={12} /><span>Remove</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Text content — sharper hierarchy: quiet brand eyebrow and
            price bracket the loud product name. Product name bumps to
            Fungis display 16px so it anchors the card; brand + price
            stay small caps at 9/11 so they read as metadata, not peers. */}
        <div style={{ padding: "12px 12px 14px", textAlign: "left" }}>
          {product.brand && (
            <p style={{ fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 400, letterSpacing: "0.14em", textTransform: "uppercase", color: "#5a5a5a", margin: "0 0 6px", opacity: 0.9 }}>{product.brand}</p>
          )}
          <p style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, letterSpacing: "0.01em", color: "#1c1c1a", margin: 0, lineHeight: 1.2 }}>{product.name}</p>
          {product.price > 0 && (
            <p style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 400, letterSpacing: "0.02em", color: "#5a5a5a", margin: "8px 0 0", opacity: 0.9 }}>${(product.price || 0).toFixed(0)}</p>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(250,249,244,0.8)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", padding: "0 28px" }} onClick={() => setConfirmDelete(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 320, background: "rgba(250,249,244,0.97)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(192,192,192,0.3)", borderRadius: 8, padding: "26px 24px 22px", boxShadow: "0 16px 48px rgba(0,0,0,0.10)" }}>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "#5a5a5a", margin: "0 0 12px" }}>Confirm</p>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#1c1c1a", margin: "0 0 22px", lineHeight: 1.65 }}>Remove <strong>{product.name}</strong> from your vanity? This cannot be undone.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: "12px 0", borderRadius: 0, border: "1px solid rgba(192,192,192,0.35)", background: "transparent", color: "#1c1c1a", fontFamily: "var(--font-body)", fontSize: 12, cursor: "pointer" }}>Cancel</button>
              <button onClick={() => { setConfirmDelete(false); onDelete(product.id); }} style={{ flex: 1, padding: "12px 0", borderRadius: 0, border: "1px solid rgba(139,115,85,0.3)", background: "rgba(139,115,85,0.07)", color: "#8b7355", fontFamily: "var(--font-body)", fontSize: 12, cursor: "pointer" }}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function buildInsights(products, activeMap) {
  const insights = [];
  const cats = products.reduce((acc, p) => { acc[p.category] = (acc[p.category] || []); acc[p.category].push(p); return acc; }, {});

  // -- 1. Routine Efficiency --------------------------------------------------
  const efficiencyItems = [];

  // Duplicate categories
  Object.entries(cats).forEach(([cat, prods]) => {
    if (prods.length > 1 && cat !== "Serum") {
      efficiencyItems.push({
        text: `You have ${prods.length} ${cat.toLowerCase()}s. Only one is needed per routine.`,
        severity: "warning",
      });
    }
  });

  // Exfoliant overlap
  const exfoliants = products.filter(p => {
    const a = detectActives(p.ingredients);
    return p.category === "Exfoliant" || a.AHA || a.BHA;
  });
  const uniqueExfNames = [...new Set(exfoliants.map(p => p.name))];
  if (uniqueExfNames.length > 1) {
    efficiencyItems.push({
      text: `You have ${uniqueExfNames.length} overlapping exfoliants. Daily use of both compromises barrier recovery.`,
      severity: "warning",
    });
  }

  // Serum count
  const serums = products.filter(p => p.category === "Serum");
  if (serums.length > 3) {
    efficiencyItems.push({
      text: `${serums.length} serums in rotation. More than 2–3 actives per session reduces each one's absorption.`,
      severity: "caution",
    });
  }

  if (efficiencyItems.length === 0) {
    efficiencyItems.push({ text: "Ritual structure looks efficient. No redundant steps detected.", severity: "ok" });
  }

  insights.push({ section: "Ritual Efficiency", icon: "layers", items: efficiencyItems });

  // -- 2. Ingredient Analysis -------------------------------------------------
  const ingredientItems = [];

  const allIngredients = products.flatMap(p => p.ingredients || []);
  const ingCounts = allIngredients.reduce((acc, ing) => { acc[ing] = (acc[ing] || 0) + 1; return acc; }, {});

  // Count active presence across products
  Object.entries(activeMap).forEach(([active, prods]) => {
    if (prods.length > 1) {
      ingredientItems.push({
        text: `${active.charAt(0).toUpperCase() + active.slice(1)} appears in ${prods.length} products. Cumulative concentration may exceed intended levels.`,
        severity: prods.length >= 3 ? "warning" : "caution",
        meta: prods.map(p => p.name),
      });
    }
  });

  // Most repeated base ingredient
  const topIng = Object.entries(ingCounts)
    .filter(([k]) => k.length > 4 && !["water", "aqua", "glycerin", "alcohol"].includes(k))
    .sort((a, b) => b[1] - a[1])[0];
  if (topIng && topIng[1] >= 3) {
    ingredientItems.push({
      text: `"${topIng[0]}" is the most repeated ingredient across your vanity — appears in ${topIng[1]} products.`,
      severity: "neutral",
    });
  }

  if (ingredientItems.length === 0) {
    ingredientItems.push({ text: "No ingredient redundancy detected across current products.", severity: "ok" });
  }

  insights.push({ section: "Ingredient Analysis", icon: "drop", items: ingredientItems });

  // -- 3. Cost Optimization ---------------------------------------------------
  const costItems = [];
  const totalValue = products.reduce((s, p) => s + (p.price || 0), 0);

  // Find products with overlapping categories — cost of redundancy
  let redundantCost = 0;
  let redundantCount = 0;
  Object.entries(cats).forEach(([cat, prods]) => {
    if (prods.length > 1 && cat !== "Serum") {
      const sorted = [...prods].sort((a, b) => (b.price || 0) - (a.price || 0));
      sorted.slice(1).forEach(p => { redundantCost += (p.price || 0); redundantCount++; });
    }
  });

  if (redundantCost > 0) {
    costItems.push({
      text: `You could remove ${redundantCount} redundant product${redundantCount > 1 ? "s" : ""} and save $${redundantCost.toFixed(0)} in overlapping products.`,
      severity: "caution",
    });
  }

  // Exfoliant redundancy cost
  if (uniqueExfNames.length > 1) {
    const exfCost = exfoliants.slice(1).reduce((s, p) => s + (p.price || 0), 0);
    if (exfCost > 0) {
      costItems.push({
        text: `Consolidating to one exfoliant saves approximately $${exfCost.toFixed(0)} per cycle.`,
        severity: "caution",
      });
    }
  }

  // Most expensive product flag
  const sorted = [...products].sort((a, b) => (b.price || 0) - (a.price || 0));
  if (sorted.length > 0 && sorted[0].price > 60) {
    costItems.push({
      text: `${sorted[0].name} at $${sorted[0].price.toFixed(0)} is your highest spend. Verify it's serving a unique function not covered by other products.`,
      severity: "neutral",
    });
  }

  if (costItems.length === 0) {
    costItems.push({ text: `Total vanity value $${totalValue.toFixed(0)}. No obvious cost inefficiencies detected.`, severity: "ok" });
  }

  insights.push({ section: "Cost Optimization", icon: "spending", items: costItems });

  // -- 4. Replacement Suggestions ---------------------------------------------
  const replaceItems = [];

  // Multiple serums with overlapping actives → consolidate
  const serumActives = serums.map(p => ({ p, actives: Object.keys(detectActives(p.ingredients)) }));
  const overlapping = serumActives.filter(s => serumActives.some(o => o.p.id !== s.p.id && o.actives.some(a => s.actives.includes(a))));
  if (overlapping.length >= 2) {
    replaceItems.push({
      text: `${overlapping.map(s => s.p.name).join(" and ")} share active ingredients. A single multi-active serum could replace both.`,
      severity: "caution",
      cygne: true,
    });
  }

  // No SPF — suggest adding one
  if (!cats["SPF"] && !cats["SPF Moisturizer"] && !activeMap["SPF"]) {
    replaceItems.push({
      text: "No SPF detected. Adding a broad-spectrum SPF 30–50 as the final AM step is the single highest-impact change you can make.",
      severity: "warning",
      cygne: true,
    });
  }

  // Low-price product in a critical category where better alternatives exist
  const budget = products.filter(p => ["Moisturizer", "Cleanser"].includes(p.category) && (p.price || 0) < 12 && products.some(other => other.category === p.category && (other.price || 0) > p.price));
  budget.forEach(p => {
    replaceItems.push({
      text: `${p.name} ($${p.price}) is your entry-level ${p.category.toLowerCase()}. If barrier issues persist, a ceramide-rich upgrade may improve tolerance of your actives.`,
      severity: "neutral",
      cygne: true,
    });
  });

  if (replaceItems.length === 0) {
    replaceItems.push({ text: "No replacement opportunities flagged. Current product selection is coherent.", severity: "ok" });
  }

  insights.push({ section: "Replacement Suggestions", icon: "sparkle", items: replaceItems });

  return insights;
}

function InsightRow({ item }) {
  const dot = item.severity === "warning" ? "#8b7355" : item.severity === "caution" ? "#8b7355" : item.severity === "ok" ? "#2d3d2b" : "var(--clay)";
  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ width: 5, height: 5, borderRadius: "50%", background: dot, flexShrink: 0, marginTop: 6 }} />
      <div style={{ flex: 1 }}>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: item.severity === "ok" ? "var(--clay)" : "var(--parchment)", margin: "0 0 4px", lineHeight: 1.6 }}>{item.text}</p>
        {item.meta && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
            {item.meta.map((m, i) => <span key={i} style={{ fontSize: 9, fontFamily: "var(--font-body)", color: "var(--clay)", background: "var(--surface)", padding: "2px 7px", borderRadius: 20, border: "1px solid var(--border)", letterSpacing: "0.04em" }}>{m}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}

function InsightBlock({ insight }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginBottom: 2 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "14px 0", background: "none", border: "none", borderTop: "1px solid var(--border)", cursor: "pointer" }}>
        <span style={{ color: "var(--clay)", opacity: 0.55 }}><Icon name={insight.icon} size={13} /></span>
        <span style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--clay)", flex: 1, textAlign: "left" }}>{insight.section}</span>
        <span style={{ color: "var(--clay)", opacity: 0.35, display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
          <Icon name="chevron" size={12} />
        </span>
      </button>
      {open && (
        <div style={{ paddingBottom: 6 }}>
          {insight.items.map((item, i) => (
            <InsightRow key={i} item={i === insight.items.length - 1 ? { ...item, _last: true } : item} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClearAllButton({ onClearAll }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <button
      onClick={() => {
        if (confirming) { onClearAll(); setConfirming(false); }
        else { setConfirming(true); setTimeout(() => setConfirming(false), 3000); }
      }}
      style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: confirming ? "#8b7355" : "var(--clay)", opacity: confirming ? 1 : 0.35, background: "none", border: "none", cursor: "pointer", paddingTop: 8, transition: "all 0.2s" }}>
      {confirming ? "Tap again to confirm" : "Clear all"}
    </button>
  );
}

function Shelf({ products, onEdit, onDelete, onAdd, onToggleRoutine, onClearAll, onSession, waitingRoom = [], onAddFromWaiting, onDismissWaiting, checkIns = [], user = {}, journals = [] }) {
  const [view, setView] = useState("shelf");
  const [filter, setFilter] = useState("All");
  const [askState, setAskState] = useState(null); // { question, context } | null
  const { activeMap } = analyzeShelf(products);
  const spending = calcSpending(products);
  const cats = ["All", ...new Set(products.map(p => p.category))];
  const filtered = filter === "All" ? products : products.filter(p => p.category === filter);
  const insights = buildInsights(products, activeMap);

  return (
    <div>
      {/* -- Header ----------------------------------------------------------- */}
      <div style={{ marginBottom: 24, paddingTop: 44 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 500, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--color-ivory)", margin: "0 0 4px", lineHeight: 1.15 }}>Your Vanity</h1>
          {false && <ClearAllButton onClearAll={onClearAll} />}  {/* hidden — dev only */}
        </div>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--clay)", margin: 0 }}>
          {products.length} product{products.length !== 1 ? "s" : ""}{spending.total > 0 ? ` · $${spending.total.toFixed(0)} estimated` : ""}
        </p>
      </div>

      {/* -- View Toggle — segmented Products / Insights pills matching
          the Morning / Evening toggle in ritualscreen.jsx. Thin ivory
          outline, low-opacity fill only on the active segment, ivory
          divider between segments, Fungis display caps. */}
      <div
        role="group"
        aria-label="Vanity view"
        style={{
          display: "inline-flex", alignItems: "stretch",
          marginBottom: 24,
          border: "1px solid rgba(250,249,244,0.28)",
          borderRadius: 999, overflow: "hidden",
        }}
      >
        {[{ id: "shelf", label: "Products" }, { id: "insights", label: "Insights" }].map((v, i) => {
          const active = view === v.id;
          return (
            <button
              key={v.id}
              type="button"
              aria-pressed={active}
              onClick={() => setView(v.id)}
              style={{
                padding: "6px 20px",
                background: active ? "rgba(250,249,244,0.14)" : "transparent",
                border: "none",
                borderLeft: i === 0 ? "none" : "1px solid rgba(250,249,244,0.28)",
                cursor: active ? "default" : "pointer",
                fontFamily: "var(--font-display)",
                fontSize: 10, fontWeight: 400,
                letterSpacing: "0.2em", textTransform: "uppercase",
                color: active ? "var(--color-ivory, #faf9f4)" : "rgba(250,249,244,0.65)",
                WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
                transition: "background 0.18s, color 0.18s",
              }}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      {/* -- PRODUCTS VIEW ----------------------------------------------------- */}
      {view === "shelf" && (
        <>
          {products.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0 40px" }}>
              <p style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 400, letterSpacing: "0.08em", color: "var(--clay)", margin: "0 0 8px" }}>Your vanity is empty.</p>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--clay)", opacity: 0.6, margin: "0 0 28px", lineHeight: 1.6 }}>Scan a product to add it, or add one manually.</p>
              <button onClick={onAdd}
                style={{ padding: "12px 28px", background: "rgba(250,249,244,0.10)", border: "1px solid rgba(45,61,43,0.3)", borderRadius: 8, fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 400, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--sage)", cursor: "pointer" }}>
                + Add Product
              </button>
            </div>
          ) : (
            <>
              {/* Category filter — fully-rounded pills matching the
                  Travel Edit / Shop Scan treatment on the home page
                  (borderRadius 999, thin ivory-alpha outline, low-opacity
                  ivory fill only when active). */}
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 12, marginBottom: 18, scrollbarWidth: "none" }}>
                {cats.map(c => {
                  const active = filter === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setFilter(c)}
                      style={{
                        flexShrink: 0,
                        padding: "6px 14px",
                        borderRadius: 999,
                        border: `1px solid ${active ? "rgba(250,249,244,0.55)" : "rgba(250,249,244,0.28)"}`,
                        background: active ? "rgba(250,249,244,0.14)" : "transparent",
                        color: active ? "var(--color-ivory, #faf9f4)" : "rgba(250,249,244,0.65)",
                        fontFamily: "var(--font-display)",
                        fontSize: 10, fontWeight: 400,
                        letterSpacing: "0.18em", textTransform: "uppercase",
                        whiteSpace: "nowrap", cursor: "pointer",
                        WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
                        transition: "background 0.18s, color 0.18s, border-color 0.18s",
                      }}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>

              <p style={{ fontFamily: "var(--font-body)", fontSize: 9, color: "var(--clay)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 14, opacity: 0.6 }}>
                {filtered.length} of {products.length} product{products.length !== 1 ? "s" : ""}
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                {filtered.map(p => <GlassProductCard key={p.id} product={p} onEdit={onEdit} onDelete={onDelete} onToggleRoutine={onToggleRoutine} onSession={onSession} user={user} onAskCygne={(q, ctx) => setAskState({ question: q, context: ctx })} />)}
                <button onClick={onAdd} style={{ ...GLASS_CARD, background: "rgba(250,249,244,0.25)", border: "1px dashed rgba(192,192,192,0.4)", cursor: "pointer", aspectRatio: "1 / 1", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <span style={{ fontSize: 20, color: "var(--color-ivory, #faf9f4)", opacity: 0.6, lineHeight: 1 }}>+</span>
                  <span style={{ fontFamily: "var(--font-display, 'Fungis', sans-serif)", fontSize: 8, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--color-ivory, #faf9f4)", opacity: 0.6 }}>Add Product</span>
                </button>
              </div>
            </>
          )}
        </>
      )}

      {/* -- INSIGHTS VIEW ----------------------------------------------------- */}
      {view === "insights" && (
        <div>
          {products.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--clay)", letterSpacing: "0.06em" }}>Add products to see vanity insights.</p>
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 28 }}>
                {[
                  { label: "Products", value: products.length },
                  { label: "Categories", value: new Set(products.map(p => p.category)).size },
                  { label: "Value", value: `$${(spending.total || 0).toFixed(0)}` },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: "var(--color-ivory-shadow)", border: "none", borderRadius: 8, padding: "16px 14px", textAlign: "center" }}>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: 22, fontWeight: 200, color: "var(--parchment)", margin: "0 0 3px", letterSpacing: "-0.02em" }}>{value}</p>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--clay)", margin: 0 }}>{label}</p>
                  </div>
                ))}
              </div>
              <div>{insights.map((insight, i) => <InsightBlock key={i} insight={insight} />)}</div>
            </>
          )}
        </div>
      )}

      {/* -- Waiting Room --------------------------------------------------- */}
      {waitingRoom.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--clay)", margin: 0 }}>Waiting Room</p>
            <span style={{ padding: "1px 8px", borderRadius: 8, background: "rgba(250,249,244,0.10)", border: "1px solid rgba(45,61,43,0.2)", fontFamily: "var(--font-body)", fontSize: 9, color: "var(--sage)" }}>{waitingRoom.length}</span>
          </div>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: "0 0 16px", lineHeight: 1.6, opacity: 0.7 }}>Products Cygne suggested holding for now. You'll get a nudge when the timing shifts.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {waitingRoom.map((item, idx) => {
              const tagCfg = DEFER_TAG_CONFIG[item.deferTag] || DEFER_TAG_CONFIG.overlap;
              const assessment = assessRoutineFit(item.product, products, checkIns, user);
              const nowReady = assessment.verdict === "add";
              return (
                <div key={idx} style={{ background: "var(--surface)", border: `1px solid ${nowReady ? "rgba(45,61,43,0.4)" : "var(--border)"}`, borderRadius: 8, padding: "16px", transition: "border-color 0.3s" }}>
                  {nowReady && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#2d3d2b" }} />
                      <span style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-ivory, #faf9f4)" }}>Ready to introduce</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 400, color: "var(--parchment)", margin: "0 0 2px" }}>{item.product.name}</p>
                      <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: 0 }}>{item.product.brand} · {item.product.category}</p>
                    </div>
                    <span style={{ padding: "2px 9px", borderRadius: 20, background: tagCfg.bg, border: `1px solid ${tagCfg.color}40`, fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: tagCfg.color, flexShrink: 0, marginLeft: 10 }}>
                      {tagCfg.label}
                    </span>
                  </div>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: "0 0 14px", lineHeight: 1.6, opacity: 0.8 }}>{item.reason}</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => onAddFromWaiting(item)}
                      style={{ flex: 1, padding: "9px 0", background: nowReady ? "#2d3d2b" : "rgba(250,249,244,0.10)", color: nowReady ? "#fdfcf9" : "var(--sage)", border: `1px solid ${nowReady ? "#2d3d2b" : "rgba(45,61,43,0.3)"}`, borderRadius: 9, fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 400, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer", transition: "all 0.2s" }}>
                      Add to Ritual
                    </button>
                    <button onClick={() => onDismissWaiting(item)}
                      style={{ padding: "9px 14px", background: "transparent", color: "var(--clay)", border: "1px solid var(--border)", borderRadius: 9, fontFamily: "var(--font-body)", fontSize: 10, cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {askState && (
        <AskCygneModal
          initialQuestion={askState.question}
          context={askState.context}
          user={user}
          products={products}
          journals={journals}
          checkIns={checkIns}
          onClose={() => setAskState(null)}
        />
      )}
    </div>
  );
}


// --- INTRODUCE SLOWLY --------------------------------------------------------

export { Shelf };