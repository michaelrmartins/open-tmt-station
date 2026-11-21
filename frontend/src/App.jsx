import { useEffect, useState } from 'react';
import { CloudSun, MapPin, TriangleAlert } from 'lucide-react';
import { api } from './lib/api.js';
import { usePolling, useNow } from './hooks/usePolling.js';
import { fmtAgo, fmtTime } from './lib/format.js';
import { Segmented, SectionTitle, ICON_STROKE } from './components/ui.jsx';
import { WeatherGrid } from './components/WeatherCards.jsx';
import { HistorySection } from './components/HistorySection.jsx';
import { EnergySection } from './components/EnergySection.jsx';
import { SystemSection } from './components/SystemSection.jsx';
import { OutsideBanner } from './components/OutsideBanner.jsx';

const RANGES = [
  { value: '1h', label: '1H', ms: 3600e3 },
  { value: '3h', label: '3H', ms: 3 * 3600e3 },
  { value: '6h', label: '6H', ms: 6 * 3600e3 },
  { value: '12h', label: '12H', ms: 12 * 3600e3 },
  { value: '24h', label: '24H', ms: 24 * 3600e3 },
  { value: '7d', label: '7D', ms: 7 * 86400e3 },
  { value: '30d', label: '30D', ms: 30 * 86400e3 },
];
const RANGE_STORE = 'station-range';

function readRange() {
  try {
    const v = localStorage.getItem(RANGE_STORE);
    return RANGES.some((r) => r.value === v) ? v : '24h';
  } catch {
    return '24h';
  }
}

/**
 * online   -> green "Live"
 * sleeping -> amber "Sleeping" (deep sleep longer than the 5 min live window, next wake-up not missed yet)
 * offline  -> red "Offline"
 * Uses the transition instants from the API, so the badge switches on time between polls.
 */
function connectionState(snapshot, error, now) {
  if (!snapshot) return 'connecting';
  if (error || snapshot.offlineAt == null) return 'offline';
  if (now <= (snapshot.sleepingAt ?? snapshot.offlineAt)) return 'online';
  return now <= snapshot.offlineAt ? 'sleeping' : 'offline';
}

const BADGE = {
  online: { label: 'Live', dot: '#7cc57a', pulse: true },
  sleeping: { label: 'Sleeping', dot: '#efbf55', pulse: false },
  offline: { label: 'Offline', dot: '#e0675c', pulse: false },
  connecting: { label: 'Connecting', dot: '#b4c0cd', pulse: false },
};

function StatusBadge({ snapshot, error }) {
  const now = useNow(5000);
  const state = connectionState(snapshot, error, now);
  const b = BADGE[state];
  const wake = snapshot?.nextWakeAt;
  let detail = null;
  if (state === 'online' && snapshot?.lastUpdate) detail = `Updated ${fmtAgo(snapshot.lastUpdate, now)}`;
  if (state === 'sleeping') detail = wake && wake > now ? `Wakes up around ${fmtTime(wake)}` : 'Waking up';
  if (state === 'offline' && snapshot?.lastUpdate) detail = `Last seen ${fmtAgo(snapshot.lastUpdate, now)}`;
  return (
    <div className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-[12px] font-medium text-ink-2 ring-1 ring-black/[0.05]" role="status" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${b.pulse ? 'live-dot' : ''}`} style={{ background: b.dot, color: b.dot }} />
      <span className="text-ink">{b.label}</span>
      {state === 'sleeping' && (
        <span className="zzz" aria-hidden="true">
          <span>z</span>
          <span>z</span>
          <span>Z</span>
        </span>
      )}
      {detail && <span className="hidden sm:inline">· {detail}</span>}
    </div>
  );
}

export default function App() {
  const [range, setRange] = useState(readRange);
  const rangeCfg = RANGES.find((r) => r.value === range);
  const rangeLabel = rangeCfg.label.toLowerCase();

  const meta = usePolling(api.meta, 10 * 60e3);
  const snapshot = usePolling(api.snapshot, 30e3);
  const history = usePolling(() => api.history(range), 60e3, [range]);
  const energy = usePolling(() => api.energy(range), 60e3, [range]);
  const outside = usePolling(api.outside, 5 * 60e3);

  useEffect(() => {
    try {
      localStorage.setItem(RANGE_STORE, range);
    } catch {
      /* storage unavailable */
    }
  }, [range]);

  const station = meta.data?.station;
  useEffect(() => {
    if (station?.name) document.title = station.name;
  }, [station?.name]);

  const error = snapshot.error || history.error || energy.error;

  return (
    <>
      <div className="backdrop" />

      <header className="glass-bar sticky top-0 z-20 border-b border-black/[0.05]">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] text-white shadow-sm" style={{ background: 'linear-gradient(140deg, #ffd88a 0%, #7cc4ee 55%, #3f8fd0 100%)' }}>
              <CloudSun size={20} strokeWidth={ICON_STROKE} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold tracking-tight">{station?.name || 'Weather Station'}</div>
              {station?.location && (
                <div className="flex items-center gap-1 truncate text-[12px] text-ink-2">
                  <MapPin size={12} strokeWidth={ICON_STROKE} aria-hidden="true" />
                  {station.location}
                </div>
              )}
            </div>
          </div>
          <StatusBadge snapshot={snapshot.data} error={snapshot.error} />
        </div>
      </header>

      <div className="px-4 pt-5 sm:px-6 lg:px-4 lg:pt-4">
        <OutsideBanner outside={outside.data} stationName={station?.name} />
      </div>

      <main className="mx-auto max-w-[1240px] px-4 pb-16 pt-2 sm:px-6">
        <div className="mt-8 flex flex-wrap items-end justify-between gap-4 px-1">
          <div>
            <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em] sm:text-[40px]">Current conditions</h1>
            <p className="mt-1 text-[15px] text-ink-2">
              Live readings from an ESP32 station
              {snapshot.data?.lastUpdate && <> · last reading at <span className="tabular">{fmtTime(snapshot.data.lastUpdate)}</span></>}
            </p>
          </div>
          <Segmented label="Time range" value={range} onChange={setRange} options={RANGES} />
        </div>

        {error && (
          <div className="glass mt-6 flex items-center gap-3 rounded-2xl px-4 py-3 text-[14px] text-ink-2">
            <TriangleAlert size={18} strokeWidth={ICON_STROKE} style={{ color: 'var(--color-coral)' }} aria-hidden="true" />
            Some data could not be loaded right now. Retrying automatically.
          </div>
        )}

        <div className="mt-6">
          <WeatherGrid snapshot={snapshot.data} history={history.data} rangeLabel={rangeLabel} />
        </div>

        <div className="mt-4">
          <HistorySection history={history.data} rangeMs={rangeCfg.ms} />
        </div>

        <SectionTitle title="Power" subtitle="Battery, power source and energy balance" />
        <EnergySection snapshot={snapshot.data} energy={energy.data} rangeLabel={rangeLabel} />

        <SectionTitle title="System" subtitle="Device health" />
        <SystemSection snapshot={snapshot.data} />

        <footer className="caption-rule mt-14 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-2">
          <span className="text-center">Data refreshes automatically every 30 seconds{meta.data?.mock ? ' · Demo data' : ''}</span>
        </footer>
        <p className="mt-3 text-center text-[11px] font-medium text-ink-2">
          Background photo by{' '}
          <a className="underline decoration-ink-3/40 underline-offset-2 hover:text-ink-2" href="https://www.magnific.com/free-photo/countryside-field-sunny-day-countryside_11502869.htm" target="_blank" rel="noopener noreferrer">
            Freepik on Magnific
          </a>
        </p>
      </main>
    </>
  );
}
