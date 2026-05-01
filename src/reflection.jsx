import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./components.jsx";
import { supabase } from "./supabase.js";
import { getSwanSensePredictions } from "./swansense.jsx";
import { compressImageBlob } from "./utils.jsx";

// ---------------------------------------------------------------------------
// Reflection — a weekly triptych gallery of the user's skin journey.
// Inherits the app's color system via CSS variables so it reads the same
// in day/night mode as every other screen.
// ---------------------------------------------------------------------------

// Theme tokens — proxied to the global CSS variables defined in App.jsx.
const BG         = "var(--deep)";
const SURFACE_BG = "var(--ink)";
const TEXT       = "var(--parchment)";
const TEXT_SOFT  = "var(--clay)";
const BORDER     = "var(--border)";
const OVERLAY    = "var(--overlay)";
const CTA_BG     = "var(--cta)";
const CTA_BORDER = "rgba(160,160,160,0.40)";
const CURSIVE    = "var(--font-display)";
const SANS       = "var(--sans)";

const ANGLES = [
  { key: "front", label: "Front", hint: "Face the lens. Chin level, shoulders soft." },
  { key: "left",  label: "Tilt Left",  hint: "Turn your head gently to the left." },
  { key: "right", label: "Tilt Right", hint: "Turn your head gently to the right." },
];

// ISO week of the year (1..53). Used as the per-entry week number so the
// label wheel lines up with the seasons.
export function isoWeekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// ISO week year — the year that "owns" this ISO week (may differ from calendar year
// in the first/last days of January/December).
function isoWeekYear(d) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  return dt.getUTCFullYear();
}

// Monday of the given ISO week/year (UTC).
function isoWeekToMonday(weekNum, isoYear) {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - (day - 1));
  const result = new Date(week1Mon);
  result.setUTCDate(week1Mon.getUTCDate() + (weekNum - 1) * 7);
  return result;
}

// Sunday (last day) of the given ISO week/year (UTC).
function isoWeekToSunday(weekNum, isoYear) {
  const monday = isoWeekToMonday(weekNum, isoYear);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return sunday;
}

// Seasonal / lunar label for a given ISO week. The wheel is loosely calibrated
// against northern-hemisphere seasons so Week 12 lands on the vernal equinox.
export function weekLabel(weekNumber) {
  const n = ((weekNumber - 1) % 52 + 52) % 52 + 1;
  if (n === 1)              return "The First Light";
  if (n >= 2  && n <= 4)    return "Deep Winter";
  if (n >= 5  && n <= 7)    return "Stillness";
  if (n >= 8  && n <= 10)   return "The Thaw";
  if (n === 11)             return "First Stir";
  if (n === 12 || n === 13) return "The Equinox";
  if (n >= 14 && n <= 16)   return "First Bloom";
  if (n >= 17 && n <= 19)   return "Soft Rain";
  if (n >= 20 && n <= 24)   return "Long Days";
  if (n === 25 || n === 26) return "The Solstice";
  if (n >= 27 && n <= 30)   return "High Summer";
  if (n >= 31 && n <= 34)   return "Golden Hour";
  if (n >= 35 && n <= 37)   return "First Frost";
  if (n === 38 || n === 39) return "The Equinox";
  if (n >= 40 && n <= 43)   return "Leaves Falling";
  if (n >= 44 && n <= 47)   return "Fading Light";
  if (n >= 48 && n <= 50)   return "Deep Winter";
  return "The Longest Night";
}

// Lunar phase for a given date — names only, no glyphs.
export function getMoonPhase(date) {
  const phases = [
    "New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous",
    "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent",
  ];
  const synodicMonth = 29.53058867;
  const knownNewMoon = new Date("2000-01-06T18:14:00Z");
  const daysSince = (date - knownNewMoon) / (1000 * 60 * 60 * 24);
  const phase = ((daysSince % synodicMonth) + synodicMonth) % synodicMonth;
  const index = Math.round(phase / (synodicMonth / 8)) % 8;
  return phases[index];
}

function formatDateLong(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

// Load an image element from a data URL or blob URL.
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Stitch 3 images into a horizontal triptych, returning a JPEG data URL.
async function stitchTriptych(dataUrls, panelWidth = 520, panelHeight = 680) {
  const canvas = document.createElement("canvas");
  canvas.width = panelWidth * 3;
  canvas.height = panelHeight;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0f120f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 3; i++) {
    const img = await loadImage(dataUrls[i]);
    const ratio = Math.max(panelWidth / img.width, panelHeight / img.height);
    const w = img.width * ratio;
    const h = img.height * ratio;
    const x = i * panelWidth + (panelWidth - w) / 2;
    const y = (panelHeight - h) / 2;
    ctx.drawImage(img, x, y, w, h);
  }
  return canvas.toDataURL("image/jpeg", 0.82);
}

// Read a File into a data URL.
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Convert a data URL to a Blob for upload.
function dataUrlToBlob(dataUrl) {
  const [header, b64] = dataUrl.split(",");
  const mime = (header.match(/data:(.*?);/) || [])[1] || "image/jpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// Upload the stitched triptych to Supabase Storage and return a signed URL.
// We prefer signed URLs so the gallery works with private buckets + RLS
// (which is the right default for per-user photos). Falls back to a public
// URL, then to the inline data URL if storage isn't configured at all.
async function uploadTriptych(userId, entryId, dataUrl) {
  const blob = dataUrlToBlob(dataUrl);
  const path = `${userId}/${entryId}.jpg`;
  console.log("[Cygne reflection] uploading to reflections/" + path, "| size:", blob.size, "bytes");
  try {
    const { data: upData, error: upErr } = await supabase.storage
      .from("reflections")
      .upload(path, blob, { contentType: "image/jpeg", upsert: true });
    if (upErr) {
      console.warn("[Cygne reflection] upload error:", upErr.message, upErr);
      return { path: null, url: null, inline: dataUrl };
    }
    console.log("[Cygne reflection] upload ok:", upData);

    // Signed URL — works for private buckets scoped by RLS.
    const { data: signed, error: signedErr } = await supabase.storage
      .from("reflections")
      .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year
    if (signed?.signedUrl) {
      console.log("[Cygne reflection] signed URL:", signed.signedUrl);
      return { path, url: signed.signedUrl };
    }
    console.warn("[Cygne reflection] createSignedUrl error:", signedErr?.message || "no url");

    // Public URL fallback (only works if bucket is public).
    const { data: pub } = supabase.storage.from("reflections").getPublicUrl(path);
    if (pub?.publicUrl) {
      console.log("[Cygne reflection] public URL:", pub.publicUrl);
      return { path, url: pub.publicUrl };
    }
    console.warn("[Cygne reflection] no URL available after upload — falling back to inline");
    return { path, url: null, inline: dataUrl };
  } catch (e) {
    console.warn("[Cygne reflection] storage upload failed, falling back to inline:", e?.message || e);
    return { path: null, url: null, inline: dataUrl };
  }
}

// Re-generate a fresh signed URL for an entry on load. Signed URLs expire,
// so we refresh them each session rather than trusting whatever was stored.
async function refreshSignedUrl(path) {
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage
      .from("reflections")
      .createSignedUrl(path, 60 * 60 * 24 * 7); // 1 week
    if (error) {
      console.warn("[Cygne reflection] refresh signed URL error for", path, "|", error.message);
      return null;
    }
    return data?.signedUrl || null;
  } catch (e) {
    console.warn("[Cygne reflection] refresh signed URL threw for", path, "|", e?.message || e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// CAPTURE FLOW
// ---------------------------------------------------------------------------

function FaceGuide({ size = 240 }) {
  return (
    <div style={{ color: TEXT, opacity: 0.55, lineHeight: 0 }}>
      <svg width={size} height={size * 1.25} viewBox="0 0 120 150" fill="none"
        style={{ pointerEvents: "none" }}>
        <ellipse cx="60" cy="72" rx="38" ry="52" stroke="currentColor" strokeWidth="0.9" strokeDasharray="2 3" />
        <line x1="60" y1="20" x2="60" y2="124" stroke="currentColor" strokeWidth="0.4" strokeDasharray="1 3" />
        <line x1="22" y1="72" x2="98" y2="72" stroke="currentColor" strokeWidth="0.4" strokeDasharray="1 3" />
      </svg>
    </div>
  );
}

function CaptureFlow({ onClose, onComplete }) {
  const [shots, setShots] = useState([]); // array of data URLs
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const step = shots.length; // 0..3
  const current = ANGLES[step] || ANGLES[2];
  const done = step >= 3;

  const pick = () => inputRef.current?.click();

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setBusy(true);
      console.log("[Cygne reflection] raw file size:", file.size, "bytes");
      const compressed = await compressImageBlob(file);
      console.log("[Cygne reflection] compressed blob size:", compressed.size, "bytes");
      const url = await fileToDataUrl(compressed);
      setShots(prev => [...prev, url]);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (shots.length < 3) return;
    setBusy(true);
    try {
      const triptych = await stitchTriptych(shots);
      await onComplete(triptych);
    } finally {
      setBusy(false);
    }
  };

  const retake = () => setShots(prev => prev.slice(0, -1));

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 400, background: SURFACE_BG,
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px" }}>
        <button onClick={onClose} style={{ background: "none", border: "none", color: TEXT_SOFT, cursor: "pointer", padding: 4, display: "inline-flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          <Icon name="x" size={14} /> Close
        </button>
        <span style={{ fontFamily: SANS, fontSize: 9, letterSpacing: "0.28em", textTransform: "uppercase", color: TEXT_SOFT }}>Reflection</span>
        <div style={{ width: 68 }} />
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 26px", textAlign: "center" }}>
        {!done ? (
          <>
            <p style={{ fontFamily: SANS, fontSize: 9, letterSpacing: "0.3em", textTransform: "uppercase", color: TEXT_SOFT, opacity: 0.7, margin: 0 }}>
              Shot {step + 1} of 3
            </p>
            <h2 style={{ fontFamily: CURSIVE, fontSize: 36, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: TEXT, margin: "6px 0 10px", lineHeight: 1.15 }}>
              {current.label}
            </h2>
            <p style={{ fontFamily: SANS, fontSize: 12, color: TEXT_SOFT, margin: 0, maxWidth: 300, lineHeight: 1.6 }}>
              {current.hint}
            </p>

            <div style={{ position: "relative", marginTop: 32, marginBottom: 32, width: 240, height: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FaceGuide size={240} />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
              {ANGLES.map((a, i) => (
                <div key={a.key} style={{
                  width: 9, height: 9, borderRadius: "50%",
                  background: i < step ? "var(--sage)" : i === step ? "rgba(45,61,43,0.45)" : "transparent",
                  border: `1px solid ${i <= step ? "var(--sage)" : BORDER}`,
                  transition: "all 0.2s",
                }} />
              ))}
            </div>

            <button onClick={pick} disabled={busy}
              style={{
                display: "inline-flex", alignItems: "center", gap: 10,
                padding: "14px 40px", borderRadius: 0,
                background: "transparent", color: "var(--color-inky-moss)", border: "1.5px solid var(--color-inky-moss)",
                cursor: busy ? "default" : "pointer",
                fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700,
                letterSpacing: "0.2em", textTransform: "uppercase",
                transition: "all 0.3s ease",
                opacity: busy ? 0.5 : 1,
              }}
              onMouseEnter={e => { if (!busy) { e.currentTarget.style.background = "var(--color-inky-moss)"; e.currentTarget.style.color = "var(--color-ivory)"; } }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-inky-moss)"; }}>
              <Icon name="camera" size={14} />
              {busy ? "Loading..." : step === 0 ? "Begin Capture" : "Next Shot"}
            </button>

            {step > 0 && (
              <button onClick={retake}
                style={{ marginTop: 16, background: "none", border: "none", color: TEXT_SOFT, cursor: "pointer", fontFamily: SANS, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", opacity: 0.7 }}>
                Retake last shot
              </button>
            )}
          </>
        ) : (
          <>
            <p style={{ fontFamily: SANS, fontSize: 9, letterSpacing: "0.3em", textTransform: "uppercase", color: TEXT_SOFT, opacity: 0.7, margin: 0 }}>
              Your reflection
            </p>
            <h2 style={{ fontFamily: CURSIVE, fontSize: 34, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: TEXT, margin: "6px 0 18px" }}>
              A quiet moment.
            </h2>

            <div style={{ display: "flex", gap: 6, width: "100%", maxWidth: 420, marginBottom: 28, border: `1px solid ${BORDER}`, padding: 4, background: "var(--surface)" }}>
              {shots.map((s, i) => (
                <img key={i} src={s} alt={ANGLES[i].label}
                  style={{ flex: 1, width: 0, aspectRatio: "3/4", objectFit: "cover", display: "block" }} />
              ))}
            </div>

            <button onClick={finish} disabled={busy}
              style={{
                display: "inline-flex", alignItems: "center", gap: 10,
                padding: "14px 40px", borderRadius: 0,
                background: "transparent", color: "var(--color-inky-moss)", border: "1.5px solid var(--color-inky-moss)",
                cursor: busy ? "default" : "pointer",
                fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700,
                letterSpacing: "0.2em", textTransform: "uppercase",
                transition: "all 0.3s ease",
                opacity: busy ? 0.5 : 1,
              }}
              onMouseEnter={e => { if (!busy) { e.currentTarget.style.background = "var(--color-inky-moss)"; e.currentTarget.style.color = "var(--color-ivory)"; } }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-inky-moss)"; }}>
              {busy ? "Saving..." : "Save reflection"}
            </button>

            <button onClick={retake} disabled={busy}
              style={{ marginTop: 16, background: "none", border: "none", color: TEXT_SOFT, cursor: "pointer", fontFamily: SANS, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", opacity: 0.7 }}>
              Retake last shot
            </button>
          </>
        )}
      </div>

      <input ref={inputRef} type="file" accept="image/*" capture="user"
        onChange={handleFile} style={{ display: "none" }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// TRIPTYCH REVEAL — splits the stitched image into 3 panels via background-
// position and slides each in from the right with a staggered delay.
// ---------------------------------------------------------------------------

function TriptychImage({ src, alt, placeholderFontSize = 11 }) {
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!src) { setStatus("error"); return; }
    setStatus("loading");
    setRevealed(false);
    const img = new Image();
    img.onload = () => setStatus("ready");
    img.onerror = () => {
      console.warn("[Cygne reflection] image failed to load:", src);
      setStatus("error");
    };
    img.src = src;
  }, [src]);

  useEffect(() => {
    if (status !== "ready") return;
    const id = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(id);
  }, [status]);

  if (!src || status === "error") {
    return (
      <div style={{
        width: "100%", aspectRatio: "3/1.3",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: TEXT_SOFT, fontFamily: SANS, fontSize: placeholderFontSize,
      }}>
        Image unavailable
      </div>
    );
  }

  return (
    <div role="img" aria-label={alt}
      style={{ display: "flex", width: "100%", aspectRatio: "1560 / 680", overflow: "hidden", background: SURFACE_BG }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          flex: 1,
          backgroundImage: `url(${src})`,
          backgroundSize: "300% 100%",
          backgroundPosition: `${i * 50}% 50%`,
          opacity: revealed ? 1 : 0,
          transform: revealed ? "translateX(0)" : "translateX(20px)",
          transition: `opacity 400ms ease-out ${i * 150}ms, transform 400ms ease-out ${i * 150}ms`,
          willChange: "opacity, transform",
        }} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EXPANDED VIEW
// ---------------------------------------------------------------------------

function ExpandedEntry({ entry, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const src = entry.url || entry.inline;
  console.log("[Cygne reflection] expanded entry", { id: entry.id, path: entry.path, url: entry.url, hasInline: !!entry.inline });

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 380,
        background: OVERLAY,
        backdropFilter: "blur(14px)",
        display: "flex", flexDirection: "column", alignItems: "center",
        overflowY: "auto", padding: "44px 18px 60px",
        animation: "fadeUp 0.3s ease",
      }}>
      <button onClick={onClose}
        style={{ position: "absolute", top: 16, right: 18, background: "none", border: "none", color: TEXT_SOFT, cursor: "pointer", padding: 8 }}>
        <Icon name="x" size={18} />
      </button>

      <p style={{ fontFamily: SANS, fontSize: 9, letterSpacing: "0.3em", textTransform: "uppercase", color: TEXT_SOFT, opacity: 0.7, margin: "0 0 6px" }}>
        Week {entry.weekNumber}
      </p>
      <h2 style={{ fontFamily: CURSIVE, fontSize: 28, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: TEXT, margin: "0 0 6px", textAlign: "center" }}>
        {getMoonPhase(new Date(entry.date))}
      </h2>
      <p style={{ fontFamily: SANS, fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: TEXT_SOFT, opacity: 0.7, margin: "0 0 26px" }}>
        {formatDateLong(entry.date)}
      </p>

      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 720,
          borderTop: `1px solid ${BORDER}`,
          borderBottom: `1px solid ${BORDER}`,
          boxShadow: "0 30px 80px rgba(0,0,0,0.3)",
        }}>
        <TriptychImage src={src} alt={`Reflection for week ${entry.weekNumber}`} placeholderFontSize={12} />
      </div>

      <div onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 560, width: "100%", marginTop: 30, padding: "20px 22px", borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
        <p style={{ fontFamily: SANS, fontSize: 9, letterSpacing: "0.28em", textTransform: "uppercase", color: TEXT_SOFT, opacity: 0.7, margin: "0 0 10px", textAlign: "center" }}>
          Swan Sense — this week
        </p>
        {entry.insight?.headline ? (
          <p style={{ fontFamily: CURSIVE, fontSize: 28, color: TEXT, margin: 0, lineHeight: 1.35, textAlign: "center" }}>
            {entry.insight.headline}
          </p>
        ) : (
          <p style={{ fontFamily: SANS, fontSize: 12, color: TEXT_SOFT, margin: 0, textAlign: "center", lineHeight: 1.7 }}>
            No insight recorded for this week.
          </p>
        )}
      </div>

      <p style={{ fontFamily: SANS, fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: TEXT_SOFT, marginTop: 24, opacity: 0.7 }}>
        Tap anywhere to close
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GALLERY ENTRY
// ---------------------------------------------------------------------------

function GalleryEntry({ entry, onExpand, caption }) {
  const src = entry.url || entry.inline;
  // Reveal once the entry scrolls into view. Disconnects after the first
  // intersection so the animation never replays on exit. Browsers without
  // IntersectionObserver fall back to immediately-visible.
  const ref = useRef(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") { setRevealed(true); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          setRevealed(true);
          io.disconnect();
          break;
        }
      }
    }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
    io.observe(node);
    return () => io.disconnect();
  }, []);

  return (
    <button onClick={onExpand} ref={ref}
      style={{
        display: "block", width: "100%", margin: "0 auto 48px",
        background: "none", border: "none", padding: 0, cursor: "pointer",
        textAlign: "center", color: TEXT,
        opacity: revealed ? 1 : 0,
        transform: revealed ? "translateY(0)" : "translateY(16px)",
        transition: "opacity 500ms ease-out, transform 500ms ease-out",
        willChange: "opacity, transform",
      }}>
      <p style={{ fontFamily: SANS, fontSize: 9, letterSpacing: "0.3em", textTransform: "uppercase", color: TEXT_SOFT, opacity: 0.7, margin: "0 0 4px" }}>
        Week {entry.weekNumber}
      </p>
      <h3 style={{ fontFamily: CURSIVE, fontSize: 24, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: TEXT, margin: "0 0 4px" }}>
        {getMoonPhase(new Date(entry.date))}
      </h3>
      <p style={{ fontFamily: SANS, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: TEXT_SOFT, margin: "0 0 18px", opacity: 0.7 }}>
        {formatDateLong(entry.date)}
      </p>
      <div style={{
        width: "100%", maxWidth: 520, margin: "0 auto",
        borderTop: `1px solid ${BORDER}`,
        borderBottom: `1px solid ${BORDER}`,
        boxShadow: "0 18px 44px rgba(0,0,0,0.2)",
      }}>
        <TriptychImage src={src} alt={`Reflection week ${entry.weekNumber}`} />
      </div>
      {caption && (
        <p style={{ fontFamily: CURSIVE, fontSize: 22, color: TEXT_SOFT, textAlign: "center", margin: "12px 0 0", letterSpacing: "0.02em", opacity: 0.85 }}>
          {caption}
        </p>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// PLACEHOLDER ENTRY — shown for weeks without a captured reflection
// ---------------------------------------------------------------------------

function MissedWeekLabel({ weekNum }) {
  return (
    <div style={{
      textAlign: "center", margin: "8px 0",
      fontFamily: "var(--font-display)", fontWeight: 400,
      fontSize: 9, letterSpacing: "0.2em",
      color: "var(--color-pebble)", opacity: 0.5,
    }}>
      · week {weekNum} ·
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN REFLECTION SCREEN
// ---------------------------------------------------------------------------

function Reflection({ reflections = [], onAddReflection, products = [], checkIns = [], user = {}, locationData = null, journals = [] }) {
  const [capturing, setCapturing] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [signedUrls, setSignedUrls] = useState({}); // { [entryId]: signedUrl }

  const sorted = [...reflections].sort((a, b) => new Date(b.date) - new Date(a.date));

  // Does this ISO week already have a captured reflection?
  const now = new Date();
  const currentWeek = isoWeekNumber(now);
  const currentYear = now.getFullYear();

  // Build gallery items: real entries + placeholders for missed weeks.
  // Only computed when there is at least one reflection.
  const galleryItems = useMemo(() => {
    if (sorted.length === 0) return [];

    const byWeek = {};
    for (const e of sorted) {
      const d = new Date(e.date);
      const wy = isoWeekYear(d);
      const key = `${wy}-W${e.weekNumber}`;
      if (!byWeek[key]) byWeek[key] = e;
    }

    const earliest = sorted[sorted.length - 1];
    const earliestD = new Date(earliest.date);
    const earliestWN = earliest.weekNumber;
    const earliestWY = isoWeekYear(earliestD);

    const startMon = isoWeekToMonday(earliestWN, earliestWY);
    const curWN = isoWeekNumber(now);
    const curWY = isoWeekYear(now);
    const curMon = isoWeekToMonday(curWN, curWY);

    const items = [];
    const cursor = new Date(startMon);
    while (cursor <= curMon) {
      const wn = isoWeekNumber(cursor);
      const wy = isoWeekYear(cursor);
      const key = `${wy}-W${wn}`;
      if (byWeek[key]) {
        items.push({ type: "entry", data: byWeek[key] });
      } else {
        items.push({ type: "placeholder", weekNum: wn, year: wy, date: isoWeekToSunday(wn, wy) });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }

    return items.reverse();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted.length]);
  const capturedThisWeek = reflections.some(r => {
    if (r.weekNumber !== currentWeek) return false;
    const d = new Date(r.date);
    return d.getFullYear() === currentYear;
  });

  // Refresh signed URLs on mount / when the reflection set changes. Signed
  // URLs expire; regenerating them per session keeps the gallery reliable.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = {};
      for (const entry of sorted) {
        if (!entry.path) continue;
        if (signedUrls[entry.id]) {
          next[entry.id] = signedUrls[entry.id];
          continue;
        }
        const url = await refreshSignedUrl(entry.path);
        if (cancelled) return;
        if (url) next[entry.id] = url;
      }
      if (!cancelled) setSignedUrls(prev => ({ ...prev, ...next }));
    })();
    return () => { cancelled = true; };
  }, [reflections.length]);

  const decorate = (entry) => ({
    ...entry,
    url: signedUrls[entry.id] || entry.url,
  });

  const expanded = sorted.find(e => e.id === expandedId);
  const expandedDecorated = expanded ? decorate(expanded) : null;

  const handleComplete = async (triptychDataUrl) => {
    setSaving(true);
    setError(null);
    try {
      const now = new Date();
      const date = now.toISOString();
      const weekNumber = isoWeekNumber(now);
      const userId = user?.id || "local";
      const id = `${weekNumber}-${now.getFullYear()}-${Date.now()}`;

      const predictions = getSwanSensePredictions(products, checkIns, user, locationData, journals);
      const meaningful = predictions.find(p => {
        const key = p.id || p.type;
        return key && !String(key).startsWith("baseline_");
      }) || predictions[0] || null;
      const insight = meaningful ? { headline: meaningful.headline, detail: meaningful.detail } : null;

      const { path, url, inline } = await uploadTriptych(userId, id, triptychDataUrl);

      const entry = {
        id, weekNumber, date,
        path: path || null,
        url: url || null,
        inline: inline || null,
        insight,
      };
      await onAddReflection(entry);
      setCapturing(false);
    } catch (e) {
      console.error("[Cygne reflection] save failed:", e);
      setError("Couldn't save that reflection. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      margin: "-32px -22px 0",
      background: BG, minHeight: "calc(100vh - 54px)",
      padding: "44px 22px 80px",
      color: TEXT,
    }}>
      {/* Header */}
      <div style={{ maxWidth: 560, margin: "0 auto 18px", textAlign: "center" }}>
        <p style={{ fontFamily: "var(--heading)", fontSize: 9, letterSpacing: "0.30em", textTransform: "uppercase", color: TEXT_SOFT, opacity: 0.7, margin: "0 0 12px" }}>
          Reflection
        </p>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 700, color: "var(--color-inky-moss)", margin: "0 0 10px", letterSpacing: "0.15em", textTransform: "uppercase", lineHeight: 1.2 }}>
          A Living Gallery.
        </h1>
        {reflections.length === 0 && (
          <p style={{ fontFamily: SANS, fontSize: 12, color: TEXT_SOFT, margin: 0, lineHeight: 1.75, maxWidth: 360, marginLeft: "auto", marginRight: "auto" }}>
            One triptych a week. A quiet record of how your skin is moving through the seasons.
          </p>
        )}
      </div>

      {error && (
        <div style={{ maxWidth: 520, margin: "0 auto 20px", padding: "12px 16px", background: "var(--surface)", border: `1px solid ${BORDER}`, borderRadius: 10, textAlign: "center" }}>
          <p style={{ fontFamily: SANS, fontSize: 11, color: TEXT_SOFT, margin: 0 }}>{error}</p>
        </div>
      )}

      <div style={{ textAlign: "center", marginBottom: 24 }}>
        {capturedThisWeek ? (
          <p style={{ fontFamily: CURSIVE, fontSize: 16, letterSpacing: "0.05em", color: TEXT_SOFT, opacity: 0.7, margin: 0 }}>
            Captured — return on your next reset day
          </p>
        ) : (
          <button onClick={() => setCapturing(true)} disabled={saving}
            style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              padding: "14px 40px", borderRadius: 0,
              background: "transparent", color: "var(--color-inky-moss)",
              border: "1.5px solid var(--color-inky-moss)",
              cursor: saving ? "default" : "pointer",
              fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700,
              letterSpacing: "0.2em", textTransform: "uppercase",
              transition: "all 0.3s ease",
              opacity: saving ? 0.6 : 1,
            }}
            onMouseEnter={e => { if (!saving) { e.currentTarget.style.background = "var(--color-inky-moss)"; e.currentTarget.style.color = "var(--color-ivory)"; } }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-inky-moss)"; }}>
            <Icon name="camera" size={14} />
            {saving ? "Saving..." : reflections.length === 0 ? "Capture your first reflection" : "Capture this week"}
          </button>
        )}
      </div>

      {/* Empty state */}
      {sorted.length === 0 && (
        <div style={{ maxWidth: 460, margin: "20px auto 0", textAlign: "center", padding: "40px 24px", background: "var(--surface)", border: `1px solid ${BORDER}`, borderRadius: 18 }}>
          <div style={{ color: TEXT_SOFT, display: "inline-flex", marginBottom: 14 }}>
            <Icon name="reflection" size={26} />
          </div>
          <p style={{ fontFamily: CURSIVE, fontSize: 26, color: TEXT, margin: "0 0 8px", letterSpacing: "0.02em" }}>
            Your gallery is waiting.
          </p>
          <p style={{ fontFamily: SANS, fontSize: 12, color: TEXT_SOFT, margin: 0, lineHeight: 1.7 }}>
            Every Sunday evening, step to the mirror. Three angles, one quiet moment — and the wheel of your year begins to turn.
          </p>
        </div>
      )}

      {/* Gallery */}
      {galleryItems.length > 0 && (
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          {galleryItems.map((item, idx) => {
            if (item.type === "entry") {
              return (
                <GalleryEntry
                  key={item.data.id}
                  entry={decorate(item.data)}
                  onExpand={() => setExpandedId(item.data.id)}
                  caption={idx === 0 ? "The week is behind you." : null}
                />
              );
            }
            // Current week with no photo — the "Capture this week" button above is the prompt
            const isCurrentWeek = item.weekNum === currentWeek && item.year === isoWeekYear(now);
            if (isCurrentWeek) return null;
            // Past week with no photo — minimal muted label only
            return (
              <MissedWeekLabel
                key={`missed-${item.year}-W${item.weekNum}`}
                weekNum={item.weekNum}
              />
            );
          })}
        </div>
      )}

      {capturing && (
        <CaptureFlow
          onClose={() => setCapturing(false)}
          onComplete={handleComplete}
        />
      )}
      {expandedDecorated && (
        <ExpandedEntry entry={expandedDecorated} onClose={() => setExpandedId(null)} />
      )}
    </div>
  );
}

export { Reflection };
