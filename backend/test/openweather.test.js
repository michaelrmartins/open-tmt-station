import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { OpenWeatherService, normalizeCurrent } from '../src/services/openweather.js';

const CURRENT = {
  dt: 1_700_000_000, name: 'Campinas', coord: { lat: -22.9, lon: -47.06 }, timezone: -10800,
  main: { temp: 21.64, feels_like: 21.8, temp_min: 19, temp_max: 24, humidity: 72, pressure: 1015 },
  wind: { speed: 2.333, deg: 140, gust: 4 }, clouds: { all: 40 }, visibility: 10000,
  weather: [{ id: 802, main: 'Clouds', description: 'scattered clouds', icon: '03d' }],
  sys: { country: 'BR', sunrise: 1_699_950_000, sunset: 1_699_997_000 },
};
const FORECAST = { list: Array.from({ length: 8 }, (_, i) => ({ dt: 1_700_000_000 + (i + 1) * 10800, main: { temp: 20 + i, humidity: 60 }, pop: 0.2, wind: { speed: 3 }, weather: CURRENT.weather })) };

const quiet = { log() {}, warn() {}, error() {} };
const tmpFile = async () => path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'ow-')), 'ow.json');

function fakeFetch({ status = 200 } = {}) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const body = url.includes('/forecast') ? FORECAST : CURRENT;
    return { ok: status === 200, status, json: async () => body };
  };
  fn.calls = calls;
  return fn;
}

const cfg = async (extra = {}) => ({
  apiKey: 'KEY', lat: '-22.9', lon: '-47.06', city: '', locationName: '', units: 'metric', lang: 'en',
  refreshMs: 3600e3, cacheFile: await tmpFile(), baseUrl: 'https://api.example', timeoutMs: 1000, ...extra,
});

test('normalizeCurrent converts units', () => {
  const c = normalizeCurrent(CURRENT);
  assert.equal(c.temp, 21.6);
  assert.equal(c.windSpeed, 8.4); // 2.333 m/s -> km/h
  assert.equal(c.visibilityKm, 10);
  assert.equal(c.condition.main, 'Clouds');
});

test('one refresh = 2 upstream requests; reading the snapshot never calls the API', async () => {
  const f = fakeFetch();
  const s = new OpenWeatherService(await cfg(), { fetchImpl: f, logger: quiet });
  await s.start();
  assert.equal(f.calls.length, 2);
  for (let i = 0; i < 1000; i++) s.snapshot();
  assert.equal(f.calls.length, 2);
  const snap = s.snapshot();
  assert.equal(snap.enabled, true);
  assert.equal(snap.location.name, 'Campinas');
  assert.equal(snap.forecast.length, 8);
  assert.ok(snap.nextUpdateAt - Date.now() > 3590e3);
  s.stop();
});

test('concurrent refreshes share one request', async () => {
  const f = fakeFetch();
  const s = new OpenWeatherService(await cfg(), { fetchImpl: f, logger: quiet });
  await Promise.all([s.refresh(), s.refresh(), s.refresh()]);
  assert.equal(f.calls.length, 2);
  s.stop();
});

test('restart within the interval reuses the cache file instead of calling the API', async () => {
  const c = await cfg();
  const f1 = fakeFetch();
  const a = new OpenWeatherService(c, { fetchImpl: f1, logger: quiet });
  await a.start();
  a.stop();
  const f2 = fakeFetch();
  const b = new OpenWeatherService(c, { fetchImpl: f2, logger: quiet });
  await b.start();
  assert.equal(f2.calls.length, 0);
  assert.equal(b.snapshot().current.temp, 21.6);
  b.stop();
});

test('invalid key waits a full interval before retrying', async () => {
  const f = fakeFetch({ status: 401 });
  const s = new OpenWeatherService(await cfg(), { fetchImpl: f, logger: quiet });
  await s.start();
  assert.equal(f.calls.length, 1);
  assert.ok(s.nextUpdateAt - Date.now() > 3590e3);
  assert.equal(s.snapshot().error !== null, true);
  s.stop();
});

test('transient errors retry after 15 min, keeping previous data', async () => {
  const s = new OpenWeatherService(await cfg(), { fetchImpl: fakeFetch(), logger: quiet });
  await s.start();
  s.fetch = fakeFetch({ status: 500 });
  await s.refresh();
  const wait = s.nextUpdateAt - Date.now();
  assert.ok(wait > 14 * 60e3 && wait <= 15 * 60e3);
  assert.equal(s.snapshot().current.temp, 21.6);
  s.stop();
});

test('not configured: disabled and no requests', async () => {
  const f = fakeFetch();
  const s = new OpenWeatherService(await cfg({ apiKey: '' }), { fetchImpl: f, logger: quiet });
  await s.start();
  assert.deepEqual(s.snapshot(), { enabled: false });
  assert.equal(f.calls.length, 0);
});
