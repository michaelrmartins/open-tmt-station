// Minimal HTTP client for the InfluxDB 1.x /query endpoint (InfluxQL).
// Also works with InfluxDB 2.x through the v1 compatibility API (use INFLUX_TOKEN).

export class InfluxClient {
  constructor({ url, database, retentionPolicy, username, password, token, timeoutMs }) {
    this.url = url;
    this.database = database;
    this.retentionPolicy = retentionPolicy;
    this.username = username;
    this.password = password;
    this.token = token;
    this.timeoutMs = timeoutMs;
  }

  headers() {
    const h = { Accept: 'application/json' };
    if (this.token) h.Authorization = `Token ${this.token}`;
    else if (this.username) h.Authorization = 'Basic ' + Buffer.from(`${this.username}:${this.password}`).toString('base64');
    return h;
  }

  /** Runs one or more statements (separated by ";") and returns InfluxDB `results`. */
  async query(q) {
    const params = new URLSearchParams({ db: this.database, q, epoch: 'ms' });
    if (this.retentionPolicy) params.set('rp', this.retentionPolicy);
    const res = await fetch(`${this.url}/query?${params}`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`InfluxDB responded ${res.status}: ${text.slice(0, 200)}`);
    }
    if (!res.ok || body.error) throw new Error(`InfluxDB: ${body.error || res.status}`);
    for (const r of body.results || []) if (r.error) throw new Error(`InfluxDB: ${r.error}`);
    return body.results || [];
  }

  async ping() {
    const res = await fetch(`${this.url}/ping`, { headers: this.headers(), signal: AbortSignal.timeout(this.timeoutMs) });
    return res.status === 204 || res.ok;
  }
}

/**
 * Converts a multi-column SELECT result into
 * { column: [{ t, v }, ...] }, skipping null values.
 */
export function resultToSeries(result) {
  const out = {};
  for (const s of result?.series || []) {
    const ti = s.columns.indexOf('time');
    s.columns.forEach((col, ci) => {
      if (ci === ti) return;
      const arr = (out[col] ||= []);
      for (const row of s.values) {
        const v = row[ci];
        if (v === null || v === undefined || v === '') continue;
        const n = Number(v);
        if (Number.isFinite(n)) arr.push({ t: Number(row[ti]), v: n });
      }
    });
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.t - b.t);
  return out;
}
