import { useState } from "react";

const Icon = ({ name, size = 20 }) => {
  const d = {
    home:    "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10",
    routine: "M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5",
    shelf:   "M4 6h16M4 10h16M4 14h16M4 18h16",
    spending:"M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
    plus:    "M12 5v14M5 12h14",
    edit:    "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z",
    trash:   "M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6",
    camera:  "M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z M12 17a4 4 0 100-8 4 4 0 000 8z",
    warning: "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01",
    check:   "M20 6L9 17l-5-5",
    x:       "M18 6L6 18M6 6l12 12",
    sun:     "M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M12 17a5 5 0 100-10 5 5 0 000 10z",
    moon:    "M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z",
    alert:   "M22 12A10 10 0 1112 2a10 10 0 0110 10zM12 8v4M12 16h.01",
    info:    "M12 22a10 10 0 100-20 10 10 0 000 20zM12 16v-4M12 8h.01",
    layers:  "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
    clock:   "M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2",
    drop:    "M12 2.69l5.66 5.66a8 8 0 11-11.31 0z",
    leaf:    "M17 8C8 10 5.9 16.17 3.82 19c-1 1.5-.5 3 1.5 3 1 0 2-.5 3-1.5 1.5-1.5 3-4 5-4.5.5 2.5 0 5-2 7 3 0 7-3 9-7.5s0-8-3-9.5z",
    sparkle: "M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z",
    chevron: "M9 18l6-6-6-6",
    bell:    "M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0",
    box:     "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z M3.27 6.96L12 12.01l8.73-5.05 M12 22.08V12",
    book:    "M4 19.5A2.5 2.5 0 016.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z",
    fog:     "M3 15h18 M3 19h12 M5 11h14 M5 7h14",
    mountain:"M8 3l4 8 5-5 5 15H2L8 3z",
    thermo:  "M14 14.76V3.5a2.5 2.5 0 00-5 0v11.26a4 4 0 105 0z",
    snow:    "M12 2v20M2 12h20M5 5l14 14M19 5L5 19",
    plane:   "M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3s-3 .5-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5 0 1 .4 1.3L9 12l-1 3-2 1-1 2 3-1 2 1 1-2-1-2 3-1 3.5 5.3c.3.4.8.6 1.3.4l.5-.2c.4-.3.6-.7.5-1.2z",
    swan:    "M5 20h14 M6 20c0-5 3-9 8-9 M14 11c-3 0-5-2-5-4 M9 7a2 2 0 012-2l1 2",
    target:  "M12 22a10 10 0 100-20 10 10 0 000 20z M12 18a6 6 0 100-12 6 6 0 000 12z M12 14a2 2 0 100-4 2 2 0 000 4z",
    cycle:   "M12 2a10 10 0 010 20V2z M12 2a10 10 0 000 20",
    circle:  "M12 22a10 10 0 100-20 10 10 0 000 20z",
    auto:    "M12 22a10 10 0 100-20 10 10 0 000 20z M12 16v-4 M12 8h.01",
    "arrow-right": "M5 12h14M13 5l7 7-7 7",
    "arrow-left":  "M19 12H5M11 19l-7-7 7-7",
    "arrow-up":    "M12 19V5M5 12l7-7 7 7",
    "arrow-down":  "M12 5v14M19 12l-7 7-7-7",
    reflection:   "M12 3a7 7 0 100 14 7 7 0 000-14z M12 17v4 M9 21h6 M12 7v6 M10 10h4",
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {(d[name] || "").split("M").filter(Boolean).map((seg, i) => <path key={i} d={"M" + seg} />)}
    </svg>
  );
};

// --- SHARED -------------------------------------------------------------------
const labelSt = { display: "block", fontFamily: "var(--heading)", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--clay)", marginBottom: 8 };
const inputSt = { width: "100%", padding: "12px 14px", background: "var(--ink)", border: "1px solid var(--border)", borderRadius: 0, color: "var(--parchment)", fontFamily: "var(--sans)", fontSize: 14, outline: "none", boxSizing: "border-box" };

function Pill({ children, active, onClick }) {
  return (
    <button onClick={onClick} style={{ flexShrink: 0, padding: "6px 16px", borderRadius: 0, border: `1px solid ${active ? "rgba(160,160,160,0.7)" : "var(--border)"}`, background: active ? "var(--cta)" : "transparent", color: active ? "#F5F0E8" : "var(--clay)", fontFamily: "var(--heading)", fontSize: 10, cursor: "pointer", letterSpacing: "0.12em", textTransform: "uppercase", whiteSpace: "nowrap", transition: "all 0.18s" }}>
      {children}
    </button>
  );
}

function Section({ title, icon, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        {icon && <span style={{ color: "var(--clay)", opacity: 0.7 }}><Icon name={icon} size={13} /></span>}
        <span style={{ fontFamily: "var(--heading)", fontSize: 10, letterSpacing: "0.20em", textTransform: "uppercase", color: "var(--clay)" }}>{title}</span>
        <div style={{ flex: 1, height: 1, background: "var(--border)", marginLeft: 8 }} />
      </div>
      {children}
    </div>
  );
}

function FlagCard({ f }) {
  const variants = {
    warning: { border: "var(--border)", bg: "var(--surface)", dot: "var(--parchment)", text: "var(--parchment)" },
    caution: { border: "var(--border)", bg: "var(--surface)", dot: "var(--sage)",      text: "var(--parchment)" },
    missing: { border: "var(--border)", bg: "var(--surface)", dot: "var(--sage)",      text: "var(--parchment)" },
  };
  const v = variants[f.severity] || variants.caution;
  return (
    <div style={{ display: "flex", gap: 14, padding: "14px 16px", background: v.bg, borderRadius: 12, border: `1px solid ${v.border}`, marginBottom: 8 }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: v.dot, flexShrink: 0, marginTop: 6 }} />
      <div>
        <p style={{ fontFamily: "var(--sans)", fontSize: 13, color: v.text, margin: "0 0 3px", fontWeight: 500 }}>{f.label}</p>
        <p style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--clay)", margin: 0, lineHeight: 1.5 }}>{f.detail}</p>
      </div>
    </div>
  );
}

// --- CYGNE WORDMARK ----------------------------------------------------------
const LOGO_SRC = (
  "data:image/jpeg;base64,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"
);

function Wordmark({ size = 28 }) {
  return (
    <span style={{
      fontFamily: "var(--font-signature, 'Hellasta Signature', cursive)",
      fontSize: size * 0.95,
      fontWeight: 400,
      letterSpacing: "0.04em",
      lineHeight: 1,
      display: "block",
      background: "linear-gradient(135deg, #505050 0%, #B8B8B8 22%, #EBEBEB 38%, #C4C4C4 55%, #909090 70%, #D8D8D8 85%, #585858 100%)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text",
    }}>Cygne</span>
  );
}

// --- SWAN ICON ----------------------------------------------------------------
// Minimal elegant swan: small oval head, long arching neck, streamlined
// teardrop body low on the waterline. No legs, no emoji.
function SwanIcon({ size = 18, color = "currentColor", outlineOnly = false }) {
  const bodyFill   = outlineOnly ? "none" : color;
  const strokeW    = outlineOnly ? 1.5    : 1.3;
  const outStroke  = outlineOnly ? color  : "none";
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 40 28" fill="none" aria-hidden="true"
      style={{ display: "block", overflow: "visible" }}>
      <path
        d="M4 20 Q 9 15.8, 20 16 Q 28.5 16.4, 30 19 Q 27.5 21.4, 18 21.4 Q 8 21.4, 4 20 Z"
        fill={bodyFill} stroke={outStroke} strokeWidth={strokeW} />
      <path
        d="M26 16.4 C 25 11, 27 6.8, 31.2 4.8"
        stroke={color} strokeWidth={strokeW} fill="none"
        strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="31.8" cy="4.4" r="1.35" fill={bodyFill} stroke={outStroke} strokeWidth={strokeW} />
      <path d="M33 4.6 L 34.9 4.2 L 33.1 5.6 Z" fill={bodyFill} stroke={outStroke} strokeWidth={strokeW} />
    </svg>
  );
}

// --- AUTH ---------------------------------------------------------------------

// --- SPLASH SCREEN -----------------------------------------------------------


export { Icon, Pill, Section, FlagCard, Wordmark, LOGO_SRC, SwanIcon };