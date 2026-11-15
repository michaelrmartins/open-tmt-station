// Synthetic data generator with the same shape as InfluxDB results (MOCK_DATA=true).
// Simulates day/night cycle, solar panel, battery charge/discharge and weather.

import { METRIC_KEYS } from '../influx/queries.js';

const H = 3600e3;
const DAY = 24 * H;

// Deterministic hash -> stable noise per instant (series don't jump between requests).
const noise = (t, seed) => {
  const x = Math.sin((t / 60000) * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x) - 0.5;
};

function sample(t) {
  const local = new Date(t);
  const hour = local.getHours() + local.getMinutes() / 60;
  const daylight = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI)); // 06h-18h
  const cloud = 0.75 + 0.25 * Math.sin(t / (5 * H));

  const temperature = 19 + 7 * Math.sin(((hour - 9) / 24) * 2 * Math.PI) + noise(t, 1) * 0.2;
  const humidity = Math.min(99, Math.max(20, 68 - 22 * Math.sin(((hour - 9) / 24) * 2 * Math.PI) + noise(t, 2)));
  const pressure = 1013 + 4 * Math.sin(t / (2.5 * DAY)) + 0.6 * Math.sin(((hour - 10) / 12) * 2 * Math.PI) + noise(t, 3) * 0.1;
  const illuminance = Math.max(0, daylight * cloud * 42000 + noise(t, 4) * 30 * daylight);
  const sourceVoltage = daylight > 0.05 ? Math.min(6.9, 3.2 + daylight * cloud * 3.6) + noise(t, 5) * 0.03 : Math.max(0, 0.2 + noise(t, 5) * 0.1);

  // Battery: rises in the morning, saturates at ~4.13 V, drops at night.
  const charge = (() => {
    if (hour >= 8 && hour < 13) return 3.72 + ((hour - 8) / 5) * 0.41;
    if (hour >= 13 && hour < 17.5) return 4.13;
    const h = hour >= 17.5 ? hour - 17.5 : hour + 6.5; // hours since 17:30
    return 4.13 - Math.min(14.5, h) * 0.028;
  })();
  const batteryVoltage = charge + noise(t, 6) * 0.004;

  return {
    temperature,
    humidity,
    pressure,
    internalTemperature: temperature + 6 + daylight * 8 + noise(t, 7) * 0.2,
    illuminance,
    sourceVoltage,
    batteryVoltage,
    wifiSignal: -61 + noise(t, 8) * 8,
    loadAvg: 18 + Math.abs(noise(t, 9)) * 30,
    uptime: Math.floor((t - (Math.floor(t / (9 * DAY)) * 9 * DAY - 2 * H)) / 1000),
  };
}

/** Same shape as resultToSeries(): { metric: [{t, v}] }. */
export function mockSeries({ rangeMs, intervalMs, metrics = METRIC_KEYS, now = Date.now() }) {
  const out = Object.fromEntries(metrics.map((m) => [m, []]));
  const start = Math.ceil((now - rangeMs) / intervalMs) * intervalMs;
  for (let t = start; t <= now; t += intervalMs) {
    const s = sample(t);
    for (const m of metrics) out[m].push({ t, v: s[m] });
  }
  return out;
}
