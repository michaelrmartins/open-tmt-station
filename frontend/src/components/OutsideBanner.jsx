import { useId } from 'react';
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, Droplet, Gauge, Moon, Navigation, Sun, Sunrise, Sunset, Wind } from 'lucide-react';
import { fmtNum, fmtTime } from '../lib/format.js';

const STROKE = 1.5;
const SUN = '#ffd36b';
const DROP = '#7fd3f7';

/**
 * Line-style weather icon in the spirit of the banner photo: white strokes with a warm
 * sun accent. Mapped from OpenWeather condition ids (https://openweathermap.org/weather-conditions).
 */
export function WeatherIcon({ condition, size = 56 }) {
  const id = condition?.id ?? 800;
  const night = condition?.icon?.endsWith('n');
  const s = { strokeWidth: STROKE, 'aria-hidden': true };
  const box = { width: size, height: size };

  if (id >= 200 && id < 300) return <CloudLightning size={size} color="#fff" {...s} />;
  if (id >= 300 && id < 400) return <CloudDrizzle size={size} color="#fff" {...s} />;
  if (id >= 500 && id < 600) return <CloudRain size={size} color="#fff" {...s} />;
  if (id >= 600 && id < 700) return <CloudSnow size={size} color="#fff" {...s} />;
  if (id >= 700 && id < 800) return <CloudFog size={size} color="#fff" {...s} />;
  if (id === 800) return night ? <Moon size={size * 0.85} color="#fff" {...s} /> : <Sun size={size} color={SUN} {...s} />;

  // Clouds: few / scattered show the sun (or moon) behind the cloud, broken / overcast don't
  const partial = id === 801 || id === 802;
  return (
    <span className="relative inline-block" style={box} aria-hidden="true">
      {partial &&
        (night ? (
          <Moon size={size * 0.5} color="#fff" strokeWidth={STROKE} className="absolute right-[4%] top-[2%] opacity-90" />
        ) : (
          <Sun size={size * 0.6} color={SUN} strokeWidth={STROKE} className="absolute left-[2%] top-[-4%]" />
        ))}
      <Cloud size={size * (partial ? 0.82 : 0.95)} color="#fff" strokeWidth={STROKE} className="absolute bottom-[2%] right-0" fill={partial ? 'rgba(255,255,255,0.12)' : 'none'} />
    </span>
  );
}

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compass = (deg) => (deg == null ? '' : DIRS[Math.round(deg / 45) % 8]);
const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

function Metric({ icon, value, unit, label, accent }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
      <span className="shrink-0" style={{ color: accent || '#fff' }}>{icon}</span>
      <div className="min-w-0">
        <div className="tabular whitespace-nowrap text-[24px] font-semibold leading-none tracking-[-0.02em] sm:text-[34px]">
          {value}
          <span className="ml-1 text-[14px] font-medium opacity-90 sm:text-[18px]">{unit}</span>
        </div>
        <div className="mt-1 truncate text-[13px] font-medium opacity-85">{label}</div>
      </div>
    </div>
  );
}

/** Forecast temperature line with a cyan glow, as in the reference photo. */
function ForecastLine({ forecast }) {
  const id = useId().replace(/:/g, '');
  const pts = forecast.filter((f) => f.temp != null);
  if (pts.length < 2) return null;
  const W = 600, H = 70, padX = 14, padY = 12;
  const lo = Math.min(...pts.map((p) => p.temp)), hi = Math.max(...pts.map((p) => p.temp));
  const span = hi - lo || 1;
  const xy = pts.map((p, i) => [padX + (i * (W - 2 * padX)) / (pts.length - 1), H - padY - ((p.temp - lo) / span) * (H - 2 * padY)]);
  let d = `M${xy[0][0]},${xy[0][1]}`;
  for (let i = 0; i < xy.length - 1; i++) {
    const p0 = xy[i - 1] || xy[i], p1 = xy[i], p2 = xy[i + 1], p3 = xy[i + 2] || p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  const [lx, ly] = xy[xy.length - 1];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[70px] w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id={`fa-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={DROP} stopOpacity="0.35" />
            <stop offset="100%" stopColor={DROP} stopOpacity="0" />
          </linearGradient>
          <filter id={`fg-${id}`} x="-10%" y="-50%" width="120%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path d={`${d} L${lx},${H} L${xy[0][0]},${H} Z`} fill={`url(#fa-${id})`} />
        <path d={d} fill="none" stroke={DROP} strokeWidth="2.5" vectorEffect="non-scaling-stroke" filter={`url(#fg-${id})`} />
      </svg>
      <div className="mt-1 grid text-center" style={{ gridTemplateColumns: `repeat(${pts.length}, minmax(0, 1fr))` }}>
        {pts.map((p) => (
          <div key={p.time} className="min-w-0">
            <div className="tabular text-[13px] font-semibold">{fmtNum(p.temp, 0)}°</div>
            <div className="tabular text-[11px] opacity-75">{fmtTime(p.time)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OutsideBanner({ outside, stationName }) {
  const on = outside?.enabled && outside.current;
  const c = outside?.current;
  const place = outside?.location?.name;

  return (
    <section className="relative overflow-hidden rounded-[32px] shadow-[0_24px_60px_-28px_rgba(15,60,110,0.45)] ring-1 ring-white/60">
      <img
        src="/images/station-banner.jpg"
        srcSet="/images/station-banner-1200.jpg 1200w, /images/station-banner.jpg 2048w"
        sizes="(max-width: 1280px) 100vw, 1240px"
        alt={`${stationName || 'Weather station'}: solar-powered ESP32 sensor box on a pole in an open field`}
        className="absolute inset-x-0 top-0 h-[230px] w-full object-cover object-[24%_center] sm:h-[300px] lg:inset-0 lg:h-full lg:object-left"
      />
      {/* Mobile: blurred photo behind the stacked panels */}
      <div
        className="absolute inset-x-0 bottom-0 top-[230px] bg-cover bg-center sm:top-[300px] lg:hidden"
        style={{ backgroundImage: "linear-gradient(180deg, rgba(20,70,120,0.15), rgba(15,55,40,0.35)), url('/images/backdrop.jpg')" }}
      />
      <div className="absolute inset-x-0 top-[170px] h-[60px] bg-gradient-to-b from-transparent to-[rgba(20,70,120,0.15)] sm:top-[240px] lg:hidden" />
      {/* Desktop: soft shade behind the panels */}
      <div className="absolute inset-0 hidden bg-gradient-to-r from-transparent via-[rgba(10,45,90,0.05)] to-[rgba(10,45,90,0.28)] lg:block" />

      <div className="photo-text relative grid grid-cols-1 text-white lg:min-h-[440px] lg:grid-cols-[1fr_minmax(0,600px)]">
        <div className="h-[230px] sm:h-[300px] lg:h-auto" />

        <div className="flex flex-col justify-end gap-3 p-4 pt-5 sm:p-6 lg:justify-center lg:py-8 lg:pl-0 lg:pr-8">
          {on ? (
            <>
              <div className="glass-photo grid grid-cols-1 gap-5 rounded-[24px] p-5 sm:grid-cols-[1.25fr_auto_1fr] sm:items-center">
                <div className="flex min-w-0 items-center gap-4">
                  <WeatherIcon condition={c.condition} size={60} />
                  <div className="min-w-0">
                    <div className="tabular whitespace-nowrap text-[40px] font-semibold leading-none tracking-[-0.03em] sm:text-[46px]">
                      {fmtNum(c.temp, 1)}
                      <span className="ml-0.5 text-[26px] font-medium">°C</span>
                    </div>
                    <div className="mt-1.5 truncate text-[13px] font-medium opacity-90">
                      {capital(c.condition?.description) || 'Outside'} · feels like {fmtNum(c.feelsLike, 0)}°
                    </div>
                  </div>
                </div>
                <div className="hidden h-14 w-px bg-white/35 sm:block" />
                <Metric icon={<Droplet strokeWidth={STROKE} className="h-8 w-8 sm:h-10 sm:w-10" />} accent={DROP} value={fmtNum(c.humidity, 0)} unit="%" label="Humidity" />
              </div>

              <div className="glass-photo grid grid-cols-2 gap-4 rounded-[24px] p-5 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <Metric icon={<Gauge strokeWidth={STROKE} className="h-7 w-7 sm:h-[38px] sm:w-[38px]" />} value={fmtNum(c.pressure, 0)} unit="hPa" label="Pressure" />
                <div className="hidden h-12 w-px bg-white/35 sm:block" />
                <Metric
                  icon={<Wind strokeWidth={STROKE} className="h-7 w-7 sm:h-[38px] sm:w-[38px]" />}
                  value={fmtNum(c.windSpeed, 1)}
                  unit="km/h"
                  label={
                    <span className="inline-flex items-center gap-1">
                      Wind {compass(c.windDeg)}
                      {c.windDeg != null && <Navigation size={11} strokeWidth={2} style={{ transform: `rotate(${c.windDeg + 180}deg)` }} />}
                    </span>
                  }
                />
              </div>

              {outside.forecast?.length > 1 && (
                <div className="glass-photo rounded-[24px] px-5 pb-4 pt-4">
                  <div className="flex items-center justify-between gap-3 text-[13px] font-medium">
                    <span>Next 24 hours</span>
                    <span className="flex items-center gap-3 opacity-85">
                      {c.sunrise && (
                        <span className="inline-flex items-center gap-1"><Sunrise size={14} strokeWidth={STROKE} /> {fmtTime(c.sunrise)}</span>
                      )}
                      {c.sunset && (
                        <span className="inline-flex items-center gap-1"><Sunset size={14} strokeWidth={STROKE} /> {fmtTime(c.sunset)}</span>
                      )}
                    </span>
                  </div>
                  <ForecastLine forecast={outside.forecast} />
                </div>
              )}

              <div className="caption-rule mt-1 text-[11px] font-semibold uppercase tracking-[0.22em] opacity-90">
                <span className="whitespace-nowrap">Outside conditions{place ? ` · ${place}` : ''}</span>
              </div>
              <div className="-mt-2 text-center text-[11px] tracking-[0.12em] opacity-75">
                {outside.source} · updated {fmtTime(outside.fetchedAt)}
                {outside.stale ? ' · delayed' : ''}
              </div>
            </>
          ) : (
            <div className="pb-2 lg:pb-0">
              <div className="caption-rule text-[12px] font-semibold uppercase tracking-[0.24em]">
                <span className="whitespace-nowrap">Real-time weather data</span>
              </div>
              <div className="mt-2 text-center text-[11px] uppercase tracking-[0.28em] opacity-85">Solar-powered ESP32 station</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
