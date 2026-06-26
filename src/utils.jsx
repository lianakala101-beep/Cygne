import { useState } from "react";
import { Icon } from "./components.jsx";

/** Compress an image file to JPEG, max 1080px on longest side, keeps output well under 1MB */
export async function compressImage(file, maxDim = 1080, quality = 0.82) {
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

/** Compress an image file to JPEG Blob, max 1080px wide, returns Blob for direct upload */
export async function compressImageBlob(file, maxWidth = 1080, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round(height * (maxWidth / width));
        width = maxWidth;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(img.src);
        if (blob) resolve(blob);
        else reject(new Error("canvas.toBlob returned null"));
      }, "image/jpeg", quality);
    };
    img.onerror = (e) => { URL.revokeObjectURL(img.src); reject(e); };
    img.src = URL.createObjectURL(file);
  });
}


function SwanWelcomeScreen({ user, onDone }) {
  const name = user?.name && user.name !== "Friend" ? user.name.split(" ")[0] : null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--color-inky-moss, #2d3d2b)", display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "space-between", padding: "72px 36px 64px", zIndex: 500 }}>
      <div>
        {/* Cygne logo — forced white via brightness(0) invert(1) so the
            PNG paints against the dark inky-moss canvas. Replaces the
            previous standalone SwanIcon brand mark. */}
        <img
          src="/cygne-logo.png"
          alt="Cygne"
          style={{ height: 48, width: "auto", display: "block", marginBottom: 24, filter: "brightness(0) invert(1)" }}
        />
        <p style={{ fontFamily: "var(--font-body)", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255, 255, 255, 0.6)", margin: "0 0 14px" }}>
          {name ? "Welcome, " + name + "." : "Welcome."}
        </p>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 38, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--color-ivory, #faf9f4)", margin: "0 0 20px", lineHeight: 1.2 }}>
          Your ritual starts here.
        </h1>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "rgba(255, 255, 255, 0.6)", lineHeight: 1.7, maxWidth: 320 }}>
          Add the products already on your shelf. Cygne will build your ritual, sequence your steps, and start learning your skin.
        </p>
      </div>
      <div style={{ width: "100%" }}>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "rgba(255, 255, 255, 0.4)", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 16, textAlign: "center" }}>
          Takes about 2 minutes
        </p>
        <button onClick={onDone}
          style={{ width: "100%", padding: "15px 0", background: "transparent", border: "1px solid var(--color-ivory, #faf9f4)", borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--color-ivory, #faf9f4)", cursor: "pointer" }}>
          Add my products <Icon name="arrow-right" size={14} />
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

// --- SHARED LOCAL DATE HELPERS ---------------------------------------------
// Use local midnight (not UTC) so cycle & treatment tracking advance at the
// user's local midnight, not UTC midnight.
function toLocalMidnight(d) {
  // When given a "YYYY-MM-DD" (or "YYYY-MM-DDTHH:…") string, parse the date
  // portion as local — new Date("YYYY-MM-DD") is UTC midnight which shifts
  // one day back in negative-UTC-offset timezones.
  if (typeof d === "string") {
    const [year, month, day] = d.split("T")[0].split("-").map(Number);
    return new Date(year, month - 1, day).getTime();
  }
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
// Day 1 = cycle start date. No auto-wrap — when a period runs late the
// day count keeps climbing past user.cycleLength, capped at 45 so the
// input/display can't run away. The user explicitly resets (set day 1 →
// new cycleStartDate) when their next period actually starts. The
// CycleTracker UI surfaces a "running long" note once day > cycleLength.
function getCurrentCycleDay(user) {
  if (!user) return null;
  if (user.cycleStartDate) {
    // Parse stored date string as local midnight to avoid UTC-offset shifts.
    const [y, m, d] = user.cycleStartDate.split("T")[0].split("-").map(Number);
    const startLocal = new Date(y, m - 1, d);
    const today = new Date();
    const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diffDays = Math.floor((todayLocal.getTime() - startLocal.getTime()) / (1000 * 60 * 60 * 24));
    const rawDay = diffDays + 1;
    const day = Math.min(Math.max(rawDay, 1), 45);
    // eslint-disable-next-line no-console
    console.log("[Cygne cycle]", {
      cycleStartDate: user.cycleStartDate,
      startLocal: startLocal.toString(),
      todayLocal: todayLocal.toString(),
      diffDays,
      rawDay,
      resolvedDay: day,
    });
    return day;
  }
  return user.cycleDay || null;
}
// Days elapsed since treatment (1-indexed: day 1 = day of treatment).
function getTreatmentElapsed(treatmentDate) {
  return daysBetweenLocal(treatmentDate) + 1;
}

// ISO week of the year (1..53). Kept here (eagerly loaded) so App.jsx can use
// it without pulling in the lazy-loaded reflection.jsx chunk.
function isoWeekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// ISO week year — the year that "owns" this ISO week (may differ from calendar
// year at the boundary).
function isoWeekYear(d) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  return dt.getUTCFullYear();
}

// Age gate for Ask Cygne (the AI chat feature). Reads the birth fields
// onboarding writes onto the `user` object (birthYear / birthMonth /
// birthDay; the brief refers to skinProfile.birthYear but the actual
// storage path is user.birthYear). Returns one of three states the UI
// can branch on:
//
//   'available' — user is 17+; show every Ask Cygne entry point as usual
//   'underage'  — user is < 17; hide every Ask Cygne entry point entirely
//                 (per brief: "not even a locked/disabled state")
//   'unknown'   — birthYear missing or unparsable; show a "Add your birth
//                 year in Profile to unlock Ask Cygne" prompt in place of
//                 the primary entry point. Fail-closed (no AI access
//                 until they fill it in).
//
// Age is recomputed on every call — no caching — so a user whose birthday
// passes while signed in flips from 16 → 17 on next render (the brief
// calls this out explicitly as the desired natural behavior).
//
// If birthMonth/birthDay are missing, fall back to (1, 1) per brief:
// "otherwise assume Jan 1 for a conservative estimate". That treats the
// birthday as having already happened this year for any sign-in after
// Jan 1, giving the user the benefit of the doubt rather than blocking
// late-year-birthday 17s through most of the year.
const ASK_CYGNE_MIN_AGE = 17;

function getAskCygneAccess(user) {
  if (!user) return "unknown";
  const yearStr = user.birthYear;
  if (yearStr === null || yearStr === undefined || yearStr === "") return "unknown";
  const y = parseInt(yearStr, 10);
  if (!Number.isFinite(y) || y < 1900 || y > 9999) return "unknown";
  const m = user.birthMonth ? parseInt(user.birthMonth, 10) : 1;
  const d = user.birthDay ? parseInt(user.birthDay, 10) : 1;
  const mm = Number.isFinite(m) && m >= 1 && m <= 12 ? m : 1;
  const dd = Number.isFinite(d) && d >= 1 && d <= 31 ? d : 1;
  const today = new Date();
  let age = today.getFullYear() - y;
  const todayM = today.getMonth() + 1;
  const todayD = today.getDate();
  // Subtract one if their birthday hasn't passed yet this calendar year.
  if (todayM < mm || (todayM === mm && todayD < dd)) {
    age -= 1;
  }
  return age >= ASK_CYGNE_MIN_AGE ? "available" : "underage";
}

export { SwanWelcomeScreen, useLocalStorage, daysBetweenLocal, getCurrentCycleDay, getTreatmentElapsed, toLocalMidnight, isoWeekNumber, isoWeekYear, getAskCygneAccess };