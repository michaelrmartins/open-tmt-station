import { useId } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TONES } from '../lib/labels.js';
import { fmtDateTime, fmtNum } from '../lib/format.js';

const toRows = (points = []) => points.map(([t, v]) => ({ t, v }));

/** Minimal area sparkline. */
export function Sparkline({ points, tone = 'slate', height = 56 }) {
  const id = useId().replace(/:/g, '');
  const t = TONES[tone];
  const data = toRows(points);
  if (data.length < 2) return <div style={{ height }} />;
  return (
    <div style={{ height }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={t.line} stopOpacity={0.45} />
              <stop offset="100%" stopColor={t.line} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Area type="monotone" dataKey="v" stroke={t.line} strokeWidth={1.75} fill={`url(#sp-${id})`} isAnimationActive={false} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartTooltip({ active, payload, unit, digits }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="glass rounded-2xl px-3 py-2 text-[12px]">
      <div className="text-ink-2">{fmtDateTime(p.t)}</div>
      <div className="tabular text-[15px] font-semibold text-ink">
        {fmtNum(p.v, digits)} <span className="text-[12px] font-medium text-ink-2">{unit}</span>
      </div>
    </div>
  );
}

/** Full history chart with soft grid and hover tooltip. */
export function HistoryChart({ points, tone = 'sky', unit, digits = 1, rangeMs, domain, band, reference, height = 280 }) {
  const id = useId().replace(/:/g, '');
  const t = TONES[tone];
  const data = toRows(points);
  const long = rangeMs > 2 * 86400e3;
  const tick = (ts) =>
    new Date(ts).toLocaleString(undefined, long ? { day: 'numeric', month: 'short' } : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  if (data.length < 2) {
    return <div className="flex items-center justify-center text-[14px] text-ink-3" style={{ height }}>No data in this range</div>;
  }
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 6, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`hc-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={t.line} stopOpacity={0.4} />
              <stop offset="100%" stopColor={t.line} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.06)" />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={tick}
            tick={{ fill: '#a1a1a6', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={48}
          />
          <YAxis
            domain={domain || ['auto', 'auto']}
            tickFormatter={(v) => fmtNum(v, Math.abs(v) >= 100 ? 0 : digits)}
            tick={{ fill: '#a1a1a6', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={44}
            allowDataOverflow={false}
          />
          {band && <ReferenceArea y1={band[0]} y2={band[1]} fill={t.line} fillOpacity={0.08} stroke="none" ifOverflow="hidden" />}
          {reference && <ReferenceLine y={reference.value} stroke="rgba(0,0,0,0.18)" strokeDasharray="4 4" ifOverflow="hidden" label={{ value: reference.label, position: 'insideTopRight', fill: '#a1a1a6', fontSize: 11 }} />}
          <Tooltip content={<ChartTooltip unit={unit} digits={digits} />} cursor={{ stroke: 'rgba(0,0,0,0.12)', strokeWidth: 1 }} />
          <Area type="monotone" dataKey="v" stroke={t.fg} strokeOpacity={0.75} strokeWidth={2} fill={`url(#hc-${id})`} dot={false} activeDot={{ r: 4, fill: '#fff', stroke: t.fg, strokeWidth: 2 }} animationDuration={600} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

