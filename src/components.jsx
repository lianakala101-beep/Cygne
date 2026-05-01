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
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {(d[name] || "").split("M").filter(Boolean).map((seg, i) => <path key={i} d={"M" + seg} />)}
    </svg>
  );
};

// --- SHARED -------------------------------------------------------------------
const labelSt = { display: "block", fontFamily: "var(--sans)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--clay)", marginBottom: 8 };
const inputSt = { width: "100%", padding: "12px 14px", background: "var(--ink)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--parchment)", fontFamily: "var(--sans)", fontSize: 14, outline: "none", boxSizing: "border-box" };

function Pill({ children, active, onClick }) {
  return (
    <button onClick={onClick} style={{ flexShrink: 0, padding: "6px 15px", borderRadius: 20, border: `1px solid ${active ? "var(--sage)" : "var(--border)"}`, background: active ? "var(--sage)" : "transparent", color: active ? "var(--deep)" : "var(--clay)", fontFamily: "var(--sans)", fontSize: 11, cursor: "pointer", letterSpacing: "0.06em", whiteSpace: "nowrap", transition: "all 0.18s" }}>
      {children}
    </button>
  );
}

function Section({ title, icon, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        {icon && <span style={{ color: "var(--clay)", opacity: 0.7 }}><Icon name={icon} size={13} /></span>}
        <span style={{ fontFamily: "var(--sans)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--clay)" }}>{title}</span>
        <div style={{ flex: 1, height: 1, background: "var(--border)", marginLeft: 8 }} />
      </div>
      {children}
    </div>
  );
}

function FlagCard({ f }) {
  const variants = {
    warning: { border: "var(--border)", bg: "var(--surface)", dot: "var(--parchment)", text: "var(--parchment)" },
    caution: { border: "var(--border)",         bg: "var(--surface)",         dot: "var(--sage)",    text: "var(--parchment)" },
    missing: { border: "var(--border)",           bg: "var(--surface)",        dot: "var(--clay)",    text: "var(--parchment)" },
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

function Wordmark({ size = 28, theme = "dark" }) {
  const h = Math.round(size * 1.1);
  if (theme === "light") {
    return (
      <span style={{ fontFamily: "var(--font-display)", fontSize: size * 0.9, fontWeight: 400, color: "#1a1814", letterSpacing: "0.04em", lineHeight: 1, display: "block" }}>Cygne</span>
    );
  }
  return (
    <img src={LOGO_SRC} alt="Cygne" style={{ height: h, width: "auto", display: "block", objectFit: "contain", mixBlendMode: "lighten", filter: "brightness(1.15) contrast(1.1)" }} />
  );
}

// --- AUTH ---------------------------------------------------------------------

// --- SPLASH SCREEN -----------------------------------------------------------


export { Icon, Pill, Section, FlagCard, Wordmark, LOGO_SRC };
export function SwanIcon({ size = 16, color = "currentColor" }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><path d="M12 3C8 3 4 6 4 10c0 3 2 5 4 7l4 4 4-4c2-2 4-4 4-7 0-4-4-7-8-7z" /></svg>;
}
