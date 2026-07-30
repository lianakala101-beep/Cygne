// One-time educational note shown after the user answers the
// Fitzpatrick self-report question — inline below the pills in both
// onboarding and the profile editor. Not shown if they skip; not
// shown again once they've dismissed it.
//
// Dismissal is tracked per-device in localStorage
// (cygne_fitzpatrick_note_dismissed) — cross-device sync would need a
// user_metadata field, but this is a low-stakes UX prompt: seeing it
// twice on a second device isn't a real bug, and the localStorage
// approach avoids threading yet another Supabase-synced flag through
// App.jsx.
//
// Copy is verbatim from the product spec — general skincare framing
// with an explicit disclaimer sentence. Never diagnostic.

import { useState, useEffect } from "react";

const IVORY = "var(--color-ivory, #faf9f4)";
const STORAGE_KEY = "cygne_fitzpatrick_note_dismissed";

// Read-once helper. Guarded so it survives SSR / restricted-quota
// contexts where localStorage might throw.
function readDismissed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

// Small exported helper so callers can pre-check without mounting the
// component (e.g. to decide whether to bump onboarding's step index).
// Not currently used but cheap to expose.
export function isFitzpatrickNoteDismissed() {
  return readDismissed();
}

export function FitzpatrickNote({ variant = "dark" }) {
  // `visible` is a per-mount session state — driven by the dismissed
  // flag on first render, then only mutated by the × button.
  const [visible, setVisible] = useState(() => !readDismissed());

  // If the dismissed flag flips true elsewhere while this note is
  // mounted (e.g. user has two tabs open), collapse this one too.
  useEffect(() => {
    if (!visible) return;
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY && e.newValue === "1") setVisible(false);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [visible]);

  if (!visible) return null;

  const dismiss = () => {
    writeDismissed();
    setVisible(false);
  };

  // Two variants: onboarding renders on the dark inky-moss canvas
  // (ivory text on translucent ivory fill), profile edit renders on
  // the ivory-shadow card (ink text on inky-moss-tinted fill). Same
  // copy, tone-matched to the surrounding surface.
  const isDark = variant === "dark";
  const bg     = isDark ? "rgba(250,249,244,0.08)" : "rgba(45,61,43,0.08)";
  const border = isDark ? "1px solid rgba(250,249,244,0.22)" : "1px solid rgba(45,61,43,0.22)";
  const color  = isDark ? IVORY : "#1c1c1a";
  const mutedX = isDark ? "rgba(255,255,255,0.55)" : "rgba(28,28,26,0.55)";

  return (
    <div style={{
      marginTop: 20,
      padding: "14px 16px 14px 18px",
      background: bg,
      border,
      borderRadius: 8,
      display: "flex",
      gap: 12,
      alignItems: "flex-start",
    }}>
      <p style={{
        flex: 1, minWidth: 0, margin: 0,
        fontFamily: "var(--font-body)",
        fontSize: 12, lineHeight: 1.6,
        color, opacity: 0.9,
      }}>
        <strong style={{ fontWeight: 700 }}>A quick note:</strong>{" "}
        skin with more natural pigment still needs daily SPF — it's less prone
        to burning, but sun exposure can still affect tone and texture over
        time. This is general skincare information, not medical advice — for
        any specific skin concerns, we always recommend checking with a
        dermatologist.
      </p>
      <button
        onClick={dismiss}
        aria-label="Dismiss note"
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: mutedX, fontSize: 18, lineHeight: 1, padding: 2, flexShrink: 0,
        }}
      >×</button>
    </div>
  );
}
