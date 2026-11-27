import { ForecastChart } from './charts.jsx';
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

function Metric({ icon: Icon, value, unit, label, accent }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Icon strokeWidth={STROKE} className="hidden h-8 w-8 shrink-0 2xl:block" style={{ color: accent || '#fff' }} aria-hidden="true" />
      <div className="min-w-0">
        <div className="tabular whitespace-nowrap text-[26px] font-semibold leading-none tracking-[-0.02em]">
          {value}
          <span className="ml-1 text-[13px] font-medium opacity-90">{unit}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 truncate text-[12px] font-medium opacity-85">
          <Icon strokeWidth={1.8} className="h-3.5 w-3.5 shrink-0 2xl:hidden" style={{ color: accent || '#fff' }} aria-hidden="true" />
          {label}
        </div>
      </div>
    </div>
  );
}

/**
 * Wide, low banner: the station photo with frosted panels side by side.
 * Desktop: one row of panels. Phones/tablets: the row scrolls horizontally (snap).
 */
export function OutsideBanner({ outside, stationName }) {
  const on = outside?.enabled && outside.current;
  const c = outside?.current;
  const place = outside?.location?.name;
  const panel = 'glass-photo shrink-0 snap-start rounded-[22px] px-5 py-4 text-white';

  return (
    <section className="relative lg:overflow-hidden lg:rounded-[28px] lg:shadow-[0_20px_50px_-26px_rgba(15,60,110,0.45)] lg:ring-1 lg:ring-white/60">
      {/* Scene extension (sky, trees, grass) at the same scale, so the horizon lines up */}
      <img
        src="/images/station-banner-fill.jpg"
        alt=""
        aria-hidden="true"
        className="absolute left-0 top-[-8%] hidden h-[172%] w-full object-fill lg:block"
      />
      {/* The station photo, scaled so the whole pole, box and solar panels fit, fading to the right */}
      <img
        src="/images/station-banner.jpg"
        srcSet="/images/station-banner-1200.jpg 1200w, /images/station-banner.jpg 2048w"
        sizes="1100px"
        alt={`${stationName || 'Weather station'}: solar-powered ESP32 sensor box on a pole in an open field`}
        className="absolute left-0 top-[-8%] hidden h-[172%] w-auto max-w-none lg:block"
        style={{ maskImage: 'linear-gradient(90deg, #000 50%, transparent 92%)', WebkitMaskImage: 'linear-gradient(90deg, #000 50%, transparent 92%)' }}
      />
      <div className="absolute inset-0 hidden bg-gradient-to-r from-transparent via-[rgba(10,45,90,0.04)] to-[rgba(10,45,90,0.22)] lg:block" />

      <div className="relative flex flex-col justify-center gap-2.5 text-ink lg:photo-text lg:min-h-[208px] lg:py-4 lg:pl-[420px] 2xl:pl-[460px] lg:pr-6 lg:text-white xl:min-h-[216px]">
        {on ? (
          <>
            <div className="flex flex-col gap-3 lg:snap-x lg:snap-mandatory lg:flex-row lg:overflow-x-auto lg:px-4 lg:[scrollbar-width:none] xl:grid xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.3fr)] xl:overflow-visible xl:px-0">
              {/* Temperature + humidity */}
              <div className={`${panel} flex w-full items-center gap-3.5 lg:w-[300px] xl:w-auto`}>
                <WeatherIcon condition={c.condition} size={42} />
                <div className="min-w-0 flex-1">
                  <div className="tabular whitespace-nowrap text-[32px] font-semibold leading-none tracking-[-0.03em]">
                    {fmtNum(c.temp, 1)}
                    <span className="ml-0.5 text-[18px] font-medium">°C</span>
                  </div>
                  <div className="mt-1 truncate text-[12px] font-medium opacity-90">
                    {capital(c.condition?.description) || 'Outside'} · feels {fmtNum(c.feelsLike, 0)}°
                  </div>
                </div>
                <div className="h-11 w-px shrink-0 bg-white/35" />
                <Metric icon={Droplet} accent={DROP} value={fmtNum(c.humidity, 0)} unit="%" label="Humidity" />
              </div>

              {/* Pressure + wind */}
              <div className={`${panel} flex w-full items-center justify-around gap-4 lg:w-[270px] xl:w-auto`}>
                <Metric icon={Gauge} value={fmtNum(c.pressure, 0)} unit="hPa" label="Pressure" />
                <div className="h-11 w-px shrink-0 bg-white/35" />
                <Metric
                  icon={Wind}
                  value={fmtNum(c.windSpeed, 1)}
                  unit="km/h"
                  label={
                    <span className="inline-flex items-center gap-1">
                      Wind {compass(c.windDeg)}
                      {c.windDeg != null && <Navigation size={10} strokeWidth={2} style={{ transform: `rotate(${c.windDeg + 180}deg)` }} />}
                    </span>
                  }
                />
              </div>

              {/* Next 24 h */}
              {outside.forecast?.length > 1 && (
                <div className={`${panel} w-full !py-3 lg:w-[340px] xl:w-auto`}>
                  <div className="flex items-center justify-between gap-3 text-[12px] font-medium">
                    <span className="whitespace-nowrap">Next 24 hours</span>
                    <span className="flex items-center gap-3 whitespace-nowrap opacity-85">
                      {c.sunrise && (
                        <span className="inline-flex items-center gap-1"><Sunrise size={13} strokeWidth={STROKE} /> {fmtTime(c.sunrise)}</span>
                      )}
                      {c.sunset && (
                        <span className="inline-flex items-center gap-1"><Sunset size={13} strokeWidth={STROKE} /> {fmtTime(c.sunset)}</span>
                      )}
                    </span>
                  </div>
                  <ForecastChart forecast={outside.forecast} height={78} />
                </div>
              )}
            </div>

            <div className="caption-rule text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-3 lg:px-4 lg:text-white lg:opacity-90 xl:px-0">
              <span className="whitespace-nowrap">
                Outside{place ? ` · ${place}` : ''}<span className="hidden sm:inline"> · {outside.source}</span> · updated {fmtTime(outside.fetchedAt)}
                {outside.stale ? ' · delayed' : ''}
              </span>
            </div>
          </>
        ) : (
          <div className="px-4 lg:px-0">
            <div className="caption-rule text-[12px] font-semibold uppercase tracking-[0.24em]">
              <span className="whitespace-nowrap">Real-time weather data</span>
            </div>
            <div className="mt-2 text-center text-[11px] uppercase tracking-[0.28em] opacity-85">Solar-powered ESP32 station</div>
          </div>
        )}
      </div>
    </section>
  );
}
