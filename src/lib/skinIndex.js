// Daily Skin Index — pure rule-based synthesis of data that already
// exists elsewhere in the app (cycle phase, local weather) into a
// short, scannable readout for the home dashboard.
//
// No LLM call, no new data source — this reads the same signals
// dashboard.jsx already computes (getCyclePhase / getCurrentCycleDay
// from progress.jsx + utils.jsx, useWeather from environment.jsx) and
// combines them with simple conditionals, the same pattern
// swansense.jsx uses for its rule-based predictions.
//
// Every value here is a same-day readout, not a diagnosis — labels
// stay in the "risk / trend" register the rest of the app already
// uses (see PHASE_META in progress.jsx), never a clinical claim.

// Sebum trend is driven entirely by cycle phase — no weather
// dependency, so this item is still available with cycle tracking
// enabled even when location/weather data is missing. Follicular and
// Ovulatory intentionally share "Escalating" — sebum climbs through
// both phases as estrogen rises — Luteal is where it crests, and
// Menstrual is the trough right after the drop in both hormones.
const SEBUM_TREND_BY_PHASE = {
  Menstrual:  "Low",
  Follicular: "Escalating",
  Ovulatory:  "Escalating",
  Luteal:     "Peak",
};

// Barrier risk combines a hormonal baseline (luteal/menstrual skin is
// more reactive and slower to recover — same framing used in
// PHASE_META.Menstrual/Luteal in progress.jsx) with environmental
// dryness (low humidity strips the barrier faster) and, lightly, high
// UV (adds oxidative load on top of an already-taxed barrier). Either
// signal alone is enough to compute a partial score; only fully
// absent when NEITHER cycle phase NOR any weather field is available.
function computeBarrierRisk({ cyclePhaseName, humidity, uvIndex }) {
  if (cyclePhaseName == null && humidity == null && uvIndex == null) return null;

  let score = 0;
  if (cyclePhaseName === "Luteal" || cyclePhaseName === "Menstrual") score += 1;
  if (humidity != null) {
    if (humidity < 20) score += 1.5;
    else if (humidity < 35) score += 1;
    else if (humidity < 50) score += 0.5;
  }
  if (uvIndex != null && uvIndex >= 6) score += 0.5;

  if (score >= 1.5) return "High";
  if (score >= 1) return "Medium";
  return "Low";
}

// Tone maps each index value to the same semantic palette used
// elsewhere in the app: sage/moss for a favorable reading, warm clay
// for a caution reading, plain ivory for anything in between.
const TONE_BY_VALUE = {
  High: "caution", Medium: "neutral", Low: "positive",
  Escalating: "caution", Peak: "caution",
};

function toneFor(value) {
  return TONE_BY_VALUE[value] || "neutral";
}

// Builds the short list of index items + one synthesized action line.
// Returns { items: [{ key, label, value, tone }], actionLine: string|null }.
// items is [] (and actionLine null) only when neither cycle phase nor
// any weather field resolved — the caller should omit the whole card
// in that case; any partial signal still produces a reduced-but-
// present card, per spec ("gracefully reduce... rather than hiding
// the whole card").
function buildSkinIndex({ cyclePhaseName = null, weather = null } = {}) {
  const humidity = weather?.humidity ?? null;
  const uvIndex = weather?.uvIndex ?? null;

  const items = [];

  const barrierRisk = computeBarrierRisk({ cyclePhaseName, humidity, uvIndex });
  if (barrierRisk) {
    items.push({ key: "barrier", label: "Barrier Risk", value: barrierRisk, tone: toneFor(barrierRisk) });
  }

  if (uvIndex != null) {
    // Display rounded to the nearest whole number — UV index is
    // conventionally shown on a 0-11+ integer scale, no decimals.
    // The raw fractional value (e.g. from open-meteo) is still what
    // drives the >=6 threshold checks above/below, so precision isn't
    // lost for the scoring logic — only the displayed label rounds.
    items.push({ key: "uv", label: "UV Index", value: String(Math.round(uvIndex)), tone: uvIndex >= 6 ? "caution" : "neutral" });
  }

  const sebumTrend = cyclePhaseName ? SEBUM_TREND_BY_PHASE[cyclePhaseName] || null : null;
  if (sebumTrend) {
    items.push({ key: "sebum", label: "Sebum Trend", value: sebumTrend, tone: toneFor(sebumTrend) });
  }

  if (items.length === 0) {
    return { items: [], actionLine: null };
  }

  const highUv = uvIndex != null && uvIndex >= 6;
  const risingOil = sebumTrend === "Escalating" || sebumTrend === "Peak";

  let actionLine;
  if (highUv && risingOil) {
    actionLine = "High sebum + high UV today. Consider your gel moisturizer over your cream, and don't skip SPF.";
  } else if (barrierRisk === "High") {
    actionLine = "Barrier risk is elevated today — lean on ceramides, skip new actives, and keep the ritual gentle.";
  } else if (sebumTrend === "Peak") {
    actionLine = "Oil is at its peak this phase — a clay mask or your BHA can help keep congestion in check.";
  } else if (sebumTrend === "Escalating") {
    actionLine = "Sebum is climbing — a lighter moisturizer may feel better than usual today.";
  } else if (barrierRisk === "Medium" && humidity != null && humidity < 35) {
    actionLine = "Low humidity is stressing your barrier — layer a hydrating serum underneath your moisturizer.";
  } else if (highUv) {
    actionLine = "UV is high today — SPF isn't optional.";
  } else if (sebumTrend === "Low") {
    actionLine = "Oil production is naturally lower right now — a good window for richer textures.";
  } else if (barrierRisk === "Low") {
    actionLine = "Nothing unusual in today's readout — stick with your usual ritual.";
  } else {
    actionLine = null;
  }

  return { items, actionLine };
}

export { buildSkinIndex, SEBUM_TREND_BY_PHASE };
