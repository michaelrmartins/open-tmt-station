import { CloudFog, CloudLightning, Droplets, HeartPulse, MoonStar, Snowflake, Waves } from 'lucide-react';
import { Card, CardHeader, Divider, IconChip, Skeleton, Stat, TrendPill, ICON_STROKE } from './ui.jsx';
import { PairChart } from './charts.jsx';
import { TONES } from '../lib/labels.js';
import { fmtHours, fmtNum, fmtSigned } from '../lib/format.js';

// Comfort bands by dew point (°C), as returned by the API (level)
const COMFORT = {
  dry: {
    label: 'Dry air',
    tone: 'sky',
    health: 'Fresh or dry air. Sweat evaporates quickly, which can dry out skin, eyes and airways. Drink water and keep skin moisturised.',
  },
  comfortable: {
    label: 'Comfortable',
    tone: 'sage',
    health: 'The ideal range for the human body: a feeling of freshness and well-being.',
  },
  humid: {
    label: 'Noticeably humid',
    tone: 'butter',
    health: 'The air starts to feel heavy and slightly sticky, especially during physical activity.',
  },
  oppressive: {
    label: 'Muggy and oppressive',
    tone: 'coral',
    health: 'The air is saturated with moisture. Sweat struggles to evaporate, so the body cannot cool itself well. Higher risk of heat exhaustion: rest, hydrate and avoid strenuous effort.',
  },
};

// Comfort scale shown under the value: -5 °C .. 30 °C
const SCALE_MIN = -5;
const SCALE_MAX = 30;
const SEGMENTS = [
  { from: SCALE_MIN, to: 10, tone: 'sky' },
  { from: 10, to: 16, tone: 'sage' },
  { from: 16, to: 21, tone: 'butter' },
  { from: 21, to: SCALE_MAX, tone: 'coral' },
];
const pos = (v) => `${(Math.max(0, Math.min(1, (v - SCALE_MIN) / (SCALE_MAX - SCALE_MIN))) * 100).toFixed(2)}%`;

const FOG = {
  forming: { label: 'Forming now', tone: 'coral' },
  high: { label: 'High', tone: 'butter' },
  moderate: { label: 'Moderate', tone: 'teal' },
  low: { label: 'Low', tone: 'slate' },
};
const FROST = {
  forming: { label: 'Forming now', hint: 'Air at or below 0 °C and at the dew point' },
  likely: { label: 'Likely', hint: 'Dew point below 0 °C and air close to freezing' },
  possible: { label: 'Possible', hint: 'Dew point below 0 °C, air could cool down to it' },
  low: { label: 'Low', hint: 'Dew point below 0 °C, but the air is still mild' },
  unlikely: { label: 'Not expected', hint: 'Dew point above 0 °C: dew forms, not frost' },
};
const STORM = {
  very_low: { label: 'Very low', tone: 'slate' },
  low: { label: 'Low', tone: 'sky' },
  moderate: { label: 'Moderate', tone: 'butter' },
  high: { label: 'High', tone: 'coral' },
};

function ComfortScale({ value }) {
  return (
    <div className="mt-5">
      <div className="relative h-2.5">
        <div className="flex h-full overflow-hidden rounded-full">
          {SEGMENTS.map((s) => (
            <div key={s.from} className="h-full" style={{ width: `${((s.to - s.from) / (SCALE_MAX - SCALE_MIN)) * 100}%`, background: TONES[s.tone].line, opacity: 0.8 }} />
          ))}
        </div>
        {value != null && (
          <div
            className="absolute -top-[5px] h-5 w-5 -translate-x-1/2 rounded-full border-[3px] border-white shadow-[0_1px_4px_rgba(0,0,0,0.3)] transition-[left] duration-1000"
            style={{ left: pos(value), background: TONES[COMFORT[levelOf(value)].tone].fg }}
            aria-hidden="true"
          />
        )}
      </div>
      <div className="tabular relative mt-2 h-4 text-[11px] text-ink-3">
        {[10, 16, 21].map((v) => (
          <span key={v} className="absolute -translate-x-1/2" style={{ left: pos(v) }}>
            {v}°
          </span>
        ))}
      </div>
      <div className="mt-0.5 grid grid-cols-4 text-[11px] font-medium">
        {['Dry', 'Comfortable', 'Humid', 'Oppressive'].map((l, i) => (
          <span key={l} className={i === 0 ? '' : i === 3 ? 'text-right' : 'text-center'} style={{ color: TONES[SEGMENTS[i].tone].fg }}>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

const levelOf = (v) => (v < 10 ? 'dry' : v < 16 ? 'comfortable' : v < 21 ? 'humid' : 'oppressive');

function Signal({ icon, tone, title, value, hint }) {
  return (
    <div className="rounded-[20px] bg-white/[0.08] p-3.5 ring-1 ring-white/15 sm:p-4">
      <div className="flex items-center gap-2 text-[12px] font-medium text-ink-2">
        <IconChip icon={icon} tone={tone} size="sm" />
        {title}
      </div>
      <div className="tabular mt-3 text-[16px] font-semibold tracking-tight sm:text-[19px]" style={{ color: TONES[tone].fg }}>
        {value}
      </div>
      <div className="mt-1 text-[11px] leading-snug text-ink-3 sm:text-[12px]">{hint}</div>
    </div>
  );
}

export function DewPointCard({ dew, history, rangeMs, rangeLabel }) {
  if (!dew) return <Card><Skeleton className="h-72" /></Card>;
  if (dew.value == null) {
    return (
      <Card>
        <CardHeader icon={CloudFog} tone="teal" title="Dew point" subtitle="No dew point readings in the last 3 hours" />
      </Card>
    );
  }

  const comfort = COMFORT[dew.level] || COMFORT.comfortable;
  const fog = dew.fog ? FOG[dew.fog.level] : null;
  const frost = FROST[dew.frost] || FROST.unlikely;
  const storm = STORM[dew.storm?.level] || STORM.low;
  const range = history?.series?.dewPoint?.summary;
  const trendText = dew.trend === 'flat' ? 'Stable' : `${fmtSigned(dew.rate, 1)} °C/h`;

  return (
    <Card>
      <CardHeader
        icon={CloudFog}
        tone="teal"
        title="Dew point"
        subtitle={`Comfort, health and weather signals${dew.computed ? ' · computed from temperature and humidity' : ''}`}
        right={<TrendPill trend={dew.trend} text={trendText} tone="teal" />}
      />

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
        {/* Value, comfort scale and health */}
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="tabular text-[52px] font-semibold leading-none tracking-[-0.03em]">{fmtNum(dew.value, 1)}</span>
            <span className="text-[20px] font-medium text-ink-2">°C</span>
          </div>
          <div className="mt-1.5 text-[15px] font-semibold" style={{ color: TONES[comfort.tone].fg }}>
            {comfort.label}
          </div>

          <ComfortScale value={dew.value} />

          <div className="mt-5 flex gap-3 rounded-2xl bg-white/[0.08] p-4 ring-1 ring-white/15">
            <HeartPulse size={18} strokeWidth={ICON_STROKE} className="mt-0.5 shrink-0" style={{ color: TONES[comfort.tone].fg }} aria-hidden="true" />
            <p className="text-[13px] leading-relaxed text-ink-2">{comfort.health}</p>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <Stat label="Air" value={fmtNum(dew.temperature, 1)} unit="°C" />
            <Stat label="Humidity" value={fmtNum(dew.humidity, 0)} unit="%" />
            <Stat label="Spread" value={fmtNum(dew.spread, 1)} unit="°C" hint="Air minus dew point" />
          </div>
        </div>

        {/* Weather signals */}
        <div className="grid min-w-0 grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-3">
          <Signal
            icon={CloudFog}
            tone={fog?.tone || 'slate'}
            title="Fog and dew"
            value={fog?.label || '--'}
            hint={
              dew.fog?.saturationInHours != null
                ? `At the current cooling rate the air reaches the dew point in about ${fmtHours(dew.fog.saturationInHours)}`
                : dew.spread != null
                  ? `The air is ${fmtNum(dew.spread, 1)} °C from saturation`
                  : 'Needs the air temperature'
            }
          />
          <Signal icon={Snowflake} tone="sky" title="Frost" value={frost.label} hint={frost.hint} />
          <Signal
            icon={MoonStar}
            tone="lilac"
            title="Night low floor"
            value={`≈ ${fmtNum(dew.nightLowFloor, 1)} °C`}
            hint="Overnight the air rarely cools much below the dew point: condensation releases heat"
          />
          <Signal
            icon={CloudLightning}
            tone={dew.storm?.elevated ? 'coral' : storm.tone}
            title="Storm moisture"
            value={dew.storm?.elevated ? `${storm.label} · rising` : storm.label}
            hint={dew.storm?.elevated ? 'Moist air and falling pressure: conditions favour showers and thunderstorms' : 'Moisture available near the ground for heavy rain clouds'}
          />
          <Signal
            icon={Droplets}
            tone="teal"
            title="Absolute humidity"
            value={dew.absoluteHumidity == null ? '--' : `${fmtNum(dew.absoluteHumidity, 1)} g/m³`}
            hint="Grams of water vapour in each cubic metre of air"
          />
          <Signal
            icon={Waves}
            tone="peach"
            title={`Range · ${rangeLabel}`}
            value={range?.min == null ? '--' : `${fmtNum(range.min, 1)} to ${fmtNum(range.max, 1)} °C`}
            hint={range?.avg == null ? 'No data in this range' : `Average ${fmtNum(range.avg, 1)} °C`}
          />
        </div>
      </div>

      <Divider />
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="text-[13px] font-medium text-ink-2">Temperature and dew point</div>
        <div className="flex items-center gap-4 text-[12px] text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: TONES.peach.line }} />
            Air
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: TONES.teal.line }} />
            Dew point
          </span>
          <span className="hidden sm:inline">When the lines meet, dew or fog forms</span>
        </div>
      </div>
      <div className="-mx-2 mt-3">
        <PairChart
          unit="°C"
          rangeMs={rangeMs}
          series={[
            { key: 'air', name: 'Air', tone: 'peach', points: history?.series?.temperature?.points },
            { key: 'dew', name: 'Dew point', tone: 'teal', points: history?.series?.dewPoint?.points },
          ]}
          bands={[{ label: 'comfortable', from: 10, to: 16, tone: 'sage' }]}
        />
      </div>
    </Card>
  );
}
