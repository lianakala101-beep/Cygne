import { useState, useRef, useEffect } from "react";
import { Icon, Section } from "./components.jsx";
import { detectActives, analyzeShelf, buildRoutine, isDampSkinProduct, hasSPFCoverage } from "./engine.js";
import { FREQUENCIES } from "./constants.js";
import { getLockedSession, getAutoSession } from "./productmodal.jsx";
import { getCyclePhase } from "./lib/cycle.js";
import { getCurrentCycleDay, isCycleStale, CYCLE_STALE_MESSAGE } from "./utils.jsx";
import { shareCycleCard } from "./lib/cycleShare.js";
import { glassCard } from "./lib/ui.js";

function SessionPicker({ productId, product, initial, onSession }) {
  const locked = product ? getLockedSession(product) : null;
  const auto = product ? getAutoSession(product) : { session: "both" };
  const resolved = (initial && initial !== "auto") ? initial : auto.session;
  const [selected, setSelected] = useState(resolved);

  if (locked) {
    const isAM = locked.session === "am";
    return (
      <div onClick={e => e.stopPropagation()} style={{ marginTop: "var(--space-3)" }}>
        <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 var(--space-2)", opacity: 0.6 }}>Session</p>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span style={{ padding: "var(--space-1) var(--space-3)", borderRadius: "var(--radius-pill)", background: isAM ? "rgba(var(--rgb-sage), 0.16)" : "rgba(var(--rgb-ivory), 0.08)", border: "1px solid " + (isAM ? "rgba(var(--rgb-sage), 0.32)" : "rgba(var(--rgb-ivory), 0.32)"), fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", fontWeight: 400, color: isAM ? "var(--sage)" : "#e8e2d9" }}>{isAM ? "AM only" : "PM only"}</span>
          <span style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", color: "var(--clay)", opacity: 0.5 }}>locked by ingredients</span>
        </div>
        <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", color: "var(--clay)", margin: "var(--space-2) 0 0", lineHeight: 1.5, opacity: 0.6 }}>{locked.reason}</p>
      </div>
    );
  }

  const options = [{ id: "am", label: "AM only" }, { id: "pm", label: "PM only" }, { id: "both", label: "AM + PM" }];
  return (
    <div onClick={e => e.stopPropagation()} style={{ marginTop: "var(--space-3)" }}>
      <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 var(--space-2)", opacity: 0.6 }}>Session</p>
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        {options.map(s => {
          const active = selected === s.id;
          return (
            <button key={s.id} onClick={e => { e.stopPropagation(); setSelected(s.id); if (onSession) onSession(productId, s.id); }}
              style={{ flex: 1, padding: "var(--space-2) 0", borderRadius: "var(--radius)", border: "1px solid " + (active ? "rgba(var(--rgb-sage), 0.56)" : "var(--border)"), background: active ? "rgba(var(--rgb-sage), 0.16)" : "transparent", color: active ? "var(--parchment)" : "var(--clay)", fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", fontWeight: 400, cursor: "pointer" }}>
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProductCard({ product, onEdit, onDelete, onToggleRoutine, onSession, user = {} }) {
  const activeKeys = Object.keys(detectActives(product.ingredients || []));
  const inRoutine = product.inRoutine !== false; // default true
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuOpen]);
  const ingredientList = (product.ingredients || []).map(i => i.toLowerCase());
  // Merge allergen-style avoidance lists from three sources:
  //   1. user.ingredientProfile.allergens — explicit allergen list
  //   2. skinProfile.ingredientsToAvoid   — free-text from onboarding
  //   3. skinProfile.fragrance            — auto-add fragrance keywords
  //                                         when the user opted to avoid it
  const explicitAllergens = user?.ingredientProfile?.allergens || [];
  const avoidText = user?.skinProfile?.ingredientsToAvoid || "";
  const avoidList = avoidText.split(/[,\n;]+/).map(s => s.trim()).filter(Boolean);
  const fragrancePref = (user?.skinProfile?.fragrance || "").toLowerCase();
  const fragranceTerms = (fragrancePref.startsWith("yes") || fragrancePref.startsWith("sometimes"))
    ? ["fragrance", "parfum", "perfume", "essential oil"]
    : [];
  const allAvoidance = [...explicitAllergens, ...avoidList, ...fragranceTerms];
  const allergenHits = allAvoidance.filter(a =>
    ingredientList.some(i => i.includes(a.toLowerCase()))
  );
  const lovedHits = (user?.ingredientProfile?.loved || []).filter(l =>
    ingredientList.some(i => i.includes(l.toLowerCase()))
  );

  // Shelf life status
  const shelfStatus = (() => {
    const now = Date.now();
    // Check hard expiry date first
    if (product.expiryDate) {
      const exp = new Date(product.expiryDate);
      const days = Math.ceil((exp - now) / 86400000);
      if (days <= 0) return { label: `Expired ${Math.abs(days)}d ago`, color: "var(--color-bronze)", bg: "rgba(var(--rgb-bronze), 0.08)", border: "rgba(var(--rgb-bronze), 0.32)" };
      if (days <= 30) return { label: `Expires in ${days}d`, color: "var(--color-bronze)", bg: "rgba(var(--rgb-bronze), 0.08)", border: "rgba(var(--rgb-bronze), 0.32)" };
    }
    // Check PAO + opened date
    if (product.paoMonths && product.openedDate) {
      const opened = new Date(product.openedDate);
      const paoExp = new Date(opened);
      paoExp.setMonth(paoExp.getMonth() + product.paoMonths);
      const days = Math.ceil((paoExp - now) / 86400000);
      if (days <= 0) return { label: `PAO expired ${Math.abs(days)}d ago`, color: "var(--color-bronze)", bg: "rgba(var(--rgb-bronze), 0.08)", border: "rgba(var(--rgb-bronze), 0.32)" };
      if (days <= 30) return { label: `PAO: ${days}d left`, color: "var(--color-bronze)", bg: "rgba(var(--rgb-bronze), 0.08)", border: "rgba(var(--rgb-bronze), 0.32)" };
    }
    return null;
  })();

  return (
    <div style={{ ...glassCard, padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>

      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body), sans-serif", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--sage)", marginBottom: "var(--space-2)" }}>{product.category}</div>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-sm)", fontWeight: 700, letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--parchment)", margin: "0 0 2px", lineHeight: 1.2 }}>{product.name}</h3>
          <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", color: "var(--clay)", margin: 0, letterSpacing: "0.04em" }}>{product.brand}</p>
        </div>
        <div ref={menuRef} style={{ position: "relative", flexShrink: 0, marginLeft: "var(--space-2)" }}>
          <button onClick={() => setMenuOpen(o => !o)} style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", padding: "var(--space-2) var(--space-2)", opacity: 0.6, transition: "opacity 0.15s", fontSize: "var(--text-md)", lineHeight: 1, fontFamily: "sans-serif" }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.6} aria-label="Product options">⋯</button>
          {menuOpen && (
            <div style={{ position: "absolute", right: 0, top: "100%", zIndex: 50, minWidth: 180, background: "var(--ink)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "var(--space-2) 0", boxShadow: "0 8px 28px rgba(var(--rgb-ink), 0.56)" }}>
              <button onClick={() => { setMenuOpen(false); onEdit(product); }} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", width: "100%", padding: "var(--space-3) var(--space-4)", background: "none", border: "none", cursor: "pointer", color: "var(--parchment)", fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", textAlign: "left", transition: "background 0.12s" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(var(--rgb-sage), 0.08)"} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                <Icon name="edit" size={12} /><span>Edit product</span>
              </button>
              <div style={{ height: 1, background: "var(--border)", margin: "var(--space-1) var(--space-3)" }} />
              <button onClick={() => { setMenuOpen(false); setConfirmDelete(true); }} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", width: "100%", padding: "var(--space-3) var(--space-4)", background: "none", border: "none", cursor: "pointer", color: "var(--color-bronze)", fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", textAlign: "left", transition: "background 0.12s" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(var(--rgb-bronze), 0.08)"} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                <Icon name="trash" size={12} /><span>Remove from vanity</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Price + shelf life row */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
        {product.price > 0 && (
          <span style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-lg)", color: "var(--parchment)", fontWeight: 300, letterSpacing: "-0.01em" }}>${(product.price || 0).toFixed(2)}</span>
        )}
        {shelfStatus && (
          <span style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body), sans-serif", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", fontWeight: 400, color: shelfStatus.color, background: shelfStatus.bg, border: `1px solid ${shelfStatus.border}`, padding: "var(--space-1) var(--space-2)", borderRadius: "var(--radius-pill)" }}>
            {shelfStatus.label}
          </span>
        )}
      </div>
      {/* Active tags */}
      {activeKeys.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
          {activeKeys.map(a => <span key={a} style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body), sans-serif", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--clay)", background: "var(--ink)", padding: "var(--space-1) var(--space-2)", borderRadius: "var(--radius-pill)", border: "1px solid var(--border)" }}>{a}</span>)}
        </div>
      )}

      {/* Allergen / loved badges */}
      {(allergenHits.length > 0 || lovedHits.length > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)", marginTop: activeKeys.length > 0 ? "var(--space-1)" : 0 }}>
          {allergenHits.map(a => (
            <span key={a} style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--text-xs)", fontFamily: "var(--font-body), sans-serif", letterSpacing: "var(--tracking-label)", color: "var(--color-bronze)", background: "rgba(var(--rgb-bronze), 0.08)", padding: "var(--space-1) var(--space-2)", borderRadius: "var(--radius-pill)", border: "1px solid rgba(var(--rgb-bronze), 0.16)" }}><Icon name="warning" size={9} /> {a}</span>
          ))}
          {lovedHits.map(l => (
            <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--text-xs)", fontFamily: "var(--font-body), sans-serif", letterSpacing: "var(--tracking-label)", color: "var(--color-sage)", background: "rgba(var(--rgb-sage), 0.08)", padding: "var(--space-1) var(--space-2)", borderRadius: "var(--radius-pill)", border: "1px solid rgba(var(--rgb-sage), 0.16)" }}><Icon name="sparkle" size={9} /> {l}</span>
          ))}
        </div>
      )}

      {/* In-ritual toggle */}
      <button onClick={() => onToggleRoutine(product.id)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--space-2) var(--space-4)", background: inRoutine ? "rgba(var(--rgb-sage), 0.08)" : "var(--ink)", border: `1px solid ${inRoutine ? "rgba(var(--rgb-sage), 0.32)" : "var(--border)"}`, borderRadius: "var(--radius)", cursor: "pointer", transition: "all 0.18s" }}
        onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(var(--rgb-sage), 0.56)"}
        onMouseLeave={e => e.currentTarget.style.borderColor = inRoutine ? "rgba(var(--rgb-sage), 0.32)" : "var(--border)"}>
        <span style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: inRoutine ? "var(--sage)" : "var(--clay)", fontWeight: 400 }}>
          {inRoutine ? "In ritual" : "Not in ritual"}
        </span>
        <div style={{ width: 28, height: 16, borderRadius: "var(--radius-pill)", background: inRoutine ? "var(--sage)" : "var(--border)", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
          <div style={{ position: "absolute", top: 2, left: inRoutine ? 14 : 2, width: 12, height: 12, borderRadius: "50%", background: inRoutine ? "#0d0f0d" : "var(--clay)", transition: "left 0.2s" }} />
        </div>
      </button>

      {/* Session picker — only when in routine */}
      {inRoutine && (
        <SessionPicker productId={product.id} product={product} initial={product.session} onSession={onSession} />
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(var(--rgb-ink), 0.82)", backdropFilter: "blur(8px)", padding: "0 calc(var(--space-1) * 7)" }} onClick={() => setConfirmDelete(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 320, background: "var(--ink)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "calc(var(--space-1) * 7) var(--space-6) var(--space-6)", boxShadow: "0 16px 48px rgba(var(--rgb-ink), 0.56)" }}>
            <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 var(--space-3)" }}>Confirm</p>
            <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-sm)", color: "var(--parchment)", margin: "0 0 var(--space-6)", lineHeight: 1.65 }}>
              Remove <strong>{product.name}</strong> from your vanity? This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: "var(--space-3)" }}>
              <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: "var(--space-3) 0", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "transparent", color: "var(--parchment)", fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", fontWeight: 400, cursor: "pointer", transition: "background 0.15s" }} onMouseEnter={e => e.currentTarget.style.background = "var(--surface)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>Cancel</button>
              <button onClick={() => { setConfirmDelete(false); onDelete(product.id); }} style={{ flex: 1, padding: "var(--space-3) 0", borderRadius: "var(--radius)", border: "1px solid rgba(var(--rgb-bronze), 0.32)", background: "rgba(var(--rgb-bronze), 0.08)", color: "var(--color-bronze)", fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", fontWeight: 400, cursor: "pointer", transition: "background 0.15s" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(var(--rgb-bronze), 0.16)"} onMouseLeave={e => e.currentTarget.style.background = "rgba(var(--rgb-bronze), 0.08)"}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- RITUAL STEP -------------------------------------------------------------
const STEP_REASONS = {
  Cleanser:      "Always first. Removes makeup, SPF, and buildup so everything after can actually absorb.",
  Toner:         "Applied to freshly cleansed skin before serums. Balances pH and preps absorption.",
  Essence:       "A hydrating layer applied before serums. Helps the skin drink up what comes next.",
  Serum:         "Applied thinnest to thickest, before moisturiser. The active layer where most of the work happens.",
  "Eye Cream":   "Applied before moisturiser — its formula is thinner and formulated for the delicate eye area.",
  Moisturizer:   "Seals in everything beneath it. Always after actives and serums, before SPF.",
  Oil:           "Oils sit on top of water-based layers. Final step before bed, or before SPF in AM.",
  SPF:           "Always the last step in the morning. Nothing goes on top — SPF needs to sit on the skin to work.",
  Mask:          "Used after cleansing on clean, bare skin so active ingredients can penetrate without interference.",
  Exfoliant:     "Applied after cleansing on dry skin. Used periodically — not daily — to resurface without stripping.",
  "Toning Pad":  "An exfoliating step applied after cleansing. Used less frequently while your skin builds tolerance.",
  Mist:          "A hydrating layer that can be used before serums or over makeup to refresh.",
  Balm:          "A rich occlusive layer applied last to seal everything in overnight.",
  Treatment:     "Targeted treatment applied after cleansing, before moisturiser, so actives reach the skin directly.",
  Prescription:  "Applied after cleansing, before moisturiser. PM only — prescription actives like tretinoin are photosensitive and work best overnight.",
};

function getStepReason(step) {
  const actives = Object.keys(detectActives(step.ingredients || []));
  if (actives.includes("retinol"))     return "Applied before moisturiser in PM. Photosensitive — breaks down in sunlight, so PM only.";
  if (actives.includes("AHA"))         return "Applied before moisturiser in PM. AHAs increase UV sensitivity — always follow with SPF the next morning.";
  if (actives.includes("BHA"))         return "Applied before moisturiser. BHAs exfoliate inside the pore — PM use lets skin recover overnight.";
  if (actives.includes("vitamin C"))   return "Applied to clean skin before moisturiser in AM. Pairs with SPF to neutralise free radicals throughout the day.";
  if (actives.includes("niacinamide")) return "Applied before moisturiser. Works well at any step — placed here to layer efficiently with other actives.";
  if (actives.includes("peptides"))    return "Applied before moisturiser in PM. Peptides support overnight repair and work best without UV interference.";
  return STEP_REASONS[step.category] || null;
}

function DrawnCheck({ size = 14, color = "#0d0f0d" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "block" }}>
      <path
        d="M5 12.5 L10.2 17.5 L19 7.2"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 24,
          strokeDashoffset: 24,
          animation: "cygneCheckDraw 300ms ease-out forwards",
        }}
      />
    </svg>
  );
}

// Verb names for ritual steps. Falls back to upper-cased category for any
// new categories added later.
const STEP_VERBS = {
  "Cleanser":        "CLEANSE",
  "Toner":           "TONE",
  "Toning Pad":      "TONE",
  "Essence":         "ESSENCE",
  "Mist":            "MIST",
  "Serum":           "TREAT",
  "Eye Cream":       "EYE",
  "Moisturizer":     "MOISTURIZE",
  "Oil":             "SEAL",
  "SPF":             "SPF",
  "SPF Moisturizer": "SPF MOISTURIZER",
  "Exfoliant":       "EXFOLIATE",
  "Mask":            "MASK",
  "Prescription":    "PRESCRIBED",
  "Lip":             "LIP",
};

function RoutineStep({ step, index, isLast, checked, onCheck, scheduled = true }) {
  const [expanded, setExpanded] = useState(false);
  const reason = getStepReason(step);
  // Damp-skin tip only applies to leave-on humectant layers, not cleansers.
  const dampEligible = step.category === "Serum" || step.category === "Essence";
  const damp = dampEligible && isDampSkinProduct(step);
  const stepNum = index + 1;
  const verb = STEP_VERBS[step.category] || (step.category || "").toUpperCase();
  const sessionTag = step.session === "am" ? "AM"
    : step.session === "pm" ? "PM"
    : step.session === "both" ? "AM + PM"
    : null;
  const freqLabel = step.frequency && step.frequency !== "daily"
    ? (FREQUENCIES.find(f => f.id === step.frequency)?.label || step.frequency)
    : null;

  const dimmed = checked || !scheduled;

  return (
    <div
      onClick={onCheck}
      style={{
        padding: "var(--space-5) 0",
        borderBottom: isLast ? "none" : "1px solid var(--border)",
        cursor: "pointer",
        opacity: checked ? 0.42 : scheduled ? 1 : 0.55,
        transition: "opacity 320ms ease-out",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {/* Number circle — plain numeral in a thin outlined circle, ivory
          glyph on the dark ritual canvas. Replaces the previous
          "( 01 )" bracketed pill so the number itself becomes the
          anchor of the row without a typed ornament around it. Fixed
          28px circle with no letter-spacing so two-digit step numbers
          (10+) still center cleanly. */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", margin: "0 0 var(--space-2)" }}>
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 28, height: 28, flexShrink: 0,
          border: "1px solid rgba(var(--rgb-ivory), 0.32)",
          borderRadius: "50%",
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-xs)", fontWeight: 700,
          color: "var(--color-ivory, #faf9f4)",
          whiteSpace: "nowrap", lineHeight: 1,
        }}>{stepNum}</span>
        {!scheduled && (
          <span style={{
            fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 400,
            letterSpacing: "var(--tracking-display)", textTransform: "uppercase",
            color: "var(--clay)", opacity: 0.75,
          }}>Skipped today</span>
        )}
      </div>

      <h3 style={{
        fontFamily: "var(--font-display)",
        fontSize: "var(--text-xl)", fontWeight: 700,
        letterSpacing: "0.04em", textTransform: "uppercase",
        color: "var(--color-ivory, #faf9f4)",
        lineHeight: 1.05,
        margin: "0 0 var(--space-2)",
        textDecoration: checked ? "line-through" : "none",
        textDecorationThickness: "2px",
        textDecorationColor: "rgba(var(--rgb-moss), 0.56)",
        transition: "text-decoration-color 280ms ease",
      }}>
        {verb}
      </h3>

      <p style={{
        fontFamily: "var(--font-body)",
        fontSize: "var(--text-sm)", fontWeight: 400,
        color: "var(--parchment)",
        margin: "0 0 2px",
        lineHeight: 1.35,
      }}>
        {step.name}
      </p>
      <p style={{
        fontFamily: "var(--font-body)",
        fontSize: "var(--text-xs)", fontWeight: 400,
        color: "rgba(var(--rgb-ivory), 0.56)",
        margin: 0,
        lineHeight: 1.4,
      }}>
        {step.brand}
        {sessionTag && (
          <span style={{ marginLeft: "var(--space-3)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase" }}>
            {sessionTag}
          </span>
        )}
        {freqLabel && (
          <span style={{ marginLeft: "var(--space-3)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase" }}>
            {freqLabel}
          </span>
        )}
      </p>

      {damp && (
        <p style={{
          fontFamily: "var(--font-body)",
          fontSize: "var(--text-xs)",
          color: "rgba(var(--rgb-bronze), 0.82)",
          margin: "var(--space-2) 0 0",
        }}>
          Apply on damp skin for best absorption
        </p>
      )}

      {reason && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(x => !x); }}
          style={{
            marginTop: "var(--space-3)",
            background: "none", border: "none", padding: 0,
            cursor: "pointer",
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-xs)", fontWeight: 400,
            letterSpacing: "var(--tracking-display)", textTransform: "uppercase",
            color: "var(--color-ivory, #faf9f4)",
            display: "inline-flex", alignItems: "center", gap: "var(--space-1)",
          }}
        >
          {expanded ? "HIDE" : "WHY?"}
        </button>
      )}

      {expanded && reason && (
        <p style={{
          fontFamily: "var(--font-body)",
          fontSize: "var(--text-xs)", fontWeight: 400,
          color: "var(--clay)",
          margin: "var(--space-3) 0 0",
          lineHeight: 1.7,
        }}>
          {reason}
        </p>
      )}
    </div>
  );
}
function getDayIndex() {
  const now = new Date();
  return Math.floor(now.getTime() / 86400000);
}

const NO_DATA_LINE = "Log your first check-in — Swan Sense activates once Cygne knows your skin.";

// Split the SwanSense insight into lines (prefers explicit line breaks,
// falls back to sentence boundaries) and stagger a fadeInLine animation
// across each segment.
function renderInsightLines(text) {
  const raw = String(text || "");
  const byBreak = raw.split(/\n+/).map(s => s.trim()).filter(Boolean);
  const segments = byBreak.length > 1
    ? byBreak
    : raw.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  return segments.map((seg, i) => (
    <span key={i} style={{
      display: "block",
      opacity: 0,
      animation: "fadeInLine 0.8s ease-in forwards",
      animationDelay: `${i * 0.5}s`,
    }}>{seg}</span>
  ));
}

// Stable per-day generic editorial lines used when the LLM daily call fails.
// Pick by local day-of-year so the same user sees the same line all day even
// across reloads.
const GENERIC_FALLBACK_LINES = [
  "Consistency, not intensity, builds skin.",
  "Today's ritual is tomorrow's resilience.",
  "Quiet care compounds.",
  "Your skin is reading every choice you make.",
  "The barrier remembers what you do today.",
  "Less, done well, beats more, done sometimes.",
  "Hydration is the floor every active stands on.",
];
function genericFallbackLine() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const doy = Math.floor((now - start) / 86400000);
  return GENERIC_FALLBACK_LINES[doy % GENERIC_FALLBACK_LINES.length];
}

function SwanSongCard({ currentSession, asPopup = false, onDismissPopup, user = {}, predictions = [], dailyLine = null, dailyLoading = false, dailyFailed = false, variant = "default", hasProducts = true, noProductsLine = null }) {
  const now = new Date();
  // Local guard against double-taps on the ivory-flat share icon
  // while the canvas render + native share sheet are in flight. Only
  // used inside the ivory-flat branch; harmless in the other
  // variants since the button never renders there.
  const [sharingCycle, setSharingCycle] = useState(false);
  const isBirthday = user.birthMonth && user.birthDay &&
    (now.getMonth() + 1) === parseInt(user.birthMonth) &&
    now.getDate() === parseInt(user.birthDay);

  // Plain and concrete, matching Swan Sense's tightened daily-line voice —
  // no vague sensory descriptors like "radiant" standing in for a fact.
  const BIRTHDAY_LINES = [
    "Another year of taking care of yourself.",
    "Another year around the sun. Your ritual continues.",
    "Happy birthday. One more year of consistent care.",
  ];

  // Separate meaningful predictions from baseline fallbacks
  const meaningfulPredictions = predictions.filter(p => {
    const key = p.id || p.type;
    return key && !key.startsWith("baseline_");
  });
  const hasMeaningful = meaningfulPredictions.length > 0;
  const trimmedDaily = dailyLine && dailyLine.trim();

  // Line precedence:
  //   birthday → birthday line
  //   LLM line landed → LLM line
  //   loading + no LLM line yet → em dash (subtle placeholder, no spinner)
  //   LLM call failed and no rule-based prediction → no-products line (zero
  //     products) or generic editorial line
  //   else → rule-based prediction, the no-products line, or "no data yet"
  // The LLM line takes priority over the rule-based prediction once it lands;
  // we keep the rule engine running underneath so popup detail still renders.
  // noProductsLine only ever applies once every higher-precedence source
  // (LLM line, meaningful rule-based prediction) has nothing to say — it's
  // the cycle/season floor for a zero-product user, not a replacement for
  // a real prediction.
  const line = isBirthday
    ? BIRTHDAY_LINES[now.getFullYear() % BIRTHDAY_LINES.length]
    : trimmedDaily
      ? trimmedDaily
      : dailyLoading
        ? "—"
        : dailyFailed && !hasMeaningful
          ? (!hasProducts && noProductsLine) || genericFallbackLine()
          : hasMeaningful
            ? meaningfulPredictions[0].headline
            : (!hasProducts && noProductsLine) || NO_DATA_LINE;

  const grain ="url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.045'/%3E%3C/svg%3E\")";

  // -- POPUP version ---------------------------------------------------------
  if (asPopup) {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(var(--rgb-ink), 0.82)", backdropFilter: "blur(10px)",
        padding: "0 calc(var(--space-1) * 7)",
        animation: "fadeUp 0.38s ease",
      }}>
        <div style={{
          position: "relative", width: "100%", maxWidth: 340,
          background: "linear-gradient(158deg, #3d3a28 0%, #2a2619 45%, #1e1a14 100%)",
          borderRadius: "var(--radius)",
          padding: "calc(var(--space-1) * 7) calc(var(--space-1) * 7) var(--space-6)",
          overflow: "hidden",
          isolation: "isolate",
          boxShadow: "0 24px 60px rgba(var(--rgb-ink), 0.82), 0 1px 0 rgba(var(--rgb-ivory), 0.08) inset",
          border: "1px solid rgba(var(--rgb-bronze), 0.16)",
        }}>
          <img
            src="/cygne-logo.png"
            alt=""
            aria-hidden="true"
            style={{
              position: "absolute", bottom: 14, right: 18,
              height: 120, width: "auto",
              opacity: 0.08,
              pointerEvents: "none", userSelect: "none",
            }}
          />
          <div style={{ position: "absolute", inset: 0, borderRadius: "var(--radius)", pointerEvents: "none", backgroundImage: grain, backgroundSize: "180px 180px", opacity: 0.7 }} />
          <div style={{ position: "absolute", inset: 0, borderRadius: "var(--radius)", pointerEvents: "none", background: "radial-gradient(ellipse at 85% 15%, rgba(var(--rgb-bronze), 0.08) 0%, transparent 65%)" }} />

          <div style={{ textAlign: "center", marginBottom: "var(--space-5)" }}>
            <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "rgba(var(--rgb-ivory), 0.56)", margin: 0 }}>
              Swan Song
            </p>
          </div>
          <div style={{ height: 1, background: "rgba(var(--rgb-ivory), 0.08)", marginBottom: "var(--space-5)" }} />

          <p style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)", fontWeight: 700, lineHeight: 1.35, color: "#e8e3d6", letterSpacing: "0.04em", textTransform: "uppercase", margin: "0 0 var(--space-5)" }}>{renderInsightLines(line)}</p>

          {/* Show first prediction detail in popup */}
          {hasMeaningful && meaningfulPredictions[0].detail && (
            <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", color: "rgba(var(--rgb-ivory), 0.56)", margin: "0 0 var(--space-6)", lineHeight: 1.65 }}>{meaningfulPredictions[0].detail}</p>
          )}

          <button onClick={onDismissPopup} style={{
            width: "100%", padding: "var(--space-3) 0",
            background: "rgba(var(--rgb-ivory), 0.08)", border: "1px solid rgba(var(--rgb-ivory), 0.16)",
            borderRadius: "var(--radius)", cursor: "pointer",
            fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)",
            textTransform: "uppercase", color: "rgba(var(--rgb-ivory), 0.56)", transition: "all 0.2s",
          }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(var(--rgb-ivory), 0.16)"; e.currentTarget.style.color = "rgba(var(--rgb-ivory), 0.82)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(var(--rgb-ivory), 0.08)"; e.currentTarget.style.color = "rgba(var(--rgb-ivory), 0.56)"; }}>
            Carry on
          </button>
        </div>
      </div>
    );
  }

  // -- INLINE (settled) version — note-card on home dashboard -----------------
  // ivory-flat variant: fully transparent surface, ivory text only. Used on
  // the dark homepage canvas where the card chrome would clash with the
  // editorial line treatment. Centered text per homepage spec.
  if (variant === "ivory-flat") {
    // Glanceable cycle-phase indicator. Only surfaces when the user
    // opted in to cycle tracking AND the start date resolves — no
    // fallback assumption, matches the pattern used elsewhere for
    // optional cycle data. Format: "FOLLICULAR · DAY 7".
    const cycleDay = user?.cycleTrackingEnabled ? getCurrentCycleDay(user) : null;
    const cyclePhaseName = cycleDay ? getCyclePhase(cycleDay)?.name : null;
    const cyclePhaseLabel = cyclePhaseName && cycleDay
      ? `${String(cyclePhaseName).toUpperCase()} · DAY ${cycleDay}`
      : null;
    // Stale start date (45+ days) — ask for a period log instead.
    const cycleLabel = cyclePhaseLabel || (isCycleStale(user) ? CYCLE_STALE_MESSAGE : null);

    // Loading state: LLM daily line hasn't landed yet AND we're not on
    // one of the fallback paths. A soft breathing dash replaces the
    // bare "—" so the card reads as "something is being prepared"
    // rather than empty. Keep it understated — one em dash, opacity
    // pulsing between 0.35 and 0.75 on a 2.4s cycle via swanBreath
    // (keyframes defined in App.jsx alongside softPulse / fadeInLine).
    const showLoadingDash = dailyLoading && !isBirthday && !trimmedDaily;

    // Share affordance — surfaces only when the same cycle data that
    // powers the label above resolves. If the user hasn't enabled
    // cycle tracking (or no start date exists) the button is omitted
    // entirely rather than falling back to an empty share.
    const shareEnabled = !!cyclePhaseLabel;
    const handleShareCycle = async () => {
      if (!shareEnabled || sharingCycle) return;
      setSharingCycle(true);
      try {
        await shareCycleCard({ phaseName: cyclePhaseName, day: cycleDay });
      } catch (e) {
        console.warn("[Cygne] cycle share failed:", e?.message || e);
      } finally {
        setSharingCycle(false);
      }
    };

    return (
      <div style={{ position: "relative", textAlign: "center" }}>
        {shareEnabled && (
          <button
            type="button"
            onClick={handleShareCycle}
            disabled={sharingCycle}
            aria-label={sharingCycle ? "Preparing cycle card" : "Share your cycle phase"}
            style={{
              position: "absolute", top: -6, right: -4,
              width: 30, height: 30,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              background: "none", border: "none", padding: 0,
              color: "var(--color-ivory, #faf9f4)",
              opacity: sharingCycle ? 0.45 : 0.55,
              cursor: sharingCycle ? "default" : "pointer",
              WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
              transition: "opacity 0.18s",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 16 V4" />
              <path d="M7 9 l5-5 5 5" />
              <path d="M5 13 v6 a2 2 0 0 0 2 2 h10 a2 2 0 0 0 2-2 v-6" />
            </svg>
          </button>
        )}
        <p style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-xs)", fontWeight: 700,
          letterSpacing: "var(--tracking-display)", textTransform: "uppercase",
          color: "var(--color-ivory, #faf9f4)",
          opacity: 0.75,
          margin: 0,
        }}>
          Swan Sense
        </p>
        {cycleLabel && (
          <p style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-xs)", fontWeight: 700,
            letterSpacing: "var(--tracking-display)", textTransform: "uppercase",
            color: "var(--color-ivory, #faf9f4)",
            opacity: 0.55,
            margin: "var(--space-2) 0 0",
          }}>
            {cycleLabel}
          </p>
        )}
        {showLoadingDash ? (
          <p
            aria-hidden="true"
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "var(--text-md)", fontWeight: 400,
              lineHeight: 1.5, letterSpacing: "0.01em",
              color: "var(--color-ivory, #faf9f4)",
              margin: "var(--space-3) 0 0",
              animation: "swanBreath 2.4s ease-in-out infinite",
            }}
          >
            —
          </p>
        ) : (
          <p style={{
            fontFamily: "var(--font-body)",
            fontSize: "var(--text-md)", fontWeight: 400,
            lineHeight: 1.5, letterSpacing: "0.01em",
            color: "var(--color-ivory, #faf9f4)",
            margin: "var(--space-3) 0 0",
          }}>
            {renderInsightLines(line)}
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={{ position: "relative", marginTop: "var(--space-2)" }}>
      <div style={{
        position: "relative",
        background: "var(--color-inky-moss, #2d3d2b)",
        borderRadius: "var(--radius)",
        padding: "var(--space-5) var(--space-6) var(--space-6)",
        overflow: "hidden",
        isolation: "isolate",
        border: "none",
      }}>
        {/* Faint logo watermark — inverted to read as ivory on the dark base. */}
        <img
          src="/cygne-logo.png"
          alt=""
          aria-hidden="true"
          style={{
            position: "absolute", bottom: 10, right: 14,
            height: 48, width: "auto",
            opacity: 0.10,
            filter: "brightness(0) invert(1)",
            pointerEvents: "none", userSelect: "none",
          }}
        />

        <div style={{ position: "relative", marginBottom: "var(--space-3)" }}>
          <p style={{
            fontFamily: "var(--font-body)",
            fontSize: "var(--text-xs)", fontWeight: 400,
            letterSpacing: "var(--tracking-display)", textTransform: "uppercase",
            color: "var(--color-ivory, #faf9f4)",
            margin: 0,
          }}>
            Swan Sense
          </p>
        </div>

        <p style={{
          position: "relative",
          fontFamily: "var(--font-body)",
          fontSize: "var(--text-md)", fontWeight: 400,
          lineHeight: 1.55, letterSpacing: "0.01em",
          color: "var(--color-ivory, #faf9f4)",
          margin: 0,
        }}>
          {renderInsightLines(line)}
        </p>
      </div>
    </div>
  );
}


// --- FLIGHT MODE --------------------------------------------------------------

function buildFlightEdit(products, activeMap) {
  const actives = Object.keys(activeMap);
  const hasRetinol   = !!activeMap["retinol"]?.length;
  const hasAHA       = !!activeMap["AHA"]?.length;
  const hasBHA       = !!activeMap["BHA"]?.length;
  const hasVitC      = !!activeMap["vitamin C"]?.length;
  const hasSPF       = hasSPFCoverage(products, activeMap);
  const hasMoisturizer = products.some(p => p.category === "Moisturizer" || p.category === "SPF Moisturizer");
  const hasCleanser  = products.some(p => p.category === "Cleanser");
  const hasEssence   = products.some(p => p.category === "Essence" || p.category === "Mist");

  const skip = [];
  const keep = [];
  const tips = [];

  // Always skip on flight day
  if (hasRetinol) skip.push({ name: "Retinol", reason: "Barrier is compromised in dry cabin air. Skip tonight and the night you land." });
  if (hasAHA)    skip.push({ name: "AHA Exfoliant", reason: "Sensitizes skin to dehydration. Leave at home for flight day." });
  if (hasBHA)    skip.push({ name: "BHA Exfoliant", reason: "Not needed in-flight. Can increase dryness at altitude." });

  // Always keep
  if (hasMoisturizer) keep.push({ name: "Moisturizer", reason: "Apply before boarding and again mid-flight." });
  if (hasCleanser)    keep.push({ name: "Gentle Cleanser", reason: "A quick cleanse on arrival resets skin after recycled air exposure." });
  if (hasEssence)     keep.push({ name: "Essence or Mist", reason: "Misting mid-flight maintains hydration. 100ml or under for carry-on." });
  if (hasSPF)         keep.push({ name: "SPF", reason: "UV at altitude is 2× stronger. Apply before boarding." });
  if (hasVitC)        keep.push({ name: "Vitamin C", reason: "Antioxidant protection against UV and cabin oxidative stress. AM only." });

  // Flight day tips
  tips.push("Cabin humidity drops to 10–20%. Your skin loses moisture 3× faster than on the ground.");
  if (hasRetinol || hasAHA) tips.push("Skip all actives the night before and the night you land — barrier recovery takes 24–48h.");
  tips.push("Drink water before you feel thirsty. Dehydration shows on skin within 2 hours at altitude.");
  if (products.length > 0) tips.push(`Your flight edit: ${keep.length} product${keep.length !== 1 ? "s" : ""}. Leave the rest.`);

  return { skip, keep, tips };
}

function FlightModeModal({ products, activeMap, onClose }) {
  const { skip, keep, tips } = buildFlightEdit(products, activeMap);
  const [tab, setTab] = useState("edit"); // "edit" | "tips"

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(var(--rgb-ink), 0.82)", backdropFilter: "blur(12px)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      >
      <div style={{ background: "var(--ink)", width: "100%", maxWidth: 520, borderRadius: "var(--radius-sheet)", padding: "calc(var(--space-1) * 7) var(--space-6) calc(var(--space-1) * 13)", maxHeight: "88vh", overflowY: "auto", border: "1px solid var(--border)", borderBottom: "none" }}>

        {/* Header — eyebrow letter-spacing standardized to 0.15em to
            match the section eyebrows below (and the "IN REVIEW"
            treatment elsewhere). Text colors brightened to var(--color-ivory) so
            the header reads crisply on the dark modal canvas. */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--space-2)" }}>
          <div>
            <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--color-ivory)", opacity: 0.7, margin: "0 0 var(--space-1)" }}>Flight Day</p>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-md)", fontWeight: 700, letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--color-ivory)", margin: 0, lineHeight: 1.2 }}>Your Ritual, Anywhere</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", padding: "var(--space-1)" }}><Icon name="x" size={17} /></button>
        </div>

        <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", color: "var(--color-ivory)", opacity: 0.85, margin: "0 0 var(--space-6)", lineHeight: 1.6 }}>
          What to pack, what to skip, and how to land without losing your skin.
        </p>

        {/* Tab toggle — outlined segmented pill matching the
            Morning/Evening toggle on the ritual tab. Two full-width
            pills side by side, active filled at 0.14 ivory alpha /
            inactive transparent, thin 0.28-alpha ivory border wrapping
            the group with a same-alpha divider between them. Same
            outline system as the Travel Edit / Shop Scan pills on the
            dashboard so the three surfaces feel like one system. */}
        <div
          role="group"
          aria-label="Travel edit tab"
          style={{
            display: "flex", alignItems: "stretch",
            border: "1px solid rgba(var(--rgb-ivory), 0.32)",
            borderRadius: "var(--radius-pill)", overflow: "hidden",
            marginBottom: "var(--space-6)",
          }}
        >
          {[{ id: "edit", label: "Your Edit" }, { id: "tips", label: "Flight Tips" }].map((t, i) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={active}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1,
                  padding: "var(--space-2) 0",
                  background: active ? "rgba(var(--rgb-ivory), 0.16)" : "transparent",
                  border: "none",
                  borderLeft: i === 0 ? "none" : "1px solid rgba(var(--rgb-ivory), 0.32)",
                  cursor: active ? "default" : "pointer",
                  fontFamily: "var(--font-display)",
                  fontSize: "var(--text-xs)", fontWeight: 400,
                  letterSpacing: "var(--tracking-display)", textTransform: "uppercase",
                  color: active ? "var(--color-ivory)" : "rgba(var(--rgb-ivory), 0.56)",
                  WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
                  transition: "background 0.18s, color 0.18s",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* YOUR EDIT tab */}
        {tab === "edit" && (
          <div>
            {/* -- Travel size nudge ---------------------------------------- */}
            {(() => {
              const BULKY_CATEGORIES = ["Cleanser", "Moisturizer", "Toner", "Essence", "Mist", "Oil", "Mask"];
              const bulkyInRitual = products.filter(p =>
                p.inRoutine !== false && BULKY_CATEGORIES.includes(p.category)
              );
              if (bulkyInRitual.length === 0) return null;
              const names = bulkyInRitual.map(p => p.category.toLowerCase());
              const unique = [...new Set(names)];
              const listed = unique.length <= 2
                ? unique.join(" and ")
                : unique.slice(0, -1).join(", ") + " and " + unique.slice(-1);
              return (
                <div style={{ display: "flex", gap: "var(--space-3)", padding: "var(--space-3) var(--space-4)", background: "rgba(var(--rgb-bronze), 0.08)", border: "1px solid rgba(var(--rgb-bronze), 0.16)", borderRadius: "var(--radius)", marginBottom: "var(--space-5)" }}>
                  <span style={{ color: "var(--color-bronze)", flexShrink: 0, marginTop: 2, display: "inline-flex" }}><Icon name="plane" size={16} /></span>
                  <div>
                    <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-sm)", fontWeight: 700, letterSpacing: "0.02em", color: "var(--color-ivory)", margin: "0 0 var(--space-1)", lineHeight: 1.35 }}>Check your sizes before packing.</p>
                    <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", color: "var(--color-ivory)", opacity: 0.85, margin: 0, lineHeight: 1.6 }}>
                      Your {listed} {unique.length === 1 ? "is" : "are"} often over 100ml. Decant into travel bottles or pick up minis — carry-on limit is 100ml per liquid.
                    </p>
                  </div>
                </div>
              );
            })()}
            {/* Pack these — accent dot + sage-color eyebrow retained;
                letter-spacing standardized to 0.15em to match the rest
                of the app's small-caps label register. Item title
                weight bumped 400 → 700 and size 13 → 14 so the name
                sits clearly above the reason line. */}
            {keep.length > 0 && (
              <div style={{ marginBottom: "var(--space-5)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--color-sage)" }} />
                  <span style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--color-sage)" }}>Pack These</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                  {keep.map((item, i) => (
                    <div key={i} style={{ padding: "var(--space-3) var(--space-4)", background: "rgba(var(--rgb-sage), 0.08)", border: "1px solid rgba(var(--rgb-sage), 0.16)", borderRadius: "var(--radius)" }}>
                      <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-sm)", fontWeight: 700, letterSpacing: "0.02em", color: "var(--color-ivory)", margin: "0 0 var(--space-1)", lineHeight: 1.3 }}>{item.name}</p>
                      <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", color: "var(--color-ivory)", opacity: 0.75, margin: 0, lineHeight: 1.55 }}>{item.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Leave behind — same treatment as Pack These, amber dot
                + eyebrow retained. */}
            {skip.length > 0 && (
              <div style={{ marginBottom: "var(--space-5)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--color-bronze)" }} />
                  <span style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--color-bronze)" }}>Leave Behind</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                  {skip.map((item, i) => (
                    <div key={i} style={{ padding: "var(--space-3) var(--space-4)", background: "rgba(var(--rgb-bronze), 0.08)", border: "1px solid rgba(var(--rgb-bronze), 0.16)", borderRadius: "var(--radius)" }}>
                      <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-sm)", fontWeight: 700, letterSpacing: "0.02em", color: "var(--color-ivory)", margin: "0 0 var(--space-1)", lineHeight: 1.3 }}>{item.name}</p>
                      <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", color: "var(--color-ivory)", opacity: 0.75, margin: 0, lineHeight: 1.55 }}>{item.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {keep.length === 0 && skip.length === 0 && (
              <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", color: "var(--color-ivory)", opacity: 0.85, textAlign: "center", padding: "var(--space-6) 0" }}>Add products to your vanity to generate your travel edit.</p>
            )}
          </div>
        )}

        {/* FLIGHT TIPS tab */}
        {tab === "tips" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {tips.map((tip, i) => (
              <div key={i} style={{ display: "flex", gap: "var(--space-3)", padding: "var(--space-4) var(--space-4)", ...glassCard }}>
                <span style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-sm)", color: "var(--clay)", flexShrink: 0, marginTop: 1 }}>{i + 1}.</span>
                <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", color: "var(--parchment)", margin: 0, lineHeight: 1.65 }}>{tip}</p>
              </div>
            ))}

            {/* Recovery note — sits on a sage-tinted dark card, so
                body text brightens to var(--color-ivory) like the rest of the
                dark-canvas copy. Eyebrow letter-spacing standardized
                to 0.15em. */}
            <div style={{ padding: "var(--space-4) var(--space-5)", background: "rgba(var(--rgb-sage), 0.08)", border: "1px solid rgba(var(--rgb-sage), 0.32)", borderRadius: "var(--radius)", marginTop: "var(--space-1)" }}>
              <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--color-sage)", margin: "0 0 var(--space-2)" }}>Landing Day</p>
              <p style={{ fontFamily: "var(--font-body), sans-serif", fontSize: "var(--text-xs)", color: "var(--color-ivory)", margin: 0, lineHeight: 1.65 }}>
                Give your skin 24h to re-acclimate before reintroducing actives. Cleanse, moisturize, SPF. Nothing else the first night.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}



// --- SHOP SCAN ----------------------------------------------------------------


export { ProductCard, SessionPicker, RoutineStep, SwanSongCard, FlightModeModal };