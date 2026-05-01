import { useState, useEffect } from "react";
import { Icon } from "./components.jsx";
import { hasSPFCoverage } from "./engine.js";


function buildEnvAdvice(env, products, activeMap) {
  const { humidity, uvIndex, aqi, altitude, temp } = env;
  const hasVitC    = !!activeMap["vitamin C"]?.length;
  const hasRetinol = !!activeMap["retinol"]?.length;
  const hasAHA     = !!activeMap["AHA"]?.length;
  const hasSPF     = hasSPFCoverage(products, activeMap);
  const hasMoisturizer = products.some(p => p.category === "Moisturizer" || p.category === "SPF Moisturizer");
  const hasCeramide = products.some(p => (p.ingredients || []).some(i => i.includes("ceramide")));

  const nudges = [];

  // Humidity
  if (humidity !== null) {
    if (humidity < 30) {
      nudges.push({ icon: "drop", text: hasCeramide ? "Very dry air today. Layer ceramides before your moisturizer to lock hydration in." : "Humidity is critically low. Your skin is losing moisture fast — occlusive moisturizer is essential right now.", severity: "warning" });
    } else if (humidity < 45) {
      nudges.push({ icon: "drop", text: "Low humidity. Apply hyaluronic acid on damp skin and seal immediately with moisturizer.", severity: "caution" });
    } else if (humidity > 75) {
      nudges.push({ icon: "fog", text: "High humidity today. Lighter textures will absorb better — skip heavy occlusives if skin feels congested.", severity: "info" });
    }
  }

  // UV Index
  if (uvIndex !== null) {
    if (uvIndex >= 8) {
      nudges.push({ icon: "sun", text: hasSPF ? "UV is extreme today. Reapply SPF every 90 minutes outdoors — no product lasts longer in this intensity." : "UV index is extreme and no SPF is on your vanity. This is your highest-risk day for UV damage.", severity: "warning" });
    } else if (uvIndex >= 6) {
      nudges.push({ icon: "sun", text: hasSPF ? "High UV today. SPF is your most important step this morning." : "High UV and no SPF detected. Consider adding one — it's the highest-impact change you can make.", severity: "caution" });
    } else if (uvIndex >= 3 && !hasSPF) {
      nudges.push({ icon: "sun", text: "Moderate UV. SPF still applies even on cloudy days.", severity: "info" });
    }
  }

  // AQI
  if (aqi !== null) {
    if (aqi > 150) {
      nudges.push({ icon: "fog", text: hasVitC ? "Air quality is poor. Your Vitamin C is doing important work today — don't skip it." : "Air quality is poor. Pollution particles accelerate oxidative skin damage. Vitamin C would help significantly right now.", severity: "warning" });
    } else if (aqi > 100) {
      nudges.push({ icon: "fog", text: "Moderate pollution today. Cleansing thoroughly tonight removes particulate buildup.", severity: "caution" });
    }
  }

  // Altitude
  if (altitude !== null && altitude > 1500) {
    nudges.push({ icon: "mountain", text: `At ${Math.round(altitude)}m elevation, UV is ${Math.round(altitude/1000*10)}% stronger than at sea level. SPF diligence matters more here.`, severity: "info" });
  }

  // Temperature extremes
  if (temp !== null) {
    if (temp < 2) {
      nudges.push({ icon: "snow", text: hasRetinol ? "Near-freezing temperatures increase retinol sensitivity. Apply a thin layer of moisturizer before your retinol tonight as a buffer." : "Very cold conditions stress the barrier. Prioritize occlusive hydration today.", severity: "caution" });
    } else if (temp > 35) {
      nudges.push({ icon: "thermo", text: "Extreme heat increases product absorption and can amplify active irritation. Reduce AHA/retinol intensity today if you notice sensitivity.", severity: "caution" });
    }
  }

  return nudges;
}

function EnvironmentStrip({ products, activeMap, locationData, tempUnit = "C" }) {
  const [env, setEnv] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchWeather = async (lat, lon) => {
    setLoading(true);
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,uv_index&timezone=auto&forecast_days=1`;
      const res = await fetch(url);
      const data = await res.json();
      const current = data.current;
      setEnv({
        temp: current.temperature_2m ?? null,
        humidity: current.relative_humidity_2m ?? null,
        uvIndex: current.uv_index ?? null,
        aqi: null,
        altitude: null,
      });
    } catch(e) {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (locationData?.lat && locationData?.lon) {
      fetchWeather(locationData.lat, locationData.lon);
    }
  }, [locationData?.lat, locationData?.lon, tempUnit]);

  // No location set yet — silent, no button
  if (!locationData) return null;

  if (loading) {
    return (
      <div style={{ padding: "12px 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 14, height: 14, border: "1.5px solid #2d3d2b", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)" }}>Reading local conditions...</span>
      </div>
    );
  }

  if (!env) return null;
  const location = locationData;

  const nudges = buildEnvAdvice(env, products, activeMap);
  const uvCol = env.uvIndex >= 8 ? "#8b7355" : env.uvIndex >= 6 ? "#8b7355" : env.uvIndex >= 3 ? "#8b7355" : "#2d3d2b";
  const humCol = env.humidity < 30 ? "#8b7355" : env.humidity < 45 ? "#8b7355" : env.humidity > 75 ? "#8b7355" : "#2d3d2b";

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Compact strip */}
      <button onClick={() => setExpanded(e => !e)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 0, padding: "11px 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: expanded ? "12px 12px 0 0" : 12, cursor: "pointer", transition: "all 0.2s", textAlign: "left" }}
        onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(45,61,43,0.35)"}
        onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>

        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 10, letterSpacing: "0.12em", color: "var(--color-inky-moss)" }}>
            {location?.city}{location?.country ? ` · ${location.country}` : ""}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {env.humidity !== null && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: "var(--clay)", opacity: 0.5, display: "inline-flex" }}><Icon name="drop" size={10} /></span>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 10, letterSpacing: "0.12em", color: "var(--color-inky-moss)" }}>{env.humidity}%</span>
            </div>
          )}
          {env.uvIndex !== null && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: "var(--clay)", opacity: 0.5, display: "inline-flex" }}><Icon name="sun" size={10} /></span>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 10, letterSpacing: "0.12em", color: "var(--color-inky-moss)" }}>UV {env.uvIndex}</span>
            </div>
          )}
          {env.temp !== null && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 10, letterSpacing: "0.12em", color: "var(--color-inky-moss)" }}>{Math.round(tempUnit === "F" ? (env.temp * 9/5 + 32) : env.temp)}°{tempUnit}</span>
            </div>
          )}
          {nudges.length > 0 && (
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: nudges[0].severity === "warning" ? "#8b7355" : "#8b7355" }} />
          )}
          <span style={{ color: "var(--clay)", opacity: 0.4, transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.2s", display: "inline-flex" }}><Icon name="chevron" size={10} /></span>
        </div>
      </button>

      {/* Expanded nudges */}
      {expanded && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 12px 12px", overflow: "hidden" }}>
          {nudges.length > 0 ? nudges.map((n, i) => (
            <div key={i} style={{ display: "flex", gap: 11, padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
              <span style={{ color: "var(--clay)", flexShrink: 0, marginTop: 1, display: "inline-flex" }}><Icon name={n.icon} size={12} /></span>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: 0, lineHeight: 1.65 }}>{n.text}</p>
            </div>
          )) : (
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--clay)", margin: 0 }}>Conditions look good for your ritual today.</p>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// --- DASHBOARD ----------------------------------------------------------------


export { EnvironmentStrip, buildEnvAdvice };