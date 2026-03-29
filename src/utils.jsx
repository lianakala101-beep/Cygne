import { useState } from "react";
import { LOGO_SRC } from "./components.jsx";


function SwanWelcomeScreen({ user, onDone }) {
  const name = user?.name && user.name !== "Friend" ? user.name.split(" ")[0] : null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "#3a4134", display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "space-between", padding: "72px 36px 64px", zIndex: 500 }}>
      <div>
        <span style={{ fontSize: 48, lineHeight: 1, display: "block", marginBottom: 32 }}>🦢</span>
        <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(232,226,217,0.5)", margin: "0 0 14px" }}>
          {name ? "Welcome, " + name + "." : "Welcome."}
        </p>
        <h1 style={{ fontFamily: "Reenie Beanie, cursive", fontSize: 44, fontWeight: 400, color: "rgba(232,226,217,0.95)", margin: "0 0 20px", lineHeight: 1.15 }}>
          Your ritual starts here.
        </h1>
        <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 13, color: "rgba(232,226,217,0.55)", lineHeight: 1.7, maxWidth: 320 }}>
          Add the products already on your shelf. Cygne will build your ritual, sequence your steps, and start learning your skin.
        </p>
      </div>
      <div style={{ width: "100%" }}>
        <p style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 10, color: "rgba(232,226,217,0.35)", letterSpacing: "0.06em", marginBottom: 16, textAlign: "center" }}>
          Takes about 2 minutes
        </p>
        <button onClick={onDone}
          style={{ width: "100%", padding: "16px 0", background: "rgba(232,226,217,0.12)", border: "1px solid rgba(232,226,217,0.2)", borderRadius: 14, fontFamily: "Space Grotesk, sans-serif", fontSize: 14, fontWeight: 600, color: "rgba(232,226,217,0.9)", cursor: "pointer", letterSpacing: "0.04em" }}>
          Add my products →
        </button>
      </div>
    </div>
  );
}

// --- LOCAL STORAGE HOOK ------------------------------------------------------

function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = localStorage.getItem(key);
      return item !== null ? JSON.parse(item) : initialValue;
    } catch { return initialValue; }
  });
  const setValue = (value) => {
    try {
      const next = typeof value === "function" ? value(storedValue) : value;
      setStoredValue(next);
      localStorage.setItem(key, JSON.stringify(next));
    } catch { setStoredValue(value); }
  };
  return [storedValue, setValue];
}

const DEMO_VERSION = "3";
const DEMO_PRODUCTS = [
  { id: "demo1", brand: "CeraVe", name: "Hydrating Facial Cleanser", category: "Cleanser", ingredients: ["water", "glycerin", "ceramide np", "ceramide ap", "ceramide eg", "hyaluronic acid", "niacinamide"], inRoutine: true, session: "auto", frequency: "daily", price: 16, isDemo: true },
  { id: "demo2", brand: "Paula's Choice", name: "C15 Super Booster", category: "Serum", ingredients: ["ascorbic acid", "vitamin c", "ferulic acid", "vitamin e", "tocopherol", "hyaluronic acid"], inRoutine: true, session: "am", frequency: "daily", price: 49, isDemo: true },
  { id: "demo3", brand: "The Ordinary", name: "Granactive Retinoid 2% Emulsion", category: "Serum", ingredients: ["retinol", "hydroxypinacolone retinoate", "squalane", "glycerin", "hyaluronic acid"], inRoutine: true, session: "pm", frequency: "alternating", price: 14, routineStartDate: new Date(Date.now() - 14*86400000).toISOString().split("T")[0], rampWeek: 3, isDemo: true },
  { id: "demo4", brand: "La Roche-Posay", name: "Anthelios Melt-In Sunscreen SPF 60", category: "SPF", ingredients: ["avobenzone", "homosalate", "octisalate", "octocrylene", "glycerin", "niacinamide"], inRoutine: true, session: "am", frequency: "daily", price: 38, isDemo: true },
  { id: "demo5", brand: "CeraVe", name: "Moisturizing Cream", category: "Moisturizer", ingredients: ["ceramide np", "ceramide ap", "ceramide eg", "hyaluronic acid", "cholesterol", "glycerin", "petrolatum"], inRoutine: true, session: "auto", frequency: "daily", price: 19, isDemo: true },
  { id: "demo6", brand: "Paula's Choice", name: "Skin Perfecting 2% BHA Liquid", category: "Toning Pad", ingredients: ["salicylic acid", "niacinamide", "methylpropanediol", "green tea extract"], inRoutine: true, session: "pm", frequency: "alternating", price: 34, routineStartDate: new Date(Date.now() - 21*86400000).toISOString().split("T")[0], rampWeek: 4, isDemo: true },
  { id: "demo7", brand: "The Ordinary", name: "Hyaluronic Acid 2% + B5", category: "Serum", ingredients: ["hyaluronic acid", "sodium hyaluronate", "panthenol", "vitamin b5", "glycerin"], inRoutine: true, session: "auto", frequency: "daily", price: 9, isDemo: true },
];


export { SwanWelcomeScreen, useLocalStorage, DEMO_PRODUCTS, DEMO_VERSION };