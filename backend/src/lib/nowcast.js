// Local outlook ("nowcast") from the station's own sensors.
//
// Not a scientific forecast: a transparent, rule-based estimate in the spirit of classic
// barometer forecasting (Zambretti), combined with humidity, dew point and light.
// Each rule adds or removes "evidence" (log-odds) for rain; the sum is turned into a
// probability for three horizons. Every rule that fired is returned as a factor, so the
// page can explain why it says what it says.

import { lastWindow, windowRate } from './calculations.js';

const MIN = 60e3;
const round = (v, d = 0) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const logistic = (x) => 1 / (1 + Math.exp(-x));
const meanOf = (pts) => (pts.length ? pts.reduce((a, p) => a + p.v, 0) / pts.length : null);
const lastV = (pts) => (pts.length ? pts[pts.length - 1].v : null);

/** Tunable weights and limits. Positive weight = more likely to rain. */
export const NOWCAST = {
  base: -2.2, // about 10 % with no evidence either way
  // Pressure tendency in hPa per 3 h (classic barometer bands)
  pressureTendency: [
    { max: -3, w: 2.6, key: 'pressure_falling_fast' },
    { max: -1.6, w: 1.8, key: 'pressure_falling' },
    { max: -0.5, w: 0.9, key: 'pressure_falling_slowly' },
    { max: 0.5, w: 0, key: null },
    { max: 1.6, w: -0.7, key: 'pressure_rising' },
    { max: Infinity, w: -1.2, key: 'pressure_rising_fast' },
  ],
  // Absolute pressure (hPa)
  pressureLevel: [
    { max: 1000, w: 0.8, key: 'pressure_very_low' },
    { max: 1008, w: 0.4, key: 'pressure_low' },
    { max: 1016, w: 0, key: null },
    { max: 1022, w: -0.3, key: 'pressure_high' },
    { max: Infinity, w: -0.6, key: 'pressure_very_high' },
  ],
  // Spread = temperature - dew point (°C): how close the air is to saturation
  spread: [
    { max: 1, w: 1.6, key: 'saturated' },
    { max: 2.5, w: 1.1, key: 'near_saturation' },
    { max: 4, w: 0.5, key: 'moist' },
    { max: 10, w: 0, key: null },
    { max: 15, w: -0.8, key: 'dry_air' },
    { max: Infinity, w: -1.2, key: 'very_dry_air' },
  ],
  spreadClosing: { rate: -1, w: 0.4 }, // spread shrinking faster than 1 °C/h
  humidityRising: { rate: 5, w: 0.5 }, // %/h
  // Dew point (°C): moisture available for showers and storms
  dewPoint: [
    { max: 8, w: -0.4, key: 'low_moisture' },
    { max: 18, w: 0, key: null },
    { max: 21, w: 0.4, key: 'moist_air_mass' },
    { max: Infinity, w: 0.7, key: 'very_moist_air_mass' },
  ],
  // Daytime cloud cover estimated from light (0 = clear, 1 = overcast)
  cloudCover: [
    { max: 0.25, w: -0.6, key: 'sunny' },
    { max: 0.6, w: 0, key: null },
    { max: 0.8, w: 0.3, key: 'mostly_cloudy' },
    { max: Infinity, w: 0.7, key: 'overcast' },
  ],
  darkening: { drop: 0.35, w: 0.6 }, // share of clear-sky light lost in the last 30 min
  coolingBurst: { rate: -2, w: 0.6 }, // °C/h in 30 min with humidity rising: rain-cooled air
  dayMinLux: 400, // clear-sky reference above this = daytime
  cloudMinLux: 2000, // estimate cloud cover only with the sun this high (twilight changes too fast)
  // How much each group weighs per horizon (pressure acts slowly, humidity/light quickly)
  horizons: {
    '1h': { pressure: 0.6, moisture: 1.0, sky: 1.0 },
    '3h': { pressure: 1.0, moisture: 1.0, sky: 0.9 },
    '6h': { pressure: 1.25, moisture: 0.7, sky: 0.5 },
  },
};

const band = (bands, v) => bands.find((b) => v < b.max) || bands[bands.length - 1];

/**
 * Clear-sky light reference from the last days: for each 30-min slot of the day, the highest
 * illuminance seen. Learns the sensor's own placement and shading.
 */
export function lightReference(luxPts) {
  const slots = new Map();
  const days = new Set();
  for (const p of luxPts) {
    const d = new Date(p.t);
    const slot = d.getHours() * 2 + (d.getMinutes() >= 30 ? 1 : 0);
    slots.set(slot, Math.max(slots.get(slot) ?? 0, p.v));
    days.add(d.toDateString());
  }
  // Interpolate between slot centres (hh:15 and hh:45) so the curve follows sunrise and sunset
  const at = (t) => {
    const d = new Date(t);
    const x = (d.getHours() * 60 + d.getMinutes()) / 30 - 0.5;
    const s0 = Math.floor(x);
    const k = x - s0;
    const a = slots.get((s0 + 48) % 48);
    const b = slots.get((s0 + 1 + 48) % 48);
    if (a == null && b == null) return null;
    if (a == null) return b;
    if (b == null) return a;
    return a + (b - a) * k;
  };
  return { at, days: days.size };
}

/**
 * @param s      3 h series (1 min buckets): temperature, humidity, pressure, illuminance, dewPoint
 * @param luxRef result of lightReference() over the last 7 days (or null)
 * @param dew    snapshot dew point analysis (spread, level)
 * @param pressure snapshot pressure analysis (value, rate in hPa/3h, trend)
 */
export function nowcast({ s, luxRef, dew, pressure }, now = Date.now()) {
  const W = NOWCAST;
  const factors = [];
  const groups = { pressure: 0, moisture: 0, sky: 0 };
  const add = (group, w, key, detail) => {
    if (!w || !key) return;
    groups[group] += w;
    factors.push({ key, effect: w > 0 ? 'raises' : 'lowers', weight: round(w, 2), group, ...detail });
  };

  // --- Pressure ---------------------------------------------------------------
  const p3 = pressure?.rate; // hPa/3h
  const pNow = pressure?.value;
  if (p3 != null) {
    const b = band(W.pressureTendency, p3);
    add('pressure', b.w, b.key, { value: round(p3, 1), unit: 'hPa/3h' });
  }
  if (pNow != null) {
    const b = band(W.pressureLevel, pNow);
    add('pressure', b.w, b.key, { value: round(pNow, 0), unit: 'hPa' });
  }

  // --- Moisture ---------------------------------------------------------------
  const spread = dew?.spread;
  if (spread != null) {
    const b = band(W.spread, spread);
    add('moisture', b.w, b.key, { value: round(spread, 1), unit: '°C' });
  }
  // Spread trend (°C/h) from paired temperature and dew point readings
  const dewMap = new Map((s.dewPoint || []).map((p) => [p.t, p.v]));
  const spreadPts = (s.temperature || []).filter((p) => dewMap.has(p.t)).map((p) => ({ t: p.t, v: p.v - dewMap.get(p.t) }));
  const spreadRate = windowRate(spreadPts, 45 * MIN);
  if (spreadPts.length >= 3 && spreadRate <= W.spreadClosing.rate) add('moisture', W.spreadClosing.w, 'spread_closing', { value: round(spreadRate, 1), unit: '°C/h' });
  const humRate = windowRate(s.humidity || [], 30 * MIN);
  if (humRate >= W.humidityRising.rate) add('moisture', W.humidityRising.w, 'humidity_rising', { value: round(humRate, 1), unit: '%/h' });
  if (dew?.value != null) {
    const b = band(W.dewPoint, dew.value);
    add('moisture', b.w, b.key, { value: round(dew.value, 1), unit: '°C' });
  }

  // --- Sky (light) ------------------------------------------------------------
  const lux = s.illuminance || [];
  const ref = luxRef?.at(now) ?? null;
  const isDay = ref != null ? ref >= W.dayMinLux : null;
  let cloudCover = null;
  if (isDay && ref >= W.cloudMinLux && lux.length) {
    const cur = meanOf(lastWindow(lux, 15 * MIN));
    cloudCover = clamp(1 - cur / ref, 0, 1);
    const b = band(W.cloudCover, cloudCover);
    add('sky', b.w, b.key, { value: round(cloudCover * 100), unit: '%' });
    // Rapid darkening compared with what the clear-sky curve would explain
    const then = lux.filter((p) => p.t <= now - 30 * MIN && p.t > now - 45 * MIN);
    const refThen = luxRef.at(now - 30 * MIN);
    if (then.length && refThen) {
      const drop = meanOf(then) / refThen - cur / ref;
      if (drop >= W.darkening.drop) add('sky', W.darkening.w, 'darkening', { value: round(drop * 100), unit: '%' });
    }
  }
  // Sudden cooling with rising humidity: rain-cooled air (shower nearby or starting)
  const tRate = windowRate(s.temperature || [], 30 * MIN);
  if (tRate <= W.coolingBurst.rate && humRate > 0) add('sky', W.coolingBurst.w, 'cooling_burst', { value: round(tRate, 1), unit: '°C/h' });

  // --- Probabilities ----------------------------------------------------------
  const chance = Object.fromEntries(
    Object.entries(W.horizons).map(([h, k]) => [
      h,
      round(100 * logistic(W.base + groups.pressure * k.pressure + groups.moisture * k.moisture + groups.sky * k.sky)),
    ])
  );

  // --- Storm risk -------------------------------------------------------------
  const tNow = lastV(s.temperature || []);
  const moistAir = dew?.value != null && dew.value >= 18;
  const unstable = (p3 != null && p3 <= -1.6) || factors.some((f) => f.key === 'cooling_burst' || f.key === 'darkening');
  const storm = moistAir && unstable ? (dew.value >= 21 && chance['3h'] >= 55 ? 'likely' : 'possible') : moistAir && tNow >= 27 && isDay ? 'watch' : 'none';

  // --- Scenario ---------------------------------------------------------------
  const c3 = chance['3h'];
  const improving = p3 != null && p3 >= 0.5 && (spreadRate > 0 || spread >= 6);
  let outlook;
  if (storm === 'likely' || (storm === 'possible' && c3 >= 50)) outlook = 'storm';
  else if (c3 >= 65) outlook = 'rain';
  else if (c3 >= 40) outlook = 'showers';
  else if (spread != null && spread <= 1.5 && !(isDay && cloudCover != null && cloudCover < 0.5)) outlook = 'fog';
  else if (isDay) {
    if (cloudCover == null) outlook = improving ? 'clearing' : 'unknown_day';
    else if (cloudCover <= 0.3) outlook = 'sunny';
    else if (improving) outlook = 'clearing';
    else if (cloudCover <= 0.65) outlook = 'partly_cloudy';
    else outlook = 'cloudy';
  } else if (isDay === false) {
    const clearNight = (spread == null || spread >= 5) && (p3 == null || p3 >= -0.5) && (dew?.value == null || dew.value < 18);
    outlook = clearNight ? 'clear_night' : 'cloudy_night';
  } else outlook = improving ? 'clearing' : 'unknown';

  // --- Confidence -------------------------------------------------------------
  let points = 0;
  if (p3 != null) points += 2;
  if (spread != null) points += 1;
  if (luxRef && luxRef.days >= 3) points += 1;
  if ((s.pressure || []).length >= 60) points += 1; // at least an hour of pressure history
  const confidence = points >= 5 ? 'medium' : points >= 3 ? 'low' : 'very_low';

  factors.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  return {
    outlook,
    chance, // % for '1h', '3h', '6h'
    storm, // none | watch | possible | likely
    isDay,
    cloudCover: cloudCover == null ? null : round(cloudCover * 100),
    pressureTendency: round(p3, 1),
    factors,
    confidence,
    lightReferenceDays: luxRef?.days ?? 0,
    time: now,
  };
}

