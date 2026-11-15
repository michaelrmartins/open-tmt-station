const LOCALE = undefined; // visitor's locale

export const fmtNum = (v, digits = 1) =>
  v == null || !Number.isFinite(v)
    ? '--'
    : v.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Large values without decimals, small values with one (e.g. illuminance). */
export const fmtAdaptive = (v) => (v == null ? '--' : fmtNum(v, Math.abs(v) < 10 ? 1 : 0));

export const fmtSigned = (v, digits = 1) => (v == null ? '--' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtNum(Math.abs(v), digits)}`);

export const fmtTime = (t) =>
  t == null ? '--' : new Date(t).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export const fmtDateTime = (t) =>
  t == null
    ? '--'
    : new Date(t).toLocaleString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** 3h 05m / 2d 4h / 12m */
export function fmtDuration(ms) {
  if (ms == null || !Number.isFinite(ms)) return '--';
  const m = Math.max(0, Math.round(ms / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(mm).padStart(2, '0')}m`;
  return `${mm}m`;
}

export const fmtHours = (h) => (h == null ? '--' : fmtDuration(h * 3600e3));

export function fmtAgo(t, now = Date.now()) {
  if (t == null) return 'never';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** Uptime split into units, e.g. [[3,'d'],[4,'h'],[12,'m']] */
export function uptimeParts(sec) {
  if (sec == null) return [];
  const s = Math.max(0, Math.floor(sec));
  const parts = [
    [Math.floor(s / 86400), 'd'],
    [Math.floor((s % 86400) / 3600), 'h'],
    [Math.floor((s % 3600) / 60), 'm'],
    [s % 60, 's'],
  ];
  const first = parts.findIndex(([n]) => n > 0);
  return parts.slice(Math.min(first === -1 ? 2 : first, 2));
}
