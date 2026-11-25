import test from 'node:test';
import assert from 'node:assert/strict';
import { nowcast, lightReference } from '../src/lib/nowcast.js';

const MIN = 60e3;
const now = new Date('2026-06-15T14:00:00').getTime();
// one point per minute over the last `minutes`, linear from v0 at a rate per hour
const line = (v0, ratePerH, minutes = 180) =>
  Array.from({ length: minutes + 1 }, (_, i) => ({ t: now - (minutes - i) * MIN, v: v0 + (ratePerH * i) / 60 }));
const ref = (lux) => ({ at: () => lux, days: 7 });

function series({ t = 25, tRate = 0, rh = 60, rhRate = 0, td = 15, tdRate = 0, p = 1013, pRate3h = 0, lux = 40000, luxEnd = lux }) {
  const n = 181;
  return {
    temperature: line(t - (tRate * 3), tRate),
    humidity: line(rh - (rhRate * 3), rhRate),
    dewPoint: line(td - (tdRate * 3), tdRate),
    pressure: line(p - pRate3h, pRate3h / 3),
    illuminance: Array.from({ length: n }, (_, i) => ({ t: now - (n - 1 - i) * MIN, v: lux + ((luxEnd - lux) * i) / (n - 1) })),
  };
}

test('storm approaching: falling pressure, moist air near saturation, darkening sky', () => {
  const s = series({ t: 27, tRate: -2.5, rh: 85, rhRate: 8, td: 23, tdRate: 0.2, p: 1004, pRate3h: -2.6, lux: 60000, luxEnd: 9000 });
  const o = nowcast({ s, luxRef: ref(60000), dew: { value: 23, spread: 4 }, pressure: { value: 1004, rate: -2.6, trend: 'down' } }, now);
  assert.equal(o.outlook, 'storm');
  assert.ok(o.chance['3h'] >= 70, `3h chance ${o.chance['3h']}`);
  assert.notEqual(o.storm, 'none');
  assert.ok(o.factors.some((f) => f.key === 'pressure_falling'));
  assert.ok(o.factors.some((f) => f.key === 'overcast'));
  assert.ok(o.factors.some((f) => f.key === 'cooling_burst'));
});

test('sunny day: rising pressure, dry air, full light', () => {
  const s = series({ t: 26, rh: 40, td: 11, p: 1021, pRate3h: 1, lux: 58000 });
  const o = nowcast({ s, luxRef: ref(60000), dew: { value: 11, spread: 15 }, pressure: { value: 1021, rate: 1, trend: 'up' } }, now);
  assert.equal(o.outlook, 'sunny');
  assert.ok(o.chance['3h'] <= 5, `3h chance ${o.chance['3h']}`);
  assert.ok(o.cloudCover <= 10);
});

test('clearing: half-cloudy sky with rising pressure and drying air', () => {
  const s = series({ t: 22, rh: 55, td: 12, tdRate: -0.5, p: 1015, pRate3h: 1, lux: 30000 });
  const o = nowcast({ s, luxRef: ref(60000), dew: { value: 12, spread: 10 }, pressure: { value: 1015, rate: 1, trend: 'up' } }, now);
  assert.equal(o.outlook, 'clearing');
});

test('clear night vs fog at night', () => {
  const night = (spread, td) => {
    const s = series({ t: td + spread, rh: 70, td, p: 1017, lux: 0 });
    return nowcast({ s, luxRef: ref(5), dew: { value: td, spread }, pressure: { value: 1017, rate: 0.2, trend: 'flat' } }, now);
  };
  assert.equal(night(8, 10).outlook, 'clear_night');
  assert.equal(night(8, 10).isDay, false);
  assert.equal(night(1, 14).outlook, 'fog');
});

test('pressure-driven change grows with the horizon', () => {
  const s = series({ t: 20, rh: 65, td: 13, p: 1006, pRate3h: -2 });
  const o = nowcast({ s, luxRef: null, dew: { value: 13, spread: 7 }, pressure: { value: 1006, rate: -2, trend: 'down' } }, now);
  assert.ok(o.chance['6h'] > o.chance['3h'] && o.chance['3h'] > o.chance['1h'], JSON.stringify(o.chance));
  assert.equal(o.isDay, null); // no light reference: day/night unknown
});

test('light reference learns the brightest reading per time of day', () => {
  const day = 86400e3;
  const pts = [0, 1, 2].flatMap((d) => [
    { t: now - d * day, v: 20000 + d * 10000 }, // 14:00 on three days
    { t: now - d * day - 10 * 3600e3, v: 0 }, // 04:00, same day
  ]);
  const r = lightReference(pts);
  assert.equal(r.at(now), 40000);
  assert.equal(r.at(now - 10 * 3600e3), 0);
  assert.equal(r.days, 3);
});

test('twilight: no cloud cover estimate while the light changes fast', () => {
  const s = series({ t: 18, rh: 60, td: 10, p: 1015, lux: 0 });
  const o = nowcast({ s, luxRef: ref(900), dew: { value: 10, spread: 8 }, pressure: { value: 1015, rate: 0, trend: 'flat' } }, now);
  assert.equal(o.isDay, true);
  assert.equal(o.cloudCover, null);
  assert.ok(!o.factors.some((f) => f.key === 'overcast'));
});
