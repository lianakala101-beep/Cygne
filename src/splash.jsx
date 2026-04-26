import { useState } from "react";
import { LOGO_SRC } from "./components.jsx";

function SplashScreen({ onDone }) {
  const [fading, setFading] = useState(false);

  const handleTap = () => {
    if (fading) return;
    setFading(true);
    setTimeout(onDone, 600);
  };

  const handleButton = (e) => {
    e.stopPropagation();
    handleTap();
  };

  return (
    <div
      onClick={handleTap}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#fdfcf9",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: fading ? 0 : 1,
        transition: "opacity 0.6s ease",
        cursor: "default",
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
      }}>

      {/* Logo image — centered, ~60% screen width */}
      <img
        src={LOGO_SRC}
        alt="Cygne"
        style={{
          width: "60vw",
          maxWidth: 440,
          height: "auto",
          display: "block",
        }}
      />

      {/* Tagline + CTA — pinned to bottom, above safe area */}
      <div style={{
        position: "absolute",
        bottom: "calc(60px + env(safe-area-inset-bottom, 0px))",
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}>
        <p style={{
          fontFamily: "var(--font-display, 'Fungis', sans-serif)",
          fontSize: 13,
          fontWeight: 400,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          color: "#a0a0a0",
          margin: 0,
        }}>Built Around You</p>

        <button
          onClick={handleButton}
          style={{
            marginTop: 32,
            padding: "14px 40px",
            fontFamily: "var(--font-display, 'Fungis', sans-serif)",
            fontSize: 12,
            fontWeight: 400,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#1c1c1a",
            background: "transparent",
            border: "1px solid #1c1c1a",
            borderRadius: 0,
            width: "auto",
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
          }}>
          Begin Your Ritual
        </button>
      </div>
    </div>
  );
}

export { SplashScreen };
