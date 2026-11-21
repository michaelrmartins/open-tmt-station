import { Router } from 'express';
import { RANGES, DEFAULT_RANGE, FIELDS, METRIC_KEYS } from '../influx/queries.js';
import * as calc from '../lib/calculations.js';


// "Now" derivation of each metric from a series.
const DERIVE = {
  temperature: (p, ctx) => calc.temperature(p, ctx.now),
  humidity: (p, ctx) => calc.humidity(p, ctx.now),
  pressure: (p, ctx) => calc.pressure(p, ctx.now),
  internalTemperature: (p, ctx) => calc.internalTemperature(p, ctx.now),
  illuminance: (p, ctx) => calc.illuminance(p, ctx.now),
  sourceVoltage: (p, ctx) => calc.powerInput(p, ctx.mode, ctx.now, ctx.gapMs),
  batteryVoltage: (p, ctx) => calc.battery(p, ctx.bat, ctx.now),
  wifiSignal: (p, ctx) => calc.wifi(p, ctx.now),
  loadAvg: (p, ctx) => calc.loadAvg(p, ctx.now),
  uptime: (p, ctx) => calc.uptime(p, ctx.now),
  deepSleep: (p, ctx) => calc.deepSleep(p, ctx.now),
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const parseRange = (v, fallback = DEFAULT_RANGE) => {
  if (v === undefined) return fallback;
  if (!RANGES[v]) throw new HttpError(400, `invalid range. Use: ${Object.keys(RANGES).join(', ')}`);
  return v;
};
const parseMode = (v, fallback) => {
  if (v === undefined) return fallback;
  if (v !== 'solar' && v !== 'psu') throw new HttpError(400, 'invalid mode. Use: solar, psu');
  return v;
};
const parseMetrics = (v) => {
  if (v === undefined || v === '') return METRIC_KEYS;
  const list = String(v).split(',').map((s) => s.trim()).filter(Boolean);
  const bad = list.filter((m) => !FIELDS[m]);
  if (bad.length) throw new HttpError(400, `invalid metric: ${bad.join(', ')}. Use: ${METRIC_KEYS.join(', ')}`);
  return [...new Set(list)];
};

/** Reduces a series to at most `max` points (block average) for charts. */
const downsample = (pts, max) => {
  if (!max || pts.length <= max) return pts;
  const size = Math.ceil(pts.length / max);
  const out = [];
  for (let i = 0; i < pts.length; i += size) {
    const chunk = pts.slice(i, i + size);
    out.push({ t: chunk[chunk.length - 1].t, v: chunk.reduce((a, b) => a + b.v, 0) / chunk.length });
  }
  return out;
};

const toPairs = (pts, digits = 3) => pts.map((p) => [p.t, Math.round(p.v * 10 ** digits) / 10 ** digits]);

export function createApiRouter({ config, repo, cache, weather }) {
  const r = Router();
  const bat = config.battery;
  const wrap = (fn) => async (req, res, next) => {
    try {
      res.json(await fn(req, res));
    } catch (e) {
      next(e);
    }
  };
  const ctxFor = (rangeKey, mode) => {
    const range = RANGES[rangeKey];
    return {
      now: Date.now(),
      mode,
      bat,
      gapMs: Math.max(10 * 60e3, range.intervalMs * 2.5),
      slopeWindowMs: Math.max(20 * 60e3, range.intervalMs * 3.5),
    };
  };

  // API and database connection status.
  r.get('/health', async (_req, res) => {
    let influx = 'ok';
    try {
      if (!(await repo.ping())) influx = 'error';
    } catch {
      influx = 'error';
    }
    res.status(influx === 'ok' ? 200 : 503).json({ status: influx === 'ok' ? 'ok' : 'degraded', influx, mock: repo.mock, time: Date.now() });
  });

  // External weather (OpenWeather). Served from memory: refreshed by a background
  // scheduler every OPENWEATHER_REFRESH_MINUTES, never fetched per request.
  r.get('/outside', (_req, res) => {
    res.json(weather ? weather.snapshot() : { enabled: false });
  });

  // Station info, metrics and thresholds used by the calculations.
  r.get('/meta', (_req, res) => {
    res.json({
      station: config.station,
      battery: bat,
      ranges: Object.fromEntries(Object.entries(RANGES).map(([k, v]) => [k, { ms: v.ms, interval: v.interval }])),
      defaultRange: DEFAULT_RANGE,
      metrics: Object.fromEntries(METRIC_KEYS.map((k) => [k, { field: FIELDS[k].field, unit: FIELDS[k].unit, label: FIELDS[k].label }])),
      thresholds: calc.THRESHOLDS,
      mock: repo.mock,
    });
  });

  // Current situation: values, levels, trends, battery, power input and power flow.
  // Uses the last 3 h at 1 min resolution (Grafana windows range from 30 min to 3 h).
  r.get(
    '/snapshot',
    wrap(async (req) => {
      const mode = parseMode(req.query.mode, config.station.powerMode);
      return cache.wrap(`snapshot:${mode}`, config.cache.snapshotTtlMs, async () => {
        const s = await repo.series('3h');
        const ctx = ctxFor('3h', mode);
        const metrics = Object.fromEntries(METRIC_KEYS.map((m) => [m, DERIVE[m](s[m], ctx)]));
        const flow = calc.energyAnalysis(s.sourceVoltage, s.batteryVoltage, { mode, bat, gapMs: ctx.gapMs, slopeWindowMs: ctx.slopeWindowMs });
        const lastTimes = METRIC_KEYS.map((m) => metrics[m].time).filter(Boolean);
        const lastUpdate = lastTimes.length ? Math.max(...lastTimes) : null;
        return {
          station: config.station.name,
          mode,
          generatedAt: ctx.now,
          lastUpdate,
          ...(() => {
            const c = calc.connectionStatus(lastUpdate, metrics.deepSleep, ctx.now, {
              liveWindowMs: config.station.liveWindowMs,
              graceMs: config.station.deepSleepGraceMs,
            });
            // status: online | sleeping | offline; sleepingAt / offlineAt let the page switch on time
            return { online: c.status === 'online', status: c.status, sleepingAt: c.sleepingAt, offlineAt: c.offlineAt, nextWakeAt: metrics.deepSleep.nextWakeAt };
          })(),
          metrics,
          flow: {
            state: flow.state,
            sourceOn: flow.sourceOn ?? null,
            since: flow.stateSince ?? null,
            durationMs: flow.stateSinceMs,
            atLeast: flow.stateSinceAtLeast,
          },
        };
      });
    })
  );

  // Historical series for charts + summary (min/max/avg) over the range.
  r.get(
    '/history',
    wrap(async (req) => {
      const rangeKey = parseRange(req.query.range);
      const metrics = parseMetrics(req.query.metrics);
      const maxPoints = Math.min(2000, Math.max(10, Number(req.query.maxPoints) || 500));
      return cache.wrap(`history:${rangeKey}:${metrics.join(',')}:${maxPoints}`, config.cache.historyTtlMs, async () => {
        const s = await repo.series(rangeKey, metrics);
        const now = Date.now();
        const series = {};
        for (const m of metrics) {
          const sum = calc.summarize(s[m], now);
          series[m] = {
            unit: FIELDS[m].unit,
            label: FIELDS[m].label,
            summary: { current: sum.current, min: sum.min, max: sum.max, avg: sum.avg, time: sum.time, count: sum.count },
            points: toPairs(downsample(s[m], maxPoints)),
          };
          if (m === 'batteryVoltage') {
            series.batteryPercent = {
              unit: '%',
              label: 'Battery (%)',
              points: toPairs(downsample(s[m], maxPoints).filter((p) => p.v > 2.5).map((p) => ({ t: p.t, v: calc.batteryPercent(p.v, bat) })), 1),
            };
          }
        }
        return { range: rangeKey, interval: RANGES[rangeKey].interval, from: now - RANGES[rangeKey].ms, to: now, series };
      });
    })
  );

  // Single metric: series + stats + derived values over the chosen range.
  r.get(
    '/metrics/:metric',
    wrap(async (req) => {
      const metric = req.params.metric;
      if (!FIELDS[metric]) throw new HttpError(404, `unknown metric. Use: ${METRIC_KEYS.join(', ')}`);
      const rangeKey = parseRange(req.query.range, '3h');
      const mode = parseMode(req.query.mode, config.station.powerMode);
      return cache.wrap(`metric:${metric}:${rangeKey}:${mode}`, config.cache.historyTtlMs, async () => {
        const s = await repo.series(rangeKey, [metric]);
        const ctx = ctxFor(rangeKey, mode);
        return {
          metric,
          range: rangeKey,
          unit: FIELDS[metric].unit,
          derived: DERIVE[metric](s[metric], ctx),
          points: toPairs(downsample(s[metric], 1000)),
        };
      });
    })
  );

  // Energy over the range: time on battery / on source, consumption, charging, autonomy.
  r.get(
    '/energy',
    wrap(async (req) => {
      const rangeKey = parseRange(req.query.range);
      const mode = parseMode(req.query.mode, config.station.powerMode);
      return cache.wrap(`energy:${rangeKey}:${mode}`, config.cache.historyTtlMs, async () => {
        const s = await repo.series(rangeKey, ['sourceVoltage', 'batteryVoltage']);
        const ctx = ctxFor(rangeKey, mode);
        const analysis = calc.energyAnalysis(s.sourceVoltage, s.batteryVoltage, { mode, bat, gapMs: ctx.gapMs, slopeWindowMs: ctx.slopeWindowMs });
        return {
          range: rangeKey,
          mode,
          rangeMs: RANGES[rangeKey].ms,
          ...analysis,
          power: calc.powerInput(s.sourceVoltage, mode, ctx.now, ctx.gapMs),
          battery: calc.battery(s.batteryVoltage, bat, ctx.now),
        };
      });
    })
  );

  return r;
}

export { HttpError };
