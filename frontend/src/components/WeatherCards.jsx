import { Droplets, Gauge, Sun, Thermometer } from 'lucide-react';
import { Card, CardHeader, Divider, Skeleton, Stat, TrendPill } from './ui.jsx';
import { Sparkline } from './charts.jsx';
import { label } from '../lib/labels.js';
import { fmtAdaptive, fmtNum, fmtSigned } from '../lib/format.js';

const CARDS = [
  { key: 'temperature', title: 'Temperature', icon: Thermometer, tone: 'peach', unit: '°C', digits: 1, rateDigits: 1 },
  { key: 'humidity', title: 'Humidity', icon: Droplets, tone: 'sky', unit: '%', digits: 1, rateDigits: 1 },
  { key: 'pressure', title: 'Pressure', icon: Gauge, tone: 'lilac', unit: 'hPa', digits: 1, rateDigits: 1, statDigits: 0 },
  { key: 'illuminance', title: 'Light', icon: Sun, tone: 'butter', unit: 'lx', digits: 0, rateDigits: 0 },
];

function trendText(key, m) {
  if (!m?.trend) return null;
  if (m.trend === 'flat') return key === 'pressure' ? 'Steady' : 'Stable';
  if (key === 'illuminance') return `${fmtSigned(m.delta, Math.abs(m.delta) < 10 ? 1 : 0)} lx`;
  return `${fmtSigned(m.rate, 1)} ${m.rateUnit}`;
}

function subtitle(key, m) {
  if (!m) return '';
  if (key === 'humidity') return m.comfort?.inside ? 'Within comfort band' : 'Outside comfort band';
  if (key === 'pressure') return 'Tendency over 3 h';
  if (key === 'illuminance') return 'vs. previous readings';
  return 'Rate over 30 min';
}

export function WeatherCard({ cfg, metric, history, rangeLabel }) {
  const { key, title, icon, tone, unit, digits } = cfg;
  const s = history?.summary;
  const value = key === 'illuminance' ? fmtAdaptive(metric?.value) : fmtNum(metric?.value, digits);
  const fmtS = (v) => (key === 'illuminance' ? fmtAdaptive(v) : fmtNum(v, cfg.statDigits ?? digits));

  return (
    <Card className="flex flex-col">
      <CardHeader icon={icon} tone={tone} title={title} subtitle={subtitle(key, metric)} />

      <div className="mt-5 flex items-baseline gap-1.5">
        {metric ? (
          <>
            <span className="tabular text-[44px] font-semibold leading-none tracking-[-0.03em] text-ink">{value}</span>
            <span className="text-[17px] font-medium text-ink-2">{unit}</span>
          </>
        ) : (
          <Skeleton className="h-11 w-32" />
        )}
      </div>
      <div className="mt-2 flex min-h-[26px] flex-wrap items-center justify-between gap-2">
        <span className="text-[14px] font-medium" style={{ color: `var(--color-${tone})` }}>{metric ? label(metric.level) : '\u00a0'}</span>
        <TrendPill trend={metric?.trend} text={trendText(key, metric)} tone={tone} />
      </div>

      <div className="-mx-1 mt-4">
        <Sparkline points={history?.points} tone={tone} unit={unit} digits={cfg.statDigits ?? digits} label={title} />
      </div>

      <Divider />
      <div className="grid grid-cols-3 gap-2">
        <Stat label={`Min · ${rangeLabel}`} value={fmtS(s?.min)} unit={unit} />
        <Stat label="Average" value={fmtS(s?.avg)} unit={unit} />
        <Stat label="Max" value={fmtS(s?.max)} unit={unit} />
      </div>
    </Card>
  );
}

export function WeatherGrid({ snapshot, history, rangeLabel }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {CARDS.map((c) => (
        <WeatherCard key={c.key} cfg={c} metric={snapshot?.metrics?.[c.key]} history={history?.series?.[c.key]} rangeLabel={rangeLabel} />
      ))}
    </div>
  );
}
