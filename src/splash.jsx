import { useEffect, useRef, useState } from "react";

// Intro splash — auto-fades after 2.5s. Renders a muted, autoplay swan
// video as a fullscreen backdrop with a soft dark overlay; if the video
// fails to load we drop to an inky-moss surface so the logo + tagline
// still read cleanly. Shown once per session on initial app entry; tab
// navigation never re-mounts this component, so the splash never returns.
function SplashScreen({ onDone }) {
  const [fading, setFading] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    const fadeAt = setTimeout(() => setFading(true), 2500);
    const removeAt = setTimeout(() => onDone(), 3100); // 2500 + 600ms fade
    return () => {
      clearTimeout(fadeAt);
      clearTimeout(removeAt);
    };
  }, [onDone]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "var(--color-inky-moss, #2d3d2b)",
        overflow: "hidden",
        opacity: fading ? 0 : 1,
        transition: "opacity 0.6s ease",
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
        pointerEvents: "none",
      }}>

      {!videoFailed && (
        <video
          ref={videoRef}
          src="/swan-intro.mp4"
          autoPlay
          muted
          playsInline
          loop
          preload="auto"
          onError={() => setVideoFailed(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      )}

      {/* Subtle dark overlay so the logo + tagline sit cleanly on the video */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.3)",
      }} />

      {/* Centered logo + tagline */}
      <div style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
      }}>
        <img
          src="/cygne-logo.png"
          alt="Cygne"
          style={{
            width: "60%",
            maxWidth: 280,
            height: "auto",
            display: "block",
            filter: "brightness(0) invert(1)",
            opacity: 0.95,
          }}
        />
        <p style={{
          fontFamily: "var(--font-display)",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "var(--color-ivory, #faf9f4)",
          margin: 0,
        }}>Built Around You</p>
      </div>
    </div>
  );
}

export { SplashScreen };
