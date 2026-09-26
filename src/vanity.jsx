import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { Icon, Section } from "./components.jsx";
import { detectActives, analyzeShelf, calcSpending } from "./engine.js";
import { AskCygneModal } from "./components/AskCygneModal.jsx";
import { assessRoutineFit, DEFER_TAG_CONFIG } from "./modals.jsx";
import { ProductModal } from "./productmodal.jsx";
import { getAskCygneAccess } from "./utils.jsx";
import { CATEGORIES, FREQUENCIES } from "./constants.js";


// Bottle silhouette shapes — decorative container outlines mapped by
// category so the shelf reads like an apothecary case (small vessels
// of different formats) rather than a spreadsheet of identical tiles.
// Liquids that come in a pump get the pump-bottle profile; thin
// liquids (serums, oils, and the toner/essence/mist family, which are
// packaged the same way) get the tall dropper-bottle profile; balms
// and creams get the squat jar. Anything without an explicit mapping
// falls back to the jar — the least format-specific shape.
const BOTTLE_SHAPE_BY_CATEGORY = {
  Cleanser: "pump",
  Serum: "dropper",
  Oil: "dropper",
  Toner: "dropper",
  Essence: "dropper",
  Mist: "dropper",
  Moisturizer: "jar",
  "Eye Cream": "jar",
};
function getBottleShape(category) {
  return BOTTLE_SHAPE_BY_CATEGORY[category] || "jar";
}

// Neck (cap) + body dimensions per shape. Heights are deliberately
// uneven across shapes — that unevenness is the point (see BottleRow's
// flex row, which bottom-aligns items of different heights along the
// shelf line instead of forcing a uniform card height).
const BOTTLE_SHAPE_SPEC = {
  pump:    { bodyW: 74, bodyH: 76, neckW: 26, neckH: 14, bodyRadius: "6px 6px 18px 18px", neckRadius: "4px 4px 1px 1px" },
  dropper: { bodyW: 44, bodyH: 120, neckW: 16, neckH: 16, bodyRadius: 12, neckRadius: "4px 4px 1px 1px" },
  jar:     { bodyW: 80, bodyH: 54, neckW: 66, neckH: 9, bodyRadius: "6px 6px 14px 14px", neckRadius: "3px 3px 1px 1px" },
};

const BOTTLE_FILL = "rgba(var(--rgb-ivory), 0.82)";
const BOTTLE_BORDER = "1px solid rgba(var(--rgb-ivory), 0.32)";

function ProductBottle({ product, onEdit, onDelete, onToggleRoutine, onSession, user = {}, onAskCygne }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuOpen]);

  const inRoutine = product.inRoutine !== false;
  const shape = getBottleShape(product.category);
  const spec = BOTTLE_SHAPE_SPEC[shape];

  return (
    <>
      {/* data-bottle-slot marks the actual laid-out silhouette (as
          opposed to the menu dropdown / detail sheet / delete-confirm
          overlays below, which are fixed-position siblings within this
          same fragment) — BottleRow queries this attribute to measure
          where each flex-wrapped row actually breaks. */}
      <div data-bottle-slot style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", width: spec.bodyW, flexShrink: 0 }}>
        {/* ⋯ menu — pinned to the top-right of the whole silhouette
            (not the narrow neck, which is often too small to host it)
            so it's reachable regardless of shape. */}
        <div ref={menuRef} style={{ position: "absolute", top: -6, right: -8, zIndex: 2 }}>
          <button onClick={() => setMenuOpen(o => !o)} aria-label="Options"
            style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(var(--rgb-ivory), 0.82)", border: "1px solid rgba(var(--rgb-silver), 0.32)", color: "var(--color-ink)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--text-xs)", lineHeight: 1, fontFamily: "sans-serif" }}>
            ⋯
          </button>
          {menuOpen && (
            <div style={{ position: "absolute", right: 0, top: "110%", zIndex: 50, minWidth: 170, background: "rgba(var(--rgb-ivory), 0.94)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(var(--rgb-silver), 0.32)", borderRadius: "var(--radius)", padding: "var(--space-2) 0", boxShadow: "0 8px 28px rgba(var(--rgb-ink), 0.08)" }}>
              <button onClick={() => { setMenuOpen(false); onEdit(product); }} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", width: "100%", padding: "var(--space-3) var(--space-4)", background: "none", border: "none", cursor: "pointer", color: "var(--color-ink)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", textAlign: "left" }}>
                <Icon name="edit" size={12} /><span>Edit product</span>
              </button>
              <button onClick={() => { setMenuOpen(false); onToggleRoutine(product.id); }} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", width: "100%", padding: "var(--space-3) var(--space-4)", background: "none", border: "none", cursor: "pointer", color: "var(--color-ink)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", textAlign: "left" }}>
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
                  style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", width: "100%", padding: "var(--space-3) var(--space-4)", background: "none", border: "none", cursor: "pointer", color: "var(--color-ink)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", textAlign: "left" }}>
                  <Icon name="swan" size={12} /><span>Ask Cygne</span>
                </button>
              )}
              <div style={{ height: 1, background: "rgba(var(--rgb-silver), 0.32)", margin: "var(--space-1) var(--space-3)" }} />
              <button onClick={() => { setMenuOpen(false); setConfirmDelete(true); }} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", width: "100%", padding: "var(--space-3) var(--space-4)", background: "none", border: "none", cursor: "pointer", color: "var(--color-bronze)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", textAlign: "left" }}>
                <Icon name="trash" size={12} /><span>Remove</span>
              </button>
            </div>
          )}
        </div>

        {/* Neck + body — tapping the silhouette itself (not the ⋯ menu,
            a separate absolute-positioned sibling above) opens the full
            detail sheet, since the label plate only ever shows a
            truncated name. */}
        <div
          role="button"
          tabIndex={0}
          aria-label={`View details for ${product.name}`}
          onClick={() => setDetailOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailOpen(true); } }}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
        >
          {/* Neck / cap — sits flush on top of the body (negative margin
              closes the seam so the border between them doesn't double
              up into a thick line). */}
          <div style={{ width: spec.neckW, height: spec.neckH, background: BOTTLE_FILL, border: BOTTLE_BORDER, borderRadius: spec.neckRadius, marginBottom: -1, flexShrink: 0 }} />

          {/* Body — the container's main silhouette, holding a small
              label plate rather than filling edge-to-edge with text. */}
          <div style={{
            width: spec.bodyW, height: spec.bodyH, background: BOTTLE_FILL, border: BOTTLE_BORDER, borderRadius: spec.bodyRadius,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 5, boxSizing: "border-box", flexShrink: 0,
          }}>
            <div style={{ width: "100%", textAlign: "center" }}>
              {product.brand && (
                <p style={{ fontFamily: "var(--font-body)", fontSize: 6.5, fontWeight: 400, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-stone)", margin: "0 0 2px", opacity: 0.9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{product.brand}</p>
              )}
              <p style={{
                fontFamily: "var(--font-display)", fontSize: 8.5, fontWeight: 700, letterSpacing: "0", color: "var(--color-ink)", margin: 0, lineHeight: 1.15,
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis",
              }}>{product.name}</p>
              {product.price > 0 && (
                <p style={{ fontFamily: "var(--font-body)", fontSize: 6.5, fontWeight: 400, color: "var(--color-stone)", margin: "2px 0 0", opacity: 0.9 }}>${(product.price || 0).toFixed(0)}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Full-detail bottom sheet — separate from the ⋯ menu's actions,
          triggered by tapping the bottle itself. */}
      {detailOpen && <ProductDetailSheet product={product} onClose={() => setDetailOpen(false)} />}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(var(--rgb-ivory), 0.82)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", padding: "0 calc(var(--space-1) * 7)" }} onClick={() => setConfirmDelete(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 320, background: "rgba(var(--rgb-ivory), 0.94)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(var(--rgb-silver), 0.32)", borderRadius: "var(--radius)", padding: "calc(var(--space-1) * 7) var(--space-6) var(--space-6)", boxShadow: "0 16px 48px rgba(var(--rgb-ink), 0.08)" }}>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--color-stone)", margin: "0 0 var(--space-3)" }}>Confirm</p>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", color: "var(--color-ink)", margin: "0 0 var(--space-6)", lineHeight: 1.65 }}>Remove <strong>{product.name}</strong> from your vanity? This cannot be undone.</p>
            <div style={{ display: "flex", gap: "var(--space-3)" }}>
              <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: "var(--space-3) 0", borderRadius: 0, border: "1px solid rgba(var(--rgb-silver), 0.32)", background: "transparent", color: "var(--color-ink)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", cursor: "pointer" }}>Cancel</button>
              <button onClick={() => { setConfirmDelete(false); onDelete(product.id); }} style={{ flex: 1, padding: "var(--space-3) 0", borderRadius: 0, border: "1px solid rgba(var(--rgb-bronze), 0.32)", background: "rgba(var(--rgb-bronze), 0.08)", color: "var(--color-bronze)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", cursor: "pointer" }}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DetailPill({ label, value }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "var(--space-2) var(--space-3)" }}>
      <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 var(--space-1)", opacity: 0.7 }}>{label}</p>
      <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--parchment)", margin: 0 }}>{value}</p>
    </div>
  );
}

// Full-detail view for a bottle whose label plate can only ever show a
// truncated name — same bottom-sheet pattern as RoutineFitSheet in
// productmodal.jsx (dark ink panel, rounded top corners, backdrop
// blur), reused here as the established "more about this product"
// pattern rather than inventing a new one. Deliberately separate from
// ProductModal (the ⋯ menu's "Edit product" action): this is a
// read-only view, not a form.
function ProductDetailSheet({ product, onClose }) {
  const actives = Object.keys(detectActives(product.ingredients || []));
  const ingredients = Array.isArray(product.ingredients) ? product.ingredients : [];
  const freqLabel = FREQUENCIES.find(f => f.id === product.frequency)?.label || FREQUENCIES[0].label;
  const sessionLabel = product.session === "am" ? "Morning" : product.session === "pm" ? "Evening" : product.session === "both" ? "AM & PM" : null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(var(--rgb-ink), 0.82)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", zIndex: 210, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "var(--ink)", width: "100%", maxWidth: 520, maxHeight: "80vh", overflowY: "auto", borderRadius: "var(--radius-sheet)", padding: "calc(var(--space-1) * 7) var(--space-6) var(--space-10)", border: "1px solid var(--border)", borderBottom: "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--space-5)", gap: "var(--space-3)" }}>
          <div>
            {product.brand && (
              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 var(--space-2)" }}>{product.brand}</p>
            )}
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)", fontWeight: 700, letterSpacing: "0.01em", color: "var(--parchment)", margin: 0, lineHeight: 1.25 }}>{product.name}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", padding: "var(--space-1)", flexShrink: 0 }}><Icon name="x" size={17} /></button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginBottom: "var(--space-6)" }}>
          <DetailPill label="Category" value={product.category || "Uncategorized"} />
          {product.price > 0 && <DetailPill label="Price" value={`$${(product.price || 0).toFixed(0)}`} />}
          {sessionLabel && <DetailPill label="Session" value={sessionLabel} />}
          <DetailPill label="Frequency" value={freqLabel} />
        </div>

        {actives.length > 0 && (
          <div style={{ marginBottom: "var(--space-5)" }}>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 var(--space-2)" }}>Detected actives</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
              {actives.map(a => (
                <span key={a} style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", color: "var(--color-ivory, #faf9f4)", background: "rgba(var(--rgb-ivory), 0.08)", border: "1px solid rgba(var(--rgb-ivory), 0.32)", padding: "var(--space-1) var(--space-3)", borderRadius: "var(--radius-pill)" }}>{a}</span>
              ))}
            </div>
          </div>
        )}

        {ingredients.length > 0 && (
          <div>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 var(--space-2)" }}>Ingredients</p>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: 0, lineHeight: 1.7 }}>{ingredients.join(", ")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Same thin flat divider treatment used elsewhere in the app (dashboard's
// section rule, progress.jsx's between-block rules) — no gradient, no
// shadow, just a 1px ivory-alpha line spanning the container.
const SHELF_LINE = { height: 1, background: "rgba(var(--rgb-ivory), 0.16)" };

// Canonical apothecary ordering (from constants.js's CATEGORIES) rather
// than array/insertion order — purely for the filter pill row, so pills
// list in the same sequence a physical apothecary case would group
// them. Any category present in the data but missing from CATEGORIES
// (legacy/custom value) is appended at the end rather than dropped.
function orderCategoriesPresent(products) {
  const present = new Set(products.map(p => p.category));
  const known = CATEGORIES.filter(c => present.has(c));
  const extra = [...present].filter(c => !CATEGORIES.includes(c));
  return [...known, ...extra];
}

// One flowing shelf for the whole vanity (or the current filter) —
// no per-category grouping, so a pump-bottle cleanser can sit right
// next to a dropper-bottle serum, the way an actual shelf mixes
// formats. Bottles flow left-to-right in a wrapping flex row,
// bottom-aligned (align-items: flex-end) so each bottle's base sits
// right on its row's shelf line regardless of its own height — that's
// what makes the varying pump/dropper/jar heights read as items
// actually resting on a shelf rather than a uniform grid.
//
// A shelf line under EVERY wrapped row (not just the last) isn't
// something CSS flex-wrap can express on its own — the browser decides
// where a row breaks based on available width and each bottle's own
// (non-uniform) width, and that boundary isn't exposed as anything we
// can target with a selector. So this measures it directly: every
// bottle in a row shares the exact same bottom edge (that's what
// align-items: flex-end guarantees), so grouping the DOM bottles by
// that shared bottom position reconstructs the actual rows the browser
// laid out, and a line gets drawn at each one. Re-measures via
// ResizeObserver so it stays correct across viewport/orientation
// changes and whenever the (possibly filtered) product list changes.
function BottleRow({ products, onEdit, onDelete, onToggleRoutine, onSession, user, onAskCygne }) {
  const containerRef = useRef(null);
  const [shelfLineTops, setShelfLineTops] = useState([]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const slots = Array.from(container.querySelectorAll("[data-bottle-slot]"));
      const tops = [];
      let currentBottom = null;
      slots.forEach(el => {
        const bottom = el.offsetTop + el.offsetHeight;
        if (currentBottom === null || Math.abs(bottom - currentBottom) > 2) {
          tops.push(bottom);
          currentBottom = bottom;
        }
      });
      setShelfLineTops(prev => (prev.length === tops.length && prev.every((v, i) => v === tops[i])) ? prev : tops);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, [products]);

  return (
    <div style={{ position: "relative", marginBottom: "var(--space-8)" }}>
      <div ref={containerRef} style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "var(--space-4)", rowGap: "var(--space-6)" }}>
        {products.map(p => (
          <ProductBottle key={p.id} product={p} onEdit={onEdit} onDelete={onDelete} onToggleRoutine={onToggleRoutine} onSession={onSession} user={user} onAskCygne={onAskCygne} />
        ))}
      </div>
      {shelfLineTops.map((top, i) => (
        <div key={i} style={{ ...SHELF_LINE, position: "absolute", left: 0, right: 0, top }} />
      ))}
    </div>
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
  const dot = item.severity === "warning" ? "var(--color-bronze)" : item.severity === "caution" ? "var(--color-bronze)" : item.severity === "ok" ? "var(--color-inky-moss)" : "var(--clay)";
  return (
    <div style={{ display: "flex", gap: "var(--space-3)", padding: "var(--space-3) 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ width: 5, height: 5, borderRadius: "50%", background: dot, flexShrink: 0, marginTop: "var(--space-2)" }} />
      <div style={{ flex: 1 }}>
        <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: item.severity === "ok" ? "var(--clay)" : "var(--parchment)", margin: "0 0 var(--space-1)", lineHeight: 1.6 }}>{item.text}</p>
        {item.meta && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)", marginTop: "var(--space-1)" }}>
            {item.meta.map((m, i) => <span key={i} style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", color: "var(--clay)", background: "var(--surface)", padding: "2px var(--space-2)", borderRadius: "var(--radius-pill)", border: "1px solid var(--border)", letterSpacing: "0.04em" }}>{m}</span>)}
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
        style={{ width: "100%", display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "var(--space-4) 0", background: "none", border: "none", borderTop: "1px solid var(--border)", cursor: "pointer" }}>
        <span style={{ color: "var(--clay)", opacity: 0.55 }}><Icon name={insight.icon} size={13} /></span>
        <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)", flex: 1, textAlign: "left" }}>{insight.section}</span>
        <span style={{ color: "var(--clay)", opacity: 0.35, display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
          <Icon name="chevron" size={12} />
        </span>
      </button>
      {open && (
        <div style={{ paddingBottom: "var(--space-2)" }}>
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
      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: confirming ? "var(--color-bronze)" : "var(--clay)", opacity: confirming ? 1 : 0.35, background: "none", border: "none", cursor: "pointer", paddingTop: "var(--space-2)", transition: "all 0.2s" }}>
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
  const cats = ["All", ...orderCategoriesPresent(products)];
  const filtered = filter === "All" ? products : products.filter(p => p.category === filter);
  const insights = buildInsights(products, activeMap);
  const handleAskCygne = (q, ctx) => setAskState({ question: q, context: ctx });

  return (
    <div>
      {/* -- Header ----------------------------------------------------------- */}
      <div style={{ marginBottom: "var(--space-6)", paddingTop: "calc(var(--space-1) * 11)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)", fontWeight: 500, letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--color-ivory)", margin: "0 0 var(--space-1)", lineHeight: 1.15 }}>Your Vanity</h1>
          {false && <ClearAllButton onClearAll={onClearAll} />}  {/* hidden — dev only */}
        </div>
        <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: 0 }}>
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
          marginBottom: "var(--space-6)",
          border: "1px solid rgba(var(--rgb-ivory), 0.32)",
          borderRadius: "var(--radius-pill)", overflow: "hidden",
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
                padding: "var(--space-2) var(--space-5)",
                background: active ? "rgba(var(--rgb-ivory), 0.16)" : "transparent",
                border: "none",
                borderLeft: i === 0 ? "none" : "1px solid rgba(var(--rgb-ivory), 0.32)",
                cursor: active ? "default" : "pointer",
                fontFamily: "var(--font-display)",
                fontSize: "var(--text-xs)", fontWeight: 400,
                letterSpacing: "var(--tracking-display)", textTransform: "uppercase",
                color: active ? "var(--color-ivory, #faf9f4)" : "rgba(var(--rgb-ivory), 0.56)",
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
            <div style={{ textAlign: "center", padding: "calc(var(--space-1) * 15) 0 var(--space-10)" }}>
              <p style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)", fontWeight: 400, letterSpacing: "var(--tracking-label)", color: "var(--clay)", margin: "0 0 var(--space-2)" }}>Your vanity is empty.</p>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", opacity: 0.6, margin: "0 0 calc(var(--space-1) * 7)", lineHeight: 1.6 }}>Scan a product to add it, or add one manually.</p>
              <button onClick={onAdd}
                style={{ padding: "var(--space-3) calc(var(--space-1) * 7)", background: "rgba(var(--rgb-ivory), 0.08)", border: "1px solid rgba(var(--rgb-moss), 0.32)", borderRadius: "var(--radius)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 400, letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--sage)", cursor: "pointer" }}>
                + Add Product
              </button>
            </div>
          ) : (
            <>
              {/* Category filter — fully-rounded pills matching the
                  Travel Edit / Shop Scan treatment on the home page
                  (borderRadius 999, thin ivory-alpha outline, low-opacity
                  ivory fill only when active). */}
              <div style={{ display: "flex", gap: "var(--space-2)", overflowX: "auto", paddingBottom: "var(--space-3)", marginBottom: "var(--space-5)", scrollbarWidth: "none" }}>
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
                        padding: "var(--space-2) var(--space-4)",
                        borderRadius: "var(--radius-pill)",
                        border: `1px solid ${active ? "rgba(var(--rgb-ivory), 0.56)" : "rgba(var(--rgb-ivory), 0.32)"}`,
                        background: active ? "rgba(var(--rgb-ivory), 0.16)" : "transparent",
                        color: active ? "var(--color-ivory, #faf9f4)" : "rgba(var(--rgb-ivory), 0.56)",
                        fontFamily: "var(--font-display)",
                        fontSize: "var(--text-xs)", fontWeight: 400,
                        letterSpacing: "var(--tracking-display)", textTransform: "uppercase",
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

              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", marginBottom: "var(--space-5)", opacity: 0.6 }}>
                {filtered.length} of {products.length} product{products.length !== 1 ? "s" : ""}
              </p>

              {/* One flowing shelf — no per-category grouping, so shapes
                  mix together; filtering just narrows which products
                  populate this same single row. */}
              <BottleRow
                products={filtered}
                onEdit={onEdit}
                onDelete={onDelete}
                onToggleRoutine={onToggleRoutine}
                onSession={onSession}
                user={user}
                onAskCygne={handleAskCygne}
              />

              {/* Standalone add affordance, scaled to match the jar
                  silhouette (the most neutral of the three bottle
                  shapes) rather than the old rectangular tile — a
                  dashed outline of the same shape family instead of a
                  shape belonging to any one category. */}
              <div style={{ display: "flex" }}>
                <button onClick={onAdd} style={{
                  width: BOTTLE_SHAPE_SPEC.jar.bodyW, height: BOTTLE_SHAPE_SPEC.jar.bodyH,
                  background: "rgba(var(--rgb-ivory), 0.08)", border: "1px dashed rgba(var(--rgb-ivory), 0.32)", borderRadius: BOTTLE_SHAPE_SPEC.jar.bodyRadius,
                  cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "var(--space-1)",
                  WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
                }}>
                  <span style={{ fontSize: "var(--text-md)", color: "var(--color-ivory, #faf9f4)", opacity: 0.6, lineHeight: 1 }}>+</span>
                  <span style={{ fontFamily: "var(--font-display, 'Fungis', sans-serif)", fontSize: 6.5, letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--color-ivory, #faf9f4)", opacity: 0.6 }}>Add</span>
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
            <div style={{ textAlign: "center", padding: "var(--space-10) 0" }}>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", letterSpacing: "0.06em" }}>Add products to see vanity insights.</p>
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-2)", marginBottom: "calc(var(--space-1) * 7)" }}>
                {[
                  { label: "Products", value: products.length },
                  { label: "Categories", value: new Set(products.map(p => p.category)).size },
                  { label: "Value", value: `$${(spending.total || 0).toFixed(0)}` },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: "var(--color-ivory-shadow)", border: "none", borderRadius: "var(--radius)", padding: "var(--space-4) var(--space-4)", textAlign: "center" }}>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-lg)", fontWeight: 200, color: "var(--parchment)", margin: "0 0 var(--space-1)", letterSpacing: "-0.02em" }}>{value}</p>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--clay)", margin: 0 }}>{label}</p>
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
        <div style={{ marginTop: "var(--space-8)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)", margin: 0 }}>Waiting Room</p>
            <span style={{ padding: "1px var(--space-2)", borderRadius: "var(--radius-pill)", background: "rgba(var(--rgb-ivory), 0.08)", border: "1px solid rgba(var(--rgb-moss), 0.16)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--sage)" }}>{waitingRoom.length}</span>
          </div>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: "0 0 var(--space-4)", lineHeight: 1.6, opacity: 0.7 }}>Products Cygne suggested holding for now. You'll get a nudge when the timing shifts.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {waitingRoom.map((item, idx) => {
              const tagCfg = DEFER_TAG_CONFIG[item.deferTag] || DEFER_TAG_CONFIG.overlap;
              const assessment = assessRoutineFit(item.product, products, checkIns, user);
              const nowReady = assessment.verdict === "add";
              return (
                <div key={idx} style={{ background: "var(--surface)", border: `1px solid ${nowReady ? "rgba(var(--rgb-moss), 0.32)" : "var(--border)"}`, borderRadius: "var(--radius)", padding: "var(--space-4)", transition: "border-color 0.3s" }}>
                  {nowReady && (
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--color-inky-moss)" }} />
                      <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--color-ivory, #faf9f4)" }}>Ready to introduce</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--space-2)" }}>
                    <div>
                      <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", fontWeight: 400, color: "var(--parchment)", margin: "0 0 2px" }}>{item.product.name}</p>
                      <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: 0 }}>{item.product.brand} · {item.product.category}</p>
                    </div>
                    <span style={{ padding: "2px var(--space-2)", borderRadius: "var(--radius-pill)", background: tagCfg.bg, border: `1px solid ${tagCfg.border}`, fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: tagCfg.color, flexShrink: 0, marginLeft: "var(--space-3)" }}>
                      {tagCfg.label}
                    </span>
                  </div>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--clay)", margin: "0 0 var(--space-4)", lineHeight: 1.6, opacity: 0.8 }}>{item.reason}</p>
                  <div style={{ display: "flex", gap: "var(--space-2)" }}>
                    <button onClick={() => onAddFromWaiting(item)}
                      style={{ flex: 1, padding: "var(--space-2) 0", background: nowReady ? "var(--color-inky-moss)" : "rgba(var(--rgb-ivory), 0.08)", color: nowReady ? "var(--color-ivory)" : "var(--sage)", border: `1px solid ${nowReady ? "var(--color-inky-moss)" : "rgba(var(--rgb-moss), 0.32)"}`, borderRadius: "var(--radius)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 400, letterSpacing: "var(--tracking-label)", textTransform: "uppercase", cursor: "pointer", transition: "all 0.2s" }}>
                      Add to Ritual
                    </button>
                    <button onClick={() => onDismissWaiting(item)}
                      style={{ padding: "var(--space-2) var(--space-4)", background: "transparent", color: "var(--clay)", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", cursor: "pointer", letterSpacing: "var(--tracking-label)", textTransform: "uppercase" }}>
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