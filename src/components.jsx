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
        <p style={{ fontFamily: "var(--sans)", fontSize: 13, color: v.text, margin: "0 0 3px", fontWeight: 400 }}>{f.label}</p>
        <p style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--clay)", margin: 0, lineHeight: 1.5 }}>{f.detail}</p>
      </div>
    </div>
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


export { Icon, Pill, Section, FlagCard, SwanIcon };