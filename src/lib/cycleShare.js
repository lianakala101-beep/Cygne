// Cycle-phase shareable card generator.
//
// Renders a standalone 1080×1920 (Instagram Story aspect) transparent
// PNG on an off-screen canvas — NOT a screenshot of the in-app card.
// Layout, top to bottom, centered horizontally:
//
//   1. Cygne logo mark (140px, quiet)
//   2. Bracketed phase badge in Fungis caps — e.g. "( FOLLICULAR )"
//      matching the app's existing ( 01 )-style pill treatment (though
//      drawn as plain type here; a stroked pill at this scale would
//      compete with the numeral below).
//   3. Large DAY numeral in Fungis Heavy — apothecary/health "hero
//      number" energy, matches the 112px Ritual Health treatment on
//      the Progress screen at scale.
//   4. Single evocative mood word per phase — MOOD_WORDS map keeps
//      copy poetic, not clinical or actionable.
//   5. Small "cygne.skin" signature near the bottom.
//
// Transparent background is intentional per spec — the Instagram
// Story compositor lets the user drop this over any background of
// their choice; text is painted ivory so it reads on the dark
// backgrounds Story users tend to pick.
//
// Share step uses the Web Share API level 2 (files) which is
// available in iOS 15+ WKWebView (what Capacitor renders inside);
// falls back to a browser download for web contexts / older iOS.

const CANVAS_W = 1080;
const CANVAS_H = 1920;
const IVORY = "#faf9f4";

// One mood word per canonical phase. Kept poetic — not advice, not
// clinical. Menstrual = rest, Follicular = building energy,
// Ovulatory = peak, Luteal = groundedness. Extended-cycle days past
// day 35 fall through to Luteal in getCyclePhase, so STEADY covers
// the "running long" tail too.
const MOOD_WORDS = {
  Menstrual:  "QUIET",
  Follicular: "RISING",
  Ovulatory:  "GLOWING",
  Luteal:     "STEADY",
};

// Canvas 2D doesn't universally support ctx.letterSpacing across the
// iOS versions Cygne ships to (only Safari 17.4+), so draw each glyph
// individually with a manual px offset. Text is centered by measuring
// total advance (glyph widths + inter-glyph spacing) and starting
// left of the anchor x by half that.
function drawSpacedText(ctx, text, x, y, fontSize, spacingEm) {
  const chars = Array.from(String(text));
  if (chars.length === 0) return;
  const spacingPx = fontSize * spacingEm;
  const widths = chars.map(c => ctx.measureText(c).width);
  const total = widths.reduce((sum, w) => sum + w, 0) + spacingPx * (chars.length - 1);
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  let cursor = x - total / 2;
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], cursor, y);
    cursor += widths[i] + spacingPx;
  }
  ctx.textAlign = prevAlign;
}

function loadLogo() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load cygne logo"));
    img.src = "/cygne-logo.png";
  });
}

async function renderCycleShareBlob({ phaseName, day }) {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  // Transparent background: canvas starts fully transparent, don't
  // fill it. Do NOT set globalAlpha or a base fill — that would
  // defeat the point.

  // Wait for the app's Fungis faces to be ready before drawing text.
  // In practice they're already loaded by the time the user can tap
  // the share icon (every screen uses Fungis), but this is cheap
  // insurance against a race on the very first render after cold
  // launch.
  try { if (document?.fonts?.ready) await document.fonts.ready; } catch {}

  // Load logo up front. If it fails we still render the type — the
  // card is legible without the mark.
  let logo = null;
  try { logo = await loadLogo(); } catch {}

  ctx.fillStyle = IVORY;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  // 1. Logo — quiet size (140px), centered on x = 540, top-anchored
  //    around y = 320.
  if (logo) {
    const logoSize = 140;
    // Fit while preserving the natural aspect ratio (some logo files
    // are wider than tall; assume square-ish here and let
    // drawImage handle scaling).
    const w = logoSize;
    const h = logoSize * (logo.naturalHeight / (logo.naturalWidth || 1));
    ctx.globalAlpha = 0.9;
    ctx.drawImage(logo, (CANVAS_W - w) / 2, 260, w, h);
    ctx.globalAlpha = 1;
  }

  // 2. Bracketed phase badge — "( FOLLICULAR )".
  const phaseUpper = String(phaseName || "").toUpperCase();
  const badgeText = phaseUpper ? `( ${phaseUpper} )` : "";
  if (badgeText) {
    ctx.font = '700 44px "Fungis Heavy", "Fungis", sans-serif';
    ctx.globalAlpha = 0.85;
    drawSpacedText(ctx, badgeText, CANVAS_W / 2, 780, 44, 0.22);
    ctx.globalAlpha = 1;
  }

  // 3. Day numeral — apothecary hero number, tight caps tracking.
  //    "DAY 07"; day 1-9 gets a leading zero for typographic weight.
  const dayNum = Number.isFinite(Number(day)) ? Number(day) : 0;
  const dayPad = String(Math.max(0, Math.floor(dayNum))).padStart(2, "0");
  ctx.font = '700 260px "Fungis Heavy", "Fungis", sans-serif';
  drawSpacedText(ctx, `DAY ${dayPad}`, CANVAS_W / 2, 1080, 260, 0.02);

  // 4. Mood word — smaller caps, quieter, mapped from phase name.
  //    Unknown phases fall back to no mood word rather than guessing.
  const mood = MOOD_WORDS[phaseName];
  if (mood) {
    ctx.font = '700 56px "Fungis Heavy", "Fungis", sans-serif';
    ctx.globalAlpha = 0.7;
    drawSpacedText(ctx, mood, CANVAS_W / 2, 1360, 56, 0.32);
    ctx.globalAlpha = 1;
  }

  // 5. cygne.skin signature — quiet, near the bottom, no CTA styling.
  ctx.font = '400 30px "Fungis Normal", "Fungis", sans-serif';
  ctx.globalAlpha = 0.55;
  drawSpacedText(ctx, "cygne.skin", CANVAS_W / 2, 1780, 30, 0.24);
  ctx.globalAlpha = 1;

  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) { reject(new Error("Canvas toBlob returned null")); return; }
        resolve(blob);
      },
      "image/png",
    );
  });
}

// Public entry point. Renders the blob, wraps it in a File, and
// hands it to the native share sheet via Web Share API level 2 (which
// WKWebView exposes to Capacitor pages since iOS 15). Downloads as a
// fallback for browser contexts that don't support file sharing.
//
// Returns { shared: bool, cancelled?: bool, downloaded?: bool } so
// callers can decide whether to show any state feedback.
async function shareCycleCard({ phaseName, day }) {
  const blob = await renderCycleShareBlob({ phaseName, day });
  const safePhase = String(phaseName || "phase").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const safeDay = String(day || "0").replace(/[^0-9]/g, "");
  const filename = `cygne-cycle-${safePhase}-day-${safeDay}.png`;
  const file = typeof File === "function"
    ? new File([blob], filename, { type: "image/png" })
    : null;

  if (
    file
    && typeof navigator !== "undefined"
    && typeof navigator.canShare === "function"
    && navigator.canShare({ files: [file] })
    && typeof navigator.share === "function"
  ) {
    try {
      await navigator.share({ files: [file], title: "Cygne" });
      return { shared: true };
    } catch (e) {
      if (e && e.name === "AbortError") return { shared: false, cancelled: true };
      throw e;
    }
  }

  // Fallback: trigger a browser download.
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { shared: false, downloaded: true };
}

export { MOOD_WORDS, renderCycleShareBlob, shareCycleCard };
