import { LocationManager } from "./progress.jsx";
import { useState, useRef } from "react";
import { Icon, Section } from "./components.jsx";
import { calcSpending } from "./engine.js";

function Profile({ user, products, onLogout, locationData, setLocationData, locationDenied, setLocationDenied }) {
  const spending = calcSpending(products);
  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--clay)", marginBottom: 6 }}>account</p>
        <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 32, fontWeight: 300, letterSpacing: "0.12em", color: "var(--parchment)", margin: "0 0 2px" }}>{user.name}</h2>
        <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 12, color: "var(--clay)", letterSpacing: "0.04em" }}>{user.email}</p>
      </div>

      {/* Your Skin section */}
      {(user.skinType || (user.concerns && user.concerns.length > 0) || user.skinAgeBracket) && (
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--clay)", marginBottom: 12 }}>Your Skin</p>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px" }}>
            {user.skinAgeBracket && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay)" }}>Age Bracket</span>
                <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--parchment)", fontWeight: 500 }}>{user.skinAgeBracket}</span>
              </div>
            )}
            {user.skinType && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: user.concerns?.length > 0 ? 12 : 0, paddingBottom: user.concerns?.length > 0 ? 12 : 0, borderBottom: user.concerns?.length > 0 ? "1px solid var(--border)" : "none" }}>
                <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay)" }}>Skin Type</span>
                <span style={{ padding: "4px 12px", borderRadius: 20, background: "rgba(122,144,112,0.10)", border: "1px solid rgba(122,144,112,0.3)", fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "#7a9070", fontWeight: 500 }}>{user.skinType}</span>
              </div>
            )}
            {user.concerns && user.concerns.length > 0 && (
              <div>
                <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 8px" }}>Concerns</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {user.concerns.map((c, i) => (
                    <span key={i} style={{ padding: "4px 12px", borderRadius: 20, background: "var(--ink)", border: "1px solid var(--border)", fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)" }}>{c}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 32 }}>
        {[["Products", products.length], ["Categories", new Set(products.map(p => p.category)).size], ["Value", `$${spending.total.toFixed(0)}`]].map(([l, v]) => (
          <div key={l} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 12px", textAlign: "center" }}>
            <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 24, fontWeight: 200, color: "var(--parchment)", margin: "0 0 4px", letterSpacing: "-0.02em" }}>{v}</p>
            <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--clay)", margin: 0 }}>{l}</p>
          </div>
        ))}
      </div>

      {/* Location */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--clay)", marginBottom: 12 }}>Your Environment</p>
        <LocationManager locationData={locationData} setLocationData={setLocationData} locationDenied={locationDenied} setLocationDenied={setLocationDenied} />
      </div>

      <Section title="About Cygne" icon="leaf">
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 20px" }}>
          <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 13, color: "var(--clay)", margin: "0 0 14px", lineHeight: 1.7 }}>
            Cygne transforms your product collection into a properly sequenced, conflict-free routine. Correct layering. Ingredient compatibility. Reduced redundancy.
          </p>
          <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: 0, opacity: 0.6, lineHeight: 1.6 }}>
            All analysis is rule-based and logic-driven. Product identification uses AI vision on upload. No chat, no social, no telehealth.
          </p>
        </div>
      </Section>

      <button onClick={onLogout}
        style={{ width: "100%", padding: "13px 0", background: "none", color: "var(--clay)", border: "1px solid var(--border)", borderRadius: 10, fontFamily: "Space Grotesk, sans-serif", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", cursor: "pointer", transition: "border-color 0.2s, color 0.2s" }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "#7a9070"; e.currentTarget.style.color = "#7a9070"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--clay)"; }}>
        Sign Out
      </button>
    </div>
  );
}


// --- PROFILE SHEET ------------------------------------------------------------

// --- SKIN EDITOR (sub-component for ProfileSheet) ----------------------------

function SkinEditor({ user, onUpdateUser }) {
  const [editing, setEditing] = useState(false);
  const [draftType, setDraftType] = useState(user?.skinType || "");
  const [draftConcerns, setDraftConcerns] = useState(user?.concerns || []);

  const toggleConcern = (c) => setDraftConcerns(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

  const save = () => {
    onUpdateUser({ ...user, skinType: draftType, concerns: draftConcerns });
    setEditing(false);
  };

  const cancel = () => {
    setDraftType(user?.skinType || "");
    setDraftConcerns(user?.concerns || []);
    setEditing(false);
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ fontFamily: "var(--sans)", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--clay)", margin: 0 }}>Your Skin</p>
        {!editing && (
          <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", fontFamily: "var(--sans)", fontSize: 10, color: "var(--sage)", cursor: "pointer", letterSpacing: "0.08em", padding: 0 }}>
            Edit
          </button>
        )}
      </div>

      {!editing ? (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
          {user?.skinType ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: user?.concerns?.length > 0 ? 10 : 0, paddingBottom: user?.concerns?.length > 0 ? 10 : 0, borderBottom: user?.concerns?.length > 0 ? "1px solid var(--border)" : "none" }}>
              <span style={{ fontFamily: "var(--sans)", fontSize: 10, color: "var(--clay)", letterSpacing: "0.06em" }}>Skin type</span>
              <span style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(122,144,112,0.10)", border: "1px solid rgba(122,144,112,0.3)", fontFamily: "var(--sans)", fontSize: 10, color: "var(--sage)", fontWeight: 500 }}>{user.skinType}</span>
            </div>
          ) : (
            <p style={{ fontFamily: "var(--sans)", fontSize: 11, color: "var(--clay)", margin: "0 0 8px", opacity: 0.5 }}>No skin type set.</p>
          )}
          {user?.concerns?.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {user.concerns.map((c, i) => (
                <span key={i} style={{ padding: "3px 10px", borderRadius: 20, background: "var(--ink)", border: "1px solid var(--border)", fontFamily: "var(--sans)", fontSize: 10, color: "var(--clay)" }}>{c}</span>
              ))}
            </div>
          ) : (
            <p style={{ fontFamily: "var(--sans)", fontSize: 11, color: "var(--clay)", margin: 0, opacity: 0.5 }}>No concerns set.</p>
          )}
        </div>
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid rgba(122,144,112,0.3)", borderRadius: 12, padding: "16px" }}>
          <p style={{ fontFamily: "var(--sans)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 10px", opacity: 0.7 }}>Skin type</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
            {SKIN_TYPES.map(t => {
              const active = draftType === t;
              return (
                <button key={t} onClick={() => setDraftType(active ? "" : t)} style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${active ? "rgba(122,144,112,0.55)" : "var(--border)"}`, background: active ? "rgba(122,144,112,0.18)" : "transparent", fontFamily: "var(--sans)", fontSize: 11, color: active ? "var(--parchment)" : "var(--clay)", fontWeight: active ? 600 : 400, cursor: "pointer", transition: "all 0.15s" }}>
                  {t}
                </button>
              );
            })}
          </div>
          <p style={{ fontFamily: "var(--sans)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 10px", opacity: 0.7 }}>Concerns</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
            {SKIN_CONCERNS.map(c => {
              const active = draftConcerns.includes(c);
              return (
                <button key={c} onClick={() => toggleConcern(c)} style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${active ? "rgba(122,144,112,0.55)" : "var(--border)"}`, background: active ? "rgba(122,144,112,0.18)" : "transparent", fontFamily: "var(--sans)", fontSize: 11, color: active ? "var(--parchment)" : "var(--clay)", fontWeight: active ? 600 : 400, cursor: "pointer", transition: "all 0.15s" }}>
                  {c}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={save} style={{ flex: 1, padding: "10px 0", background: "rgba(122,144,112,0.14)", border: "1px solid rgba(122,144,112,0.35)", borderRadius: 10, fontFamily: "var(--sans)", fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--sage)", cursor: "pointer" }}>Save</button>
            <button onClick={cancel} style={{ flex: 1, padding: "10px 0", background: "transparent", border: "1px solid var(--border)", borderRadius: 10, fontFamily: "var(--sans)", fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay)", cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}



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
  const inputStyle = { background: "var(--ink)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--parchment)", outline: "none" };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ fontFamily: "var(--sans)", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--clay)", margin: 0 }}>Ingredient Profile</p>
        {!editing && <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", fontFamily: "var(--sans)", fontSize: 10, color: "var(--sage)", cursor: "pointer", letterSpacing: "0.08em", padding: 0 }}>Edit</button>}
      </div>

      {!editing ? (
        <div style={{ background: "var(--ink)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
          {!hasAny ? (
            <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: 0, opacity: 0.5 }}>
              No ingredients flagged yet. Tap Edit to mark allergens and loved ingredients — Cygne will cross-reference them on every product.
            </p>
          ) : (
            <>
              {allergens.length > 0 && (
                <div style={{ marginBottom: loved.length > 0 ? 12 : 0 }}>
                  <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "#c06060", margin: "0 0 7px", opacity: 0.8 }}>Avoid</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {allergens.map(a => (
                      <span key={a} style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(192,96,96,0.08)", border: "1px solid rgba(192,96,96,0.22)", fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: "#c06060" }}>{a}</span>
                    ))}
                  </div>
                </div>
              )}
              {loved.length > 0 && (
                <div>
                  <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "#7a9070", margin: "0 0 7px", opacity: 0.8 }}>Love</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {loved.map(l => (
                      <span key={l} style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(122,144,112,0.08)", border: "1px solid rgba(122,144,112,0.22)", fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: "#7a9070" }}>{l}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid rgba(122,144,112,0.3)", borderRadius: 12, padding: "16px" }}>

          {/* Allergens */}
          <div style={{ marginBottom: 18 }}>
            <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "#c06060", margin: "0 0 10px", opacity: 0.9 }}>Avoid / Allergic to</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {COMMON_ALLERGENS.map(s => {
                const on = draftAllergens.includes(s);
                return (
                  <button key={s} onClick={() => toggleAllergen(s)}
                    style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${on ? "rgba(192,96,96,0.5)" : "var(--border)"}`, background: on ? "rgba(192,96,96,0.10)" : "transparent", fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: on ? "#c06060" : "var(--clay)", fontWeight: on ? 600 : 400, cursor: "pointer", transition: "all 0.15s" }}>
                    {s}
                  </button>
                );
              })}
              {draftAllergens.filter(a => !COMMON_ALLERGENS.includes(a)).map(a => (
                <button key={a} onClick={() => toggleAllergen(a)}
                  style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid rgba(192,96,96,0.5)", background: "rgba(192,96,96,0.10)", fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: "#c06060", fontWeight: 600, cursor: "pointer" }}>
                  {a} ×
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...inputStyle, flex: 1 }} placeholder="Add custom e.g. Benzophenone"
                value={customAllergen} onChange={e => setCustomAllergen(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addCustomAllergen()} />
              <button onClick={addCustomAllergen} style={{ padding: "8px 14px", background: "rgba(192,96,96,0.08)", border: "1px solid rgba(192,96,96,0.25)", borderRadius: 8, fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: "#c06060", cursor: "pointer" }}>Add</button>
            </div>
          </div>

          {/* Loved */}
          <div style={{ marginBottom: 18 }}>
            <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "#7a9070", margin: "0 0 10px", opacity: 0.9 }}>Love</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {COMMON_LOVED.map(s => {
                const on = draftLoved.includes(s);
                return (
                  <button key={s} onClick={() => toggleLoved(s)}
                    style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${on ? "rgba(122,144,112,0.5)" : "var(--border)"}`, background: on ? "rgba(122,144,112,0.10)" : "transparent", fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: on ? "#7a9070" : "var(--clay)", fontWeight: on ? 600 : 400, cursor: "pointer", transition: "all 0.15s" }}>
                    {s}
                  </button>
                );
              })}
              {draftLoved.filter(l => !COMMON_LOVED.includes(l)).map(l => (
                <button key={l} onClick={() => toggleLoved(l)}
                  style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid rgba(122,144,112,0.5)", background: "rgba(122,144,112,0.10)", fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: "#7a9070", fontWeight: 600, cursor: "pointer" }}>
                  {l} ×
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...inputStyle, flex: 1 }} placeholder="Add custom e.g. Tranexamic acid"
                value={customLoved} onChange={e => setCustomLoved(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addCustomLoved()} />
              <button onClick={addCustomLoved} style={{ padding: "8px 14px", background: "rgba(122,144,112,0.08)", border: "1px solid rgba(122,144,112,0.25)", borderRadius: 8, fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: "#7a9070", cursor: "pointer" }}>Add</button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={save} style={{ flex: 1, padding: "10px 0", background: "rgba(122,144,112,0.14)", border: "1px solid rgba(122,144,112,0.35)", borderRadius: 10, fontFamily: "var(--sans)", fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--sage)", cursor: "pointer" }}>Save</button>
            <button onClick={cancel} style={{ flex: 1, padding: "10px 0", background: "transparent", border: "1px solid var(--border)", borderRadius: 10, fontFamily: "var(--sans)", fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay)", cursor: "pointer" }}>Cancel</button>
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
  const rowStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--border)" };
  const labelStyle = { fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)" };
  const valStyle = { fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--parchment)", fontWeight: 500 };
  const inputStyle = { background: "var(--ink)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--parchment)", width: "100%", outline: "none" };
  const toggleBtnStyle = (on) => ({ padding: "5px 14px", borderRadius: 20, border: `1px solid ${on ? "rgba(122,144,112,0.5)" : "var(--border)"}`, background: on ? "rgba(122,144,112,0.14)" : "transparent", fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: on ? "var(--sage)" : "var(--clay)", fontWeight: on ? 600 : 400, cursor: "pointer", transition: "all 0.15s" });

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ fontFamily: "var(--sans)", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--clay)", margin: 0 }}>Skin History</p>
        {!editing && <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", fontFamily: "var(--sans)", fontSize: 10, color: "var(--sage)", cursor: "pointer", letterSpacing: "0.08em", padding: 0 }}>Edit</button>}
      </div>

      {!editing ? (
        <div style={{ background: "var(--ink)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
          {!hasSomeHistory ? (
            <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 11, color: "var(--clay)", margin: 0, opacity: 0.5 }}>No history logged. Tap Edit to add prescriptions, sensitivities, or dermatologist visits.</p>
          ) : (
            <>
              {history.onTretinoin && (
                <div style={rowStyle}>
                  <span style={labelStyle}>Tretinoin</span>
                  <span style={valStyle}>{history.tretinoinStrength ? `${history.tretinoinStrength}%` : "Active"}</span>
                </div>
              )}
              {history.accutaneHistory && (
                <div style={rowStyle}>
                  <span style={labelStyle}>Accutane history</span>
                  <span style={valStyle}>{history.accutaneEndYear ? `Ended ${history.accutaneEndYear}` : "On record"}</span>
                </div>
              )}
              {(history.prescriptions||[]).map((rx, i) => (
                <div key={i} style={rowStyle}>
                  <span style={labelStyle}>Rx</span>
                  <span style={valStyle}>{rx.name}</span>
                </div>
              ))}
              {(history.sensitivities||[]).length > 0 && (
                <div style={{ ...rowStyle, flexWrap: "wrap", gap: 6, alignItems: "flex-start", paddingTop: 10 }}>
                  <span style={{ ...labelStyle, width: "100%", marginBottom: 6 }}>Sensitivities</span>
                  {history.sensitivities.map(s => <span key={s} style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(192,96,96,0.08)", border: "1px solid rgba(192,96,96,0.2)", fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: "#c06060" }}>{s}</span>)}
                </div>
              )}
              {(history.dermaVisits||[]).slice(0,2).map((v, i) => (
                <div key={i} style={rowStyle}>
                  <span style={labelStyle}>Derm visit</span>
                  <span style={valStyle}>{v.date}{v.note ? ` — ${v.note}` : ""}</span>
                </div>
              ))}
            </>
          )}
        </div>
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid rgba(122,144,112,0.3)", borderRadius: 12, padding: "16px" }}>

          {/* Tretinoin */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={labelStyle}>Currently on tretinoin?</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button style={toggleBtnStyle(!draft.onTretinoin)} onClick={() => setDraft(d => ({ ...d, onTretinoin: false }))}>No</button>
                <button style={toggleBtnStyle(draft.onTretinoin)} onClick={() => setDraft(d => ({ ...d, onTretinoin: true }))}>Yes</button>
              </div>
            </div>
            {draft.onTretinoin && (
              <input style={inputStyle} placeholder="Strength e.g. 0.025, 0.05, 0.1" value={draft.tretinoinStrength}
                onChange={e => setDraft(d => ({ ...d, tretinoinStrength: e.target.value }))} />
            )}
          </div>

          {/* Accutane */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={labelStyle}>Accutane history?</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button style={toggleBtnStyle(!draft.accutaneHistory)} onClick={() => setDraft(d => ({ ...d, accutaneHistory: false }))}>No</button>
                <button style={toggleBtnStyle(draft.accutaneHistory)} onClick={() => setDraft(d => ({ ...d, accutaneHistory: true }))}>Yes</button>
              </div>
            </div>
            {draft.accutaneHistory && (
              <input style={inputStyle} placeholder="Year course ended e.g. 2021" value={draft.accutaneEndYear}
                onChange={e => setDraft(d => ({ ...d, accutaneEndYear: e.target.value }))} />
            )}
          </div>

          {/* Other prescriptions */}
          <div style={{ marginBottom: 16 }}>
            <p style={{ ...labelStyle, marginBottom: 8 }}>Other prescriptions</p>
            {draft.prescriptions.map((rx, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
                <span style={valStyle}>{rx.name}</span>
                <button onClick={() => setDraft(d => ({ ...d, prescriptions: d.prescriptions.filter((_, j) => j !== i) }))} style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", fontSize: 11, padding: "0 4px" }}>×</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <input style={{ ...inputStyle, flex: 1 }} placeholder="e.g. Clindamycin, Spironolactone" value={draft.newRx}
                onChange={e => setDraft(d => ({ ...d, newRx: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && addRx()} />
              <button onClick={addRx} style={{ padding: "8px 14px", background: "rgba(122,144,112,0.12)", border: "1px solid rgba(122,144,112,0.3)", borderRadius: 8, fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: "var(--sage)", cursor: "pointer" }}>Add</button>
            </div>
          </div>

          {/* Sensitivities */}
          <div style={{ marginBottom: 16 }}>
            <p style={{ ...labelStyle, marginBottom: 8 }}>Known sensitivities</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {COMMON_SENSITIVITIES.map(s => {
                const on = draft.sensitivities.includes(s);
                return <button key={s} onClick={() => toggleSensitivity(s)} style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${on ? "rgba(192,96,96,0.5)" : "var(--border)"}`, background: on ? "rgba(192,96,96,0.10)" : "transparent", fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: on ? "#c06060" : "var(--clay)", fontWeight: on ? 600 : 400, cursor: "pointer", transition: "all 0.15s" }}>{s}</button>;
              })}
            </div>
          </div>

          {/* Dermatologist visits */}
          <div style={{ marginBottom: 18 }}>
            <p style={{ ...labelStyle, marginBottom: 8 }}>Dermatologist visits</p>
            {draft.dermaVisits.slice(0,3).map((v, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: "var(--clay)" }}>{v.date}{v.note ? ` — ${v.note}` : ""}</span>
                <button onClick={() => setDraft(d => ({ ...d, dermaVisits: d.dermaVisits.filter((_, j) => j !== i) }))} style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", fontSize: 11, padding: "0 4px" }}>×</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input type="date" style={{ ...inputStyle, flex: "0 0 auto", width: 140 }} value={draft.newVisitDate}
                onChange={e => setDraft(d => ({ ...d, newVisitDate: e.target.value }))} />
              <input style={{ ...inputStyle, flex: 1 }} placeholder="Note e.g. prescribed adapalene" value={draft.newVisitNote}
                onChange={e => setDraft(d => ({ ...d, newVisitNote: e.target.value }))} />
              <button onClick={addVisit} style={{ padding: "8px 14px", background: "rgba(122,144,112,0.12)", border: "1px solid rgba(122,144,112,0.3)", borderRadius: 8, fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: "var(--sage)", cursor: "pointer" }}>Log</button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={save} style={{ flex: 1, padding: "10px 0", background: "rgba(122,144,112,0.14)", border: "1px solid rgba(122,144,112,0.35)", borderRadius: 10, fontFamily: "var(--sans)", fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--sage)", cursor: "pointer" }}>Save</button>
            <button onClick={cancel} style={{ flex: 1, padding: "10px 0", background: "transparent", border: "1px solid var(--border)", borderRadius: 10, fontFamily: "var(--sans)", fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay)", cursor: "pointer" }}>Cancel</button>
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
      <div style={{ position: "absolute", inset: 0, background: "var(--overlay)", backdropFilter: "blur(12px)" }} onClick={onClose} />
      <div style={{ position: "relative", background: "var(--surface)", width: "100%", maxWidth: 520, borderRadius: "22px 22px 0 0", border: "1px solid var(--border)", borderBottom: "none", maxHeight: "88vh", overflowY: "auto", zIndex: 1 }}>
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
          <div style={{ width: 32, height: 3, borderRadius: 2, background: "var(--border)" }} />
        </div>

        <div style={{ padding: "16px 24px 52px" }}>
          {/* Account */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: editingAccount ? 16 : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0, background: "rgba(122,144,112,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontFamily: "Reenie Beanie, cursive", fontSize: 28, color: "var(--sage)", lineHeight: 1 }}>
                    {(accountDraft.name || user?.name || "?").trim()[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <p style={{ fontFamily: "var(--sans)", fontSize: 16, fontWeight: 500, color: "var(--parchment)", margin: "0 0 2px" }}>{user?.name || "—"}</p>
                  <p style={{ fontFamily: "var(--sans)", fontSize: 11, color: "var(--clay)", margin: 0 }}>{user?.email || ""}</p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {!editingAccount && (
                  <button onClick={() => { setAccountDraft({ name: user?.name || "", email: user?.email || "", birthYear: user?.birthYear || "", birthMonth: user?.birthMonth || "", birthDay: user?.birthDay || "" }); setEditingAccount(true); }}
                    style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clay)", background: "none", border: "none", cursor: "pointer", opacity: 0.6 }}>
                    Edit
                  </button>
                )}
                <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--clay)", cursor: "pointer", padding: 4 }}><Icon name="x" size={18} /></button>
              </div>
            </div>

            {editingAccount && (
              <div style={{ background: "var(--ink)", border: "1px solid var(--border)", borderRadius: 13, padding: "16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--clay)", display: "block", marginBottom: 5 }}>Name</label>
                  <input value={accountDraft.name} onChange={e => setAccountDraft(d => ({ ...d, name: e.target.value }))}
                    style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontFamily: "Space Grotesk, sans-serif", fontSize: 13, color: "var(--parchment)", outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--clay)", display: "block", marginBottom: 5 }}>Email</label>
                  <input value={accountDraft.email} onChange={e => setAccountDraft(d => ({ ...d, email: e.target.value }))} type="email"
                    style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontFamily: "Space Grotesk, sans-serif", fontSize: 13, color: "var(--parchment)", outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--clay)", display: "block", marginBottom: 5 }}>Birthday</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={accountDraft.birthYear} onChange={e => setAccountDraft(d => ({ ...d, birthYear: e.target.value }))} placeholder="Year" maxLength={4}
                      style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontFamily: "Space Grotesk, sans-serif", fontSize: 13, color: "var(--parchment)", outline: "none", minWidth: 0 }} />
                    <input
                      value={accountDraft.birthMonth && accountDraft.birthDay ? `${accountDraft.birthMonth}/${accountDraft.birthDay}` : accountDraft.birthMonth || ""}
                      onChange={e => {
                        const val = e.target.value.replace(/[^0-9/]/g, "");
                        const parts = val.split("/");
                        setAccountDraft(d => ({ ...d, birthMonth: parts[0] || "", birthDay: parts[1] || "" }));
                      }}
                      placeholder="MM / DD" maxLength={5}
                      style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontFamily: "Space Grotesk, sans-serif", fontSize: 13, color: "var(--parchment)", outline: "none", minWidth: 0 }} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button onClick={saveAccount}
                    style={{ flex: 1, padding: "10px 0", background: "#7a9070", border: "none", borderRadius: 10, fontFamily: "Space Grotesk, sans-serif", fontSize: 12, fontWeight: 600, color: "var(--ink)", cursor: "pointer" }}>
                    Save
                  </button>
                  <button onClick={() => setEditingAccount(false)}
                    style={{ flex: 1, padding: "10px 0", background: "none", border: "1px solid var(--border)", borderRadius: 10, fontFamily: "Space Grotesk, sans-serif", fontSize: 12, color: "var(--clay)", cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 24 }}>
            {[["Products", products.length], ["Value", `$${products.reduce((s, p) => s + (p.price || 0), 0).toFixed(0)}`], ["Age Bracket", user?.skinAgeBracket || "—"]].map(([l, v]) => (
              <div key={l} style={{ background: "var(--ink)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 10px", textAlign: "center" }}>
                <p style={{ fontFamily: "var(--sans)", fontSize: 18, fontWeight: 200, color: "var(--parchment)", margin: "0 0 3px", letterSpacing: "-0.02em" }}>{v}</p>
                <p style={{ fontFamily: "var(--sans)", fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--clay)", margin: 0 }}>{l}</p>
              </div>
            ))}
          </div>

          {/* Your Skin — editable */}
          <SkinEditor user={user} onUpdateUser={onUpdateUser} />

          {/* Skin History — medical context */}
          <SkinHistory user={user} onUpdateUser={onUpdateUser} />

          {/* Ingredient Profile — allergens + loved */}
          <IngredientProfile user={user} onUpdateUser={onUpdateUser} />

          {/* Location */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontFamily: "var(--sans)", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 10px" }}>Your Environment</p>
            <LocationManager locationData={locationData} setLocationData={setLocationData} locationDenied={locationDenied} setLocationDenied={setLocationDenied} />
          </div>

          {/* Sign out */}
          <button onClick={onLogout}
            style={{ width: "100%", padding: "12px 0", background: "none", color: "var(--clay)", border: "1px solid var(--border)", borderRadius: 10, fontFamily: "var(--sans)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", cursor: "pointer", transition: "border-color 0.2s, color 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#c06060"; e.currentTarget.style.color = "#c06060"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--clay)"; }}>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

// --- SWAN WELCOME SCREEN -----------------------------------------------------

export { ProfileSheet };