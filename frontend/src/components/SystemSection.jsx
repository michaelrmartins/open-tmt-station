import { Cpu, RotateCcw, Thermometer, Timer, Wifi, WifiHigh, WifiLow, WifiZero } from 'lucide-react';
import { Card, CardHeader, Skeleton, Stat, TrendPill } from './ui.jsx';
import { TONES, label } from '../lib/labels.js';
import { fmtDateTime, fmtNum, fmtSigned, uptimeParts } from '../lib/format.js';
import { useNow } from '../hooks/usePolling.js';

function Meter({ value, tone }) {
  return (
    <div className="mt-4 h-1.5 rounded-full bg-black/[0.06]">
      <div className="h-full rounded-full transition-[width] duration-1000" style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%`, background: TONES[tone].line }} />
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

function WifiCard({ wifi }) {
  const Icon = wifi?.bars >= 3 ? Wifi : wifi?.bars === 2 ? WifiHigh : wifi?.bars === 1 ? WifiLow : WifiZero;
  return (
    <Card>
      <CardHeader icon={Icon} tone="teal" title="Wi-Fi" subtitle={label(wifi?.level)} />
      <Big value={fmtNum(wifi?.value, 0)} unit="dBm" />
      <Meter value={wifi?.quality} tone="teal" />
      <div className="mt-2 text-[12px] text-ink-2">
        Signal quality <span className="tabular font-semibold text-ink">{fmtNum(wifi?.quality, 0)}%</span>
      </div>
    </Card>
  );
}

function LoadCard({ load }) {
  return (
    <Card>
      <CardHeader icon={Cpu} tone="rose" title="CPU load" subtitle={label(load?.level)} />
      <Big value={fmtNum(load?.value, 0)} unit="%" />
      <Meter value={load?.value} tone="rose" />
      <div className="mt-2 text-[12px] text-ink-2">
        3 h average <span className="tabular font-semibold text-ink">{fmtNum(load?.avg, 0)}%</span>
      </div>
    </Card>
  );
}

function EnclosureCard({ temp }) {
  const trendText = temp?.trend === 'flat' ? 'Stable' : `${fmtSigned(temp?.rate, 1)} °C/h`;
  return (
    <Card>
      <CardHeader icon={Thermometer} tone="coral" title="Enclosure" subtitle={label(temp?.level)} right={<TrendPill trend={temp?.trend} text={trendText} tone="coral" />} />
      <Big value={fmtNum(temp?.value, 1)} unit="°C" />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="Min · 3 h" value={fmtNum(temp?.min, 1)} unit="°C" />
        <Stat label="Max · 3 h" value={fmtNum(temp?.max, 1)} unit="°C" />
      </div>
    </Card>
  );
}

function UptimeCard({ uptime }) {
  const now = useNow(1000);
  const live = uptime?.value == null ? null : uptime.stale ? uptime.reported : uptime.reported + Math.max(0, (now - uptime.time) / 1000);
  const parts = uptimeParts(live);
  return (
    <Card>
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

export function SystemSection({ snapshot }) {
  const m = snapshot?.metrics;
  if (!m) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}><Skeleton className="h-32" /></Card>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <WifiCard wifi={m.wifiSignal} />
      <LoadCard load={m.loadAvg} />
      <EnclosureCard temp={m.internalTemperature} />
      <UptimeCard uptime={m.uptime} />
    </div>
  );
}
