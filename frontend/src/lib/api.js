const BASE = import.meta.env.VITE_API_URL || '/api';

async function get(path, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null));
  const res = await fetch(`${BASE}${path}${qs.size ? `?${qs}` : ''}`, { headers: { Accept: 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export const HISTORY_METRICS = ['temperature', 'humidity', 'pressure', 'illuminance', 'batteryVoltage', 'sourceVoltage', 'internalTemperature'];

export const api = {
  meta: () => get('/meta'),
  snapshot: () => get('/snapshot'),
  history: (range) => get('/history', { range, metrics: HISTORY_METRICS.join(','), maxPoints: 400 }),
  energy: (range) => get('/energy', { range }),
};
