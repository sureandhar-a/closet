// Open-Meteo forecast + city search. Last forecast is cached so offline still shows something.
import { getKV, setKV } from './db.js';

export async function searchPlaces(q) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=5&name=${encodeURIComponent(q)}`);
  return ((await r.json()).results || []).map((p) => ({ name: [p.name, p.admin1].filter(Boolean).join(', '), lat: p.latitude, lon: p.longitude }));
}

// Returns {days: {'YYYY-MM-DD': {max, min, rain}}, fetched, stale?} or null if no place and no cache.
export async function getForecast(place) {
  const cached = await getKV('weather', null);
  if (!place) return cached;
  const fresh = cached && cached.place?.lat === place.lat && Date.now() - cached.fetched < 3 * 36e5;
  if (fresh) return cached;
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=7`;
    const d = (await (await fetch(u)).json()).daily;
    const days = {};
    d.time.forEach((t, i) => (days[t] = { max: Math.round(d.temperature_2m_max[i]), min: Math.round(d.temperature_2m_min[i]), rain: d.precipitation_probability_max[i] ?? 0 }));
    const w = { place, days, fetched: Date.now() };
    await setKV('weather', w);
    return w;
  } catch {
    return cached && { ...cached, stale: true };
  }
}
