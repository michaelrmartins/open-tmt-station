import { useState } from 'react';
import { Activity } from 'lucide-react';
import { Card, CardHeader, Segmented, Stat } from './ui.jsx';
import { HistoryChart } from './charts.jsx';
import { fmtNum } from '../lib/format.js';

const TABS = [
  { value: 'temperature', label: 'Temperature', tone: 'peach', unit: '°C', digits: 1 },
  { value: 'humidity', label: 'Humidity', tone: 'sky', unit: '%', digits: 1, band: [40, 60] },
  { value: 'dewPoint', label: 'Dew point', tone: 'teal', unit: '°C', digits: 1, band: [10, 16] },
  { value: 'pressure', label: 'Pressure', tone: 'lilac', unit: 'hPa', digits: 1, reference: { value: 1013.25, label: 'Standard' } },
  { value: 'illuminance', label: 'Light', tone: 'butter', unit: 'lx', digits: 0 },
  { value: 'batteryPercent', label: 'Battery', tone: 'sage', unit: '%', digits: 0, domain: [0, 100], reference: { value: 20, label: 'Low' } },
  { value: 'batteryVoltage', label: 'Battery voltage', tone: 'sage', unit: 'V', digits: 3 },
  { value: 'sourceVoltage', label: 'DC input', tone: 'apricot', unit: 'V', digits: 2 },
  { value: 'internalTemperature', label: 'Enclosure', tone: 'coral', unit: '°C', digits: 1 },
];

const summaryOf = (points = []) => {
  if (!points.length) return null;
  let min = Infinity, max = -Infinity, sum = 0;
  for (const [, v] of points) { min = Math.min(min, v); max = Math.max(max, v); sum += v; }
  return { min, max, avg: sum / points.length, current: points[points.length - 1][1] };
};

export function HistorySection({ history, rangeMs }) {
  const [tab, setTab] = useState('temperature');
  const cfg = TABS.find((t) => t.value === tab);
  const series = history?.series?.[tab];
  const s = summaryOf(series?.points);
  const f = (v) => fmtNum(v, cfg.digits);

  return (
    <Card>
      <CardHeader
        icon={Activity}
        tone={cfg.tone}
        title="History"
        subtitle={history ? `Averaged every ${history.interval}` : 'Loading'}
        right={
          <div className="hidden lg:block">
            <Segmented label="Metric" size="sm" value={tab} onChange={setTab} options={TABS} />
          </div>
        }
      />
      <div className="mt-4 lg:hidden">
        <Segmented label="Metric" size="sm" value={tab} onChange={setTab} options={TABS} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Latest" value={f(s?.current)} unit={cfg.unit} />
        <Stat label="Minimum" value={f(s?.min)} unit={cfg.unit} />
        <Stat label="Average" value={f(s?.avg)} unit={cfg.unit} />
        <Stat label="Maximum" value={f(s?.max)} unit={cfg.unit} />
      </div>

      <div className="-mx-2 mt-5">
        <HistoryChart key={tab} points={series?.points} tone={cfg.tone} unit={cfg.unit} digits={cfg.digits} rangeMs={rangeMs} domain={cfg.domain} band={cfg.band} reference={cfg.reference} />
      </div>
    </Card>
  );
}
