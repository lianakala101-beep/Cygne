import { useState, useRef, useEffect } from "react";
import { Pill, Icon, LOGO_SRC } from "./components.jsx";


const SKIN_TYPES = ["Dry", "Oily", "Combination", "Sensitive", "Normal"];
const SKIN_CONCERNS = ["Acne", "Hyperpigmentation", "Redness", "Fine lines", "Texture", "Dehydration", "Dullness", "Sensitivity"];
const KNOWN_ACTIVES = ["Retinol", "AHA", "BHA", "Vitamin C", "Niacinamide", "Peptides", "Hyaluronic Acid", "None yet"];

function getSkinAgeContext(birthYear) {
  if (!birthYear) return null;
  const age = new Date().getFullYear() - parseInt(birthYear);
  if (age < 25) return { bracket: "Early 20s", note: "Skin is resilient and recovering fast. Focus on SPF, prevention, and building good habits." };
  if (age < 30) return { bracket: "Late 20s", note: "Collagen production begins to slow. Vitamin C and consistent SPF become high-value investments." };
  if (age < 40) return { bracket: "30s", note: "Retinoids deliver the most measurable results at this stage. Hydration and barrier support become essential." };
  if (age < 50) return { bracket: "40s", note: "Barrier function shifts. Richer occlusives, peptides, and consistent actives drive visible change." };
  return { bracket: "50s+", note: "Lipid replenishment and barrier reinforcement are the highest priorities. Gentler frequencies for actives." };
}

function OnboardingScreen({ onComplete, setLocationData }) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [animating, setAnimating] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [skinType, setSkinType] = useState("");
  const [concerns, setConcerns] = useState([]);
  const [actives, setActives] = useState([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationSet, setLocationSet] = useState(false);
  const [resetDay, setResetDay] = useState(0); // 0 = Sunday

  const TOTAL_STEPS = 8;

  const advance = (n = 1) => {
    if (animating) return;
    setDirection(n);
    setAnimating(true);
    setTimeout(() => { setStep(s => s + n); setAnimating(false); }, 260);
  };

  const requestLocation = () => {
    if (!navigator.geolocation) return;
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lon } = pos.coords;
          const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
          const geoData = await geoRes.json();
          const city = geoData.address?.city || geoData.address?.town || geoData.address?.suburb || "Your location";
          const country = geoData.address?.country_code?.toUpperCase() || "";
          setLocationData({ lat, lon, city, country });
          setLocationSet(true);
        } catch(e) {}
        setLocationLoading(false);
      },
      () => setLocationLoading(false)
    );
  };

  const handleComplete = () => {
    const skinAge = getSkinAgeContext(birthYear);
    onComplete({
      name: name || "Friend",
      birthYear: birthYear || null,
      birthMonth: birthMonth || null,
      birthDay: birthDay || null,
      skinType,
      concerns,
      knownActives: actives,
      skinAgeBracket: skinAge?.bracket || null,
      resetDay,
    });
  };

  const skinAge = getSkinAgeContext(birthYear);
  const progress = (step / (TOTAL_STEPS - 1)) * 100;

  const slideStyle = {
    opacity: animating ? 0 : 1,
    transform: animating ? `translateX(${direction > 0 ? "18px" : "-18px"})` : "translateX(0)",
    transition: "opacity 0.26s ease, transform 0.26s ease",
  };

  // Shared pill selector
  const PillSelect = ({ options, selected, onToggle, single = false }) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map(opt => {
        const active = single ? selected === opt : selected.includes(opt);
        return (
          <button key={opt} onClick={() => onToggle(opt)}
            style={{ padding: "10px 18px", borderRadius: 24, border: `1px solid ${active ? "rgba(122,144,112,0.7)" : "var(--border)"}`, background: active ? "rgba(122,144,112,0.12)" : "var(--surface)", color: active ? "#5a7a60" : "#6b5a43", fontFamily: "var(--font-body)", fontSize: 12, fontWeight: active ? 600 : 400, cursor: "pointer", transition: "all 0.18s", letterSpacing: "0.02em" }}>
            {opt}
          </button>
        );
      })}
    </div>
  );

  const steps = [
    // 0 — Name
    <div key="name" style={slideStyle}>
      <p style={obEyebrow}>Welcome to Cygne</p>
      <h2 style={obHeading}>What should we call you?</h2>
      <p style={obSub}>Your ritual will be built around you.</p>
      <div style={{ marginTop: 32 }}>
        <input style={{ ...inputSt, fontSize: 22, fontFamily: "var(--font-signature)", letterSpacing: "0.02em", padding: "14px 16px" }} value={name} onChange={e => setName(e.target.value)} placeholder="Your first name" autoFocus />
      </div>
    </div>,

    // 1 — Birthday
    <div key="birthday" style={slideStyle}>
      <p style={obEyebrow}>Your skin story</p>
      <h2 style={obHeading}>When were you born?</h2>
      <p style={obSub}>Your birth year helps calibrate advice to your skin's life stage. Month and day are optional — for a birthday message.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 32 }}>
        <div><label style={labelSt}>Birth year <span style={{ opacity: 0.5 }}>required</span></label>
          <input style={inputSt} type="number" min="1940" max="2010" value={birthYear} onChange={e => setBirthYear(e.target.value)} placeholder="1990" /></div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}><label style={labelSt}>Month <span style={{ opacity: 0.5 }}>optional</span></label>
            <input style={inputSt} type="number" min="1" max="12" value={birthMonth} onChange={e => setBirthMonth(e.target.value)} placeholder="MM" /></div>
          <div style={{ flex: 1 }}><label style={labelSt}>Day <span style={{ opacity: 0.5 }}>optional</span></label>
            <input style={inputSt} type="number" min="1" max="31" value={birthDay} onChange={e => setBirthDay(e.target.value)} placeholder="DD" /></div>
        </div>
      </div>
      {skinAge && (
        <div style={{ marginTop: 20, padding: "13px 16px", background: "rgba(122,144,112,0.08)", border: "1px solid rgba(122,144,112,0.25)", borderRadius: 12 }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6e8a72", margin: "0 0 5px" }}>{skinAge.bracket}</p>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: 0, lineHeight: 1.65 }}>{skinAge.note}</p>
        </div>
      )}
    </div>,

    // 2 — Skin type
    <div key="skintype" style={slideStyle}>
      <p style={obEyebrow}>Your skin</p>
      <h2 style={obHeading}>How does your skin behave?</h2>
      <p style={obSub}>Be honest — this is just between you and the swan.</p>
      <div style={{ marginTop: 32 }}>
        <PillSelect options={SKIN_TYPES} selected={skinType} onToggle={v => setSkinType(v === skinType ? "" : v)} single={true} />
      </div>
    </div>,

    // 3 — Concerns
    <div key="concerns" style={slideStyle}>
      <p style={obEyebrow}>Your skin</p>
      <h2 style={obHeading}>What are you working on?</h2>
      <p style={obSub}>Select everything that applies. Cygne will flag gaps and tailor what it tells you.</p>
      <div style={{ marginTop: 32 }}>
        <PillSelect options={SKIN_CONCERNS} selected={concerns}
          onToggle={v => setConcerns(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])} />
      </div>
    </div>,

    // 4 — Current actives
    <div key="actives" style={slideStyle}>
      <p style={obEyebrow}>Your ritual</p>
      <h2 style={obHeading}>Any actives already in your routine?</h2>
      <p style={obSub}>Even if you haven't added them yet. This helps Cygne understand where you're starting from.</p>
      <div style={{ marginTop: 32 }}>
        <PillSelect options={KNOWN_ACTIVES} selected={actives}
          onToggle={v => {
            if (v === "None yet") { setActives(["None yet"]); return; }
            setActives(prev => {
              const filtered = prev.filter(x => x !== "None yet");
              return filtered.includes(v) ? filtered.filter(x => x !== v) : [...filtered, v];
            });
          }} />
      </div>
    </div>,

    // 5 — Location
    <div key="location" style={slideStyle}>
      <p style={obEyebrow}>Your environment</p>
      <h2 style={obHeading}>Where are you based?</h2>
      <p style={obSub}>Cygne uses local humidity, UV index, and temperature to adjust your daily ritual advice. Your location is never shared.</p>
      <div style={{ marginTop: 32 }}>
        {locationSet ? (
          <div style={{ padding: "16px 18px", background: "rgba(122,144,112,0.1)", border: "1px solid rgba(122,144,112,0.3)", borderRadius: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#6e8a72" }} />
              <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#6e8a72", margin: 0, fontWeight: 500 }}>Location enabled</p>
            </div>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: "6px 0 0" }}>Your environment data will appear on the home screen.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button onClick={requestLocation}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "13px 20px", background: "rgba(122,144,112,0.10)", border: "1px solid rgba(122,144,112,0.3)", borderRadius: 12, fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "#6e8a72", cursor: "pointer", letterSpacing: "0.08em", transition: "all 0.2s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(122,144,112,0.18)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(122,144,112,0.08)"}>
              <Icon name="target" size={14} />
              {locationLoading ? "Requesting..." : "Enable Location"}
            </button>
            <button onClick={() => advance(1)}
              style={{ background: "none", border: "none", fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", cursor: "pointer", padding: "8px 0", letterSpacing: "0.06em", opacity: 0.6 }}>
              Skip for now
            </button>
          </div>
        )}
      </div>
    </div>,

    // 6 — Reset day
    <div key="resetday" style={slideStyle}>
      <p style={obEyebrow}>Your weekly reset</p>
      <h2 style={obHeading}>When does your week end?</h2>
      <p style={obSub}>Each week, Cygne will invite you to capture a reflection — a three-angle portrait that becomes part of your gallery. Choose the evening that feels like your reset.</p>
      <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {[
          { d: 0, label: "Sun" },
          { d: 1, label: "Mon" },
          { d: 2, label: "Tue" },
          { d: 3, label: "Wed" },
          { d: 4, label: "Thu" },
          { d: 5, label: "Fri" },
          { d: 6, label: "Sat" },
        ].map(({ d, label }) => {
          const active = resetDay === d;
          return (
            <button key={d} onClick={() => setResetDay(d)}
              style={{
                padding: "14px 0", borderRadius: 12,
                border: `1px solid ${active ? "rgba(122,144,112,0.7)" : "var(--border)"}`,
                background: active ? "rgba(122,144,112,0.15)" : "var(--surface)",
                color: active ? "#5a7a60" : "#6b5a43",
                fontFamily: "var(--font-body)", fontSize: 12,
                fontWeight: active ? 600 : 400, letterSpacing: "0.08em",
                textTransform: "uppercase", cursor: "pointer", transition: "all 0.18s",
              }}>
              {label}
            </button>
          );
        })}
      </div>
      <p style={{ ...obSub, marginTop: 18, fontSize: 11, opacity: 0.7 }}>
        You'll get a gentle nudge that evening: "The week is behind you. Let's capture your reflection."
      </p>
    </div>,

    // 7 — All set
    <div key="done" style={{ ...slideStyle, position: "fixed", inset: 0, background: "var(--color-ivory)", display: "flex", flexDirection: "column", justifyContent: "space-between", overflow: "hidden" }}>

      {/* Top — logo + welcome, matching splash layout */}
      <div style={{ padding: "72px 36px 0" }}>
        <img
          src={LOGO_SRC}
          alt="Cygne"
          style={{ height: 170, width: "auto", display: "block", filter: "brightness(1.25) contrast(1.05)", mixBlendMode: "lighten" }}
        />
        <p style={{ fontFamily: "var(--font-signature)", fontSize: 22, fontWeight: 400, color: "rgba(232,227,214,0.95)", margin: "6px 0 0 130px", letterSpacing: "0.05em", lineHeight: 1 }}>built around you</p>
      </div>

      {/* Bottom — welcome message + skin age + Enter button */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", padding: "0 36px 72px" }}>
        <p style={{ fontFamily: "var(--font-signature)", fontSize: 32, fontWeight: 400, color: "rgba(232,227,214,0.95)", margin: "0 0 6px", letterSpacing: "0.02em", lineHeight: 1.2 }}>
          {name ? `Welcome, ${name}.` : "Welcome."}
        </p>
        <p style={{ fontFamily: "var(--font-signature)", fontSize: 22, fontWeight: 400, color: "rgba(232,227,214,0.6)", margin: "0 0 24px", letterSpacing: "0.02em" }}>Your ritual begins.</p>
        {skinAge && (
          <div style={{ padding: "12px 16px", background: "rgba(232,227,214,0.06)", border: "1px solid rgba(232,227,214,0.15)", borderRadius: 12, marginBottom: 28, width: "100%" }}>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(122,144,112,0.9)", margin: "0 0 5px" }}>{skinAge.bracket}</p>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "rgba(232,227,214,0.55)", margin: 0, lineHeight: 1.7 }}>{skinAge.note}</p>
          </div>
        )}
        <button onClick={handleComplete}
          style={{ width: "100%", padding: "15px 0", background: "rgba(232,227,214,0.12)", color: "rgba(232,227,214,0.95)", border: "1px solid rgba(232,227,214,0.28)", borderRadius: 10, fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", cursor: "pointer", transition: "background 0.2s" }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(232,227,214,0.2)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(232,227,214,0.12)"}>
          Enter Cygne
        </button>
      </div>
    </div>,
  ];

  const canAdvance = [
    name.trim().length > 0,        // 0 — name
    birthYear.length === 4,        // 1 — birthday
    skinType.length > 0,           // 2 — skin type
    true,                          // 3 — concerns — optional
    true,                          // 4 — actives — optional
    true,                          // 5 — location — optional
    true,                          // 6 — reset day (has a default)
    true,                          // 7 — all set
  ];

  return (

        <div style={{ minHeight: "100vh", background: "#f5f2ee", display: "flex", flexDirection: "column", padding: "0 24px 40px", position: "relative", overflow: "hidden" }}>
      {/* Background blobs */}
      <div style={{ position: "absolute", top: "-20%", right: "-15%", width: 500, height: 500, borderRadius: "60% 40% 55% 45%", background: "rgba(232,226,217,0.25)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "-25%", left: "-10%", width: 440, height: 440, borderRadius: "45% 55% 40% 60%", background: "rgba(232,226,217,0.18)", pointerEvents: "none" }} />

      {/* Progress bar */}
      {step < TOTAL_STEPS - 1 && (
        <div style={{ position: "sticky", top: 0, zIndex: 10, paddingTop: 52, paddingBottom: 16, background: "#f5f2ee" }}>
          <div style={{ height: 1.5, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: "#6e8a72", borderRadius: 2, transition: "width 0.4s ease" }} />
          </div>
        </div>
      )}

      {/* Back button */}
      {step > 0 && step < TOTAL_STEPS - 1 && (
        <button onClick={() => advance(-1)}
          style={{ position: "absolute", top: 52, left: 24, background: "none", border: "none", color: "var(--clay)", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6, zIndex: 11 }}>
          <Icon name="chevron" size={12} style={{ transform: "rotate(180deg)" }} /> Back
        </button>
      )}

      {/* Step content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: step === 0 || step === TOTAL_STEPS - 1 ? "center" : "flex-start", paddingTop: step === 0 ? 0 : 20, maxWidth: 420, width: "100%", margin: "0 auto" }}>
        {steps[step]}
      </div>

      {/* Next button — not shown on location (step 5) or all-set (step 7) */}
      {step >= 0 && step < 5 && (
        <div style={{ position: "sticky", bottom: 0, background: "#f5f2ee", padding: "16px 24px 32px", marginTop: "auto" }}>
          <button onClick={() => canAdvance[step] && advance(1)}
            style={{ width: "100%", padding: "14px 0", background: canAdvance[step] ? "#6e8a72" : "#e0dbd5", color: canAdvance[step] ? "#0d0f0d" : "var(--clay)", border: `1px solid ${canAdvance[step] ? "transparent" : "var(--border)"}`, borderRadius: 10, fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", cursor: canAdvance[step] ? "pointer" : "default", transition: "all 0.2s", opacity: canAdvance[step] ? 1 : 0.5 }}>
            Continue
          </button>
          {step === 3 || step === 4 ? (
            <button onClick={() => advance(1)} style={{ width: "100%", marginTop: 10, background: "none", border: "none", fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", cursor: "pointer", padding: "8px 0", opacity: 0.5, letterSpacing: "0.06em" }}>Skip</button>
          ) : null}
        </div>
      )}
      {step === 5 && (
        <div style={{ maxWidth: 420, width: "100%", margin: "24px auto 0" }}>
          <button onClick={() => advance(1)}
            style={{ width: "100%", padding: "14px 0", background: "#6e8a72", color: "#0d0f0d", border: "none", borderRadius: 10, fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer" }}>
            Continue
          </button>
        </div>
      )}
      {step === 6 && (
        <div style={{ position: "sticky", bottom: 0, background: "#f5f2ee", padding: "16px 24px 32px", marginTop: "auto" }}>
          <button onClick={() => advance(1)}
            style={{ width: "100%", padding: "14px 0", background: "#6e8a72", color: "#0d0f0d", border: "none", borderRadius: 10, fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer" }}>
            Continue
          </button>
        </div>
      )}
    </div>
  );
}

// Onboarding text styles
const obEyebrow = { fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--clay)", margin: "0 0 10px" };
const obHeading = { fontFamily: "var(--font-signature)", fontSize: 36, fontWeight: 400, color: "var(--parchment)", margin: "0 0 8px", letterSpacing: "0.01em", lineHeight: 1.15 };
const obSub = { fontFamily: "var(--font-body)", fontSize: 12, color: "#6b5338", margin: 0, lineHeight: 1.7, opacity: 0.8 };
const inputSt = { width: "100%", padding: "12px 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontFamily: "var(--font-body)", fontSize: 14, color: "var(--parchment)", outline: "none" };
const labelSt = { fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay)", display: "block", marginBottom: 6 };


export { OnboardingScreen };
