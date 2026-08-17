// Skin Status shareable card generator.
//
// Renders a standalone 1080×1920 (Instagram Story aspect) transparent
// PNG on an off-screen canvas — NOT a screenshot of the in-app card.
// Layout, top to bottom:
//
//   1. Cygne logo mark (110px, quiet), tight gap to the block below.
//   2. Skin-status phrase in large Fungis Heavy — phase-mapped,
//      framed as a window/phase (SKIN_STATUS map) rather than a
//      measured biological fact. Wraps onto multiple lines when the
//      phrase is too wide for the canvas at full size.
//   3. Directly below, smaller: "( FOLLICULAR • DAY 8 )" — phase name
//      + day, Fungis Normal, wide tracking.
//   4. cygne.skin signature, small, anchored near the bottom —
//      separate from the tight group above.
//
// Items 1–3 are laid out as one cohesive block (small fixed gaps,
// vertically centered as a unit in the upper-middle of the canvas)
// rather than floating at fixed absolute positions across the full
// canvas height — the earlier draft over-spread each line.
//
// Transparent background is intentional — the Instagram Story
// compositor lets the user drop this over any background of their
// choice. Text is painted inky-moss with a soft ivory halo stroked
// behind each glyph, so the same asset reads on both light and dark
// Story backgrounds (halo blends into light backgrounds, glows on
// dark ones).
//
// Share step uses the Web Share API level 2 (files), available in
// iOS 15+ WKWebView (what Capacitor renders inside) — surfaces
// "Add to Instagram Story" automatically when Instagram is
// installed. Falls back to a browser download for contexts that
// don't support file sharing.

const CANVAS_W = 1080;
const CANVAS_H = 1920;
const INKY_MOSS = "#2d3d2b";
const IVORY_HALO = "#faf9f4";
// Horizontal margin the status phrase + phase/day line must respect
// so nothing runs edge-to-edge on the exported image.
const SIDE_MARGIN = 90;
const MAX_TEXT_WIDTH = CANVAS_W - SIDE_MARGIN * 2;

// Phase-mapped "skin status" phrase. Framed as a window/phase the
// user is currently in, not a stated biological measurement — e.g.
// "COLLAGEN WINDOW" describes a favorable stretch, not a claim that
// collagen synthesis was measured. Kept short (2-3 words) so it reads
// as a headline at hero scale.
const SKIN_STATUS = {
  Menstrual:  "RECOVERY PHASE",
  Follicular: "COLLAGEN WINDOW",
  Ovulatory:  "THE GOLDEN HOUR",
  Luteal:     "BARRIER FOCUS",
};

// Canvas 2D doesn't universally support ctx.letterSpacing across the
// iOS versions Cygne ships to (only Safari 17.4+), so draw each glyph
// individually with a manual px offset.
//
// If `halo` is provided ({ color, width }) each glyph is stroked
// before it's filled — a soft outline that keeps dark text legible
// against dark Story backgrounds while staying invisible (blending
// in) against light ones.
function measureSpacedWidth(ctx, text, spacingPx) {
  const chars = Array.from(String(text));
  if (chars.length === 0) return 0;
  const widths = chars.map(c => ctx.measureText(c).width);
  return widths.reduce((sum, w) => sum + w, 0) + spacingPx * (chars.length - 1);
}

function drawSpacedLine(ctx, text, x, y, fontSize, spacingEm, halo) {
  const chars = Array.from(String(text));
  if (chars.length === 0) return;
  const spacingPx = fontSize * spacingEm;
  const widths = chars.map(c => ctx.measureText(c).width);
  const total = widths.reduce((sum, w) => sum + w, 0) + spacingPx * (chars.length - 1);
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  let cursor = x - total / 2;
  for (let i = 0; i < chars.length; i++) {
    if (halo) {
      const prevStroke = ctx.strokeStyle;
      const prevWidth = ctx.lineWidth;
      const prevJoin = ctx.lineJoin;
      ctx.strokeStyle = halo.color;
      ctx.lineWidth = halo.width;
      ctx.lineJoin = "round";
      ctx.strokeText(chars[i], cursor, y);
      ctx.strokeStyle = prevStroke;
      ctx.lineWidth = prevWidth;
      ctx.lineJoin = prevJoin;
    }
    ctx.fillText(chars[i], cursor, y);
    cursor += widths[i] + spacingPx;
  }
  ctx.textAlign = prevAlign;
}

// Greedy word-wrap for a spaced/tracked headline. ctx.font must
// already be set to the target size/weight before calling. Returns
// an array of line strings, each of which fits within maxWidth at
// the given letter-spacing.
function wrapSpacedWords(ctx, text, fontSize, spacingEm, maxWidth) {
  const spacingPx = fontSize * spacingEm;
  const words = String(text).split(" ").filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const width = measureSpacedWidth(ctx, candidate, spacingPx);
    if (width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [text];
}

// Draws a wrapped, spaced headline centered on x, with its vertical
// center at yCenter. Returns the total pixel height the block
// occupied, so callers can advance a running cursor for whatever
// comes next.
function drawWrappedBlock(ctx, text, x, yCenter, fontSize, spacingEm, lineHeight, halo, maxWidth) {
  const lines = wrapSpacedWords(ctx, text, fontSize, spacingEm, maxWidth);
  const blockHeight = lines.length * lineHeight;
  const firstLineY = yCenter - blockHeight / 2 + lineHeight / 2;
  lines.forEach((line, i) => {
    drawSpacedLine(ctx, line, x, firstLineY + i * lineHeight, fontSize, spacingEm, halo);
  });
  return blockHeight;
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
  // Transparent background: canvas starts fully transparent and is
  // never filled — no fillRect / clearRect touches it — so the PNG's
  // alpha channel is preserved end to end.

  try { if (document?.fonts?.ready) await document.fonts.ready; } catch {}

  let logo = null;
  try { logo = await loadLogo(); } catch {}

  ctx.fillStyle = INKY_MOSS;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  // Halo widths scale with font size so the outline reads at
  // consistent visual weight across tiers.
  const statusHalo = { color: IVORY_HALO, width: 6 };
  const phaseDayHalo = { color: IVORY_HALO, width: 3 };
  const sigHalo = { color: IVORY_HALO, width: 2 };

  const phaseUpper = String(phaseName || "").toUpperCase();
  const dayNum = Number.isFinite(Number(day)) ? Number(day) : null;
  const status = SKIN_STATUS[phaseName] || null;
  const phaseDayText = phaseUpper && dayNum != null
    ? `( ${phaseUpper} • DAY ${dayNum} )`
    : null;

  // Logo + status phrase + phase/day line are laid out as ONE
  // cohesive group: fixed small gaps between elements, with the
  // whole group vertically centered a little above the canvas
  // midpoint (so the separately-anchored signature has room to sit
  // near the true bottom without crowding).
  const LOGO_SIZE = 110;
  const GAP_LOGO_TO_STATUS = 46;
  const STATUS_FONT_SIZE = 108;
  const STATUS_LINE_HEIGHT = 116;
  const GAP_STATUS_TO_PHASEDAY = 34;
  const PHASEDAY_FONT_SIZE = 32;

  ctx.font = `700 ${STATUS_FONT_SIZE}px "Fungis Heavy", "Fungis", sans-serif`;
  const statusLines = status ? wrapSpacedWords(ctx, status, STATUS_FONT_SIZE, 0.02, MAX_TEXT_WIDTH) : [];
  const statusHeight = statusLines.length * STATUS_LINE_HEIGHT;

  ctx.font = `400 ${PHASEDAY_FONT_SIZE}px "Fungis Normal", "Fungis", sans-serif`;
  const phaseDayHeight = phaseDayText ? PHASEDAY_FONT_SIZE : 0;

  let logoHeight = 0;
  if (logo) {
    logoHeight = LOGO_SIZE * (logo.naturalHeight / (logo.naturalWidth || 1));
  }

  const totalGroupHeight =
    (logo ? logoHeight + GAP_LOGO_TO_STATUS : 0) +
    statusHeight +
    (phaseDayText ? GAP_STATUS_TO_PHASEDAY + phaseDayHeight : 0);

  // Group's vertical center sits a bit above the canvas midpoint —
  // this leaves generous breathing room below for the signature to
  // sit near the true bottom without the two blocks feeling stacked
  // on top of each other.
  const groupCenterY = CANVAS_H * 0.42;
  let cursorY = groupCenterY - totalGroupHeight / 2;

  // 1. Logo. Natural (unfiltered) render — the source asset is
  //    inherently dark, matching the app's existing brightness(0)
  //    invert(1) pattern used elsewhere to make it read on dark
  //    backgrounds; here we want the dark original. A soft ivory
  //    shadow plays the same halo role the text strokes play.
  if (logo) {
    const w = LOGO_SIZE;
    const h = logoHeight;
    ctx.save();
    ctx.shadowColor = "rgba(250, 249, 244, 0.85)";
    ctx.shadowBlur = 12;
    ctx.drawImage(logo, (CANVAS_W - w) / 2, cursorY, w, h);
    ctx.restore();
    cursorY += h + GAP_LOGO_TO_STATUS;
  }

  // 2. Skin-status phrase.
  if (status) {
    ctx.font = `700 ${STATUS_FONT_SIZE}px "Fungis Heavy", "Fungis", sans-serif`;
    const centerY = cursorY + statusHeight / 2;
    drawWrappedBlock(ctx, status, CANVAS_W / 2, centerY, STATUS_FONT_SIZE, 0.02, STATUS_LINE_HEIGHT, statusHalo, MAX_TEXT_WIDTH);
    cursorY += statusHeight;
  }

  // 3. Phase + day — "( FOLLICULAR • DAY 8 )".
  if (phaseDayText) {
    cursorY += GAP_STATUS_TO_PHASEDAY;
    ctx.font = `400 ${PHASEDAY_FONT_SIZE}px "Fungis Normal", "Fungis", sans-serif`;
    drawSpacedLine(ctx, phaseDayText, CANVAS_W / 2, cursorY + PHASEDAY_FONT_SIZE / 2, PHASEDAY_FONT_SIZE, 0.24, phaseDayHalo);
  }

  // 4. cygne.skin signature — quiet, near the true bottom, anchored
  //    independently of the group above (no CTA styling).
  ctx.font = '400 30px "Fungis Normal", "Fungis", sans-serif';
  drawSpacedLine(ctx, "cygne.skin", CANVAS_W / 2, 1780, 30, 0.24, sigHalo);

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
  const filename = `cygne-skin-status-${safePhase}-day-${safeDay}.png`;
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

export { SKIN_STATUS, renderCycleShareBlob, shareCycleCard };
