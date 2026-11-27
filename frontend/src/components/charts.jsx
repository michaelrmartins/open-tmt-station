// Charts built on Apache ECharts (tree-shaken: only line charts and the components used).
//
// Options are written with the app's CSS colour tokens, e.g. 'var(--color-peach-line)' or
// 'alpha(var(--color-peach-line), 0.4)'. <EChart> resolves them against its own element, so
// charts inside the glass cards pick up the glass palette automatically.

import { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, EffectScatterChart, GaugeChart, LineChart, ScatterChart } from 'echarts/charts';
import { DataZoomComponent, GridComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { TONES } from '../lib/labels.js';
import { fmtDateTime, fmtNum, fmtTime } from '../lib/format.js';

echarts.use([LineChart, BarChart, ScatterChart, GaugeChart, EffectScatterChart, GridComponent, TooltipComponent, MarkAreaComponent, MarkLineComponent, DataZoomComponent, CanvasRenderer]);

// ---------------------------------------------------------------------------
// Colour tokens
// ---------------------------------------------------------------------------
const toRgba = (color, a) => {
  const c = color.trim();
  if (c.startsWith('#')) {
    const h = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1, 7);
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(',').map((x) => x.trim());
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return c;
};

/** Replaces 'var(--x)' and 'alpha(var(--x), 0.3)' strings in an option with real colours. */
function resolveTokens(value, el) {
  const css = getComputedStyle(el);
  const v = (name) => css.getPropertyValue(name).trim() || '#888';
  const walk = (x) => {
    if (typeof x === 'string') {
      const a = x.match(/^alpha\(var\((--[\w-]+)\),\s*([\d.]+)\)$/);
      if (a) return toRgba(v(a[1]), Number(a[2]));
      const m = x.match(/^var\((--[\w-]+)\)$/);
      return m ? v(m[1]) : x;
    }
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === 'object' && Object.getPrototypeOf(x) === Object.prototype) {
      return Object.fromEntries(Object.entries(x).map(([k, val]) => [k, walk(val)]));
    }
    return x; // functions, numbers, dates
  };
  return walk(value);
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Thin React wrapper: creates the chart once, resizes with its container, applies the option
 * when it changes (memoise it in the caller) and disposes on unmount.
 */
export function EChart({ option, height, className = '', ariaLabel }) {
  const ref = useRef(null);
  const chart = useRef(null);

  useEffect(() => {
    const c = echarts.init(ref.current, null, { renderer: 'canvas' });
    chart.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chart.current || !option) return;
    const resolved = resolveTokens(option, ref.current);
    if (reducedMotion()) {
      resolved.animation = false;
      (resolved.series || []).forEach((s) => {
        if (s.type === 'effectScatter') s.showEffectOn = 'emphasis';
      });
    }
    // Merge (not replace): new data animates from the previous state and user zoom is kept
    chart.current.setOption(resolved, { replaceMerge: ['series'] });
  }, [option]);

  return <div ref={ref} role="img" aria-label={ariaLabel} className={className} style={{ height, width: '100%' }} />;
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------
const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Helvetica Neue', Arial, sans-serif";

/** Frosted tooltip, appended to <body> so cards with overflow hidden never clip it. */
const tooltipBase = {
  trigger: 'axis',
  appendTo: 'body',
  confine: true,
  backgroundColor: 'rgba(18, 40, 70, 0.88)',
  borderColor: 'rgba(255, 255, 255, 0.22)',
  borderWidth: 1,
  padding: [8, 12],
  textStyle: { color: '#ffffff', fontFamily: FONT, fontSize: 12 },
  extraCssText: 'border-radius: 14px; backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); box-shadow: 0 12px 30px -12px rgba(5, 20, 45, 0.6);',
};

const row = (color, label, value) =>
  `<div style="display:flex;align-items:center;gap:8px;margin-top:2px">` +
  `<span style="width:8px;height:8px;border-radius:9999px;background:${color}"></span>` +
  `<span style="opacity:.8">${label}</span><b style="margin-left:auto;font-variant-numeric:tabular-nums">${value}</b></div>`;
const head = (t) => `<div style="opacity:.75;margin-bottom:2px">${t}</div>`;

const areaGradient = (lineVar, top = 0.4) => ({
  type: 'linear',
  x: 0,
  y: 0,
  x2: 0,
  y2: 1,
  colorStops: [
    { offset: 0, color: `alpha(${lineVar}, ${top})` },
    { offset: 1, color: `alpha(${lineVar}, 0)` },
  ],
});

/** Glowing, pulsing marker on the latest point. */
const lastPoint = (data, lineVar, size = 7) => ({
  type: 'effectScatter',
  data: data.length ? [data[data.length - 1]] : [],
  symbolSize: size,
  z: 5,
  rippleEffect: { scale: 2.8, brushType: 'stroke', period: 3.2 },
  itemStyle: { color: '#ffffff', borderColor: lineVar, borderWidth: 2, shadowBlur: 8, shadowColor: lineVar },
  tooltip: { show: false },
  silent: true,
});

const timeLabel = (rangeMs) => (ts) =>
  new Date(ts).toLocaleString(undefined, rangeMs > 2 * 86400e3 ? { day: 'numeric', month: 'short' } : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const axisText = { color: 'var(--axis)', fontSize: 11, fontFamily: FONT };

// ---------------------------------------------------------------------------
// Sparkline (weather cards)
// ---------------------------------------------------------------------------
export function Sparkline({ points, tone = 'slate', height = 56, unit = '', digits = 1, label = 'Trend' }) {
  const line = TONES[tone].line;
  const option = useMemo(() => {
    const data = points || [];
    return {
      animationDuration: 700,
      grid: { left: 2, right: 8, top: 8, bottom: 4 },
      xAxis: { type: 'time', show: false },
      yAxis: { type: 'value', show: false, scale: true },
      tooltip: {
        ...tooltipBase,
        axisPointer: { type: 'line', lineStyle: { color: 'var(--hair-strong)', width: 1 } },
        formatter: (ps) => {
          const p = ps.find((x) => x.seriesType === 'line');
          return p ? head(fmtDateTime(p.value[0])) + row(p.color, label, `${fmtNum(p.value[1], digits)} ${unit}`) : '';
        },
      },
      series: [
        {
          type: 'line',
          data,
          smooth: 0.35,
          showSymbol: false,
          color: line,
          lineStyle: { width: 2, color: line, shadowBlur: 8, shadowColor: `alpha(${line}, 0.6)` },
          areaStyle: { color: areaGradient(line, 0.45) },
        },
        lastPoint(data, line, 6),
      ],
    };
  }, [points, line, unit, digits, label]);

  if (!points || points.length < 2) return <div style={{ height }} />;
  return <EChart option={option} height={height} ariaLabel={`${label} trend`} />;
}

// ---------------------------------------------------------------------------
// History chart
// ---------------------------------------------------------------------------
export function HistoryChart({ points, tone = 'sky', unit, digits = 1, rangeMs, domain, band, reference, height = 280, label = 'Value' }) {
  const line = TONES[tone].line;
  const option = useMemo(() => {
    const data = points || [];
    return {
      animationDuration: 700,
      grid: { left: 48, right: 16, top: 16, bottom: 28 },
      xAxis: {
        type: 'time',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { ...axisText, hideOverlap: true, formatter: timeLabel(rangeMs) },
      },
      yAxis: {
        type: 'value',
        scale: !domain,
        min: domain?.[0],
        max: domain?.[1],
        splitNumber: 4,
        axisLabel: { ...axisText, formatter: (v) => fmtNum(v, Math.abs(v) >= 100 ? 0 : digits) },
        splitLine: { lineStyle: { color: 'var(--hair)' } },
      },
      tooltip: {
        ...tooltipBase,
        axisPointer: { type: 'line', lineStyle: { color: 'var(--hair-strong)', width: 1 } },
        formatter: (ps) => {
          const p = ps.find((x) => x.seriesType === 'line');
          return p ? head(fmtDateTime(p.value[0])) + row(p.color, label, `${fmtNum(p.value[1], digits)} ${unit}`) : '';
        },
      },
      // Drag to pan, Ctrl + wheel (or pinch) to zoom; plain scrolling keeps scrolling the page
      dataZoom: [{ type: 'inside', zoomOnMouseWheel: 'ctrl', moveOnMouseWheel: false, moveOnMouseMove: true }],
      series: [
        {
          type: 'line',
          data,
          smooth: 0.3,
          showSymbol: false,
          sampling: 'lttb',
          color: line,
          lineStyle: { width: 2.25, color: line, shadowBlur: 10, shadowColor: `alpha(${line}, 0.55)` },
          areaStyle: { color: areaGradient(line, 0.38) },
          emphasis: { focus: 'none' },
          markArea: band
            ? { silent: true, itemStyle: { color: `alpha(${line}, 0.1)` }, data: [[{ yAxis: band[0] }, { yAxis: band[1] }]] }
            : undefined,
          markLine: reference
            ? {
                silent: true,
                symbol: 'none',
                lineStyle: { color: 'var(--hair-strong)', type: [4, 4], width: 1 },
                label: { position: 'insideEndTop', color: 'var(--axis)', fontSize: 11, formatter: reference.label },
                data: [{ yAxis: reference.value }],
              }
            : undefined,
        },
        lastPoint(data, line, 8),
      ],
    };
  }, [points, line, unit, digits, rangeMs, domain, band, reference, label]);

  if (!points || points.length < 2) {
    return <div className="flex items-center justify-center text-[14px] text-ink-3" style={{ height }}>No data in this range</div>;
  }
  return <EChart option={option} height={height} ariaLabel={`${label} history chart`} />;
}

// ---------------------------------------------------------------------------
// Two series on one axis (temperature vs dew point)
// ---------------------------------------------------------------------------
export function PairChart({ series, unit = '', rangeMs, bands = [], height = 220, spreadLabel }) {
  const option = useMemo(() => {
    const [first, ...rest] = series;
    const firstLine = TONES[first.tone].line;
    // index the second series by time for the tooltip spread
    const other = new Map((rest[0]?.points || []).map(([t, v]) => [t, v]));
    return {
      animationDuration: 700,
      grid: { left: 40, right: 16, top: 14, bottom: 28 },
      xAxis: {
        type: 'time',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { ...axisText, hideOverlap: true, formatter: timeLabel(rangeMs) },
      },
      yAxis: {
        type: 'value',
        scale: true,
        splitNumber: 4,
        axisLabel: { ...axisText, formatter: (v) => fmtNum(v, 0) },
        splitLine: { lineStyle: { color: 'var(--hair)' } },
      },
      tooltip: {
        ...tooltipBase,
        axisPointer: { type: 'line', lineStyle: { color: 'var(--hair-strong)', width: 1 } },
        formatter: (ps) => {
          const lines = ps.filter((x) => x.seriesType === 'line');
          if (!lines.length) return '';
          const t = lines[0].value[0];
          let html = head(fmtDateTime(t));
          lines.forEach((p) => (html += row(p.color, p.seriesName, `${fmtNum(p.value[1], 1)} ${unit}`)));
          const a = lines.find((p) => p.seriesIndex === 0)?.value[1];
          const b = other.get(t);
          if (spreadLabel && a != null && b != null) html += `<div style="margin-top:4px;opacity:.75">${spreadLabel}: <b>${fmtNum(a - b, 1)} ${unit}</b></div>`;
          return html;
        },
      },
      series: [
        {
          type: 'line',
          name: first.name,
          data: first.points || [],
          smooth: 0.3,
          showSymbol: false,
          color: firstLine,
          lineStyle: { width: 2, color: firstLine, shadowBlur: 8, shadowColor: `alpha(${firstLine}, 0.5)` },
          areaStyle: { color: areaGradient(firstLine, 0.3) },
          markArea: bands.length
            ? {
                silent: true,
                data: bands.map((b) => [{ yAxis: b.from, itemStyle: { color: `alpha(${TONES[b.tone].line}, 0.1)` } }, { yAxis: b.to }]),
              }
            : undefined,
        },
        ...rest.map((s) => {
          const l = TONES[s.tone].line;
          return {
            type: 'line',
            name: s.name,
            data: s.points || [],
            smooth: 0.3,
            showSymbol: false,
            color: l,
            lineStyle: { width: 2.25, color: l, shadowBlur: 10, shadowColor: `alpha(${l}, 0.6)` },
          };
        }),
        ...rest.map((s) => lastPoint(s.points || [], TONES[s.tone].line, 7)),
      ],
    };
  }, [series, unit, rangeMs, bands, spreadLabel]);

  const hasData = series.some((s) => (s.points || []).length > 1);
  if (!hasData) {
    return <div className="flex items-center justify-center text-[14px] text-ink-3" style={{ height }}>No data in this range</div>;
  }
  return <EChart option={option} height={height} ariaLabel={series.map((s) => s.name).join(' and ') + ' chart'} />;
}

// ---------------------------------------------------------------------------
// Forecast line (banner): temperatures with labels, cyan glow, rich tooltip
// ---------------------------------------------------------------------------
const DROP = '#7fd3f7';

export function ForecastChart({ forecast, height = 84 }) {
  const option = useMemo(() => {
    const pts = (forecast || []).filter((f) => f.temp != null);
    return {
      animationDuration: 800,
      grid: { left: 14, right: 14, top: 20, bottom: 18 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: pts.map((p) => fmtTime(p.time)),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: 'rgba(255, 255, 255, 0.75)', fontSize: 10, fontFamily: FONT, interval: 1, margin: 6 },
      },
      yAxis: { type: 'value', show: false, scale: true },
      tooltip: {
        ...tooltipBase,
        axisPointer: { type: 'line', lineStyle: { color: 'rgba(255, 255, 255, 0.35)', width: 1 } },
        formatter: (ps) => {
          const p = ps[0];
          const f = pts[p.dataIndex];
          if (!f) return '';
          const desc = f.condition?.description ? f.condition.description.charAt(0).toUpperCase() + f.condition.description.slice(1) : '';
          return (
            head(fmtDateTime(f.time)) +
            row(DROP, 'Temperature', `${fmtNum(f.temp, 0)} °C`) +
            (f.pop != null ? row('#a6aee6', 'Chance of rain', `${f.pop}%`) : '') +
            (f.windSpeed != null ? row('#ffffff', 'Wind', `${fmtNum(f.windSpeed, 0)} km/h`) : '') +
            (desc ? `<div style="margin-top:4px;opacity:.75">${desc}</div>` : '')
          );
        },
      },
      series: [
        {
          type: 'line',
          data: pts.map((p) => p.temp),
          smooth: 0.4,
          symbol: 'circle',
          symbolSize: 5,
          showSymbol: true,
          color: DROP,
          itemStyle: { color: '#ffffff', borderColor: DROP, borderWidth: 1.5 },
          lineStyle: { width: 2.5, color: DROP, shadowBlur: 10, shadowColor: 'rgba(127, 211, 247, 0.8)' },
          areaStyle: {
            color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(127, 211, 247, 0.32)' }, { offset: 1, color: 'rgba(127, 211, 247, 0)' }] },
          },
          label: {
            show: true,
            position: 'top',
            distance: 4,
            formatter: (p) => `${fmtNum(p.value, 0)}°`,
            color: '#ffffff',
            fontSize: 11,
            fontWeight: 600,
            fontFamily: FONT,
            textShadowColor: 'rgba(5, 25, 50, 0.35)',
            textShadowBlur: 2,
          },
        },
      ],
    };
  }, [forecast]);

  if (!forecast || forecast.filter((f) => f.temp != null).length < 2) return null;
  return <EChart option={option} height={height} ariaLabel="Temperature forecast for the next 24 hours" />;
}

// ---------------------------------------------------------------------------
// Scale bar: one horizontal bar for meters, scales, zones and shares
// ---------------------------------------------------------------------------
/**
 * @param min, max      scale range
 * @param value         fill up to this value (meter / progress), optional
 * @param marker        draw a round thumb at this value, optional
 * @param segments      [{ from, to, tone, label }] coloured bands (comfort scales, shares)
 * @param zone          { from, to, tone, label } highlighted range drawn over the track
 * @param ticks         [{ value, label }] labels under the bar
 * @param tone          colour of the fill and thumb
 * @param tooltip       (target) => html, target = { kind: 'value' | 'segment' | 'zone', ... }
 */
export function ScaleBar({ min = 0, max = 100, value, marker, segments, zone, ticks, tone = 'sky', thickness = 8, tooltip, ariaLabel = 'Scale' }) {
  const option = useMemo(() => {
    const span = max - min;
    const at = (v) => Math.max(0, Math.min(span, v - min)); // shifted so the bar starts at 0
    const fill = TONES[tone].line;
    const r = thickness / 2;
    const common = { type: 'bar', barWidth: thickness, barGap: '-100%', silent: false, animationDuration: 900 };
    const series = [];

    // Track
    series.push({ ...common, data: [span], itemStyle: { color: 'var(--track)', borderRadius: r }, silent: true, tooltip: { show: false }, z: 1 });

    // Coloured segments (stacked)
    (segments || []).forEach((seg, i, all) => {
      const radius = all.length === 1 ? r : i === 0 ? [r, 0, 0, r] : i === all.length - 1 ? [0, r, r, 0] : 0;
      series.push({
        ...common,
        stack: 'segments',
        name: seg.label,
        data: [{ value: at(seg.to) - at(seg.from), seg }],
        itemStyle: { color: `alpha(${TONES[seg.tone].line}, 0.85)`, borderRadius: radius },
        z: 2,
      });
    });

    // Zone: transparent offset + coloured range (stacked)
    if (zone) {
      series.push({ ...common, stack: 'zone', data: [at(zone.from)], itemStyle: { color: 'transparent' }, silent: true, tooltip: { show: false }, z: 2 });
      series.push({ ...common, stack: 'zone', name: zone.label, data: [{ value: at(zone.to) - at(zone.from), zone }], itemStyle: { color: `alpha(${TONES[zone.tone].line}, 0.35)`, borderRadius: r }, z: 2 });
    }

    // Fill
    if (value != null) {
      series.push({ ...common, name: 'value', data: [{ value: Math.max(at(value), span * 0.01), raw: value }], itemStyle: { color: fill, borderRadius: r, shadowBlur: 6, shadowColor: `alpha(${fill}, 0.5)` }, z: 3 });
    }

    // Thumb
    if (marker != null) {
      series.push({
        type: 'scatter',
        name: 'marker',
        data: [[at(marker), 0]],
        symbolSize: thickness + 9,
        itemStyle: { color: fill, borderColor: '#ffffff', borderWidth: 3, shadowBlur: 6, shadowColor: 'rgba(0, 0, 0, 0.3)' },
        z: 5,
        animationDuration: 900,
      });
    }

    const tickVals = (ticks || []).map((t) => at(t.value));
    const tickLabel = new Map((ticks || []).map((t) => [at(t.value), t.label]));
    const hasTicks = tickVals.length > 0;

    return {
      grid: { left: thickness, right: thickness, top: marker != null ? 8 : 2, bottom: hasTicks ? 20 : marker != null ? 8 : 2 },
      xAxis: {
        type: 'value',
        min: 0,
        max: span,
        show: hasTicks,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { ...axisText, fontSize: 10, customValues: tickVals, formatter: (v) => tickLabel.get(v) ?? '', margin: 8 },
      },
      yAxis: { type: 'category', data: ['v'], show: false },
      tooltip: tooltip
        ? {
            ...tooltipBase,
            trigger: 'item',
            formatter: (p) => {
              if (p.seriesName === 'marker' || p.seriesName === 'value') return tooltip({ kind: 'value' });
              if (p.data?.seg) return tooltip({ kind: 'segment', ...p.data.seg });
              if (p.data?.zone) return tooltip({ kind: 'zone', ...p.data.zone });
              return '';
            },
          }
        : { show: false },
      series,
    };
  }, [min, max, value, marker, segments, zone, ticks, tone, thickness, tooltip]);

  const height = (marker != null ? thickness + 18 : thickness + 4) + ((ticks || []).length ? 18 : 0);
  return <EChart option={option} height={height} ariaLabel={ariaLabel} />;
}

// ---------------------------------------------------------------------------
// Ring gauge (battery)
// ---------------------------------------------------------------------------
export function RingGauge({ value, tone = 'sage', size = 120, center, sub, tooltip, ariaLabel = 'Gauge' }) {
  const option = useMemo(() => {
    const c = TONES[tone].line;
    return {
      tooltip: tooltip ? { ...tooltipBase, trigger: 'item', formatter: () => tooltip } : { show: false },
      series: [
        {
          type: 'gauge',
          startAngle: 90,
          endAngle: -270,
          min: 0,
          max: 100,
          radius: '92%',
          pointer: { show: false },
          progress: { show: true, roundCap: true, width: 10, itemStyle: { color: c, shadowBlur: 10, shadowColor: `alpha(${c}, 0.6)` } },
          axisLine: { roundCap: true, lineStyle: { width: 10, color: [[1, 'var(--track)']] } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          title: { show: true, offsetCenter: [0, '30%'], color: 'var(--color-ink-2)', fontSize: 11, fontFamily: FONT },
          detail: { offsetCenter: [0, '-6%'], valueAnimation: true, color: 'var(--color-ink)', fontSize: 20, fontWeight: 600, fontFamily: FONT, formatter: () => center ?? '' },
          data: [{ value: value ?? 0, name: sub ?? '' }],
          animationDuration: 1000,
        },
      ],
    };
  }, [value, tone, center, sub, tooltip]);
  return (
    <div style={{ width: size }}>
      <EChart option={option} height={size} ariaLabel={ariaLabel} />
    </div>
  );
}
