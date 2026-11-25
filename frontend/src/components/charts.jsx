import { useId } from 'react';
import { Area, AreaChart, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TONES } from '../lib/labels.js';
import { fmtDateTime, fmtNum } from '../lib/format.js';

const toRows = (points = []) => points.map(([t, v]) => ({ t, v }));

/** Glowing dot on the last point of a series. */
export function EndDot({ cx, cy, index, last, color, r = 3.5 }) {
  if (index !== last || cx == null || cy == null) return null;
  return (
    <g>
      <circle className="halo" cx={cx} cy={cy} r={r + 3} fill={color} opacity={0.4} />
      <circle cx={cx} cy={cy} r={r} fill="#fff" stroke={color} strokeWidth={2} />
    </g>
  );
}

/** Minimal area sparkline. */
export function Sparkline({ points, tone = 'slate', height = 56 }) {
  const id = useId().replace(/:/g, '');
  const t = TONES[tone];
  const data = toRows(points);
  if (data.length < 2) return <div style={{ height }} />;
  return (
    <div className="glow-line" style={{ height, '--glow': t.line }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 2, left: 0 }}>
          <defs>
            <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={t.line} stopOpacity={0.45} />
              <stop offset="100%" stopColor={t.line} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Area type="monotone" dataKey="v" stroke={t.line} strokeWidth={2} fill={`url(#sp-${id})`} isAnimationActive={false} dot={<EndDot last={data.length - 1} color={t.line} />} />
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
    <div className="glow-line" style={{ height, '--glow': t.line }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`hc-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={t.line} stopOpacity={0.4} />
              <stop offset="100%" stopColor={t.line} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--hair)" />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={tick}
            tick={{ fill: 'var(--axis)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={48}
          />
          <YAxis
            domain={domain || ['auto', 'auto']}
            tickFormatter={(v) => fmtNum(v, Math.abs(v) >= 100 ? 0 : digits)}
            tick={{ fill: 'var(--axis)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={44}
            allowDataOverflow={false}
          />
          {band && <ReferenceArea y1={band[0]} y2={band[1]} fill={t.line} fillOpacity={0.08} stroke="none" ifOverflow="hidden" />}
          {reference && <ReferenceLine y={reference.value} stroke="var(--hair-strong)" strokeDasharray="4 4" ifOverflow="hidden" label={{ value: reference.label, position: 'insideTopRight', fill: 'var(--axis)', fontSize: 11 }} />}
          <Tooltip content={<ChartTooltip unit={unit} digits={digits} />} cursor={{ stroke: 'var(--hair-strong)', strokeWidth: 1 }} />
          <Area type="monotone" dataKey="v" stroke={t.line} strokeWidth={2.25} fill={`url(#hc-${id})`} dot={<EndDot last={data.length - 1} color={t.line} r={4} />} activeDot={{ r: 4.5, fill: '#fff', stroke: t.fg, strokeWidth: 2 }} animationDuration={600} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}


function PairTooltip({ active, payload, series, unit }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="glass rounded-2xl px-3 py-2 text-[12px]">
      <div className="text-ink-2">{fmtDateTime(row.t)}</div>
      {series.map((s) => (
        <div key={s.key} className="tabular flex items-center gap-2 text-ink">
          <span className="h-2 w-2 rounded-full" style={{ background: TONES[s.tone].line }} />
          {s.name} <span className="font-semibold">{row[s.key] == null ? '--' : `${fmtNum(row[s.key], 1)} ${unit}`}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Two series on one axis (e.g. temperature and dew point). The first is drawn as a soft
 * area, the others as lines; optional horizontal bands mark reference ranges.
 */
export function PairChart({ series, unit = '', rangeMs, bands = [], height = 220 }) {
  const id = useId().replace(/:/g, '');
  const byTime = new Map();
  series.forEach((s) => (s.points || []).forEach(([t, v]) => byTime.set(t, { ...(byTime.get(t) || { t }), [s.key]: v })));
  const data = [...byTime.values()].sort((a, b) => a.t - b.t);
  const long = rangeMs > 2 * 86400e3;
  const tick = (ts) =>
    new Date(ts).toLocaleString(undefined, long ? { day: 'numeric', month: 'short' } : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  if (data.length < 2) {
    return <div className="flex items-center justify-center text-[14px] text-ink-3" style={{ height }}>No data in this range</div>;
  }
  const [first, ...rest] = series;
  const t0 = TONES[first.tone];
  return (
    <div className="glow-line" style={{ height, '--glow': t0.line }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`pc-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={t0.line} stopOpacity={0.32} />
              <stop offset="100%" stopColor={t0.line} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--hair)" />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tick} tick={{ fill: 'var(--axis)', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={48} />
          <YAxis domain={['auto', 'auto']} tickFormatter={(v) => fmtNum(v, 0)} tick={{ fill: 'var(--axis)', fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
          {bands.map((b) => (
            <ReferenceArea key={b.label} y1={b.from} y2={b.to} fill={TONES[b.tone].line} fillOpacity={0.08} stroke="none" ifOverflow="hidden" />
          ))}
          <Tooltip content={<PairTooltip series={series} unit={unit} />} cursor={{ stroke: 'var(--hair-strong)', strokeWidth: 1 }} />
          <Area type="monotone" dataKey={first.key} stroke={t0.line} strokeWidth={2} fill={`url(#pc-${id})`} dot={false} connectNulls animationDuration={600} />
          {rest.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} stroke={TONES[s.tone].line} strokeWidth={2.25} dot={<EndDot last={data.length - 1} color={TONES[s.tone].line} />} connectNulls animationDuration={600} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
