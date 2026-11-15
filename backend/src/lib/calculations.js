// Derived calculations, ported from the "HTML Graphics" panels of the Grafana dashboard
// (grafana-dashboard-reference.json). Pure functions: they take time-ordered points
// { t (ms), v } and return numbers / state keys.
//
// Level keys are slugs; the frontend maps them to labels and colors.

const H = 3600e3;
const MIN = 60e3;

// ---------------------------------------------------------------------------
// Thresholds (same as in Grafana)
// ---------------------------------------------------------------------------
export const THRESHOLDS = {
  staleMs: 5 * MIN,
  staleInternalMs: 15 * MIN,
  temperature: { rateWindowMs: 30 * MIN, rateThreshold: 0.3 }, // °C/h
  humidity: { rateWindowMs: 30 * MIN, rateThreshold: 1, comfortMin: 40, comfortMax: 60 }, // %/h
  pressure: { rateWindowMs: 3 * H, rateThreshold: 0.5, standard: 1013.25 }, // hPa/3h
  illuminance: { rateWindowMs: 30 * MIN, deltaSamples: 5, deltaRelThreshold: 0.05 },
  internalTemperature: { rateWindowMs: 30 * MIN, rateThreshold: 0.3 },
  battery: {
    rateWindowMs: 30 * MIN,
    rateThreshold: 20, // mV/h needed to leave "flat"
    etaWindowMs: 2 * H,
    etaMinPoints: 10,
    etaMaxDays: 30,
    low: 3.3,
    recharge: 4.06, // CN3065 restarts charging below this
  },
  flow: {
    sourceOn: { solar: 4.0, psu: 4.5 },
    chargeSlope: 8, // mV/h rise that counts as charging
    slopeWindowMs: 20 * MIN,
  },
  power: {
    solar: { min: 0, max: 7.5, chargerMin: 4.0, chargerOk: 4.3, nightBelow: 1.0 },
    psu: { min: 4.0, max: 6.0, nominal: 5.0, specLo: 4.75, specHi: 5.25, offBelow: 1.0 },
    rippleWindowMs: 30 * MIN,
    gapMs: 10 * MIN, // longer gaps don't count as time
  },
  uptime: { recentBootS: 3600 },
};

// Level scales: { max } => first level where value < max.
const LEVELS = {
  temperature: [[0, 'freezing'], [10, 'cold'], [18, 'cool'], [24, 'comfortable'], [28, 'warm'], [33, 'hot'], [Infinity, 'very_hot']],
  humidity: [[25, 'very_dry'], [40, 'dry'], [60, 'comfortable'], [70, 'humid'], [85, 'very_humid'], [Infinity, 'saturated']],
  pressure: [[970, 'stormy'], [990, 'rain'], [1010, 'change'], [1030, 'fair'], [Infinity, 'very_dry']],
  illuminance: [[1, 'darkness'], [10, 'very_dark'], [50, 'dim'], [200, 'low_light'], [500, 'indoor'], [1000, 'well_lit'], [10000, 'daylight'], [Infinity, 'direct_sun']],
  internalTemperature: [[0, 'too_cold_to_charge'], [10, 'cold'], [35, 'normal'], [45, 'warm'], [55, 'hot'], [Infinity, 'critical']],
  loadAvg: [[25, 'idle'], [50, 'light'], [75, 'moderate'], [90, 'heavy'], [Infinity, 'critical']],
  solar: [[1.0, 'night'], [4.0, 'low_light'], [4.6, 'weak_sun'], [5.6, 'partial_sun'], [6.3, 'good_sun'], [Infinity, 'full_sun']],
  psu: [[1.0, 'disconnected'], [4.75, 'undervoltage'], [5.25, 'stable'], [5.6, 'high'], [Infinity, 'overvoltage']],
};

// Minimum-based scales (value >= min).
const LEVELS_MIN = {
  battery: [[90, 'full'], [60, 'good'], [35, 'moderate'], [15, 'low'], [-Infinity, 'critical']],
  wifi: [[-50, 'excellent', 3], [-60, 'very_good', 3], [-67, 'good', 2], [-70, 'fair', 2], [-80, 'weak', 1], [-Infinity, 'unusable', 0]],
};

export const levelOf = (scale, v) => (v == null ? null : (LEVELS[scale].find(([max]) => v < max) || [])[1] ?? null);
const levelMinOf = (scale, v) => LEVELS_MIN[scale].find(([min]) => v >= min);

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
const round = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Slope per hour via least-squares linear regression. */
export function slopePerHour(points, scale = 1) {
  if (points.length < 2) return 0;
  const t0 = points[0].t;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of points) {
    const x = (p.t - t0) / H;
    const y = p.v * scale;
    sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  const n = points.length;
  const den = n * sxx - sx * sx;
  return den ? (n * sxy - sx * sy) / den : 0;
}

/** Points inside the window [last.t - ms, last.t]. */
export const lastWindow = (points, ms) => {
  if (!points.length) return [];
  const end = points[points.length - 1].t;
  return points.filter((p) => p.t >= end - ms);
};

/** Rate over the recent window (requires >= minPoints, as in Grafana). */
export function windowRate(points, ms, { scale = 1, minPoints = 3 } = {}) {
  const win = lastWindow(points, ms);
  return win.length >= minPoints ? slopePerHour(win, scale) : 0;
}

export const trendOf = (rate, threshold) => (rate > threshold ? 'up' : rate < -threshold ? 'down' : 'flat');

export function summarize(points, now = Date.now(), staleMs = THRESHOLDS.staleMs) {
  if (!points.length) return { current: null, min: null, max: null, avg: null, time: null, count: 0, stale: true };
  const vals = points.map((p) => p.v);
  const last = points[points.length - 1];
  let min = Infinity, max = -Infinity, sum = 0;
  for (const v of vals) { if (v < min) min = v; if (v > max) max = v; sum += v; }
  return { current: last.v, min, max, avg: sum / vals.length, time: last.t, count: vals.length, stale: now - last.t > staleMs };
}

const clean = (points, lo, hi) => points.filter((p) => p.v >= lo && p.v <= hi);

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
function rated(points, scale, cfg, now, decimals = 2) {
  const s = summarize(points, now);
  const rate = windowRate(points, cfg.rateWindowMs);
  return {
    value: round(s.current, decimals),
    min: round(s.min, decimals),
    max: round(s.max, decimals),
    avg: round(s.avg, decimals),
    time: s.time,
    stale: s.stale,
    level: levelOf(scale, s.current),
    rate: round(rate, 2),
    trend: s.count ? trendOf(rate, cfg.rateThreshold) : null,
  };
}

/** Temperature (AM2301): rate in °C/h, regression over the last 30 min. */
export const temperature = (pts, now) => ({ unit: '°C', rateUnit: '°C/h', ...rated(clean(pts, -40, 80), 'temperature', THRESHOLDS.temperature, now, 1) });

/** Humidity (AM2301): rate in %/h over 30 min, comfort band 40-60 %. */
export function humidity(pts, now) {
  const { comfortMin, comfortMax } = THRESHOLDS.humidity;
  const r = rated(clean(pts, 0, 100), 'humidity', THRESHOLDS.humidity, now, 1);
  return { unit: '%', rateUnit: '%/h', ...r, comfort: { min: comfortMin, max: comfortMax, inside: r.value != null && r.value >= comfortMin && r.value <= comfortMax } };
}

/** Pressure (BMP280): barometric tendency in hPa/3h (slope/h x 3, 3 h window). */
export function pressure(pts, now) {
  const cfg = THRESHOLDS.pressure;
  const p = clean(pts, 300, 1100);
  const s = summarize(p, now);
  const rate3h = windowRate(p, cfg.rateWindowMs) * 3;
  return {
    unit: 'hPa',
    rateUnit: 'hPa/3h',
    value: round(s.current, 1),
    min: round(s.min, 1),
    max: round(s.max, 1),
    avg: round(s.avg, 1),
    time: s.time,
    stale: s.stale,
    level: levelOf('pressure', s.current),
    rate: round(rate3h, 2),
    trend: s.count ? trendOf(rate3h, cfg.rateThreshold) : null,
    standard: cfg.standard,
  };
}

/**
 * Illuminance (BH1750). Trend as in Grafana: current value vs. mean of the
 * 5 previous readings, threshold max(1 lx, 5 %). Also includes the rate in lx/h.
 */
export function illuminance(pts, now) {
  const cfg = THRESHOLDS.illuminance;
  const p = clean(pts, 0, 200000);
  const s = summarize(p, now);
  let delta = 0, trend = null;
  if (p.length) {
    trend = 'flat';
    const prev = p.slice(-(cfg.deltaSamples + 1), -1).map((x) => x.v);
    if (prev.length) {
      const ref = prev.reduce((a, b) => a + b, 0) / prev.length;
      delta = s.current - ref;
      const thr = Math.max(1, ref * cfg.deltaRelThreshold);
      trend = delta > thr ? 'up' : delta < -thr ? 'down' : 'flat';
    }
  }
  return {
    unit: 'lx',
    rateUnit: 'lx/h',
    value: round(s.current, 1),
    min: round(s.min, 1),
    max: round(s.max, 1),
    avg: round(s.avg, 1),
    time: s.time,
    stale: s.stale,
    level: levelOf('illuminance', s.current),
    delta: round(delta, 1),
    rate: round(windowRate(p, cfg.rateWindowMs), 1),
    trend,
    // Log scale 0..1 (0 lx .. 100 000 lx), used by the gauge
    scale: s.current == null ? null : round(clamp(Math.log10(s.current + 1) / 5, 0, 1), 3),
  };
}

/** Internal temperature (BMP280, inside the enclosure) with Li-ion ranges. */
export function internalTemperature(pts, now) {
  const cfg = THRESHOLDS.internalTemperature;
  const p = clean(pts, -40, 125);
  const s = summarize(p, now, THRESHOLDS.staleInternalMs);
  const rate = windowRate(p, cfg.rateWindowMs);
  return {
    unit: '°C', rateUnit: '°C/h',
    value: round(s.current, 1), min: round(s.min, 1), max: round(s.max, 1), avg: round(s.avg, 1),
    time: s.time, stale: s.stale, level: levelOf('internalTemperature', s.current),
    rate: round(rate, 2), trend: s.count ? trendOf(rate, cfg.rateThreshold) : null,
  };
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------
export const wifiQuality = (dbm) => clamp(2 * (dbm + 100), 0, 100);

export function wifi(pts, now) {
  const p = clean(pts, -120, 0);
  const s = summarize(p, now);
  if (!p.length) return { unit: 'dBm', value: null, quality: null, level: null, bars: null, time: null, stale: true };
  const [, level, bars] = levelMinOf('wifi', s.current);
  return { unit: 'dBm', value: round(s.current, 0), min: round(s.min, 0), max: round(s.max, 0), avg: round(s.avg, 1), quality: round(wifiQuality(s.current), 0), level, bars, time: s.time, stale: s.stale };
}

export function loadAvg(pts, now) {
  const s = summarize(pts, now);
  return { unit: '%', value: round(s.current, 0), min: round(s.min, 0), max: round(s.max, 0), avg: round(s.avg, 1), level: levelOf('loadAvg', s.current), time: s.time, stale: s.stale };
}

/** Uptime (UptimeSec): boot time and restarts (counter drops > 5 s). */
export function uptime(pts, now = Date.now()) {
  const p = pts.filter((x) => x.v >= 0);
  if (!p.length) return { value: null, bootTime: null, restarts: 0, recentBoot: false, time: null, stale: true };
  const last = p[p.length - 1];
  let restarts = 0;
  for (let i = 1; i < p.length; i++) if (p[i].v < p[i - 1].v - 5) restarts++;
  const stale = now - last.t > THRESHOLDS.staleMs;
  const live = stale ? last.v : last.v + Math.max(0, (now - last.t) / 1000);
  return { unit: 's', value: Math.round(live), reported: last.v, bootTime: last.t - last.v * 1000, restarts, recentBoot: last.v < THRESHOLDS.uptime.recentBootS, time: last.t, stale };
}

// ---------------------------------------------------------------------------
// Energy
// ---------------------------------------------------------------------------
export const batteryPercent = (v, { empty, full }) => clamp(((v - empty) / (full - empty)) * 100, 0, 100);
/** Converts mV/h to %/h using the same linear voltage scale as Grafana. */
const mvhToPctH = (mvh, { empty, full }) => (mvh / ((full - empty) * 1000)) * 100;

/**
 * Battery (ANALOG_Voltage2). Linear percentage between BAT_EMPTY and BAT_MAX,
 * rate in mV/h (30 min regression), trend (20 mV/h threshold) and
 * time to empty (2 h regression, >= 10 points, capped at 30 days).
 * Extra: time to full while charging.
 */
export function battery(pts, bat, now = Date.now()) {
  const cfg = THRESHOLDS.battery;
  const p = pts.filter((x) => x.v > 2.5 && x.v < 5);
  const s = summarize(p, now);
  if (!p.length) return { unit: 'V', voltage: null, percent: null, level: null, trend: null, rate: null, eta: null, time: null, stale: true };

  const voltage = s.current;
  const percent = batteryPercent(voltage, bat);
  const rate = windowRate(p, cfg.rateWindowMs, { scale: 1000 });
  const trend = trendOf(rate, cfg.rateThreshold);

  // Time to empty
  let toEmpty = null;
  const longWin = lastWindow(p, cfg.etaWindowMs);
  const longRate = longWin.length >= cfg.etaMinPoints ? slopePerHour(longWin, 1000) : null;
  const etaRate = longRate !== null && longRate < 0 ? longRate : rate;
  if (trend === 'down' && etaRate < 0 && voltage > bat.empty) {
    const hours = ((voltage - bat.empty) * 1000) / -etaRate;
    const capped = hours / 24 > cfg.etaMaxDays;
    toEmpty = { hours: capped ? null : round(hours, 2), overMaxDays: capped ? cfg.etaMaxDays : null, at: capped ? null : Math.round(s.time + hours * H), rateMvH: round(etaRate, 1) };
  }

  // Time to full (linear estimate; CC/CV charging slows down near the end)
  let toFull = null;
  if (trend === 'up' && rate > 0 && voltage < bat.full) {
    const hours = ((bat.full - voltage) * 1000) / rate;
    toFull = { hours: round(hours, 2), at: Math.round(s.time + hours * H), rateMvH: round(rate, 1) };
  }

  return {
    unit: 'V',
    voltage: round(voltage, 3),
    percent: round(percent, 1),
    level: levelMinOf('battery', percent)[1],
    low: voltage < cfg.low,
    min: round(s.min, 3),
    max: round(s.max, 3),
    rate: round(rate, 1), // mV/h
    ratePercent: round(mvhToPctH(rate, bat), 2), // %/h
    trend, // up = charging, down = discharging, flat = stable
    toEmpty,
    toFull,
    empty: bat.empty,
    full: bat.full,
    time: s.time,
    stale: s.stale,
  };
}

/**
 * DC input (ANALOG_Voltage1) - solar panel or USB supply.
 * Level, charger status, ripple (peak-to-peak over 30 min, mV) and
 * "charge window": time with voltage >= 4.3 V (gaps > 10 min ignored).
 */
export function powerInput(pts, mode = 'solar', now = Date.now(), gapMs = THRESHOLDS.power.gapMs) {
  const P = THRESHOLDS.power;
  const p = pts.filter((x) => x.v >= 0 && x.v <= 15);
  const s = summarize(p, now);
  if (!p.length) return { mode, unit: 'V', voltage: null, level: null, status: null, time: null, stale: true };

  const cur = s.current;
  const rip = lastWindow(p, P.rippleWindowMs).map((x) => x.v);
  const rippleMv = rip.length > 1 ? (Math.max(...rip) - Math.min(...rip)) * 1000 : 0;

  let chargeMs = 0;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i], dt = b.t - a.t;
    if (dt > 0 && dt <= gapMs && a.v >= P.solar.chargerOk && b.v >= P.solar.chargerOk) chargeMs += dt;
  }

  let status;
  if (mode === 'solar') {
    status = cur >= P.solar.chargerOk ? 'charger_active' : cur >= P.solar.chargerMin ? 'charger_limit' : 'below_minimum';
  } else {
    status = cur < P.psu.offBelow ? 'no_input' : cur >= P.psu.specLo && cur <= P.psu.specHi ? 'usb_spec_ok' : 'usb_spec_out';
  }
  const sun = clamp((cur - P.solar.nightBelow) / (6.5 - P.solar.nightBelow), 0, 1);

  return {
    mode,
    unit: 'V',
    voltage: round(cur, 2),
    level: levelOf(mode, cur),
    status,
    min: round(s.min, 2),
    max: round(s.max, 2),
    avg: round(s.avg, 2),
    rippleMv: Math.round(rippleMv),
    chargeWindowMs: chargeMs,
    sunIntensity: mode === 'solar' ? round(sun, 3) : null,
    limits: P[mode],
    time: s.time,
    stale: s.stale,
  };
}

// ---------------------------------------------------------------------------
// Power flow: source -> CN3065 -> ESP32 + battery
// ---------------------------------------------------------------------------

/** Instant state, identical to the Grafana "flow" panel. */
export function stateOf(src, bat, slope, mode) {
  const F = THRESHOLDS.flow;
  if (src < F.sourceOn[mode]) return 'battery'; // no source: running on battery
  if (slope > F.chargeSlope) return 'charging';
  if (bat >= THRESHOLDS.battery.recharge) return 'full'; // source present, battery full
  return 'charging';
}

/** Battery slope (mV/h) at each point, 20 min moving window. */
export function batterySlopes(batPts, windowMs = THRESHOLDS.flow.slopeWindowMs) {
  return batPts.map((p, i) => {
    let j = i;
    while (j > 0 && p.t - batPts[j - 1].t <= windowMs) j--;
    const win = batPts.slice(j, i + 1);
    return win.length >= 3 ? slopePerHour(win, 1000) : 0;
  });
}

/**
 * State timeline built from the source and battery series.
 * Returns ordered events { t, state, src, bat }.
 */
export function stateTimeline(srcPts, batPts, mode, { slopeWindowMs } = {}) {
  const src = srcPts.filter((p) => p.v >= 0 && p.v < 15);
  const batt = batPts.filter((p) => p.v > 2.5 && p.v < 5);
  const slopes = batterySlopes(batt, slopeWindowMs);
  const merged = [
    ...src.map((p) => ({ t: p.t, k: 's', v: p.v })),
    ...batt.map((p, i) => ({ t: p.t, k: 'b', v: p.v, sl: slopes[i] })),
  ].sort((a, b) => a.t - b.t || (a.k === 's' ? -1 : 1));

  const events = [];
  let s = null, b = null, sl = 0;
  for (const e of merged) {
    if (e.k === 's') s = e.v; else { b = e.v; sl = e.sl; }
    if (s === null || b === null) continue;
    events.push({ t: e.t, state: stateOf(s, b, sl, mode), src: s, bat: b, slope: sl, k: e.k });
  }
  return events;
}

/**
 * Energy analysis over the range:
 *  - time on battery, time on source (charging + full) and per state;
 *  - current state and how long it has lasted;
 *  - average consumption while discharging (mV/h and %/h) and estimated autonomy;
 *  - average charging rate (mV/h and %/h) and estimated full recharge time.
 *
 * Average rates are regressions per continuous state segment, weighted by
 * segment duration (segments < 10 min or with < 3 points are ignored).
 */
export function energyAnalysis(srcPts, batPts, { mode = 'solar', bat, gapMs = THRESHOLDS.power.gapMs, slopeWindowMs, minSegmentMs = 10 * MIN } = {}) {
  const events = stateTimeline(srcPts, batPts, mode, { slopeWindowMs });
  const totals = { battery: 0, charging: 0, full: 0 };
  if (!events.length) {
    return { mode, state: null, stateSinceMs: null, stateSinceAtLeast: false, totals: { ...totals, source: 0, covered: 0 }, shares: null, discharge: null, charge: null, transitions: 0 };
  }

  // Duration: each interval between consecutive events goes to the earlier state.
  let transitions = 0;
  for (let i = 1; i < events.length; i++) {
    const a = events[i - 1], b = events[i], dt = b.t - a.t;
    if (dt > 0 && dt <= gapMs) totals[a.state] += dt;
    if (b.state !== a.state) transitions++;
  }

  // Current state and since when (same logic as Grafana).
  const last = events[events.length - 1];
  let changeT = null;
  for (let i = events.length - 1; i > 0; i--) {
    if (events[i - 1].state !== last.state) { changeT = events[i].t; break; }
  }
  const since = changeT ?? events[0].t;

  // Continuous segments per state, using battery readings only.
  const segments = [];
  let seg = null;
  for (const e of events) {
    if (e.k !== 'b') continue;
    const st = e.state === 'battery' ? 'battery' : e.state === 'charging' ? 'charging' : 'full';
    if (!seg || seg.state !== st || e.t - seg.pts[seg.pts.length - 1].t > gapMs) {
      seg = { state: st, pts: [] };
      segments.push(seg);
    }
    seg.pts.push({ t: e.t, v: e.bat });
  }

  const avgRate = (state) => {
    let wsum = 0, acc = 0, n = 0;
    for (const sg of segments) {
      if (sg.state !== state || sg.pts.length < 3) continue;
      const dur = sg.pts[sg.pts.length - 1].t - sg.pts[0].t;
      if (dur < minSegmentMs) continue;
      acc += slopePerHour(sg.pts, 1000) * dur;
      wsum += dur;
      n++;
    }
    return wsum ? { rateMvH: acc / wsum, sampledMs: wsum, segments: n } : null;
  };

  const capacityMv = (bat.full - bat.empty) * 1000;
  const d = avgRate('battery');
  const discharge = d && d.rateMvH < 0
    ? {
        rateMvH: round(d.rateMvH, 1),
        ratePercentH: round(mvhToPctH(d.rateMvH, bat), 2),
        // Autonomy from 100 % to 0 % at the observed average consumption
        autonomyHours: round(capacityMv / -d.rateMvH, 1),
        sampledMs: d.sampledMs,
        segments: d.segments,
      }
    : d ? { rateMvH: round(d.rateMvH, 1), ratePercentH: round(mvhToPctH(d.rateMvH, bat), 2), autonomyHours: null, sampledMs: d.sampledMs, segments: d.segments } : null;

  const c = avgRate('charging');
  const charge = c && c.rateMvH > 0
    ? {
        rateMvH: round(c.rateMvH, 1),
        ratePercentH: round(mvhToPctH(c.rateMvH, bat), 2),
        // Time from 0 % to 100 % at the observed average charging rate
        fullChargeHours: round(capacityMv / c.rateMvH, 1),
        sampledMs: c.sampledMs,
        segments: c.segments,
      }
    : c ? { rateMvH: round(c.rateMvH, 1), ratePercentH: round(mvhToPctH(c.rateMvH, bat), 2), fullChargeHours: null, sampledMs: c.sampledMs, segments: c.segments } : null;

  const source = totals.charging + totals.full;
  const covered = source + totals.battery;
  return {
    mode,
    state: last.state,
    stateSince: since,
    stateSinceMs: last.t - since,
    stateSinceAtLeast: changeT === null, // state did not change within the range
    sourceOn: last.src >= THRESHOLDS.flow.sourceOn[mode],
    totals: { ...totals, source, covered },
    shares: covered ? { battery: round(totals.battery / covered, 4), source: round(source / covered, 4) } : null,
    discharge,
    charge,
    transitions,
  };
}
