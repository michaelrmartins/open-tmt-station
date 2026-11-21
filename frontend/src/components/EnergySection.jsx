import { BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, CircuitBoard, Clock, Cpu, Hourglass, Plug, PlugZap, Sun, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { Card, CardHeader, Divider, IconChip, Pill, Skeleton, Stat, TrendPill, ICON_STROKE } from './ui.jsx';
import { FLOW_STATE, TONES, batteryTone, label } from '../lib/labels.js';
import { fmtDateTime, fmtDuration, fmtHours, fmtNum, fmtSigned, fmtTime } from '../lib/format.js';

// ---------------------------------------------------------------------------
// Battery
// ---------------------------------------------------------------------------
function BatteryGlyph({ percent, tone, charging }) {
  const t = TONES[tone];
  const p = Math.max(0, Math.min(100, percent ?? 0));
  return (
    <div className="relative flex items-center" aria-hidden="true">
      <div className="relative h-[72px] w-[150px] rounded-[22px] border-[2.5px] p-[5px]" style={{ borderColor: 'var(--track-strong)' }}>
        <div className="h-full rounded-[15px] transition-[width] duration-1000 ease-out" style={{ width: `${Math.max(p, 4)}%`, background: `linear-gradient(180deg, ${t.line}, ${t.fg})`, opacity: 0.85 }} />
        {charging && (
          <span className="absolute inset-0 flex items-center justify-center text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.15)]">
            <Zap size={26} strokeWidth={ICON_STROKE} fill="currentColor" />
          </span>
        )}
      </div>
      <div className="ml-[3px] h-6 w-[6px] rounded-r-[4px]" style={{ background: 'var(--track-strong)' }} />
    </div>
  );
}

function BatteryCard({ battery }) {
  if (!battery) return <Card><Skeleton className="h-64" /></Card>;
  const tone = batteryTone(battery.percent);
  const charging = battery.trend === 'up';
  const Icon = charging ? BatteryCharging : battery.percent >= 60 ? BatteryFull : battery.percent >= 20 ? BatteryMedium : BatteryLow;
  const trendLabel = battery.trend === 'up' ? `Charging ${fmtSigned(battery.rate, 0)} mV/h` : battery.trend === 'down' ? `Discharging ${fmtSigned(battery.rate, 0)} mV/h` : 'Stable';

  let eta = null;
  if (battery.toEmpty) {
    eta = battery.toEmpty.overMaxDays
      ? { title: 'Empty in', value: `More than ${battery.toEmpty.overMaxDays} days`, at: null }
      : { title: 'Empty in', value: fmtHours(battery.toEmpty.hours), at: battery.toEmpty.at };
  } else if (battery.toFull) {
    eta = { title: 'Full in', value: fmtHours(battery.toFull.hours), at: battery.toFull.at };
  }

  return (
    <Card className="flex flex-col">
      <CardHeader icon={Icon} tone={tone} title="Battery" subtitle={`Li-ion cell · ${label(battery.level)}`} right={<TrendPill trend={battery.trend} text={trendLabel} tone={charging ? 'sage' : 'apricot'} />} />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-5">
        <div>
          <div className="flex items-baseline gap-1">
            <span className="tabular text-[52px] font-semibold leading-none tracking-[-0.03em]">{fmtNum(battery.percent, 0)}</span>
            <span className="text-[20px] font-medium text-ink-2">%</span>
          </div>
          <div className="mt-1.5 text-[14px] font-medium" style={{ color: TONES[tone].fg }}>
            {label(battery.level)} · <span className="tabular">{fmtNum(battery.voltage, 3)} V</span>
          </div>
        </div>
        <BatteryGlyph percent={battery.percent} tone={tone} charging={charging} />
      </div>

      <div className="mt-5 min-h-[52px] rounded-2xl bg-white/[0.08] px-4 py-3 ring-1 ring-white/15">
        {eta ? (
          <div className="flex items-center gap-3">
            <Hourglass size={18} strokeWidth={ICON_STROKE} className="text-ink-2" aria-hidden="true" />
            <div className="text-[14px] text-ink-2">
              {eta.title} <span className="tabular font-semibold text-ink">{eta.value}</span>
              {eta.at && <span className="text-ink-3"> · around {fmtDateTime(eta.at)}</span>}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-[14px] text-ink-2">
            <Clock size={18} strokeWidth={ICON_STROKE} aria-hidden="true" />
            Voltage is steady, no estimate needed
          </div>
        )}
      </div>

      <Divider />
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Min · 3 h" value={fmtNum(battery.min, 3)} unit="V" />
        <Stat label="Max · 3 h" value={fmtNum(battery.max, 3)} unit="V" />
        <Stat label="Rate" value={fmtSigned(battery.ratePercent, 1)} unit="%/h" />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Power flow: source -> CN3065 -> ESP32, battery attached to the charger
// ---------------------------------------------------------------------------
function FlowNode({ icon, tone, title, value, dim }) {
  return (
    <div className={`flex flex-col items-center gap-1.5 text-center transition-opacity ${dim ? 'opacity-45' : ''}`}>
      <IconChip icon={icon} tone={tone} size="lg" />
      <div className="text-[12px] font-semibold text-ink">{title}</div>
      <div className="tabular -mt-1 text-[11px] text-ink-2">{value}</div>
    </div>
  );
}

function PowerFlowCard({ snapshot }) {
  if (!snapshot) return <Card><Skeleton className="h-64" /></Card>;
  const { flow, mode, metrics } = snapshot;
  const solar = mode === 'solar';
  const srcTone = solar ? 'apricot' : 'sky';
  const state = FLOW_STATE[flow.state] || { title: 'Unknown', tone: 'slate' };
  const srcOn = !!flow.sourceOn;
  const bat = metrics.batteryVoltage;
  const charging = flow.state === 'charging';
  const onBattery = flow.state === 'battery';
  const loadTone = srcOn ? srcTone : 'apricot';
  const route = charging
    ? `${solar ? 'Solar' : 'PSU'} powers the ESP32 and charges the battery`
    : onBattery
      ? `Battery powers the ESP32 · ${solar ? 'solar' : 'PSU'} offline`
      : `${solar ? 'Solar' : 'PSU'} powers the ESP32 · battery full`;

  return (
    <Card className="flex flex-col">
      <CardHeader icon={onBattery ? BatteryMedium : solar ? Sun : Plug} tone={state.tone} title="Power flow" subtitle={route} />

      <div className="mt-5 flex items-baseline justify-between gap-3">
        <div className="text-[26px] font-semibold tracking-tight" style={{ color: TONES[state.tone].fg }}>{state.title}</div>
        <div className="tabular text-right text-[13px] text-ink-2">
          {flow.atLeast ? 'for over ' : 'for '}
          <span className="font-semibold text-ink">{fmtDuration(flow.durationMs)}</span>
        </div>
      </div>

      {/* Diagram: 3 columns x 3 rows */}
      <div className="mt-6 grid grid-cols-[auto_1fr_auto_1fr_auto] grid-rows-[auto_36px_auto] items-center">
        <FlowNode icon={solar ? Sun : PlugZap} tone={srcOn ? srcTone : 'slate'} title={solar ? 'Solar' : 'PSU'} value={`${fmtNum(metrics.sourceVoltage.voltage, 2)} V`} dim={!srcOn} />
        <div className={`flow-h mx-2 mb-9 h-[3px] ${srcOn ? 'is-active' : ''}`} style={{ color: TONES[srcTone].line }} />
        <FlowNode icon={CircuitBoard} tone={state.tone} title="CN3065" value={charging ? 'Charging' : onBattery ? 'Bypass' : 'Complete'} />
        <div className="flow-h is-active mx-2 mb-9 h-[3px]" style={{ color: TONES[loadTone].line }} />
        <FlowNode icon={Cpu} tone={loadTone} title="ESP32" value={snapshot.status === 'sleeping' ? 'Sleeping' : snapshot.online ? 'Running' : 'No recent data'} />

        <div />
        <div />
        <div className={`flow-v mx-auto h-full w-[3px] ${flow.state !== 'full' ? 'is-active' : ''} ${charging ? '' : 'is-reverse'}`} style={{ color: TONES[charging ? 'sage' : 'apricot'].line }} />
        <div />
        <div />

        <div />
        <div />
        <FlowNode icon={charging ? BatteryCharging : BatteryMedium} tone={batteryTone(bat.percent)} title="Battery" value={`${fmtNum(bat.voltage, 2)} V · ${fmtNum(bat.percent, 0)}%`} />
        <div />
        <div />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// DC input
// ---------------------------------------------------------------------------
const STATUS_TONE = { charger_active: 'sage', usb_spec_ok: 'sage', charger_limit: 'apricot', usb_spec_out: 'apricot', below_minimum: 'slate', no_input: 'coral' };

function PowerInputCard({ power, rangeLabel }) {
  if (!power) return <Card><Skeleton className="h-64" /></Card>;
  const solar = power.mode === 'solar';
  const tone = solar ? 'apricot' : 'sky';
  const L = power.limits || {};
  const pos = (v) => `${Math.max(0, Math.min(100, ((v - L.min) / (L.max - L.min)) * 100))}%`;
  const zone = solar ? [L.chargerOk, L.max] : [L.specLo, L.specHi];

  return (
    <Card className="flex flex-col">
      <CardHeader icon={solar ? Sun : Plug} tone={tone} title={solar ? 'Solar panel' : 'USB supply'} subtitle="DC input voltage" right={<Pill tone={STATUS_TONE[power.status] || 'slate'}>{label(power.status)}</Pill>} />

      <div className="mt-5 flex items-baseline gap-1.5">
        <span className="tabular text-[44px] font-semibold leading-none tracking-[-0.03em]">{fmtNum(power.voltage, 2)}</span>
        <span className="text-[17px] font-medium text-ink-2">V</span>
      </div>
      <div className="mt-1.5 text-[14px] font-medium" style={{ color: TONES[tone].fg }}>{label(power.level)}</div>

      {/* Scale with the charger / USB-spec zone */}
      <div className="mt-6">
        <div className="relative h-2 rounded-full bg-[var(--track)]">
          <div className="absolute inset-y-0 rounded-full" style={{ left: pos(zone[0]), width: `calc(${pos(zone[1])} - ${pos(zone[0])})`, background: TONES.sage.bg }} />
          <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-1000" style={{ width: pos(power.voltage), background: TONES[tone].line }} />
          <div className="absolute -top-1 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white shadow" style={{ left: pos(power.voltage), background: TONES[tone].fg }} />
        </div>
        <div className="tabular mt-2 flex justify-between text-[11px] text-ink-3">
          <span>{fmtNum(L.min, 1)} V</span>
          <span>{solar ? `Charger ${fmtNum(L.chargerMin, 1)} V min` : `USB ${fmtNum(L.specLo, 2)} to ${fmtNum(L.specHi, 2)} V`}</span>
          <span>{fmtNum(L.max, 1)} V</span>
        </div>
      </div>

      <Divider />
      <div className="grid grid-cols-3 gap-2">
        {solar ? (
          <>
            <Stat label={`Peak · ${rangeLabel}`} value={fmtNum(power.max, 2)} unit="V" />
            <Stat label="Average" value={fmtNum(power.avg, 2)} unit="V" />
            <Stat label="Charge window" value={fmtDuration(power.chargeWindowMs)} hint="Time above 4.3 V" />
          </>
        ) : (
          <>
            <Stat label={`Min · ${rangeLabel}`} value={fmtNum(power.min, 2)} unit="V" />
            <Stat label="Max" value={fmtNum(power.max, 2)} unit="V" />
            <Stat label="Ripple · 30 min" value={fmtNum(power.rippleMv, 0)} unit="mV" />
          </>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Energy statistics over the selected range
// ---------------------------------------------------------------------------
function StatTile({ icon, tone, title, value, unit, hint }) {
  return (
    <div className="rounded-[20px] bg-white/[0.08] p-4 ring-1 ring-white/15">
      <div className="flex items-center gap-2 text-[12px] font-medium text-ink-2">
        <IconChip icon={icon} tone={tone} size="sm" />
        {title}
      </div>
      <div className="tabular mt-3 text-[22px] font-semibold tracking-tight text-ink">
        {value}
        {unit && <span className="ml-1 text-[13px] font-medium text-ink-2">{unit}</span>}
      </div>
      {hint && <div className="mt-0.5 text-[12px] text-ink-3">{hint}</div>}
    </div>
  );
}

function EnergyStatsCard({ energy, rangeLabel }) {
  if (!energy) return <Card><Skeleton className="h-48" /></Card>;
  const { totals, shares, discharge, charge } = energy;
  const solar = energy.mode === 'solar';
  const batPct = shares ? shares.battery * 100 : 0;
  const srcPct = shares ? shares.source * 100 : 0;

  return (
    <Card>
      <CardHeader icon={Zap} tone="sage" title="Energy balance" subtitle={`Last ${rangeLabel} · ${energy.transitions} state changes`} />

      {/* Share bar */}
      <div className="mt-5">
        <div className="flex h-3 overflow-hidden rounded-full bg-[var(--track)]">
          <div className="h-full transition-[width] duration-1000" style={{ width: `${srcPct}%`, background: TONES[solar ? 'apricot' : 'sky'].line }} />
          <div className="h-full transition-[width] duration-1000" style={{ width: `${batPct}%`, background: TONES.sage.line }} />
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-[12px] text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: TONES[solar ? 'apricot' : 'sky'].line }} />
            On {solar ? 'solar' : 'PSU'} <span className="tabular font-semibold text-ink">{fmtNum(srcPct, 0)}%</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: TONES.sage.line }} />
            On battery <span className="tabular font-semibold text-ink">{fmtNum(batPct, 0)}%</span>
          </span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile icon={solar ? Sun : Plug} tone={solar ? 'apricot' : 'sky'} title={`Time on ${solar ? 'solar' : 'PSU'}`} value={fmtDuration(totals.source)} hint={`Charging ${fmtDuration(totals.charging)}`} />
        <StatTile icon={BatteryMedium} tone="sage" title="Time on battery" value={fmtDuration(totals.battery)} hint={`Full ${fmtDuration(totals.full)}`} />
        <StatTile icon={TrendingDown} tone="apricot" title="Discharge rate" value={discharge ? fmtSigned(discharge.rateMvH, 1) : '--'} unit="mV/h" hint={discharge ? `${fmtSigned(discharge.ratePercentH, 2)} %/h` : 'Not enough data'} />
        <StatTile icon={TrendingUp} tone="sage" title="Charge rate" value={charge ? fmtSigned(charge.rateMvH, 1) : '--'} unit="mV/h" hint={charge ? `${fmtSigned(charge.ratePercentH, 2)} %/h` : 'Not enough data'} />
        <StatTile icon={Hourglass} tone="lilac" title="Autonomy" value={fmtHours(discharge?.autonomyHours)} hint="Full to empty, average load" />
        <StatTile icon={BatteryCharging} tone="teal" title="Full recharge" value={fmtHours(charge?.fullChargeHours)} hint="Empty to full, average rate" />
      </div>
      <p className="mt-4 text-[12px] text-ink-3">
        Rates come from linear regressions over each continuous charging or discharging segment, weighted by duration. Charge level is estimated
        linearly from voltage, so treat autonomy figures as approximations. Last reading {fmtTime(energy.battery?.time)}.
      </p>
    </Card>
  );
}

export function EnergySection({ snapshot, energy, rangeLabel }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <BatteryCard battery={snapshot?.metrics?.batteryVoltage} />
      <PowerFlowCard snapshot={snapshot} />
      <PowerInputCard power={energy?.power} rangeLabel={rangeLabel} />
      <div className="lg:col-span-3">
        <EnergyStatsCard energy={energy} rangeLabel={rangeLabel} />
      </div>
    </div>
  );
}
