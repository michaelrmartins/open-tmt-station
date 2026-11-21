import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { buildSeriesQuery } from '../src/influx/queries.js';

const config = {
  port: 0, corsOrigin: '*', trustProxy: 0, rateLimitPerMinute: 1000, mock: true,
  influx: { url: 'http://x', database: 'db', measurement: 'mqtt_consumer', topicPrefix: 'tele/esp32_varanda/' },
  station: { name: 'Test', location: '', powerMode: 'solar' },
  battery: { empty: 3.0, full: 4.135 },
  cache: { snapshotTtlMs: 1000, historyTtlMs: 1000 },
  openWeather: { apiKey: '', lat: '', lon: '', city: '', units: 'metric', lang: 'en', refreshMs: 3600e3, cacheFile: '/nonexistent/ow.json' },
};

const start = () => new Promise((resolve) => {
  const server = createApp(config).listen(0, () => resolve(server));
});

test('generated InfluxQL', () => {
  const q = buildSeriesQuery({ measurement: 'mqtt_consumer', topicPrefix: 'tele/esp32_varanda/', rangeKey: '3h', metrics: ['temperature', 'uptime'] });
  assert.equal(q, 'SELECT mean("AM2301_Temperature") AS "temperature", last("UptimeSec") AS "uptime" FROM "mqtt_consumer" WHERE "topic" =~ /^tele\\/esp32_varanda\\// AND time > now() - 3h GROUP BY time(1m) fill(none)');
  assert.throws(() => buildSeriesQuery({ measurement: 'm', topicPrefix: 'p', rangeKey: '1h; DROP' }));
});

test('endpoints (MOCK_DATA)', async () => {
  const server = await start();
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    const get = async (p) => { const r = await fetch(base + p); return { status: r.status, body: await r.json() }; };

    assert.equal((await get('/health')).body.status, 'ok');
    const snap = await get('/snapshot');
    assert.equal(snap.status, 200);
    assert.ok(snap.body.metrics.temperature.value !== null);
    assert.equal(snap.body.metrics.deepSleep.value, 300);
    assert.ok(['online', 'sleeping', 'offline'].includes(snap.body.status));
    assert.ok(['battery', 'charging', 'full'].includes(snap.body.flow.state));

    const hist = await get('/history?range=24h&metrics=temperature,batteryVoltage');
    assert.equal(hist.status, 200);
    assert.ok(hist.body.series.temperature.points.length > 100);
    assert.ok(hist.body.series.batteryPercent.points.length > 100);

    const energy = await get('/energy?range=7d');
    assert.equal(energy.status, 200);
    assert.ok(energy.body.totals.battery > 0 && energy.body.totals.source > 0);
    assert.ok(energy.body.discharge.rateMvH < 0);
    assert.ok(energy.body.charge.rateMvH > 0);

    assert.equal((await get('/metrics/pressure?range=6h')).status, 200);
    const outside = await get('/outside');
    assert.equal(outside.body.enabled, true); // demo data in MOCK_DATA mode without a key
    assert.ok(outside.body.current.temp !== null);
    assert.equal((await get('/history?range=99y')).status, 400);
    assert.equal((await get('/history?metrics=foo')).status, 400);
    assert.equal((await get('/metrics/foo')).status, 404);
    assert.equal((await get('/nada')).status, 404);
  } finally {
    server.close();
  }
});
