// External weather from OpenWeather (free "Current weather" + "5 day / 3 hour forecast" APIs).
//
// Rate-limit safety: the API is only called by a background scheduler, once per refresh
// interval (default 60 min, 2 requests per refresh). HTTP requests from visitors only read
// the in-memory copy. The last response is persisted to disk, so container restarts reuse it
// instead of calling the API again. Failed refreshes keep the previous data and retry at most
// every 15 min (or wait for the next interval when the key or location is invalid).

import fs from 'node:fs/promises';
import path from 'node:path';

const MIN = 60e3;
const RETRY_MS = 15 * MIN;
const FORECAST_SLOTS = 8; // 8 x 3 h = next 24 h

const round = (v, d = 1) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const msToKmh = (v) => (v == null ? null : round(v * 3.6, 1));
const condition = (w) => (w ? { id: w.id, main: w.main, description: w.description, icon: w.icon } : null);

/** Normalizes the /weather response. */
export function normalizeCurrent(c) {
  return {
    time: c.dt * 1000,
    temp: round(c.main?.temp),
    feelsLike: round(c.main?.feels_like),
    tempMin: round(c.main?.temp_min),
    tempMax: round(c.main?.temp_max),
    humidity: c.main?.humidity ?? null,
    pressure: c.main?.pressure ?? null,
    windSpeed: msToKmh(c.wind?.speed),
    windGust: msToKmh(c.wind?.gust),
    windDeg: c.wind?.deg ?? null,
    clouds: c.clouds?.all ?? null,
    visibilityKm: c.visibility == null ? null : round(c.visibility / 1000, 1),
    rain1h: c.rain?.['1h'] ?? null,
    snow1h: c.snow?.['1h'] ?? null,
    condition: condition(c.weather?.[0]),
    sunrise: c.sys?.sunrise ? c.sys.sunrise * 1000 : null,
    sunset: c.sys?.sunset ? c.sys.sunset * 1000 : null,
    timezoneOffsetS: c.timezone ?? null,
  };
}

/** Normalizes the /forecast response (3-hour steps). */
export function normalizeForecast(f) {
  return (f.list || []).slice(0, FORECAST_SLOTS).map((s) => ({
    time: s.dt * 1000,
    temp: round(s.main?.temp),
    humidity: s.main?.humidity ?? null,
    pop: s.pop == null ? null : Math.round(s.pop * 100), // probability of precipitation, %
    windSpeed: msToKmh(s.wind?.speed),
    condition: condition(s.weather?.[0]),
  }));
}

export class OpenWeatherService {
  constructor(cfg, { mock = false, fetchImpl = globalThis.fetch, logger = console } = {}) {
    this.cfg = cfg;
    this.mock = mock;
    this.fetch = fetchImpl;
    this.log = logger;
    this.data = null; // { location, current, forecast }
    this.fetchedAt = null;
    this.lastError = null;
    this.nextUpdateAt = null;
    this.timer = null;
    this.inFlight = null;
    this.requests = 0; // upstream calls made by this process
  }

  get configured() {
    return Boolean(this.cfg.apiKey && ((this.cfg.lat && this.cfg.lon) || this.cfg.city));
  }

  async start() {
    if (!this.configured) {
      if (this.cfg.apiKey) this.log.warn('[openweather] API key set but no location (OPENWEATHER_LAT/LON or OPENWEATHER_CITY)');
      return;
    }
    await this.loadCache();
    const age = this.fetchedAt ? Date.now() - this.fetchedAt : Infinity;
    if (age < this.cfg.refreshMs) {
      this.schedule(this.cfg.refreshMs - age);
      this.log.log(`[openweather] using cached data, next refresh in ${Math.round((this.cfg.refreshMs - age) / MIN)} min`);
    } else {
      await this.refresh();
    }
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  schedule(ms) {
    clearTimeout(this.timer);
    this.nextUpdateAt = Date.now() + ms;
    this.timer = setTimeout(() => this.refresh(), ms);
    this.timer.unref?.();
  }

  locationParams() {
    const p = new URLSearchParams({ appid: this.cfg.apiKey, units: this.cfg.units, lang: this.cfg.lang });
    if (this.cfg.lat && this.cfg.lon) {
      p.set('lat', this.cfg.lat);
      p.set('lon', this.cfg.lon);
    } else {
      p.set('q', this.cfg.city);
    }
    return p;
  }

  async call(endpoint, extra = {}) {
    const params = this.locationParams();
    for (const [k, v] of Object.entries(extra)) params.set(k, v);
    this.requests++;
    const res = await this.fetch(`${this.cfg.baseUrl}/${endpoint}?${params}`, { signal: AbortSignal.timeout(this.cfg.timeoutMs) });
    if (!res.ok) {
      const err = new Error(`OpenWeather ${endpoint} responded ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  /** Fetches current weather + forecast. Concurrent calls share the same request. */
  refresh() {
    if (!this.configured) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    this.inFlight = (async () => {
      try {
        const current = await this.call('weather');
        const forecast = await this.call('forecast', { cnt: String(FORECAST_SLOTS) });
        this.data = {
          location: {
            name: this.cfg.locationName || current.name || this.cfg.city || null,
            country: current.sys?.country || null,
            lat: current.coord?.lat ?? null,
            lon: current.coord?.lon ?? null,
          },
          current: normalizeCurrent(current),
          forecast: normalizeForecast(forecast),
        };
        this.fetchedAt = Date.now();
        this.lastError = null;
        await this.saveCache();
        this.schedule(this.cfg.refreshMs);
        this.log.log(`[openweather] updated (${this.data.location.name}, ${this.data.current.temp} °C)`);
      } catch (e) {
        // Never log the URL: it contains the API key.
        this.lastError = { message: e.message, status: e.status || null, at: Date.now() };
        const fatal = e.status === 401 || e.status === 404;
        this.schedule(fatal ? this.cfg.refreshMs : Math.min(RETRY_MS, this.cfg.refreshMs));
        this.log.error(`[openweather] refresh failed: ${e.message}${fatal ? ' (check key / location)' : ''}`);
      } finally {
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }

  async loadCache() {
    try {
      const saved = JSON.parse(await fs.readFile(this.cfg.cacheFile, 'utf8'));
      // Only reuse a cache written for the same location
      if (saved.key === this.cacheKey() && saved.data && saved.fetchedAt) {
        this.data = saved.data;
        this.fetchedAt = saved.fetchedAt;
      }
    } catch {
      /* no cache yet */
    }
  }

  async saveCache() {
    try {
      await fs.mkdir(path.dirname(this.cfg.cacheFile), { recursive: true });
      await fs.writeFile(this.cfg.cacheFile, JSON.stringify({ key: this.cacheKey(), fetchedAt: this.fetchedAt, data: this.data }));
    } catch (e) {
      this.log.warn(`[openweather] could not write cache: ${e.message}`);
    }
  }

  cacheKey() {
    return [this.cfg.lat, this.cfg.lon, this.cfg.city, this.cfg.units, this.cfg.lang].join('|');
  }

  /** Public payload for the API. Never triggers an upstream request. */
  snapshot(now = Date.now()) {
    if (!this.configured) {
      if (this.mock) return mockOutside(now);
      return { enabled: false };
    }
    return {
      enabled: true,
      source: 'OpenWeather',
      ...(this.data || { location: null, current: null, forecast: [] }),
      fetchedAt: this.fetchedAt,
      nextUpdateAt: this.nextUpdateAt,
      refreshMinutes: Math.round(this.cfg.refreshMs / MIN),
      stale: !this.fetchedAt || now - this.fetchedAt > 2 * this.cfg.refreshMs + RETRY_MS,
      error: this.lastError ? (this.data ? 'Last update failed, showing previous data' : 'Waiting for the first successful update') : null,
    };
  }
}

/** Synthetic outside weather for MOCK_DATA mode without an API key. */
function mockOutside(now) {
  const hourStart = Math.floor(now / 3600e3) * 3600e3;
  const h = new Date(hourStart).getHours();
  const temp = (hr) => round(20 + 6 * Math.sin(((hr - 9) / 24) * 2 * Math.PI), 1);
  const cond = (hr) =>
    hr >= 6 && hr < 18 ? { id: 802, main: 'Clouds', description: 'scattered clouds', icon: '03d' } : { id: 800, main: 'Clear', description: 'clear sky', icon: '01n' };
  const day = new Date(hourStart);
  day.setHours(0, 0, 0, 0);
  return {
    enabled: true,
    source: 'OpenWeather (demo data)',
    location: { name: 'Demo City', country: 'BR', lat: -23.55, lon: -46.63 },
    current: {
      time: hourStart,
      temp: temp(h),
      feelsLike: round(temp(h) + 0.6, 1),
      tempMin: 14,
      tempMax: 26,
      humidity: 64,
      pressure: 1015,
      windSpeed: 8.4,
      windGust: 14.2,
      windDeg: 135,
      clouds: 40,
      visibilityKm: 10,
      rain1h: null,
      snow1h: null,
      condition: cond(h),
      sunrise: day.getTime() + 5.75 * 3600e3,
      sunset: day.getTime() + 18.6 * 3600e3,
      timezoneOffsetS: -10800,
    },
    forecast: Array.from({ length: FORECAST_SLOTS }, (_, i) => {
      const t = hourStart + (i + 1) * 3 * 3600e3;
      const hr = new Date(t).getHours();
      return { time: t, temp: temp(hr), humidity: 60 + (i % 3) * 5, pop: [0, 0, 10, 20, 40, 20, 0, 0][i], windSpeed: 6 + i, condition: cond(hr) };
    }),
    fetchedAt: hourStart,
    nextUpdateAt: hourStart + 3600e3,
    refreshMinutes: 60,
    stale: false,
    error: null,
  };
}
