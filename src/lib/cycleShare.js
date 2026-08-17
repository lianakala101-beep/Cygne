// Skin Status shareable STICKER generator.
//
// Renders a compact, content-sized transparent PNG on an off-screen
// canvas — NOT a full-screen Story background and NOT a screenshot
// of the in-app card. The exported canvas is cropped tightly to the
// actual content bounding box (logo + status phrase + phase/day line
// + signature) plus a small padding margin, so it behaves like a
// normal Instagram sticker once shared: small, draggable, resizable,
// rotatable on the user's Story canvas — not a full-bleed image they
// have to manually shrink to make room for anything else.
//
// Layout, top to bottom, all tightly grouped (this is a sticker, not
// a poster — nothing is spread across a fixed 1920px canvas anymore):
//
//   1. Cygne logo mark (110px, quiet), tight gap to the block below.
//   2. Skin-status phrase in large Fungis Heavy — phase-mapped,
//      framed as a window/phase (SKIN_STATUS map) rather than a
//      measured biological fact. Wraps onto multiple lines when the
//      phrase is too wide for the design wrap width.
//   3. Directly below, smaller: "( FOLLICULAR • DAY 8 )" — phase name
//      + day, Fungis Normal, wide tracking.
//   4. cygne.skin signature, small, sitting just below that — still
//      part of the same tight sticker block, not a poster footer.
//
// The canvas is sized to fit exactly this content (measured in a
// first pass, then drawn into a canvas sized to match) plus
// STICKER_PADDING on every side — no large surrounding transparent
// field.
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

const INKY_MOSS = "#2d3d2b";
const IVORY_HALO = "#faf9f4";
// Design wrap width for the status phrase — independent of the
// export canvas now that the canvas is content-sized rather than a
// fixed 1080px-wide Story frame. Keeps the same line-break behavior
// the phrase had in the Story-sized draft (unchanged visual content),
// just no longer tied to a literal canvas width.
const STATUS_WRAP_WIDTH = 900;
// Padding around the tightly-cropped content on every side, so the
// sticker doesn't touch its own bounding box edges.
const STICKER_PADDING = 56;

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
  try { if (document?.fonts?.ready) await document.fonts.ready; } catch {}

  let logo = null;
  try { logo = await loadLogo(); } catch {}

  // Halo widths scale with font size so the outline reads at
  // consistent visual weight across tiers. Unchanged from the
  // Story-sized draft — purely a cropping change, not a content one.
  const statusHalo = { color: IVORY_HALO, width: 6 };
  const phaseDayHalo = { color: IVORY_HALO, width: 3 };
  const sigHalo = { color: IVORY_HALO, width: 2 };

  const phaseUpper = String(phaseName || "").toUpperCase();
  const dayNum = Number.isFinite(Number(day)) ? Number(day) : null;
  const status = SKIN_STATUS[phaseName] || null;
  const phaseDayText = phaseUpper && dayNum != null
    ? `( ${phaseUpper} • DAY ${dayNum} )`
    : null;

  // Same type sizes and gaps as the Story-sized draft — only the
  // canvas itself is now sized to fit them instead of the reverse.
  const LOGO_SIZE = 110;
  const GAP_LOGO_TO_STATUS = 46;
  const STATUS_FONT_SIZE = 108;
  const STATUS_LINE_HEIGHT = 116;
  const GAP_STATUS_TO_PHASEDAY = 34;
  const PHASEDAY_FONT_SIZE = 32;
  const GAP_PHASEDAY_TO_SIG = 44;
  const SIG_FONT_SIZE = 30;

  // -- Pass 1: measure ------------------------------------------------
  // A scratch canvas gives us a 2D context for ctx.measureText before
  // we know the final (content-sized) canvas dimensions. Canvas size
  // doesn't affect text metrics as long as the font is set on this
  // context the same way it'll be set on the real one.
  const scratch = document.createElement("canvas");
  const mctx = scratch.getContext("2d");
  mctx.textBaseline = "middle";
  mctx.textAlign = "center";

  mctx.font = `700 ${STATUS_FONT_SIZE}px "Fungis Heavy", "Fungis", sans-serif`;
  const statusLines = status ? wrapSpacedWords(mctx, status, STATUS_FONT_SIZE, 0.02, STATUS_WRAP_WIDTH) : [];
  const statusLineWidths = statusLines.map(line => measureSpacedWidth(mctx, line, STATUS_FONT_SIZE * 0.02));
  const statusMaxWidth = statusLineWidths.length ? Math.max(...statusLineWidths) : 0;
  const statusHeight = statusLines.length * STATUS_LINE_HEIGHT;

  mctx.font = `400 ${PHASEDAY_FONT_SIZE}px "Fungis Normal", "Fungis", sans-serif`;
  const phaseDayWidth = phaseDayText ? measureSpacedWidth(mctx, phaseDayText, PHASEDAY_FONT_SIZE * 0.24) : 0;
  const phaseDayHeight = phaseDayText ? PHASEDAY_FONT_SIZE : 0;

  mctx.font = `400 ${SIG_FONT_SIZE}px "Fungis Normal", "Fungis", sans-serif`;
  const sigWidth = measureSpacedWidth(mctx, "cygne.skin", SIG_FONT_SIZE * 0.24);

  let logoWidth = 0;
  let logoHeight = 0;
  if (logo) {
    logoWidth = LOGO_SIZE;
    logoHeight = LOGO_SIZE * (logo.naturalHeight / (logo.naturalWidth || 1));
  }

  const contentWidth = Math.max(logoWidth, statusMaxWidth, phaseDayWidth, sigWidth);
  const contentHeight =
    (logo ? logoHeight + GAP_LOGO_TO_STATUS : 0) +
    statusHeight +
    (phaseDayText ? GAP_STATUS_TO_PHASEDAY + phaseDayHeight : 0) +
    GAP_PHASEDAY_TO_SIG + SIG_FONT_SIZE;

  // -- Pass 2: draw into a canvas sized to exactly fit that content --
  const canvasW = Math.ceil(contentWidth + STICKER_PADDING * 2);
  const canvasH = Math.ceil(contentHeight + STICKER_PADDING * 2);
  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  // Transparent background: canvas is never filled with an opaque
  // color — no fillRect / clearRect touches it — so the PNG's alpha
  // channel is preserved end to end.
  ctx.fillStyle = INKY_MOSS;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  const centerX = canvasW / 2;
  let cursorY = STICKER_PADDING;

  // 1. Logo. Natural (unfiltered) render — the source asset is
  //    inherently dark, matching the app's existing brightness(0)
  //    invert(1) pattern used elsewhere to make it read on dark
  //    backgrounds; here we want the dark original. A soft ivory
  //    shadow plays the same halo role the text strokes play.
  if (logo) {
    ctx.save();
    ctx.shadowColor = "rgba(250, 249, 244, 0.85)";
    ctx.shadowBlur = 12;
    ctx.drawImage(logo, centerX - logoWidth / 2, cursorY, logoWidth, logoHeight);
    ctx.restore();
    cursorY += logoHeight + GAP_LOGO_TO_STATUS;
  }

  // 2. Skin-status phrase.
  if (status) {
    ctx.font = `700 ${STATUS_FONT_SIZE}px "Fungis Heavy", "Fungis", sans-serif`;
    statusLines.forEach((line, i) => {
      drawSpacedLine(ctx, line, centerX, cursorY + STATUS_LINE_HEIGHT / 2 + i * STATUS_LINE_HEIGHT, STATUS_FONT_SIZE, 0.02, statusHalo);
    });
    cursorY += statusHeight;
  }

  // 3. Phase + day — "( FOLLICULAR • DAY 8 )".
  if (phaseDayText) {
    cursorY += GAP_STATUS_TO_PHASEDAY;
    ctx.font = `400 ${PHASEDAY_FONT_SIZE}px "Fungis Normal", "Fungis", sans-serif`;
    drawSpacedLine(ctx, phaseDayText, centerX, cursorY + PHASEDAY_FONT_SIZE / 2, PHASEDAY_FONT_SIZE, 0.24, phaseDayHalo);
    cursorY += phaseDayHeight;
  }

  // 4. cygne.skin signature — quiet, still part of the same tight
  //    sticker block (no CTA styling).
  cursorY += GAP_PHASEDAY_TO_SIG;
  ctx.font = `400 ${SIG_FONT_SIZE}px "Fungis Normal", "Fungis", sans-serif`;
  drawSpacedLine(ctx, "cygne.skin", centerX, cursorY + SIG_FONT_SIZE / 2, SIG_FONT_SIZE, 0.24, sigHalo);

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
