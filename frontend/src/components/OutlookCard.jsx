import { useCallback } from 'react';
import { ScaleBar } from './charts.jsx';
import { ArrowDownRight, ArrowUpRight, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSun, Info, MoonStar, Radar, Sun, Zap } from 'lucide-react';
import { Card, CardHeader, Divider, Pill, Skeleton, ICON_STROKE } from './ui.jsx';
import { TONES } from '../lib/labels.js';
import { fmtNum, fmtTime } from '../lib/format.js';

const SCENARIO = {
  sunny: { icon: Sun, tone: 'butter', title: 'Sunny', text: 'Bright sky and stable air. Little chance of rain.' },
  clearing: { icon: CloudSun, tone: 'butter', title: 'Clearing up', text: 'Pressure is rising and the air is drying out: the sky should open up.' },
  partly_cloudy: { icon: CloudSun, tone: 'sky', title: 'Partly cloudy', text: 'Some clouds around, but no strong signs of rain.' },
  cloudy: { icon: Cloud, tone: 'slate', title: 'Cloudy', text: 'Overcast sky, without a strong rain signal so far.' },
  showers: { icon: CloudDrizzle, tone: 'sky', title: 'Showers possible', text: 'Moisture and pressure point to a chance of showers.' },
  rain: { icon: CloudRain, tone: 'sky', title: 'Rain likely', text: 'Several signals agree: rain is likely in the next hours.' },
  storm: { icon: CloudLightning, tone: 'coral', title: 'Storm approaching', text: 'Moist, unstable air and falling pressure: thunderstorms may develop.' },
  fog: { icon: CloudFog, tone: 'teal', title: 'Fog or low clouds', text: 'The air is at its dew point: fog, mist or drizzle are likely.' },
  clear_night: { icon: MoonStar, tone: 'lilac', title: 'Clear night', text: 'Dry, stable air: expect a mostly clear sky tonight.' },
  cloudy_night: { icon: CloudMoon, tone: 'lilac', title: 'Cloudy night', text: 'Moisture or falling pressure: clouds are likely tonight.' },
  unknown_day: { icon: CloudSun, tone: 'slate', title: 'Mixed signals', text: 'Not enough data yet to tell how the sky will evolve.' },
  unknown: { icon: Cloud, tone: 'slate', title: 'Mixed signals', text: 'Not enough data yet to tell how the sky will evolve.' },
};

const STORM = {
  watch: 'Hot and humid: watch for afternoon storms',
  possible: 'Thunderstorms possible',
  likely: 'Thunderstorms likely',
};

const CONFIDENCE = { medium: 'Medium confidence', low: 'Low confidence', very_low: 'Very low confidence' };

const abs = (v, d = 1) => fmtNum(Math.abs(v), d);
const FACTOR = {
  pressure_falling_fast: (f) => `Pressure falling fast (${fmtNum(f.value, 1)} hPa in 3 h)`,
  pressure_falling: (f) => `Pressure falling (${fmtNum(f.value, 1)} hPa in 3 h)`,
  pressure_falling_slowly: (f) => `Pressure falling slowly (${fmtNum(f.value, 1)} hPa in 3 h)`,
  pressure_rising: (f) => `Pressure rising (+${fmtNum(f.value, 1)} hPa in 3 h)`,
  pressure_rising_fast: (f) => `Pressure rising fast (+${fmtNum(f.value, 1)} hPa in 3 h)`,
  pressure_very_low: (f) => `Very low pressure (${fmtNum(f.value, 0)} hPa)`,
  pressure_low: (f) => `Low pressure (${fmtNum(f.value, 0)} hPa)`,
  pressure_high: (f) => `High pressure (${fmtNum(f.value, 0)} hPa)`,
  pressure_very_high: (f) => `Very high pressure (${fmtNum(f.value, 0)} hPa)`,
  saturated: (f) => `Air saturated (${fmtNum(f.value, 1)} °C from the dew point)`,
  near_saturation: (f) => `Air close to saturation (${fmtNum(f.value, 1)} °C from the dew point)`,
  moist: (f) => `Moist air (${fmtNum(f.value, 1)} °C from the dew point)`,
  dry_air: (f) => `Dry air (${fmtNum(f.value, 1)} °C from the dew point)`,
  very_dry_air: (f) => `Very dry air (${fmtNum(f.value, 1)} °C from the dew point)`,
  spread_closing: (f) => `Air moistening quickly (gap to dew point ${fmtNum(f.value, 1)} °C/h)`,
  humidity_rising: (f) => `Humidity rising (+${fmtNum(f.value, 1)} %/h)`,
  low_moisture: (f) => `Little moisture (dew point ${fmtNum(f.value, 1)} °C)`,
  moist_air_mass: (f) => `Moist air mass (dew point ${fmtNum(f.value, 1)} °C)`,
  very_moist_air_mass: (f) => `Very moist air mass (dew point ${fmtNum(f.value, 1)} °C)`,
  sunny: (f) => `Bright sky (about ${fmtNum(f.value, 0)}% cloud)`,
  mostly_cloudy: (f) => `Mostly cloudy (about ${fmtNum(f.value, 0)}% cloud)`,
  overcast: (f) => `Overcast (about ${fmtNum(f.value, 0)}% cloud)`,
  darkening: (f) => `Sky darkening fast (${fmtNum(f.value, 0)}% less light in 30 min)`,
  cooling_burst: (f) => `Sudden cooling (${abs(f.value)} °C/h) with rising humidity`,
};

const chanceTone = (p) => (p < 20 ? 'sage' : p < 40 ? 'sky' : p < 65 ? 'butter' : 'coral');

function Horizon({ label, value }) {
  const tone = chanceTone(value ?? 0);
  const tip = useCallback(() => `${label}: <b>${value ?? '--'}%</b> chance of rain`, [label, value]);
  return (
    <div className="grid grid-cols-[72px_1fr_44px] items-center gap-3">
      <span className="text-[12px] font-medium text-ink-2">{label}</span>
      <ScaleBar min={0} max={100} value={value ?? 0} tone={tone} thickness={8} tooltip={tip} ariaLabel={`${label} ${value} percent chance of rain`} />
      <span className="tabular text-right text-[13px] font-semibold">{value == null ? '--' : `${value}%`}</span>
    </div>
  );
}

/** OpenWeather's probability of precipitation for the next forecast slot, for comparison. */
function openWeatherPop(outside) {
  const f = outside?.enabled && outside.forecast?.find((s) => s.time > Date.now());
  return f && f.pop != null ? { pop: f.pop, until: f.time } : null;
}

export function OutlookCard({ outlook, outside }) {
  if (!outlook) return <Card><Skeleton className="h-64" /></Card>;
  const sc = SCENARIO[outlook.outlook] || SCENARIO.unknown;
  const Icon = sc.icon;
  const c3 = outlook.chance?.['3h'];
  const ow = openWeatherPop(outside);
  const raises = outlook.factors.filter((f) => f.effect === 'raises' && FACTOR[f.key]);
  const lowers = outlook.factors.filter((f) => f.effect === 'lowers' && FACTOR[f.key]);

  return (
    <Card>
      <CardHeader
        icon={Radar}
        tone="sky"
        title="Local outlook"
        subtitle="Next hours, estimated from the station's own sensors"
        right={<Pill tone="slate">{CONFIDENCE[outlook.confidence] || 'Low confidence'}</Pill>}
      />

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* Scenario */}
        <div className="flex min-w-0 gap-4">
          <span className="chip inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px]" style={{ '--chip-bg': TONES[sc.tone].bg, color: TONES[sc.tone].fg }}>
            <Icon size={34} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="text-[26px] font-semibold leading-tight tracking-tight" style={{ color: TONES[sc.tone].fg }}>
              {sc.title}
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{sc.text}</p>
            {outlook.storm !== 'none' && STORM[outlook.storm] && (
              <div className="mt-3">
                <Pill tone={outlook.storm === 'watch' ? 'butter' : 'coral'} icon={Zap}>
                  {STORM[outlook.storm]}
                </Pill>
              </div>
            )}
          </div>
        </div>

        {/* Rain chance */}
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="tabular text-[44px] font-semibold leading-none tracking-[-0.03em]" style={{ color: TONES[chanceTone(c3 ?? 0)].fg }}>
              {c3 == null ? '--' : c3}
            </span>
            <span className="text-[18px] font-medium text-ink-2">%</span>
          </div>
          <div className="mt-1 text-[13px] text-ink-2">chance of rain in the next 3 hours</div>
          <div className="mt-4 space-y-2.5">
            <Horizon label="Next hour" value={outlook.chance?.['1h']} />
            <Horizon label="3 hours" value={outlook.chance?.['3h']} />
            <Horizon label="6 hours" value={outlook.chance?.['6h']} />
          </div>
          <div className="mt-4 space-y-1 text-[12px] text-ink-2">
            {outlook.cloudCover != null ? (
              <div>
                Sky cover now <span className="tabular font-semibold text-ink">about {fmtNum(outlook.cloudCover, 0)}%</span>, from the light sensor
              </div>
            ) : (
              <div>{outlook.isDay === false ? 'Night: the light sensor cannot see the clouds' : 'Sky cover: not enough light to estimate'}</div>
            )}
            {ow && (
              <div>
                OpenWeather forecast <span className="tabular font-semibold text-ink">{ow.pop}%</span> until {fmtTime(ow.until)}
              </div>
            )}
          </div>
        </div>

        {/* Why */}
        <div className="min-w-0 rounded-[20px] bg-white/[0.08] p-4 ring-1 ring-white/15">
          <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-3">Why</div>
          {raises.length + lowers.length === 0 ? (
            <p className="mt-2 text-[13px] text-ink-2">No strong signal either way: conditions look stable.</p>
          ) : (
            <ul className="mt-2.5 space-y-2">
              {[...raises, ...lowers].slice(0, 7).map((f) => {
                const up = f.effect === 'raises';
                const A = up ? ArrowUpRight : ArrowDownRight;
                return (
                  <li key={f.key} className="flex items-start gap-2 text-[13px] leading-snug text-ink-2">
                    <A size={16} strokeWidth={2} className="mt-px shrink-0" style={{ color: TONES[up ? 'coral' : 'sage'].fg }} aria-label={up ? 'raises the chance of rain' : 'lowers the chance of rain'} />
                    <span>{FACTOR[f.key](f)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <Divider />
      <p className="flex items-start gap-2 text-[12px] leading-relaxed text-ink-3">
        <Info size={14} strokeWidth={ICON_STROKE} className="mt-0.5 shrink-0" aria-hidden="true" />
        An estimate from local trends in pressure, humidity, dew point, temperature and light (the clear-sky light curve is learned from the last{' '}
        {outlook.lightReferenceDays || 0} days). It is not a scientific forecast and works best for the next few hours.
      </p>
    </Card>
  );
}
