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
// uses (see PHASE_META in progress.jsx), never a clinical claim. The
// generated guidance bullets follow the same rule: pattern/trend
// framing ("may benefit from", "consider") rather than declarative
// diagnostic statements.
//
// Fast-follow, not in this pass: Air Quality Index. Open-Meteo serves
// AQI from a separate Air Quality API (air-quality-api.open-meteo.com)
// that isn't integrated yet — environment.jsx's useWeather only calls
// the standard forecast endpoint. Wiring that up is a self-contained
// follow-up, not a blocker for this card.

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

// Humidity's own tone reads independently of barrier risk (which
// already folds humidity in as one input among several) — this is
// just "is today's air dry, comfortable, or humid," a simpler and
// more literal read of the same number.
function toneForHumidity(humidity) {
  if (humidity < 30) return "caution";
  if (humidity < 55) return "neutral";
  return "positive";
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

// Builds the short list of index items + a short list of rule-based
// guidance bullets. Returns:
//   { items: [{ key, label, value, tone }], actions: string[] }
//
// items is [] (and actions []) only when neither cycle phase nor any
// weather field resolved — the caller should omit the whole card in
// that case; any partial signal still produces a reduced-but-present
// card, per spec ("gracefully reduce... rather than hiding the whole
// card"). Each guidance bullet only appears when the specific
// condition behind it is actually present in the data — there's no
// padding to hit a target count, so the list can be anywhere from 0
// to 3 items.
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

  if (humidity != null) {
    // relative_humidity_2m from Open-Meteo, already fetched by
    // environment.jsx's useWeather — same source as the UV item
    // above, just a different field off the same response.
    items.push({ key: "humidity", label: "Humidity", value: `${Math.round(humidity)}%`, tone: toneForHumidity(humidity) });
  }

  const sebumTrend = cyclePhaseName ? SEBUM_TREND_BY_PHASE[cyclePhaseName] || null : null;
  if (sebumTrend) {
    items.push({ key: "sebum", label: "Sebum Trend", value: sebumTrend, tone: toneFor(sebumTrend) });
  }

  if (items.length === 0) {
    return { items: [], actions: [] };
  }

  const highUv = uvIndex != null && uvIndex >= 6;
  const risingOil = sebumTrend === "Escalating" || sebumTrend === "Peak";

  // Each candidate is independent and only fires on its own specific
  // condition — no artificial padding to reach a target count.
  const actions = [];

  // Morning product suggestion.
  if (barrierRisk === "High" || (highUv && risingOil)) {
    actions.push("A lightweight gel moisturizer may suit better than a heavier cream this morning.");
  } else if (barrierRisk === "Medium" && humidity != null && humidity < 35) {
    actions.push("Today's lower humidity may benefit from a richer, barrier-supporting moisturizer.");
  }

  // Active-ingredient guidance — a caution when the barrier looks
  // stressed, or a trend-based suggestion when oil is climbing and
  // the barrier isn't compromised. Mutually exclusive: never suggest
  // adding an active in the same breath as backing off actives.
  if (barrierRisk === "High") {
    actions.push("Exfoliating acids may be worth holding off on — barrier sensitivity looks elevated today.");
  } else if (risingOil) {
    actions.push("Rising oil this phase may benefit from a BHA or clay-based step in your routine.");
  }

  // SPF reminder, only when UV is meaningfully high.
  if (highUv) {
    actions.push("Consider reapplying SPF today, especially with extended time outdoors.");
  }

  // Calm fallback — only when there's real data to read but nothing
  // notable enough to have triggered a bullet above, so the section
  // never renders as an empty gap under a populated index.
  if (actions.length === 0) {
    actions.push("Nothing unusual in today's pattern — your usual ritual should serve you well.");
  }

  return { items, actions };
}

export { buildSkinIndex, SEBUM_TREND_BY_PHASE };
