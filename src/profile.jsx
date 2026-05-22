import { LocationManager } from "./progress.jsx";
import { useState, useRef } from "react";
import { Icon, Section } from "./components.jsx";
import { calcSpending } from "./engine.js";

const SKIN_TYPES = ["Dry", "Oily", "Combination", "Sensitive", "Normal"];
const SKIN_CONCERNS = ["Acne", "Hyperpigmentation", "Redness", "Fine lines", "Texture", "Dehydration", "Dullness", "Sensitivity"];

function Profile({ user, products, onLogout, locationData, setLocationData, locationDenied, setLocationDenied }) {
  const spending = calcSpending(products);
  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--clay)", marginBottom: 6 }}>account</p>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--color-inky-moss)", margin: "0 0 2px" }}>{user.name}</h2>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--clay)", letterSpacing: "0.04em" }}>{user.email}</p>
      </div>

      {/* Your Skin section */}
      {(user.skinType || (user.concerns && user.concerns.length > 0) || user.skinAgeBracket) && (
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--clay)", marginBottom: 12 }}>Your Skin</p>
          <div style={{ background: "var(--color-ivory-shadow)", border: "none", borderRadius: 8, padding: "16px 18px" }}>
            {user.skinAgeBracket && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay)" }}>Age Bracket</span>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--parchment)", fontWeight: 400 }}>{user.skinAgeBracket}</span>
              </div>
            )}
            {user.skinType && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: user.concerns?.length > 0 ? 12 : 0, paddingBottom: user.concerns?.length > 0 ? 12 : 0, borderBottom: user.concerns?.length > 0 ? "1px solid var(--border)" : "none" }}>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay)" }}>Skin Type</span>
                <span style={{ padding: "4px 12px", borderRadius: 20, background: "rgba(45,61,43,0.10)", border: "1px solid rgba(45,61,43,0.3)", fontFamily: "var(--font-body)", fontSize: 11, color: "#2d3d2b", fontWeight: 400 }}>{user.skinType}</span>
              </div>
            )}
            {user.concerns && user.concerns.length > 0 && (
              <div>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 8px" }}>Concerns</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {user.concerns.map((c, i) => (
                    <span key={i} style={{ padding: "4px 12px", borderRadius: 20, background: "var(--ink)", border: "1px solid var(--border)", fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)" }}>{c}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 32 }}>
        {[["Products", products.length], ["Categories", new Set(products.map(p => p.category)).size], ["Value", `$${spending.total.toFixed(0)}`]].map(([l, v]) => (
          <div key={l} style={{ background: "var(--color-ivory-shadow)", border: "none", borderRadius: 8, padding: "18px 12px", textAlign: "center" }}>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 24, fontWeight: 200, color: "var(--parchment)", margin: "0 0 4px", letterSpacing: "-0.02em" }}>{v}</p>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--clay)", margin: 0 }}>{l}</p>
          </div>
        ))}
      </div>

      {/* Location */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--clay)", marginBottom: 12 }}>Your Environment</p>
        <LocationManager locationData={locationData} setLocationData={setLocationData} locationDenied={locationDenied} setLocationDenied={setLocationDenied} />
      </div>

      <Section title="About Cygne" icon="leaf">
        <div style={{ background: "var(--color-ivory-shadow)", border: "none", borderRadius: 8, padding: "20px 20px" }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--clay)", margin: "0 0 14px", lineHeight: 1.7 }}>
            Cygne transforms your product collection into a properly sequenced, conflict-free routine. Correct layering. Ingredient compatibility. Reduced redundancy.
          </p>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: 0, opacity: 0.6, lineHeight: 1.6 }}>
            All analysis is rule-based and logic-driven. Product identification uses AI vision on upload. No chat, no social, no telehealth.
          </p>
        </div>
      </Section>

      <button onClick={onLogout}
        style={{ width: "100%", padding: "13px 0", background: "none", color: "var(--clay)", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", cursor: "pointer", transition: "border-color 0.2s, color 0.2s" }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "#2d3d2b"; e.currentTarget.style.color = "#2d3d2b"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--clay)"; }}>
        Sign Out
      </button>
    </div>
  );
}


// --- PROFILE SHEET ------------------------------------------------------------



// --- INGREDIENT PROFILE -------------------------------------------------------

const COMMON_ALLERGENS = [
  "Fragrance", "Alcohol denat", "Essential oils", "Limonene", "Linalool",
  "Citronellol", "Geraniol", "Benzyl alcohol", "Methylisothiazolinone",
  "Parabens", "Formaldehyde", "Lanolin", "Propylene glycol", "Cocamidopropyl betaine",
];

const COMMON_LOVED = [
  "Niacinamide", "Ceramides", "Hyaluronic acid", "Centella asiatica",
  "Panthenol", "Squalane", "Glycerin", "Peptides", "Azelaic acid",
  "Vitamin C", "Retinol", "Bakuchiol", "Green tea", "Resveratrol",
];

function IngredientProfile({ user, onUpdateUser }) {
  const profile = user?.ingredientProfile || {};
  const allergens = profile.allergens || [];
  const loved = profile.loved || [];
  const [editing, setEditing] = useState(false);
  const [draftAllergens, setDraftAllergens] = useState(allergens);
  const [draftLoved, setDraftLoved] = useState(loved);
  const [customAllergen, setCustomAllergen] = useState("");
  const [customLoved, setCustomLoved] = useState("");

  const toggleAllergen = (s) => setDraftAllergens(d =>
    d.includes(s) ? d.filter(x => x !== s) : [...d, s]
  );
  const toggleLoved = (s) => setDraftLoved(d =>
    d.includes(s) ? d.filter(x => x !== s) : [...d, s]
  );
  const addCustomAllergen = () => {
    const v = customAllergen.trim();
    if (!v || draftAllergens.includes(v)) return;
    setDraftAllergens(d => [...d, v]);
    setCustomAllergen("");
  };
  const addCustomLoved = () => {
    const v = customLoved.trim();
    if (!v || draftLoved.includes(v)) return;
    setDraftLoved(d => [...d, v]);
    setCustomLoved("");
  };
  const save = () => {
    onUpdateUser({ ...user, ingredientProfile: { allergens: draftAllergens, loved: draftLoved } });
    setEditing(false);
  };
  const cancel = () => {
    setDraftAllergens(allergens);
    setDraftLoved(loved);
    setEditing(false);
  };

  const hasAny = allergens.length > 0 || loved.length > 0;

  // Shared visual language with SkinProfileEditor — same card chrome,
  // header treatment, edit chrome, field labels, Save/Cancel buttons.
  const fieldLabel = (txt) => (
    <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--color-inky-moss, #2d3d2b)", margin: "0 0 8px" }}>{txt}</p>
  );
  const editInputStyle = {
    width: "100%", boxSizing: "border-box",
    background: "var(--color-ivory, #faf9f4)",
    border: "1px solid rgba(45,61,43,0.18)",
    borderRadius: 0, padding: "11px 14px",
    fontFamily: "var(--font-body)", fontSize: 13,
    color: "var(--color-ink, #1c1c1a)",
    caretColor: "var(--color-inky-moss, #2d3d2b)",
    outline: "none",
    WebkitAppearance: "none", appearance: "none",
    WebkitTapHighlightColor: "transparent",
  };
  // Loved (moss) and avoided (clay) keep their tonal distinction via
  // background + text color when active; inactive is the neutral outline.
  const tagButton = ({ on, tone, onClick, children }) => {
    const palettes = {
      love:  { active: { color: "#2d3d2b", bg: "rgba(45,61,43,0.12)", border: "var(--color-inky-moss, #2d3d2b)" } },
      avoid: { active: { color: "#8b7355", bg: "rgba(139,115,85,0.10)", border: "rgba(139,115,85,0.5)" } },
    };
    const p = palettes[tone].active;
    return (
      <button type="button" onClick={onClick}
        style={{
          padding: "6px 12px", borderRadius: 24,
          border: `1px solid ${on ? p.border : "rgba(45,61,43,0.35)"}`,
          background: on ? p.bg : "transparent",
          color: on ? p.color : "var(--color-inky-moss, #2d3d2b)",
          fontFamily: "var(--font-body)", fontSize: 11, fontWeight: on ? 700 : 400,
          cursor: "pointer", letterSpacing: "0.02em", transition: "all 0.18s",
          WebkitAppearance: "none", appearance: "none",
        }}>{children}</button>
    );
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--color-inky-moss, #2d3d2b)", margin: 0 }}>
          Ingredient Profile
        </p>
        {!editing && (
          <button onClick={() => setEditing(true)}
            style={{ background: "none", border: "none", fontFamily: "var(--font-body)", fontSize: 10, color: "var(--color-inky-moss, #2d3d2b)", cursor: "pointer", letterSpacing: "0.14em", textTransform: "uppercase", padding: 0 }}>
            Edit
          </button>
        )}
      </div>

      {!editing ? (
        <div style={{ background: "var(--color-ivory-shadow, #f0ebe0)", borderTop: "1px solid rgba(45,61,43,0.18)", padding: "18px 16px" }}>
          {!hasAny ? (
            <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--color-pebble, #7a7a7a)", margin: 0 }}>
              No ingredients flagged yet. Tap Edit to mark allergens and loved ingredients — Cygne will cross-reference them on every product.
            </p>
          ) : (
            // Unified chip cloud — loved + avoided shown together. Chip color
            // (clay = avoid, moss = love) is the only visual distinction.
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {loved.map(l => (
                <span key={`l-${l}`} style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(45,61,43,0.08)", border: "1px solid rgba(45,61,43,0.22)", fontFamily: "var(--font-body)", fontSize: 10, color: "#2d3d2b" }}>{l}</span>
              ))}
              {allergens.map(a => (
                <span key={`a-${a}`} style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(139,115,85,0.08)", border: "1px solid rgba(139,115,85,0.22)", fontFamily: "var(--font-body)", fontSize: 10, color: "#8b7355" }}>{a}</span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: "var(--color-ivory-shadow, #f0ebe0)", borderTop: "1px solid rgba(45,61,43,0.18)", padding: "18px 16px", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Avoid / Allergic to */}
          <div>
            {fieldLabel("Avoid / Allergic to")}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {COMMON_ALLERGENS.map(s => tagButton({ on: draftAllergens.includes(s), tone: "avoid", onClick: () => toggleAllergen(s), children: s }))}
              {draftAllergens.filter(a => !COMMON_ALLERGENS.includes(a)).map(a => (
                <button key={a} onClick={() => toggleAllergen(a)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 24, border: "1px solid rgba(139,115,85,0.5)", background: "rgba(139,115,85,0.10)", fontFamily: "var(--font-body)", fontSize: 11, color: "#8b7355", fontWeight: 700, cursor: "pointer", WebkitAppearance: "none", appearance: "none" }}>
                  {a} <Icon name="x" size={9} />
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={editInputStyle} placeholder="Add custom e.g. Benzophenone"
                value={customAllergen} onChange={e => setCustomAllergen(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addCustomAllergen()} />
              <button onClick={addCustomAllergen}
                style={{ padding: "0 18px", background: "transparent", border: "1.5px solid var(--color-inky-moss, #2d3d2b)", borderRadius: 0, fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--color-inky-moss, #2d3d2b)", cursor: "pointer", WebkitAppearance: "none", appearance: "none" }}>
                Add
              </button>
            </div>
          </div>

          {/* Love */}
          <div>
            {fieldLabel("Love")}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {COMMON_LOVED.map(s => tagButton({ on: draftLoved.includes(s), tone: "love", onClick: () => toggleLoved(s), children: s }))}
              {draftLoved.filter(l => !COMMON_LOVED.includes(l)).map(l => (
                <button key={l} onClick={() => toggleLoved(l)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 24, border: "1px solid var(--color-inky-moss, #2d3d2b)", background: "rgba(45,61,43,0.12)", fontFamily: "var(--font-body)", fontSize: 11, color: "#2d3d2b", fontWeight: 700, cursor: "pointer", WebkitAppearance: "none", appearance: "none" }}>
                  {l} <Icon name="x" size={9} />
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={editInputStyle} placeholder="Add custom e.g. Tranexamic acid"
                value={customLoved} onChange={e => setCustomLoved(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addCustomLoved()} />
              <button onClick={addCustomLoved}
                style={{ padding: "0 18px", background: "transparent", border: "1.5px solid var(--color-inky-moss, #2d3d2b)", borderRadius: 0, fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--color-inky-moss, #2d3d2b)", cursor: "pointer", WebkitAppearance: "none", appearance: "none" }}>
                Add
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={save}
              style={{ flex: 1, padding: "12px 0", background: "transparent", border: "1.5px solid var(--color-inky-moss, #2d3d2b)", borderRadius: 0, fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--color-inky-moss, #2d3d2b)", cursor: "pointer", WebkitAppearance: "none", appearance: "none" }}>
              Save
            </button>
            <button onClick={cancel}
              style={{ flex: 1, padding: "12px 0", background: "transparent", border: "1px solid rgba(45,61,43,0.22)", borderRadius: 0, fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 400, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--color-pebble, #7a7a7a)", cursor: "pointer", WebkitAppearance: "none", appearance: "none" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- SKIN PROFILE (onboarding answers — climate, goals, philosophy, etc.) ----
//
// Same shape as the data captured during onboarding's later steps. Editing here
// writes back to user.skinProfile, which syncs to Supabase via App.jsx's
// updateUser → supabase.auth.updateUser pipeline. Downstream consumers
// (swansense.jsx, intelligence.jsx, engine.applyPhilosophy) read the value
// inline on every render, so changes take effect immediately for routine
// recommendations. The swan-sense-daily cache is keyed per (userId, day) — the
// next day's headline picks up the new profile.

// Skin Type and Concerns live on the user object's TOP level (user.skinType,
// user.concerns) — not inside user.skinProfile. They're listed here so the
// editor renders them in a single unified accordion, but the save handler
// routes them correctly. `top: true` flags the field as top-level.
const SKIN_PROFILE_FIELDS = [
  { key: "skinType",           label: "Skin Type",           options: SKIN_TYPES,    top: true },
  { key: "concerns",           label: "Concerns",            options: SKIN_CONCERNS, top: true, multi: true },
  { key: "skinGoals",          label: "Skin Goals",          options: ["Glassy & Luminous", "Clear & Smooth", "Even-Toned", "Firm & Refined", "Hydrated & Plump"], multi: true },
  { key: "specialOccasion",    label: "Preparing For",       options: ["Wedding", "Vacation", "Event or Shoot", "Just For Me"] },
  { key: "consistency",        label: "Adherence",           options: ["Daily, Without Fail", "A Few Times a Week", "When I Remember"] },
  { key: "routinePhilosophy",  label: "Ritual Philosophy",   options: ["Minimalist — 3 to 5 steps", "Multi-Step — full ritual, I enjoy the process", "Somewhere In Between"] },
  { key: "climate",            label: "Climate",             options: ["Humid", "Dry", "Cold", "Tropical", "Mixed Seasons"] },
  { key: "environment",        label: "Environment",         options: ["Indoors", "Outdoors", "Hybrid"] },
  { key: "travel",             label: "Travel",              options: ["Frequently", "Occasionally", "Rarely"] },
  { key: "fragrance",          label: "Fragrance Sensitivity", options: ["Yes — I avoid it", "Sometimes", "No"] },
];

function SkinProfileEditor({ user, onUpdateUser }) {
  const [editing, setEditing] = useState(false);
  const profile = user?.skinProfile || {};
  // Draft holds both top-level fields (skinType, concerns) and nested
  // skinProfile fields in one flat object — the editor doesn't need to
  // know the distinction. save() routes each field to its correct home.
  const buildDraft = () => ({
    skinType:          user?.skinType || "",
    concerns:          Array.isArray(user?.concerns) ? user.concerns : [],
    skinGoals:         Array.isArray(profile.skinGoals) ? profile.skinGoals : [],
    specialOccasion:   profile.specialOccasion || "",
    occasionDate:      profile.occasionDate || "",
    consistency:       profile.consistency || "",
    routinePhilosophy: profile.routinePhilosophy || "",
    climate:           profile.climate || "",
    environment:       profile.environment || "",
    travel:            profile.travel || "",
    fragrance:         profile.fragrance || "",
    ingredientsToAvoid: profile.ingredientsToAvoid || "",
  });
  const [draft, setDraft] = useState(buildDraft());

  const setField = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const toggleMulti = (k, v) => setDraft(d => {
    const cur = Array.isArray(d[k]) ? d[k] : [];
    return { ...d, [k]: cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v] };
  });
  const toggleSingle = (k, v) => setDraft(d => ({ ...d, [k]: d[k] === v ? "" : v }));

  const startEditing = () => { setDraft(buildDraft()); setEditing(true); };
  const cancel = () => { setDraft(buildDraft()); setEditing(false); };
  const save = () => {
    const { skinType, concerns, ...profileDraft } = draft;
    const cleaned = { ...profileDraft, ingredientsToAvoid: (profileDraft.ingredientsToAvoid || "").trim() || null };
    // If the user moved to a non-event occasion, clear the date so downstream
    // logic (e.g. SwanSense's countdown gate) doesn't fire on stale data.
    if (cleaned.specialOccasion === "Just For Me" || cleaned.specialOccasion === "Not Right Now" || !cleaned.specialOccasion) {
      cleaned.occasionDate = "";
    }
    onUpdateUser({ ...user, skinType, concerns, skinProfile: cleaned });
    setEditing(false);
  };

  // Pill button shared with onboarding's PillSelect visual.
  const Pill = ({ active, children, onClick }) => (
    <button type="button" onClick={onClick}
      style={{
        padding: "8px 14px", borderRadius: 24,
        border: `1px solid ${active ? "var(--color-inky-moss, #2d3d2b)" : "rgba(45,61,43,0.35)"}`,
        background: active ? "rgba(45,61,43,0.12)" : "transparent",
        color: "var(--color-inky-moss, #2d3d2b)",
        fontFamily: "var(--font-body)", fontSize: 11, fontWeight: active ? 700 : 400,
        cursor: "pointer", letterSpacing: "0.02em", transition: "all 0.18s",
        WebkitAppearance: "none", appearance: "none",
      }}>
      {children}
    </button>
  );

  const summaryRow = (label, value) => (
    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 14, paddingBottom: 8, marginBottom: 8, borderBottom: "1px solid rgba(45,61,43,0.08)" }}>
      <span style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-inky-moss, #2d3d2b)", flexShrink: 0 }}>{label}</span>
      <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--color-ink, #1c1c1a)", textAlign: "right", lineHeight: 1.5 }}>{value}</span>
    </div>
  );

  const fieldLabel = (txt) => (
    <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--color-inky-moss, #2d3d2b)", margin: "0 0 8px" }}>{txt}</p>
  );

  const editInputStyle = {
    width: "100%", boxSizing: "border-box",
    background: "var(--color-ivory, #faf9f4)",
    border: "1px solid rgba(45,61,43,0.18)",
    borderRadius: 0, padding: "11px 14px",
    fontFamily: "var(--font-body)", fontSize: 13,
    color: "var(--color-ink, #1c1c1a)",
    caretColor: "var(--color-inky-moss, #2d3d2b)",
    outline: "none",
    WebkitAppearance: "none", appearance: "none",
    WebkitTapHighlightColor: "transparent",
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--color-inky-moss, #2d3d2b)", margin: 0 }}>
          Your Skin Profile
        </p>
        {!editing && (
          <button onClick={startEditing}
            style={{ background: "none", border: "none", fontFamily: "var(--font-body)", fontSize: 10, color: "var(--color-inky-moss, #2d3d2b)", cursor: "pointer", letterSpacing: "0.14em", textTransform: "uppercase", padding: 0 }}>
            Edit
          </button>
        )}
      </div>

      {!editing ? (
        <div style={{ background: "var(--color-ivory-shadow, #f0ebe0)", borderTop: "1px solid rgba(45,61,43,0.18)", padding: "18px 16px" }}>
          {SKIN_PROFILE_FIELDS.map(f => {
            const val = draft[f.key];
            const isEmpty = Array.isArray(val) ? val.length === 0 : !val;
            // Hide fragrance row entirely when not set — the em-dash placeholder
            // adds noise without information for users who haven't answered.
            if (isEmpty && f.key === "fragrance") return null;
            // Shorten any " — " descriptor values to just the headline part so
            // long philosophy labels ("Multi-Step — full ritual, I enjoy the
            // process") don't wrap awkwardly in the summary cell.
            const shorten = (v) => typeof v === "string" && v.includes(" — ") ? v.split(" — ")[0] : v;
            const display = isEmpty
              ? "—"
              : (Array.isArray(val) ? val.map(shorten).join(", ") : shorten(val));
            return summaryRow(f.label, display);
          })}
          {draft.specialOccasion && draft.occasionDate &&
            draft.specialOccasion !== "Just For Me" && draft.specialOccasion !== "Not Right Now" &&
            summaryRow("Occasion Date", draft.occasionDate)}
          {/* Ingredients to Avoid only renders when the user has actually
              entered something — no empty em-dash row. */}
          {draft.ingredientsToAvoid && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingTop: 2 }}>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-inky-moss, #2d3d2b)" }}>Ingredients to Avoid</span>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--color-ink, #1c1c1a)", lineHeight: 1.55 }}>
                {draft.ingredientsToAvoid}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: "var(--color-ivory-shadow, #f0ebe0)", borderTop: "1px solid rgba(45,61,43,0.18)", padding: "18px 16px", display: "flex", flexDirection: "column", gap: 20 }}>
          {SKIN_PROFILE_FIELDS.map(f => (
            <div key={f.key}>
              {fieldLabel(f.label)}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {f.options.map(opt => {
                  const active = f.multi ? (draft[f.key] || []).includes(opt) : draft[f.key] === opt;
                  return (
                    <Pill key={opt} active={active}
                      onClick={() => f.multi ? toggleMulti(f.key, opt) : toggleSingle(f.key, opt)}>
                      {opt}
                    </Pill>
                  );
                })}
              </div>
              {f.key === "specialOccasion" && draft.specialOccasion &&
                draft.specialOccasion !== "Just For Me" && draft.specialOccasion !== "Not Right Now" && (
                <div style={{ marginTop: 10 }}>
                  {fieldLabel("Occasion Date")}
                  <input type="date" value={draft.occasionDate || ""}
                    onChange={e => setField("occasionDate", e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    style={editInputStyle} />
                </div>
              )}
            </div>
          ))}

          <div>
            {fieldLabel("Ingredients to Avoid")}
            <input value={draft.ingredientsToAvoid}
              onChange={e => setField("ingredientsToAvoid", e.target.value)}
              placeholder="e.g. retinol, essential oils, alcohol"
              style={editInputStyle} />
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={save}
              style={{ flex: 1, padding: "12px 0", background: "transparent", border: "1.5px solid var(--color-inky-moss, #2d3d2b)", borderRadius: 0, fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--color-inky-moss, #2d3d2b)", cursor: "pointer", WebkitAppearance: "none", appearance: "none" }}>
              Save
            </button>
            <button onClick={cancel}
              style={{ flex: 1, padding: "12px 0", background: "transparent", border: "1px solid rgba(45,61,43,0.22)", borderRadius: 0, fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 400, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--color-pebble, #7a7a7a)", cursor: "pointer", WebkitAppearance: "none", appearance: "none" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- SKIN HISTORY (medical + clinical context) -------------------------------

const COMMON_SENSITIVITIES = ["Fragrance", "Essential oils", "Alcohol", "Silicones", "Sulfates", "Lanolin", "Latex", "Nut oils", "Parabens"];

function SkinHistory({ user, onUpdateUser }) {
  const history = user?.medicalHistory || {};
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    onTretinoin: history.onTretinoin || false,
    tretinoinStrength: history.tretinoinStrength || "",
    accutaneHistory: history.accutaneHistory || false,
    accutaneEndYear: history.accutaneEndYear || "",
    prescriptions: history.prescriptions || [],
    sensitivities: history.sensitivities || [],
    newRx: "",
    dermaVisits: history.dermaVisits || [],
    newVisitDate: "",
    newVisitNote: "",
  });

  const toggleSensitivity = (s) => setDraft(d => ({
    ...d,
    sensitivities: d.sensitivities.includes(s) ? d.sensitivities.filter(x => x !== s) : [...d.sensitivities, s],
  }));

  const addRx = () => {
    if (!draft.newRx.trim()) return;
    setDraft(d => ({ ...d, prescriptions: [...d.prescriptions, { name: d.newRx.trim(), addedAt: new Date().toISOString() }], newRx: "" }));
  };

  const addVisit = () => {
    if (!draft.newVisitDate) return;
    setDraft(d => ({ ...d, dermaVisits: [...d.dermaVisits, { date: d.newVisitDate, note: d.newVisitNote.trim() }].sort((a,b) => b.date.localeCompare(a.date)), newVisitDate: "", newVisitNote: "" }));
  };

  const save = () => {
    const { newRx, newVisitDate, newVisitNote, ...clean } = draft;
    onUpdateUser({ ...user, medicalHistory: clean });
    setEditing(false);
  };

  const cancel = () => {
    setDraft({ onTretinoin: history.onTretinoin || false, tretinoinStrength: history.tretinoinStrength || "", accutaneHistory: history.accutaneHistory || false, accutaneEndYear: history.accutaneEndYear || "", prescriptions: history.prescriptions || [], sensitivities: history.sensitivities || [], newRx: "", dermaVisits: history.dermaVisits || [], newVisitDate: "", newVisitNote: "" });
    setEditing(false);
  };

  const hasSomeHistory = history.onTretinoin || history.accutaneHistory || (history.prescriptions||[]).length || (history.sensitivities||[]).length || (history.dermaVisits||[]).length;

  // Shared visual language with SkinProfileEditor.
  const summaryRow = (label, value) => (
    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 14, paddingBottom: 8, marginBottom: 8, borderBottom: "1px solid rgba(45,61,43,0.08)" }}>
      <span style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-inky-moss, #2d3d2b)", flexShrink: 0 }}>{label}</span>
      <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--color-ink, #1c1c1a)", textAlign: "right", lineHeight: 1.5 }}>{value}</span>
    </div>
  );
  const fieldLabel = (txt) => (
    <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--color-inky-moss, #2d3d2b)", margin: "0 0 8px" }}>{txt}</p>
  );
  const editInputStyle = {
    width: "100%", boxSizing: "border-box",
    background: "var(--color-ivory, #faf9f4)",
    border: "1px solid rgba(45,61,43,0.18)",
    borderRadius: 0, padding: "11px 14px",
    fontFamily: "var(--font-body)", fontSize: 13,
    color: "var(--color-ink, #1c1c1a)",
    caretColor: "var(--color-inky-moss, #2d3d2b)",
    outline: "none",
    WebkitAppearance: "none", appearance: "none",
    WebkitTapHighlightColor: "transparent",
  };
  const Pill = ({ on, tone, onClick, children }) => {
    const active = tone === "avoid"
      ? { color: "#8b7355", bg: "rgba(139,115,85,0.10)", border: "rgba(139,115,85,0.5)" }
      : { color: "#2d3d2b", bg: "rgba(45,61,43,0.12)", border: "var(--color-inky-moss, #2d3d2b)" };
    return (
      <button type="button" onClick={onClick}
        style={{
          padding: "6px 12px", borderRadius: 24,
          border: `1px solid ${on ? active.border : "rgba(45,61,43,0.35)"}`,
          background: on ? active.bg : "transparent",
          color: on ? active.color : "var(--color-inky-moss, #2d3d2b)",
          fontFamily: "var(--font-body)", fontSize: 11, fontWeight: on ? 700 : 400,
          cursor: "pointer", letterSpacing: "0.02em", transition: "all 0.18s",
          WebkitAppearance: "none", appearance: "none",
        }}>{children}</button>
    );
  };
  const smallAddButton = {
    padding: "0 18px", background: "transparent",
    border: "1.5px solid var(--color-inky-moss, #2d3d2b)", borderRadius: 0,
    fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 700,
    letterSpacing: "0.18em", textTransform: "uppercase",
    color: "var(--color-inky-moss, #2d3d2b)", cursor: "pointer",
    WebkitAppearance: "none", appearance: "none",
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--color-inky-moss, #2d3d2b)", margin: 0 }}>
          Skin History
        </p>
        {!editing && (
          <button onClick={() => setEditing(true)}
            style={{ background: "none", border: "none", fontFamily: "var(--font-body)", fontSize: 10, color: "var(--color-inky-moss, #2d3d2b)", cursor: "pointer", letterSpacing: "0.14em", textTransform: "uppercase", padding: 0 }}>
            Edit
          </button>
        )}
      </div>

      {!editing ? (
        <div style={{ background: "var(--color-ivory-shadow, #f0ebe0)", borderTop: "1px solid rgba(45,61,43,0.18)", padding: "18px 16px" }}>
          {!hasSomeHistory ? (
            <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--color-pebble, #7a7a7a)", margin: 0 }}>
              No history logged. Tap Edit to add prescriptions, sensitivities, or dermatologist visits.
            </p>
          ) : (
            <>
              {history.onTretinoin && summaryRow("Tretinoin", history.tretinoinStrength ? `${history.tretinoinStrength}%` : "Active")}
              {history.accutaneHistory && summaryRow("Accutane", history.accutaneEndYear ? `Ended ${history.accutaneEndYear}` : "On record")}
              {(history.prescriptions || []).map((rx, i) => summaryRow(i === 0 ? "Rx" : " ", rx.name))}
              {(history.sensitivities || []).length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, paddingBottom: 8, marginBottom: 8, borderBottom: "1px solid rgba(45,61,43,0.08)" }}>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-inky-moss, #2d3d2b)", flexShrink: 0, paddingTop: 3 }}>Sensitivities</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "flex-end" }}>
                    {history.sensitivities.map(s => (
                      <span key={s} style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(139,115,85,0.08)", border: "1px solid rgba(139,115,85,0.22)", fontFamily: "var(--font-body)", fontSize: 10, color: "#8b7355" }}>{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {(history.dermaVisits || []).slice(0, 2).map((v, i) => summaryRow(i === 0 ? "Derm Visit" : " ", `${v.date}${v.note ? ` — ${v.note}` : ""}`))}
            </>
          )}
        </div>
      ) : (
        <div style={{ background: "var(--color-ivory-shadow, #f0ebe0)", borderTop: "1px solid rgba(45,61,43,0.18)", padding: "18px 16px", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Tretinoin */}
          <div>
            {fieldLabel("Currently On Tretinoin")}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <Pill on={!draft.onTretinoin} tone="love" onClick={() => setDraft(d => ({ ...d, onTretinoin: false }))}>No</Pill>
              <Pill on={draft.onTretinoin} tone="love" onClick={() => setDraft(d => ({ ...d, onTretinoin: true }))}>Yes</Pill>
            </div>
            {draft.onTretinoin && (
              <input style={{ ...editInputStyle, marginTop: 10 }} placeholder="Strength e.g. 0.025, 0.05, 0.1"
                value={draft.tretinoinStrength}
                onChange={e => setDraft(d => ({ ...d, tretinoinStrength: e.target.value }))} />
            )}
          </div>

          {/* Accutane */}
          <div>
            {fieldLabel("Accutane History")}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <Pill on={!draft.accutaneHistory} tone="love" onClick={() => setDraft(d => ({ ...d, accutaneHistory: false }))}>No</Pill>
              <Pill on={draft.accutaneHistory} tone="love" onClick={() => setDraft(d => ({ ...d, accutaneHistory: true }))}>Yes</Pill>
            </div>
            {draft.accutaneHistory && (
              <input style={{ ...editInputStyle, marginTop: 10 }} placeholder="Year course ended e.g. 2021"
                value={draft.accutaneEndYear}
                onChange={e => setDraft(d => ({ ...d, accutaneEndYear: e.target.value }))} />
            )}
          </div>

          {/* Other prescriptions */}
          <div>
            {fieldLabel("Other Prescriptions")}
            {draft.prescriptions.map((rx, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--color-ink, #1c1c1a)" }}>{rx.name}</span>
                <button onClick={() => setDraft(d => ({ ...d, prescriptions: d.prescriptions.filter((_, j) => j !== i) }))}
                  aria-label="Remove prescription"
                  style={{ background: "none", border: "none", color: "var(--color-pebble, #7a7a7a)", cursor: "pointer", padding: "0 4px", display: "inline-flex", alignItems: "center" }}>
                  <Icon name="x" size={11} />
                </button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input style={editInputStyle} placeholder="e.g. Clindamycin, Spironolactone"
                value={draft.newRx}
                onChange={e => setDraft(d => ({ ...d, newRx: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && addRx()} />
              <button onClick={addRx} style={smallAddButton}>Add</button>
            </div>
          </div>

          {/* Sensitivities */}
          <div>
            {fieldLabel("Known Sensitivities")}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {COMMON_SENSITIVITIES.map(s => (
                <Pill key={s} on={draft.sensitivities.includes(s)} tone="avoid" onClick={() => toggleSensitivity(s)}>{s}</Pill>
              ))}
            </div>
          </div>

          {/* Dermatologist visits */}
          <div>
            {fieldLabel("Dermatologist Visits")}
            {draft.dermaVisits.slice(0, 3).map((v, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid rgba(45,61,43,0.08)" }}>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--color-ink, #1c1c1a)" }}>{v.date}{v.note ? ` — ${v.note}` : ""}</span>
                <button onClick={() => setDraft(d => ({ ...d, dermaVisits: d.dermaVisits.filter((_, j) => j !== i) }))}
                  aria-label="Remove visit"
                  style={{ background: "none", border: "none", color: "var(--color-pebble, #7a7a7a)", cursor: "pointer", padding: "0 4px", display: "inline-flex", alignItems: "center" }}>
                  <Icon name="x" size={11} />
                </button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input type="date" style={{ ...editInputStyle, flex: "0 0 auto", width: 150 }}
                value={draft.newVisitDate}
                onChange={e => setDraft(d => ({ ...d, newVisitDate: e.target.value }))} />
              <input style={editInputStyle} placeholder="Note e.g. prescribed adapalene"
                value={draft.newVisitNote}
                onChange={e => setDraft(d => ({ ...d, newVisitNote: e.target.value }))} />
              <button onClick={addVisit} style={smallAddButton}>Log</button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={save}
              style={{ flex: 1, padding: "12px 0", background: "transparent", border: "1.5px solid var(--color-inky-moss, #2d3d2b)", borderRadius: 0, fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--color-inky-moss, #2d3d2b)", cursor: "pointer", WebkitAppearance: "none", appearance: "none" }}>
              Save
            </button>
            <button onClick={cancel}
              style={{ flex: 1, padding: "12px 0", background: "transparent", border: "1px solid rgba(45,61,43,0.22)", borderRadius: 0, fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 400, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--color-pebble, #7a7a7a)", cursor: "pointer", WebkitAppearance: "none", appearance: "none" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileSheet({ user, products, locationData, setLocationData, locationDenied, setLocationDenied, onUpdateUser, onLogout, onClose }) {
  const [editingAccount, setEditingAccount] = useState(false);
  const [accountDraft, setAccountDraft] = useState({
    name: user?.name || "",
    email: user?.email || "",
    birthYear: user?.birthYear || "",
    birthMonth: user?.birthMonth || "",
    birthDay: user?.birthDay || "",
  });

  const saveAccount = () => {
    onUpdateUser({ ...user, ...accountDraft });
    setEditingAccount(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      >
      <div style={{ position: "absolute", inset: 0, background: "rgba(28,28,26,0.45)", backdropFilter: "blur(10px)" }} onClick={onClose} />
      <div style={{ position: "relative", background: "var(--color-ivory, #faf9f4)", width: "100%", maxWidth: 520, borderRadius: 0, maxHeight: "88vh", overflowY: "auto", zIndex: 1 }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
          <div style={{ width: 32, height: 3, borderRadius: 2, background: "rgba(45,61,43,0.18)" }} />
        </div>

        <div style={{ padding: "16px 24px 52px" }}>
          {/* Account */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: editingAccount ? 16 : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 32,
                  letterSpacing: "0.04em",
                  color: "var(--color-inky-moss, #2d3d2b)",
                  lineHeight: 1,
                  userSelect: "none",
                }}>
                  {(accountDraft.name || user?.name || "?").trim()[0].toUpperCase()}
                </span>
                <div>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: 16, fontWeight: 400, color: "var(--parchment)", margin: "0 0 2px" }}>{user?.name || "—"}</p>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: 0 }}>{user?.email || ""}</p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {!editingAccount && (
                  <button onClick={() => { setAccountDraft({ name: user?.name || "", email: user?.email || "", birthYear: user?.birthYear || "", birthMonth: user?.birthMonth || "", birthDay: user?.birthDay || "" }); setEditingAccount(true); }}
                    style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-inky-moss, #2d3d2b)", background: "none", border: "none", cursor: "pointer" }}>
                    Edit
                  </button>
                )}
                <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "var(--color-pebble, #7a7a7a)", cursor: "pointer", padding: 4 }}><Icon name="x" size={18} /></button>
              </div>
            </div>

            {editingAccount && (() => {
              const inputStyle = {
                width: "100%", boxSizing: "border-box",
                background: "var(--color-ivory-shadow, #f0ebe0)",
                border: "1px solid rgba(45,61,43,0.14)",
                borderRadius: 0, padding: "11px 14px",
                fontFamily: "var(--font-body)", fontSize: 13,
                color: "var(--color-ink, #1c1c1a)",
                caretColor: "var(--color-inky-moss, #2d3d2b)",
                outline: "none",
                WebkitAppearance: "none", appearance: "none",
                WebkitTapHighlightColor: "transparent",
              };
              const labelStyle = { fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--color-inky-moss, #2d3d2b)", display: "block", marginBottom: 6 };
              return (
                <div style={{ background: "var(--color-ivory-shadow, #f0ebe0)", borderTop: "1px solid rgba(45,61,43,0.18)", padding: "18px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Name</label>
                    <input value={accountDraft.name} onChange={e => setAccountDraft(d => ({ ...d, name: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Email</label>
                    <input value={accountDraft.email} onChange={e => setAccountDraft(d => ({ ...d, email: e.target.value }))} type="email" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Birthday</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={accountDraft.birthYear} onChange={e => setAccountDraft(d => ({ ...d, birthYear: e.target.value }))} placeholder="Year" maxLength={4} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
                      <input
                        value={accountDraft.birthMonth && accountDraft.birthDay ? `${accountDraft.birthMonth}/${accountDraft.birthDay}` : accountDraft.birthMonth || ""}
                        onChange={e => {
                          const val = e.target.value.replace(/[^0-9/]/g, "");
                          const parts = val.split("/");
                          setAccountDraft(d => ({ ...d, birthMonth: parts[0] || "", birthDay: parts[1] || "" }));
                        }}
                        placeholder="MM / DD" maxLength={5} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <button onClick={saveAccount}
                      style={{ flex: 1, padding: "12px 0", background: "transparent", border: "1.5px solid var(--color-inky-moss, #2d3d2b)", borderRadius: 0, fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--color-inky-moss, #2d3d2b)", cursor: "pointer", WebkitAppearance: "none", appearance: "none" }}>
                      Save
                    </button>
                    <button onClick={() => setEditingAccount(false)}
                      style={{ flex: 1, padding: "12px 0", background: "transparent", border: "1px solid rgba(45,61,43,0.22)", borderRadius: 0, fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 400, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--color-pebble, #7a7a7a)", cursor: "pointer", WebkitAppearance: "none", appearance: "none" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 24 }}>
            {[["Products", products.length], ["Value", `$${products.reduce((s, p) => s + (p.price || 0), 0).toFixed(0)}`], ["Age Bracket", user?.skinAgeBracket || "—"]].map(([l, v]) => (
              <div key={l} style={{ background: "var(--ink)", border: "1px solid var(--border)", borderRadius: 8, padding: "14px 10px", textAlign: "center" }}>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 18, fontWeight: 200, color: "var(--parchment)", margin: "0 0 3px", letterSpacing: "-0.02em" }}>{v}</p>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--clay)", margin: 0 }}>{l}</p>
              </div>
            ))}
          </div>

          {/* Your Skin Profile — unified skin type, concerns, and all
              onboarding answers (goals, philosophy, climate, etc.) */}
          <SkinProfileEditor user={user} onUpdateUser={onUpdateUser} />

          {/* Skin History — medical context */}
          <SkinHistory user={user} onUpdateUser={onUpdateUser} />

          {/* Ingredient Profile — allergens + loved */}
          <IngredientProfile user={user} onUpdateUser={onUpdateUser} />

          {/* Location */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 10px" }}>Your Environment</p>
            <LocationManager locationData={locationData} setLocationData={setLocationData} locationDenied={locationDenied} setLocationDenied={setLocationDenied} />
          </div>

          {/* Sign out */}
          <button onClick={onLogout}
            style={{ width: "100%", padding: "13px 0", background: "transparent", color: "var(--color-inky-moss, #2d3d2b)", border: "1.5px solid var(--color-inky-moss, #2d3d2b)", borderRadius: 0, fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", cursor: "pointer", WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent" }}>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

// --- SWAN WELCOME SCREEN -----------------------------------------------------

export { ProfileSheet };