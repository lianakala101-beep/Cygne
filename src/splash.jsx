import { useState } from "react";
import { LOGO_SRC } from "./components.jsx";

function SplashScreen({ onDone }) {
  const [fading, setFading] = useState(false);

  const handleContinue = () => {
    if (fading) return;
    setFading(true);
    setTimeout(onDone, 600);
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "var(--color-ivory)",
        display: "flex", flexDirection: "column",
        justifyContent: "flex-start",
        opacity: fading ? 0 : 1,
        transition: "opacity 0.6s ease",
        overflow: "hidden",
      }}>

      {/* Top — logo + tagline, left-aligned */}
      <div style={{ padding: "72px 36px 0" }}>
        <img
          src={LOGO_SRC}
          alt="Cygne"
          style={{
            height: 170, width: "auto",
            display: "block",
            filter: "brightness(1.25) contrast(1.05)",
            mixBlendMode: "lighten",
          }}
        />
        <p style={{
          fontFamily: "var(--font-signature)",
          fontSize: 22, fontWeight: 400,
          color: "rgba(232,227,214,0.95)",
          margin: "6px 0 0 130px",
          letterSpacing: "0.05em",
          lineHeight: 1,
        }}>built around you</p>
      </div>

      {/* Below logo — description and button sitting just under the logo block */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: "32px 36px 72px",
      }}>
        <p style={{
          fontFamily: "var(--font-body)",
          fontSize: 13,
          color: "rgba(232,227,214,0.60)",
          margin: "0 0 28px",
          lineHeight: 1.75,
          textAlign: "center",
          maxWidth: 300,
        }}>A ritual tracker that reads your vanity, your skin, and your life — and keeps up with all three.</p>

        <button
          onClick={handleContinue}
          style={{
            padding: "15px 0",
            background: "rgba(232,227,214,0.12)",
            color: "rgba(232,227,214,0.95)",
            border: "1px solid rgba(232,227,214,0.28)",
            borderRadius: 10,
            fontFamily: "var(--font-body)",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "background 0.2s, border-color 0.2s",
            width: "100%",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(232,227,214,0.2)"; e.currentTarget.style.borderColor = "rgba(232,227,214,0.5)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(232,227,214,0.12)"; e.currentTarget.style.borderColor = "rgba(232,227,214,0.28)"; }}>
          Get Started
        </button>
      </div>
    </div>
  );
}


// --- ONBOARDING ---------------------------------------------------------------

export { SplashScreen };