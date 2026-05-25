import { useState, useEffect } from "react";

// Pulls current weather from open-meteo for a given location. Returns
// { env, loading } — env is null until the first successful fetch and
// stays null on failure (callers should treat absence as "no weather
// signal" rather than retrying).
export function useWeather(locationData, tempUnit = "C") {
  const [env, setEnv] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!locationData?.lat || !locationData?.lon) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${locationData.lat}&longitude=${locationData.lon}&current=temperature_2m,relative_humidity_2m,uv_index&timezone=auto&forecast_days=1`;
        const res = await fetch(url);
        const data = await res.json();
        if (cancelled) return;
        const current = data.current || {};
        setEnv({
          temp: current.temperature_2m ?? null,
          humidity: current.relative_humidity_2m ?? null,
          uvIndex: current.uv_index ?? null,
        });
      } catch (e) {
        // silently fail — absence reads as "no weather signal"
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [locationData?.lat, locationData?.lon, tempUnit]);

  return { env, loading };
}
