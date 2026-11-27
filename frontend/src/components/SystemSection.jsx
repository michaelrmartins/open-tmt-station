import { useCallback } from 'react';
import { ScaleBar } from './charts.jsx';
import { AlarmClock, Cpu, MoonStar, RotateCcw, Thermometer, Timer, Wifi, WifiHigh, WifiLow, WifiZero } from 'lucide-react';
import { Card, CardHeader, Skeleton, Stat, TrendPill } from './ui.jsx';
import { TONES, label } from '../lib/labels.js';
import { fmtDateTime, fmtNum, fmtSigned, fmtTime, uptimeParts } from '../lib/format.js';
import { useNow } from '../hooks/usePolling.js';

function Meter({ value, tone, label, unit = '%' }) {
  const tip = useCallback(() => `${label} <b>${fmtNum(value, 0)}${unit}</b>`, [label, value, unit]);
  return (
    <div className="mt-4">
      <ScaleBar min={0} max={100} value={value ?? 0} tone={tone} thickness={6} tooltip={tip} ariaLabel={`${label} ${fmtNum(value, 0)} percent`} />
    </div>
  );
}

function Big({ value, unit }) {
  return (
    <div className="mt-4 flex items-baseline gap-1">
      <span className="tabular text-[32px] font-semibold leading-none tracking-[-0.02em]">{value}</span>
      <span className="text-[14px] font-medium text-ink-2">{unit}</span>
    </div>
  );
}

function WifiCard({ wifi, className }) {
  const Icon = wifi?.bars >= 3 ? Wifi : wifi?.bars === 2 ? WifiHigh : wifi?.bars === 1 ? WifiLow : WifiZero;
  return (
    <Card className={className}>
      <CardHeader icon={Icon} tone="teal" title="Wi-Fi" subtitle={label(wifi?.level)} />
      <Big value={fmtNum(wifi?.value, 0)} unit="dBm" />
      <Meter value={wifi?.quality} tone="teal" label="Signal quality" />
      <div className="mt-2 text-[12px] text-ink-2">
        Signal quality <span className="tabular font-semibold text-ink">{fmtNum(wifi?.quality, 0)}%</span>
      </div>
    </Card>
  );
}

function LoadCard({ load, className }) {
  return (
    <Card className={className}>
      <CardHeader icon={Cpu} tone="rose" title="CPU load" subtitle={label(load?.level)} />
      <Big value={fmtNum(load?.value, 0)} unit="%" />
      <Meter value={load?.value} tone="rose" label="CPU load" />
      <div className="mt-2 text-[12px] text-ink-2">
        3 h average <span className="tabular font-semibold text-ink">{fmtNum(load?.avg, 0)}%</span>
      </div>
    </Card>
  );
}

function EnclosureCard({ temp, className }) {
  const trendText = temp?.trend === 'flat' ? 'Stable' : `${fmtSigned(temp?.rate, 1)} °C/h`;
  return (
    <Card className={className}>
      <CardHeader icon={Thermometer} tone="coral" title="Enclosure" subtitle={label(temp?.level)} right={<TrendPill trend={temp?.trend} text={trendText} tone="coral" />} />
      <Big value={fmtNum(temp?.value, 1)} unit="°C" />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="Min · 3 h" value={fmtNum(temp?.min, 1)} unit="°C" />
        <Stat label="Max · 3 h" value={fmtNum(temp?.max, 1)} unit="°C" />
      </div>
    </Card>
  );
}

function UptimeCard({ uptime, className }) {
  const now = useNow(1000);
  const live = uptime?.value == null ? null : uptime.stale ? uptime.reported : uptime.reported + Math.max(0, (now - uptime.time) / 1000);
  const parts = uptimeParts(live);
  return (
    <Card className={className}>
      <CardHeader icon={Timer} tone={uptime?.recentBoot ? 'butter' : 'sage'} title="Uptime" subtitle={uptime?.recentBoot ? 'Recently restarted' : 'Running'} />
      <div className="tabular mt-4 flex items-baseline gap-2">
        {parts.length ? (
          parts.map(([n, u], i) => (
            <span key={u} className="flex items-baseline gap-0.5">
              <span className="text-[32px] font-semibold leading-none tracking-[-0.02em]">{i === 0 ? n : String(n).padStart(2, '0')}</span>
              <span className="text-[14px] font-medium text-ink-2">{u}</span>
            </span>
          ))
        ) : (
          <span className="text-[32px] font-semibold">--</span>
        )}
      </div>
      <div className="mt-4 flex items-center gap-2 text-[12px] text-ink-2">
        <RotateCcw size={14} strokeWidth={1.75} aria-hidden="true" />
        Booted {fmtDateTime(uptime?.bootTime)}
        {uptime?.restarts > 0 && <span> · {uptime.restarts} restart{uptime.restarts > 1 ? 's' : ''} in 3 h</span>}
      </div>
    </Card>
  );
}

/** Seconds as display parts, e.g. 330 -> [[5,'min'],[30,'s']], 7200 -> [[2,'h']] */
function intervalParts(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const parts = [];
  if (h) parts.push([h, 'h']);
  if (m) parts.push([m, 'min']);
  if (r || !parts.length) parts.push([r, 's']);
  return parts;
}

function DeepSleepCard({ sleep, className }) {
  const now = useNow(15000);
  const enabled = sleep?.enabled;
  const overdue = enabled && sleep.nextWakeAt && now - sleep.nextWakeAt > 60e3;
  return (
    <Card className={className}>
      <CardHeader
        icon={MoonStar}
        tone="lilac"
        title="Deep sleep"
        subtitle={sleep?.value == null ? 'No data' : enabled ? 'Sleeps between readings' : 'Disabled, always on'}
      />
      <div className="tabular mt-4 flex items-baseline gap-2">
        {enabled ? (
          intervalParts(sleep.value).map(([n, u]) => (
            <span key={u} className="flex items-baseline gap-0.5">
              <span className="text-[32px] font-semibold leading-none tracking-[-0.02em]">{n}</span>
              <span className="text-[14px] font-medium text-ink-2">{u}</span>
            </span>
          ))
        ) : (
          <span className="text-[32px] font-semibold leading-none tracking-[-0.02em]">{sleep?.value == null ? '--' : 'Off'}</span>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-2">
        <AlarmClock size={14} strokeWidth={1.75} aria-hidden="true" />
        {enabled ? (
          <>
            Last wake-up {fmtTime(sleep.time)}
            <span>· {overdue ? 'next wake-up overdue' : `next around ${fmtTime(sleep.nextWakeAt)}`}</span>
          </>
        ) : (
          <>Last report {fmtTime(sleep?.time)}</>
        )}
        {sleep?.changedAt && (
          <span>· changed from {intervalParts(sleep.previous).map(([n, u]) => `${n} ${u}`).join(' ')} at {fmtTime(sleep.changedAt)}</span>
        )}
      </div>
    </Card>
  );
}

export function SystemSection({ snapshot }) {
  const m = snapshot?.metrics;
  // Desktop: three cards on the first row, uptime and deep sleep side by side on the second
  const grid = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6';
  if (!m) {
    return (
      <div className={grid}>
        {[2, 2, 2, 3, 3].map((span, i) => (
          <Card key={i} className={span === 2 ? 'lg:col-span-2' : 'lg:col-span-3'}><Skeleton className="h-32" /></Card>
        ))}
      </div>
    );
  }
  return (
    <div className={grid}>
      <WifiCard wifi={m.wifiSignal} className="lg:col-span-2" />
      <LoadCard load={m.loadAvg} className="lg:col-span-2" />
      <EnclosureCard temp={m.internalTemperature} className="sm:col-span-2 lg:col-span-2" />
      <UptimeCard uptime={m.uptime} className="lg:col-span-3" />
      <DeepSleepCard sleep={m.deepSleep} className="lg:col-span-3" />
    </div>
  );
}
