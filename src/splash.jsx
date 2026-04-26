import { useState } from "react";

function SplashScreen({ onDone }) {
  const [fading, setFading] = useState(false);

  const handleTap = () => {
    if (fading) return;
    setFading(true);
    setTimeout(onDone, 600);
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

      {/* Logo — centered, ~60% screen width, satin silver gradient */}
      <span style={{
        fontFamily: "var(--font-signature, 'Hellasta Signature', cursive)",
        fontSize: "clamp(72px, 18vw, 160px)",
        fontWeight: 400,
        lineHeight: 1,
        letterSpacing: "0.02em",
        display: "block",
        background: "linear-gradient(135deg, #c0c0c0 0%, #e8e8e8 30%, #a8a8a8 50%, #d4d4d4 70%, #b0b0b0 100%)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        textAlign: "center",
        width: "60vw",
        maxWidth: 440,
      }}>Cygne</span>

      {/* Tagline — pinned to bottom, above safe area */}
      <p style={{
        position: "absolute",
        bottom: "calc(60px + env(safe-area-inset-bottom, 0px))",
        left: 0,
        right: 0,
        textAlign: "center",
        fontFamily: "var(--font-display, 'Fungis', sans-serif)",
        fontSize: 13,
        fontWeight: 400,
        letterSpacing: "0.15em",
        textTransform: "uppercase",
        color: "#a0a0a0",
        margin: 0,
      }}>Built Around You</p>
    </div>
  );
}

export { SplashScreen };
