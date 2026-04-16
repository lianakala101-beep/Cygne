import { useState } from "react";
import { LOGO_SRC } from "./components.jsx";

/** Compress an image file to JPEG, max 800px on longest side, keeps output well under 1MB */
export async function compressImage(file, maxDim = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      console.log("[Cygne compress] original:", width, "x", height, "file size:", file.size);
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const b64 = dataUrl.split(",")[1];
      console.log("[Cygne compress] resized:", width, "x", height, "base64 length:", b64.length, "(~" + Math.round(b64.length * 0.75 / 1024) + "KB)");
      URL.revokeObjectURL(img.src);
      resolve(b64);
    };
    img.onerror = (e) => { URL.revokeObjectURL(img.src); reject(e); };
    img.src = URL.createObjectURL(file);
  });
}


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
    setStoredValue(prev => {
      try {
        const next = typeof value === "function" ? value(prev) : value;
        localStorage.setItem(key, JSON.stringify(next));
        return next;
      } catch { return typeof value === "function" ? value(prev) : value; }
    });
  };
  return [storedValue, setValue];
}

const DEMO_VERSION = "3";
const DEMO_PRODUCTS = [
  { id: "demo1", brand: "CeraVe", name: "Hydrating Facial Cleanser", category: "Cleanser", ingredients: ["water", "glycerin", "ceramide np", "ceramide ap", "ceramide eg", "hyaluronic acid", "niacinamide"], inRoutine: true, session: "both", frequency: "daily", price: 16, isDemo: true },
  { id: "demo2", brand: "Paula's Choice", name: "C15 Super Booster", category: "Serum", ingredients: ["ascorbic acid", "vitamin c", "ferulic acid", "vitamin e", "tocopherol", "hyaluronic acid"], inRoutine: true, session: "am", frequency: "daily", price: 49, isDemo: true },
  { id: "demo3", brand: "The Ordinary", name: "Granactive Retinoid 2% Emulsion", category: "Serum", ingredients: ["retinol", "hydroxypinacolone retinoate", "squalane", "glycerin", "hyaluronic acid"], inRoutine: true, session: "pm", frequency: "alternating", price: 14, routineStartDate: new Date(Date.now() - 14*86400000).toISOString().split("T")[0], rampWeek: 3, isDemo: true },
  { id: "demo4", brand: "La Roche-Posay", name: "Anthelios Melt-In Sunscreen SPF 60", category: "SPF", ingredients: ["avobenzone", "homosalate", "octisalate", "octocrylene", "glycerin", "niacinamide"], inRoutine: true, session: "am", frequency: "daily", price: 38, isDemo: true },
  { id: "demo5", brand: "CeraVe", name: "Moisturizing Cream", category: "Moisturizer", ingredients: ["ceramide np", "ceramide ap", "ceramide eg", "hyaluronic acid", "cholesterol", "glycerin", "petrolatum"], inRoutine: true, session: "both", frequency: "daily", price: 19, isDemo: true },
  { id: "demo6", brand: "Paula's Choice", name: "Skin Perfecting 2% BHA Liquid", category: "Toning Pad", ingredients: ["salicylic acid", "niacinamide", "methylpropanediol", "green tea extract"], inRoutine: true, session: "pm", frequency: "alternating", price: 34, routineStartDate: new Date(Date.now() - 21*86400000).toISOString().split("T")[0], rampWeek: 4, isDemo: true },
  { id: "demo7", brand: "The Ordinary", name: "Hyaluronic Acid 2% + B5", category: "Serum", ingredients: ["hyaluronic acid", "sodium hyaluronate", "panthenol", "vitamin b5", "glycerin"], inRoutine: true, session: "both", frequency: "daily", price: 9, isDemo: true },
];


// --- SHARED LOCAL DATE HELPERS ---------------------------------------------
// Use local midnight (not UTC) so cycle & treatment tracking advance at the
// user's local midnight, not UTC midnight.
function toLocalMidnight(d) {
  const date = d instanceof Date ? d : new Date(d);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
function daysBetweenLocal(startIso, nowDate = new Date()) {
  if (!startIso) return 0;
  const startMs = toLocalMidnight(startIso);
  const nowMs = toLocalMidnight(nowDate);
  return Math.floor((nowMs - startMs) / 86400000);
}
// Current cycle day from user.cycleStartDate. Parsed as LOCAL date.
// Day 1 = cycle start date; wraps every 28 days.
function getCurrentCycleDay(user) {
  if (!user) return null;
  if (user.cycleStartDate) {
    // Parse stored ISO as local date
    const start = new Date(user.cycleStartDate);
    const startLocal = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const today = new Date();
    const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diffDays = Math.floor((todayLocal.getTime() - startLocal.getTime()) / (1000 * 60 * 60 * 24));
    const rawDay = diffDays + 1;
    const day = ((rawDay - 1) % 28 + 28) % 28 + 1;
    // eslint-disable-next-line no-console
    console.log("[Cygne cycle]", {
      cycleStartDate: user.cycleStartDate,
      startLocal: startLocal.toString(),
      todayLocal: todayLocal.toString(),
      diffDays,
      rawDay,
      wrappedDay: day,
    });
    return day;
  }
  return user.cycleDay || null;
}
// Days elapsed since treatment (1-indexed: day 1 = day of treatment).
function getTreatmentElapsed(treatmentDate) {
  return daysBetweenLocal(treatmentDate) + 1;
}

export { SwanWelcomeScreen, useLocalStorage, DEMO_PRODUCTS, DEMO_VERSION, daysBetweenLocal, getCurrentCycleDay, getTreatmentElapsed, toLocalMidnight };