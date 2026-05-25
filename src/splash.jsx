import { useEffect, useState } from "react";
import { AuthScreen } from "./auth.jsx";

// Persistent swan-video backdrop. Lives across both the splash beat and
// the auth form so the video never restarts — the user sees a single
// continuous loop until they sign in.
function SwanVideoBackdrop({ fadingOut = false }) {
  const [videoFailed, setVideoFailed] = useState(false);
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 9990,
      background: "var(--color-inky-moss, #2d3d2b)",
      overflow: "hidden",
      opacity: fadingOut ? 0 : 1,
      transition: "opacity 0.6s ease",
      pointerEvents: "none",
    }}>
      {!videoFailed && (
        <video
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
      {/* Soft dark wash so the foreground content reads cleanly */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.3)",
      }} />
    </div>
  );
}

// Logo + tagline overlay shown for the first 2.5s of app launch. Fades
// out on its own; the parent never needs to unmount it directly.
function SplashOverlay({ onDone }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeAt = setTimeout(() => setFading(true), 2500);
    const doneAt = setTimeout(() => onDone(), 3100);
    return () => {
      clearTimeout(fadeAt);
      clearTimeout(doneAt);
    };
  }, [onDone]);

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 9995,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 28,
      opacity: fading ? 0 : 1,
      transition: "opacity 0.6s ease",
      pointerEvents: "none",
      userSelect: "none",
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
        fontFamily: "var(--font-body)",
        fontSize: 12,
        fontWeight: 400,
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        color: "var(--color-ivory, #faf9f4)",
        margin: 0,
      }}>Built Around You</p>
    </div>
  );
}

// Pre-auth shell — owns the persistent video backdrop, runs the 2.5s
// splash overlay, then hands off to the (frosted-glass) AuthScreen. On a
// successful auth result we fade the whole layer out before calling
// onAuth, so the transition into the main app is a smooth crossfade
// instead of an abrupt cut.
function PreAuthScreen({ onAuth }) {
  const [splashDone, setSplashDone] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);

  const handleAuth = (...args) => {
    setFadingOut(true);
    setTimeout(() => onAuth(...args), 600);
  };

  return (
    <>
      <SwanVideoBackdrop fadingOut={fadingOut} />
      <div style={{
        position: "fixed", inset: 0, zIndex: 9996,
        opacity: fadingOut ? 0 : 1,
        transition: "opacity 0.6s ease",
        pointerEvents: fadingOut ? "none" : "auto",
      }}>
        {!splashDone
          ? <SplashOverlay onDone={() => setSplashDone(true)} />
          : <AuthScreen onAuth={handleAuth} />
        }
      </div>
    </>
  );
}

// Legacy named export kept so any external mention of `SplashScreen` keeps
// resolving — the canonical entry is now PreAuthScreen.
const SplashScreen = SplashOverlay;

export { PreAuthScreen, SwanVideoBackdrop, SplashOverlay, SplashScreen };
