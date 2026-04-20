import { useState, useRef, useEffect } from "react";
import { Icon, Section, Wordmark } from "./components.jsx";
import { detectActives, analyzeShelf, buildRoutine, isDampSkinProduct, hasSPFCoverage } from "./engine.js";
import { FREQUENCIES } from "./constants.js";
import { getLockedSession, getAutoSession } from "./productmodal.jsx";

function SessionPicker({ productId, product, initial, onSession }) {
  const locked = product ? getLockedSession(product) : null;
  const auto = product ? getAutoSession(product) : { session: "both" };
  const resolved = (initial && initial !== "auto") ? initial : auto.session;
  const [selected, setSelected] = useState(resolved);

  if (locked) {
    const isAM = locked.session === "am";
    return (
      <div onClick={e => e.stopPropagation()} style={{ marginTop: 10 }}>
        <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 6px", opacity: 0.6 }}>Session</p>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ padding: "5px 12px", borderRadius: 8, background: isAM ? "rgba(122,144,112,0.14)" : "rgba(232,226,217,0.10)", border: "1px solid " + (isAM ? "rgba(122,144,112,0.4)" : "rgba(232,226,217,0.3)"), fontFamily: "Space Grotesk, sans-serif", fontSize: 10, fontWeight: 700, color: isAM ? "var(--sage)" : "#e8e2d9" }}>{isAM ? "AM only" : "PM only"}</span>
          <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: "var(--clay)", opacity: 0.5 }}>locked by ingredients</span>
        </div>
        <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: "var(--clay)", margin: "8px 0 0", lineHeight: 1.5, opacity: 0.6 }}>{locked.reason}</p>
      </div>
    );
  }

  const options = [{ id: "am", label: "AM only" }, { id: "pm", label: "PM only" }, { id: "both", label: "AM + PM" }];
  return (
    <div onClick={e => e.stopPropagation()} style={{ marginTop: 10 }}>
      <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 6px", opacity: 0.6 }}>Session</p>
      <div style={{ display: "flex", gap: 6 }}>
        {options.map(s => {
          const active = selected === s.id;
          return (
            <button key={s.id} onClick={e => { e.stopPropagation(); setSelected(s.id); if (onSession) onSession(productId, s.id); }}
              style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "1px solid " + (active ? "rgba(122,144,112,0.55)" : "var(--border)"), background: active ? "rgba(122,144,112,0.18)" : "transparent", color: active ? "var(--parchment)" : "var(--clay)", fontFamily: "Space Grotesk, sans-serif", fontSize: 10, fontWeight: active ? 700 : 400, cursor: "pointer" }}>
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
  const allergenHits = (user?.ingredientProfile?.allergens || []).filter(a =>
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
      if (days <= 0) return { label: `Expired ${Math.abs(days)}d ago`, color: "#8b7355", bg: "rgba(139,115,85,0.08)", border: "rgba(139,115,85,0.25)" };
      if (days <= 30) return { label: `Expires in ${days}d`, color: "#8b7355", bg: "rgba(139,115,85,0.08)", border: "rgba(139,115,85,0.25)" };
    }
    // Check PAO + opened date
    if (product.paoMonths && product.openedDate) {
      const opened = new Date(product.openedDate);
      const paoExp = new Date(opened);
      paoExp.setMonth(paoExp.getMonth() + product.paoMonths);
      const days = Math.ceil((paoExp - now) / 86400000);
      if (days <= 0) return { label: `PAO expired ${Math.abs(days)}d ago`, color: "#8b7355", bg: "rgba(139,115,85,0.08)", border: "rgba(139,115,85,0.25)" };
      if (days <= 30) return { label: `PAO: ${days}d left`, color: "#8b7355", bg: "rgba(139,115,85,0.08)", border: "rgba(139,115,85,0.25)" };
    }
    return null;
  })();

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "18px 18px 16px", display: "flex", flexDirection: "column", gap: 12, transition: "border-color 0.2s" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(122,144,112,0.4)"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>

      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 9, fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--sage)", marginBottom: 6 }}>{product.category}</div>
          <h3 style={{ fontFamily: "Reenie Beanie, cursive", fontSize: 22, fontWeight: 400, letterSpacing: "0.02em", color: "var(--parchment)", margin: "0 0 2px", lineHeight: 1.15 }}>{product.name}</h3>
          <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: 0, letterSpacing: "0.04em" }}>{product.brand}</p>
        </div>
        <div ref={menuRef} style={{ position: "relative", flexShrink: 0, marginLeft: 8 }}>
          <button onClick={() => setMenuOpen(o => !o)} style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", padding: "6px 8px", opacity: 0.6, transition: "opacity 0.15s", fontSize: 16, lineHeight: 1, fontFamily: "sans-serif" }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.6} aria-label="Product options">⋯</button>
          {menuOpen && (
            <div style={{ position: "absolute", right: 0, top: "100%", zIndex: 50, minWidth: 180, background: "var(--ink)", border: "1px solid var(--border)", borderRadius: 12, padding: "6px 0", boxShadow: "0 8px 28px rgba(0,0,0,0.45)" }}>
              <button onClick={() => { setMenuOpen(false); onEdit(product); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 16px", background: "none", border: "none", cursor: "pointer", color: "var(--parchment)", fontFamily: "Space Grotesk, sans-serif", fontSize: 12, textAlign: "left", transition: "background 0.12s" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(122,144,112,0.1)"} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                <Icon name="edit" size={12} /><span>Edit product</span>
              </button>
              <div style={{ height: 1, background: "var(--border)", margin: "4px 12px" }} />
              <button onClick={() => { setMenuOpen(false); setConfirmDelete(true); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 16px", background: "none", border: "none", cursor: "pointer", color: "#8b7355", fontFamily: "Space Grotesk, sans-serif", fontSize: 12, textAlign: "left", transition: "background 0.12s" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(139,115,85,0.08)"} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                <Icon name="trash" size={12} /><span>Remove from vanity</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Price + shelf life row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {product.price > 0 && (
          <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 18, color: "var(--parchment)", fontWeight: 300, letterSpacing: "-0.01em" }}>${(product.price || 0).toFixed(2)}</span>
        )}
        {shelfStatus && (
          <span style={{ fontSize: 9, fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, color: shelfStatus.color, background: shelfStatus.bg, border: `1px solid ${shelfStatus.border}`, padding: "3px 9px", borderRadius: 20 }}>
            {shelfStatus.label}
          </span>
        )}
      </div>
      {/* Active tags */}
      {activeKeys.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {activeKeys.map(a => <span key={a} style={{ fontSize: 9, fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clay)", background: "var(--ink)", padding: "3px 8px", borderRadius: 20, border: "1px solid var(--border)" }}>{a}</span>)}
        </div>
      )}

      {/* Allergen / loved badges */}
      {(allergenHits.length > 0 || lovedHits.length > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: activeKeys.length > 0 ? 5 : 0 }}>
          {allergenHits.map(a => (
            <span key={a} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.08em", color: "#8b7355", background: "rgba(139,115,85,0.08)", padding: "3px 8px", borderRadius: 20, border: "1px solid rgba(139,115,85,0.22)" }}><Icon name="warning" size={9} /> {a}</span>
          ))}
          {lovedHits.map(l => (
            <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.08em", color: "#7a9070", background: "rgba(122,144,112,0.08)", padding: "3px 8px", borderRadius: 20, border: "1px solid rgba(122,144,112,0.2)" }}><Icon name="sparkle" size={9} /> {l}</span>
          ))}
        </div>
      )}

      {/* In-ritual toggle */}
      <button onClick={() => onToggleRoutine(product.id)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", background: inRoutine ? "rgba(122,144,112,0.08)" : "var(--ink)", border: `1px solid ${inRoutine ? "rgba(122,144,112,0.3)" : "var(--border)"}`, borderRadius: 10, cursor: "pointer", transition: "all 0.18s" }}
        onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(122,144,112,0.5)"}
        onMouseLeave={e => e.currentTarget.style.borderColor = inRoutine ? "rgba(122,144,112,0.3)" : "var(--border)"}>
        <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: inRoutine ? "var(--sage)" : "var(--clay)", fontWeight: inRoutine ? 600 : 400 }}>
          {inRoutine ? "In ritual" : "Not in ritual"}
        </span>
        <div style={{ width: 28, height: 16, borderRadius: 8, background: inRoutine ? "var(--sage)" : "var(--border)", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
          <div style={{ position: "absolute", top: 2, left: inRoutine ? 14 : 2, width: 12, height: 12, borderRadius: "50%", background: inRoutine ? "#0d0f0d" : "var(--clay)", transition: "left 0.2s" }} />
        </div>
      </button>

      {/* Session picker — only when in routine */}
      {inRoutine && (
        <SessionPicker productId={product.id} product={product} initial={product.session} onSession={onSession} />
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(8,10,8,0.75)", backdropFilter: "blur(8px)", padding: "0 28px" }} onClick={() => setConfirmDelete(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 320, background: "var(--ink)", border: "1px solid var(--border)", borderRadius: 18, padding: "26px 24px 22px", boxShadow: "0 16px 48px rgba(0,0,0,0.55)" }}>
            <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 12px" }}>Confirm</p>
            <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 13, color: "var(--parchment)", margin: "0 0 22px", lineHeight: 1.65 }}>
              Remove <strong>{product.name}</strong> from your vanity? This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "1px solid var(--border)", background: "transparent", color: "var(--parchment)", fontFamily: "Space Grotesk, sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "background 0.15s" }} onMouseEnter={e => e.currentTarget.style.background = "var(--surface)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>Cancel</button>
              <button onClick={() => { setConfirmDelete(false); onDelete(product.id); }} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "1px solid rgba(139,115,85,0.35)", background: "rgba(139,115,85,0.12)", color: "#8b7355", fontFamily: "Space Grotesk, sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "background 0.15s" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(139,115,85,0.2)"} onMouseLeave={e => e.currentTarget.style.background = "rgba(139,115,85,0.12)"}>Remove</button>
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
  if (actives.includes("retinol"))     return "Applied last in the PM active layers. Photosensitive — breaks down in sunlight, so PM only.";
  if (actives.includes("AHA"))         return "Applied before moisturiser in PM. AHAs increase UV sensitivity — always follow with SPF the next morning.";
  if (actives.includes("BHA"))         return "Applied before moisturiser. BHAs exfoliate inside the pore — PM use lets skin recover overnight.";
  if (actives.includes("vitamin C"))   return "Applied to clean skin before moisturiser in AM. Pairs with SPF to neutralise free radicals throughout the day.";
  if (actives.includes("niacinamide")) return "Applied before moisturiser. Works well at any step — placed here to layer efficiently with other actives.";
  if (actives.includes("peptides"))    return "Applied before moisturiser in PM. Peptides support overnight repair and work best without UV interference.";
  return STEP_REASONS[step.category] || null;
}

function RoutineStep({ step, index, isLast, checked, onCheck, scheduled = true }) {
  const activeKeys = Object.keys(detectActives(step.ingredients || []));
  const [expanded, setExpanded] = useState(false);
  const reason = getStepReason(step);
  const damp = isDampSkinProduct(step);
  const freqLabel = step.frequency && step.frequency !== "daily"
    ? (FREQUENCIES.find(f => f.id === step.frequency)?.label || step.frequency)
    : null;
  const nameColor = scheduled ? "var(--parchment)" : "var(--taupe)";
  const ringColor = scheduled ? "#7a9070" : "var(--taupe)";
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", opacity: checked ? 0.45 : scheduled ? 1 : 0.55, transition: "opacity 0.2s" }}>
      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div
          onClick={onCheck}
          style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${ringColor}`, background: checked ? ringColor : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.18s", flexShrink: 0 }}>
          {checked && <Icon name="check" size={13} />}
        </div>
        {!isLast && <div style={{ width: 1, flex: 1, background: "var(--border)", marginTop: 6, minHeight: 16 }} />}
      </div>
      <div style={{ flex: 1, marginBottom: isLast ? 0 : 12 }}>
        <div
          style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 13, padding: "13px 15px", cursor: reason ? "pointer" : "default", transition: "border-color 0.15s" }}
          onClick={() => reason && setExpanded(e => !e)}
          onMouseEnter={e => { if (reason) e.currentTarget.style.borderColor = "rgba(122,144,112,0.35)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--clay)", marginBottom: 4 }}>
                {step.category}
                {!scheduled && <span style={{ marginLeft: 8, color: "var(--taupe)", opacity: 0.75 }}>· Skipped today</span>}
              </div>
              <p style={{ fontFamily: "Reenie Beanie, cursive", fontSize: 22, fontWeight: 400, letterSpacing: "0.02em", color: nameColor, margin: "0 0 2px" }}>{step.name}</p>
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: 0 }}>
                {step.brand}
                {freqLabel && (
                  <span style={{ marginLeft: 8, fontSize: 9, fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--taupe)", opacity: 0.85 }}>{freqLabel}</span>
                )}
                {step.session && step.session !== "auto" && (
                  <span style={{ marginLeft: 8, fontSize: 9, fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clay)", opacity: 0.6 }}>{step.session === "both" ? "AM + PM" : step.session === "am" ? "AM" : step.session === "pm" ? "PM" : step.session}</span>
                )}
              </p>
              {activeKeys.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 9 }}>
                  {activeKeys.map(a => <span key={a} style={{ fontSize: 9, fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clay)", background: "var(--ink)", padding: "3px 8px", borderRadius: 20, border: "1px solid var(--border)" }}>{a}</span>)}
                </div>
              )}
            </div>
            {reason && (
              <span style={{ color: "var(--clay)", opacity: 0.35, flexShrink: 0, marginTop: 2, display: "inline-flex", transition: "transform 0.18s", transform: expanded ? "rotate(-90deg)" : "rotate(90deg)" }}><Icon name="chevron" size={11} /></span>
            )}
          </div>
          {damp && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, padding: "6px 9px", borderRadius: 8, background: "rgba(139,115,85,0.08)", border: "1px solid rgba(139,115,85,0.2)" }}>
              <span style={{ color: "rgba(139,115,85,0.85)", display: "inline-flex" }}><Icon name="drop" size={11} /></span>
              <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: "rgba(139,115,85,0.85)", letterSpacing: "0.02em" }}>Apply on damp skin for best absorption</span>
            </div>
          )}
          {expanded && reason && (
            <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: "10px 0 0", lineHeight: 1.65, paddingTop: 10, borderTop: "1px solid var(--border)", opacity: 0.85 }}>{reason}</p>
          )}
        </div>
      </div>
    </div>
  );
}
function getDayIndex() {
  const now = new Date();
  return Math.floor(now.getTime() / 86400000);
}

const NO_DATA_LINE = "Log a few check-ins and I'll have something for you soon.";

function SwanSongCard({ currentSession, asPopup = false, onDismissPopup, user = {}, predictions = [] }) {
  const now = new Date();
  const isBirthday = user.birthMonth && user.birthDay &&
    (now.getMonth() + 1) === parseInt(user.birthMonth) &&
    now.getDate() === parseInt(user.birthDay);

  const BIRTHDAY_LINES = [
    "Another year of taking care of yourself.",
    "Your skin has carried you this far.",
    "Happy birthday. Your skin looks radiant.",
  ];

  // Separate meaningful predictions from baseline fallbacks
  const meaningfulPredictions = predictions.filter(p => {
    const key = p.id || p.type;
    return key && !key.startsWith("baseline_");
  });
  const hasMeaningful = meaningfulPredictions.length > 0;

  // Line: SwanSense prediction > birthday > "not enough data yet"
  const line = isBirthday
    ? BIRTHDAY_LINES[now.getFullYear() % BIRTHDAY_LINES.length]
    : hasMeaningful
      ? meaningfulPredictions[0].headline
      : NO_DATA_LINE;

  const grain ="url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.045'/%3E%3C/svg%3E\")";

  // -- POPUP version ---------------------------------------------------------
  if (asPopup) {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(8,10,8,0.72)", backdropFilter: "blur(10px)",
        padding: "0 28px",
        animation: "fadeUp 0.38s ease",
      }}>
        <div style={{
          position: "relative", width: "100%", maxWidth: 340,
          background: "linear-gradient(158deg, #3d3a28 0%, #2a2619 45%, #1e1a14 100%)",
          borderRadius: 22,
          padding: "28px 26px 24px",
          overflow: "hidden",
          boxShadow: "0 24px 60px rgba(0,0,0,0.7), 0 1px 0 rgba(232,220,180,0.06) inset",
          border: "1px solid rgba(139,115,85,0.22)",
        }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: 22, pointerEvents: "none", backgroundImage: grain, backgroundSize: "180px 180px", opacity: 0.7 }} />
          <div style={{ position: "absolute", inset: 0, borderRadius: 22, pointerEvents: "none", background: "radial-gradient(ellipse at 85% 15%, rgba(139,115,85,0.12) 0%, transparent 65%)" }} />
          <div style={{ position: "absolute", bottom: 14, right: 18, opacity: 0.07, fontSize: 56, userSelect: "none", pointerEvents: "none" }}>🦢</div>

          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.28em", textTransform: "uppercase", color: "rgba(232,226,217,0.65)", margin: 0 }}>
              Swan Song
            </p>
          </div>
          <div style={{ height: 1, background: "rgba(232,226,217,0.12)", marginBottom: 18 }} />

          <p style={{ fontFamily: "var(--cursive)", fontSize: 32, fontWeight: 400, lineHeight: 1.5, color: "#e8e3d6", letterSpacing: "0.02em", margin: "0 0 18px" }}>{line}</p>

          {/* Show first prediction detail in popup */}
          {hasMeaningful && meaningfulPredictions[0].detail && (
            <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "rgba(232,226,217,0.5)", margin: "0 0 22px", lineHeight: 1.65 }}>{meaningfulPredictions[0].detail}</p>
          )}

          <button onClick={onDismissPopup} style={{
            width: "100%", padding: "11px 0",
            background: "rgba(232,226,217,0.08)", border: "1px solid rgba(232,226,217,0.18)",
            borderRadius: 10, cursor: "pointer",
            fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.2em",
            textTransform: "uppercase", color: "rgba(232,226,217,0.55)", transition: "all 0.2s",
          }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(232,226,217,0.14)"; e.currentTarget.style.color = "rgba(232,226,217,0.85)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(232,226,217,0.08)"; e.currentTarget.style.color = "rgba(232,226,217,0.55)"; }}>
            Carry on
          </button>
        </div>
      </div>
    );
  }

  // -- INLINE (settled) version — small card at bottom of home ---------------
  return (
    <div style={{ position: "relative", marginTop: 8 }}>
      <div style={{
        position: "relative",
        background: "linear-gradient(158deg, #3d3a28 0%, #2a2619 45%, #1e1a14 100%)",
        borderRadius: 14,
        padding: "16px 18px 14px",
        overflow: "hidden",
        boxShadow: "0 4px 18px rgba(0,0,0,0.35)",
        border: "1px solid rgba(139,115,85,0.15)",
      }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 14, pointerEvents: "none", backgroundImage: grain, backgroundSize: "180px 180px", opacity: 0.6 }} />
        <div style={{ position: "absolute", bottom: 8, right: 12, opacity: 0.06, fontSize: 44, userSelect: "none", pointerEvents: "none" }}>🦢</div>

        <div style={{ marginBottom: 10 }}>
          <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 8, letterSpacing: "0.28em", textTransform: "uppercase", color: "rgba(232,226,217,0.55)", margin: 0 }}>Swan Song</p>
        </div>

        <p style={{ fontFamily: "var(--cursive)", fontSize: 22, fontWeight: 400, lineHeight: 1.5, color: "rgba(232,227,214,0.85)", letterSpacing: "0.02em", margin: 0 }}>{line}</p>
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(8,10,8,0.85)", backdropFilter: "blur(12px)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      >
      <div style={{ background: "var(--ink)", width: "100%", maxWidth: 520, borderRadius: "20px 20px 0 0", padding: "28px 24px 52px", maxHeight: "88vh", overflowY: "auto", border: "1px solid var(--border)", borderBottom: "none" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div>
            <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 5px" }}>Flight Day</p>
            <h2 style={{ fontFamily: "Reenie Beanie, cursive", fontSize: 22, fontWeight: 400, letterSpacing: "0.02em", color: "var(--parchment)", margin: 0, lineHeight: 1.1 }}>Your Ritual, Anywhere</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", padding: 4 }}><Icon name="x" size={17} /></button>
        </div>

        <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: "0 0 22px", lineHeight: 1.6 }}>
          What to pack, what to skip, and how to land without losing your skin.
        </p>

        {/* Tab toggle */}
        <div style={{ display: "flex", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 3, marginBottom: 24 }}>
          {[{ id: "edit", label: "Your Edit" }, { id: "tips", label: "Flight Tips" }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: tab === t.id ? "#7a9070" : "transparent", color: tab === t.id ? "#0d0f0d" : "var(--clay)", fontFamily: "Space Grotesk, sans-serif", fontSize: 10, fontWeight: tab === t.id ? 700 : 400, cursor: "pointer", letterSpacing: "0.12em", textTransform: "uppercase", transition: "all 0.18s" }}>
              {t.label}
            </button>
          ))}
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
                <div style={{ display: "flex", gap: 12, padding: "13px 16px", background: "rgba(139,115,85,0.07)", border: "1px solid rgba(139,115,85,0.22)", borderRadius: 12, marginBottom: 18 }}>
                  <span style={{ color: "#8b7355", flexShrink: 0, marginTop: 2, display: "inline-flex" }}><Icon name="plane" size={16} /></span>
                  <div>
                    <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, fontWeight: 600, color: "var(--parchment)", margin: "0 0 3px" }}>Check your sizes before packing.</p>
                    <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: 0, lineHeight: 1.6 }}>
                      Your {listed} {unique.length === 1 ? "is" : "are"} often over 100ml. Decant into travel bottles or pick up minis — carry-on limit is 100ml per liquid.
                    </p>
                  </div>
                </div>
              );
            })()}
            {/* Pack these */}
            {keep.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#7a9070" }} />
                  <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "#7a9070" }}>Pack These</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {keep.map((item, i) => (
                    <div key={i} style={{ padding: "13px 16px", background: "rgba(122,144,112,0.06)", border: "1px solid rgba(122,144,112,0.2)", borderRadius: 12 }}>
                      <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 13, color: "var(--parchment)", margin: "0 0 3px", fontWeight: 500 }}>{item.name}</p>
                      <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: 0, lineHeight: 1.55 }}>{item.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Leave behind */}
            {skip.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#8b7355" }} />
                  <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "#8b7355" }}>Leave Behind</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {skip.map((item, i) => (
                    <div key={i} style={{ padding: "13px 16px", background: "rgba(139,115,85,0.06)", border: "1px solid rgba(139,115,85,0.18)", borderRadius: 12 }}>
                      <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 13, color: "var(--parchment)", margin: "0 0 3px", fontWeight: 500 }}>{item.name}</p>
                      <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: 0, lineHeight: 1.55 }}>{item.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {keep.length === 0 && skip.length === 0 && (
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 12, color: "var(--clay)", textAlign: "center", padding: "24px 0" }}>Add products to your vanity to generate your travel edit.</p>
            )}
          </div>
        )}

        {/* FLIGHT TIPS tab */}
        {tab === "tips" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {tips.map((tip, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
                <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 13, color: "var(--clay)", flexShrink: 0, marginTop: 1 }}>{i + 1}.</span>
                <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 12, color: "var(--parchment)", margin: 0, lineHeight: 1.65 }}>{tip}</p>
              </div>
            ))}

            {/* Recovery note */}
            <div style={{ padding: "16px 18px", background: "rgba(122,144,112,0.08)", border: "1px solid rgba(122,144,112,0.25)", borderRadius: 12, marginTop: 4 }}>
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "#7a9070", margin: "0 0 6px" }}>Landing Day</p>
              <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 12, color: "var(--clay)", margin: 0, lineHeight: 1.65 }}>
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