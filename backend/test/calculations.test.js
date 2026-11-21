import test from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../src/lib/calculations.js';

const MIN = 60e3;
const BAT = { empty: 3.0, full: 4.135 };
const now = 1_700_000_000_000;
// Linear series: v0 + rate/h, one point per minute, ending at `now`.
const line = (v0, ratePerH, minutes, step = 1) =>
  Array.from({ length: Math.floor(minutes / step) + 1 }, (_, i) => {
    const t = now - (minutes - i * step) * MIN;
    return { t, v: v0 + (ratePerH * (i * step)) / 60 };
  });

test('slopePerHour recovers the slope of a line', () => {
  assert.ok(Math.abs(c.slopePerHour(line(20, 1.5, 60)) - 1.5) < 1e-9);
  assert.ok(Math.abs(c.slopePerHour(line(4, -0.03, 60), 1000) + 30) < 1e-6);
});

test('temperature: trend with 0.3 °C/h threshold over 30 min', () => {
  const up = c.temperature(line(20, 1, 120), now);
  assert.equal(up.trend, 'up');
  assert.ok(Math.abs(up.rate - 1) < 0.01);
  assert.equal(c.temperature(line(20, 0.2, 120), now).trend, 'flat');
  assert.equal(c.temperature(line(20, -0.5, 120), now).trend, 'down');
  assert.equal(c.temperature(line(22, 0, 10), now).level, 'comfortable');
});

test('humidity: comfort band and levels', () => {
  const h = c.humidity(line(55, 0, 30), now);
  assert.equal(h.level, 'comfortable');
  assert.equal(h.comfort.inside, true);
  assert.equal(c.humidity(line(90, 0, 30), now).level, 'saturated');
});

test('pressure: tendency in hPa/3h', () => {
  const p = c.pressure(line(1020, -0.5, 240), now); // -1.5 hPa/3h
  assert.ok(Math.abs(p.rate + 1.5) < 0.01);
  assert.equal(p.trend, 'down');
  assert.equal(p.level, 'fair');
});

test('illuminance: delta vs mean of the 5 previous readings', () => {
  const pts = [100, 100, 100, 100, 100, 200].map((v, i) => ({ t: now - (5 - i) * MIN, v }));
  const l = c.illuminance(pts, now);
  assert.equal(l.delta, 100);
  assert.equal(l.trend, 'up');
  assert.equal(l.level, 'indoor');
});

test('battery: percent, discharge and time to empty', () => {
  // 3.6 V falling 30 mV/h
  const b = c.battery(line(3.6 + 0.06, -0.03, 120), BAT, now);
  assert.ok(Math.abs(b.voltage - 3.6) < 1e-6);
  assert.ok(Math.abs(b.percent - ((0.6 / 1.135) * 100)) < 0.1);
  assert.equal(b.trend, 'down');
  assert.ok(Math.abs(b.rate + 30) < 0.5);
  assert.ok(Math.abs(b.toEmpty.hours - 20) < 0.1); // 600 mV / 30 mV/h
  assert.equal(b.toFull, null);
});

test('battery: charging yields time to full', () => {
  const b = c.battery(line(3.8, 0.1, 60), BAT, now); // ends at 3.9 V, +100 mV/h
  assert.equal(b.trend, 'up');
  assert.ok(Math.abs(b.toFull.hours - 2.35) < 0.05);
});

test('battery: long ETA while discharging slowly', () => {
  const b = c.battery(line(4.0, -0.021, 60), BAT, now); // -21 mV/h -> ~47 h
  assert.ok(b.toEmpty.hours > 40);
  const slow = c.battery(line(4.0, -0.0, 60).map((p, i) => ({ ...p, v: 4.0 - i * 0.0004 })), BAT, now);
  assert.ok(slow.trend === 'down');
});

test('solar input: status, charge window and ripple', () => {
  const pts = line(5.0, 0, 60);
  const p = c.powerInput(pts, 'solar', now);
  assert.equal(p.status, 'charger_active');
  assert.equal(p.chargeWindowMs, 60 * MIN);
  assert.equal(p.rippleMv, 0);
  assert.equal(p.level, 'partial_sun');
  const psu = c.powerInput(pts, 'psu', now);
  assert.equal(psu.status, 'usb_spec_ok');
  assert.equal(psu.level, 'stable');
});

test('flow: instant states', () => {
  assert.equal(c.stateOf(0.5, 3.9, -20, 'solar'), 'battery');
  assert.equal(c.stateOf(5.5, 3.9, 50, 'solar'), 'charging');
  assert.equal(c.stateOf(5.5, 4.12, 0, 'solar'), 'full');
  assert.equal(c.stateOf(5.5, 3.9, 0, 'solar'), 'charging');
});

test('energyAnalysis: time on battery / source, consumption and charging', () => {
  // 2 h on battery (no source, -40 mV/h) followed by 2 h charging (+100 mV/h)
  const src = [], batt = [];
  const start = now - 240 * MIN;
  for (let i = 0; i <= 240; i++) {
    const t = start + i * MIN;
    const onBat = i < 120;
    src.push({ t, v: onBat ? 0.3 : 5.5 });
    batt.push({ t, v: onBat ? 3.9 - (0.04 * i) / 60 : 3.82 + (0.1 * (i - 120)) / 60 });
  }
  const e = c.energyAnalysis(src, batt, { mode: 'solar', bat: BAT });
  assert.equal(e.state, 'charging');
  assert.ok(Math.abs(e.totals.battery - 120 * MIN) <= 2 * MIN);
  assert.ok(Math.abs(e.totals.source - 120 * MIN) <= 2 * MIN);
  assert.ok(Math.abs(e.discharge.rateMvH + 40) < 1);
  assert.ok(Math.abs(e.discharge.autonomyHours - 1135 / 40) < 1);
  assert.ok(Math.abs(e.charge.rateMvH - 100) < 3);
  assert.ok(Math.abs(e.stateSinceMs - 120 * MIN) <= 2 * MIN);
  assert.equal(e.stateSinceAtLeast, false);
});

test('deep sleep: interval, next wake-up and config change', () => {
  const pts = [{ t: now - 20 * MIN, v: 600 }, { t: now - 10 * MIN, v: 300 }, { t: now - 5 * MIN, v: 300 }];
  const d = c.deepSleep(pts, now);
  assert.equal(d.value, 300);
  assert.equal(d.enabled, true);
  assert.equal(d.nextWakeAt, now - 5 * MIN + 300e3);
  assert.equal(d.previous, 600);
  assert.equal(d.changedAt, now - 10 * MIN);
  assert.equal(d.stale, false); // 5 min old, interval 5 min: not stale yet
  assert.equal(c.deepSleep([{ t: now - 2 * MIN, v: 0 }], now).enabled, false);
  assert.equal(c.deepSleep([], now).value, null);
});

test('connection status: online, sleeping during long deep sleep, then offline', () => {
  const sleep = (v) => ({ enabled: v > 0, value: v });
  const last = now - 10 * MIN;
  // 30 min deep sleep: 10 min after the last reading it is sleeping, not offline
  let s = c.connectionStatus(last, sleep(1800), now);
  assert.equal(s.status, 'sleeping');
  assert.equal(s.offlineAt, last + 1800e3 + 90e3);
  assert.equal(c.connectionStatus(last, sleep(1800), last + 1800e3 + 91e3).status, 'offline');
  assert.equal(c.connectionStatus(now - 2 * MIN, sleep(1800), now).status, 'online');
  // deep sleep off, or shorter than the 5 min live window: plain 5 min rule
  assert.equal(c.connectionStatus(last, sleep(0), now).status, 'offline');
  assert.equal(c.connectionStatus(last, sleep(120), now).status, 'offline');
  assert.equal(c.connectionStatus(last, sleep(120), now).sleepingAt, null);
  assert.equal(c.connectionStatus(null, sleep(1800), now).status, 'offline');
});

test('connection status: no red flash when deep sleep equals the live window', () => {
  const sleep = (v) => ({ enabled: v > 0, value: v });
  const last = now - 5.5 * MIN;
  // 5 min deep sleep, 5 min window: between 5:00 and 6:30 it is sleeping (used to be offline)
  assert.equal(c.connectionStatus(last, sleep(300), now).status, 'sleeping');
  assert.equal(c.connectionStatus(last, sleep(300), last + 391e3).status, 'offline');
});

test('connection status: custom live window and grace', () => {
  const sleep = (v) => ({ enabled: v > 0, value: v });
  const last = now - 4 * MIN;
  const opts = { liveWindowMs: 3 * MIN, graceMs: 60e3 };
  // 3 min window, 5 min deep sleep: live until 3:00, sleeping until 6:00, then offline
  assert.equal(c.connectionStatus(last, sleep(300), last + 2 * MIN, opts).status, 'online');
  assert.equal(c.connectionStatus(last, sleep(300), now, opts).status, 'sleeping');
  assert.equal(c.connectionStatus(last, sleep(300), last + 361e3, opts).status, 'offline');
  // 2 min deep sleep with a 3 min window: readings arrive before the window ends, stays live
  assert.equal(c.connectionStatus(now - 2.3 * MIN, sleep(120), now, opts).status, 'online');
});

test('wifi and uptime', () => {
  const w = c.wifi([{ t: now, v: -65 }], now);
  assert.equal(w.quality, 70);
  assert.equal(w.level, 'good');
  const u = c.uptime([{ t: now - 2 * MIN, v: 5000 }, { t: now - MIN, v: 10 }, { t: now, v: 70 }], now);
  assert.equal(u.restarts, 1);
  assert.equal(u.recentBoot, true);
  assert.equal(u.bootTime, now - 70000);
});
