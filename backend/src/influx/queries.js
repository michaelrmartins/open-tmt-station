// InfluxQL query builders.
//
// No user-supplied value is ever interpolated: the time range and the
// "GROUP BY time()" come from a closed list (RANGES) and field names from
// FIELDS. The topic prefix comes from server configuration and is escaped.

// Fields of the "mqtt_consumer" measurement (Telegraf + Tasmota) used in Grafana.
export const FIELDS = {
  temperature: { field: 'AM2301_Temperature', agg: 'mean', unit: '°C', label: 'Temperature' },
  humidity: { field: 'AM2301_Humidity', agg: 'mean', unit: '%', label: 'Humidity' },
  pressure: { field: 'BMP280_Pressure', agg: 'mean', unit: 'hPa', label: 'Pressure' },
  internalTemperature: { field: 'BMP280_Temperature', agg: 'mean', unit: '°C', label: 'Internal temperature' },
  illuminance: { field: 'BH1750_Illuminance', agg: 'mean', unit: 'lx', label: 'Illuminance' },
  sourceVoltage: { field: 'ANALOG_Voltage1', agg: 'mean', unit: 'V', label: 'DC input' },
  batteryVoltage: { field: 'ANALOG_Voltage2', agg: 'mean', unit: 'V', label: 'Battery' },
  wifiSignal: { field: 'Wifi_Signal', agg: 'mean', unit: 'dBm', label: 'Wi-Fi signal' },
  loadAvg: { field: 'LoadAvg', agg: 'mean', unit: '%', label: 'CPU load' },
  uptime: { field: 'UptimeSec', agg: 'last', unit: 's', label: 'Uptime' },
  deepSleep: { field: 'DeepSleepTime', agg: 'last', unit: 's', label: 'Deep sleep' },
};

export const METRIC_KEYS = Object.keys(FIELDS);

// Ranges accepted by the API and the bucket resolution used for each.
export const RANGES = {
  '1h': { ms: 1 * 3600e3, interval: '1m', intervalMs: 60e3 },
  '3h': { ms: 3 * 3600e3, interval: '1m', intervalMs: 60e3 },
  '6h': { ms: 6 * 3600e3, interval: '2m', intervalMs: 120e3 },
  '12h': { ms: 12 * 3600e3, interval: '5m', intervalMs: 300e3 },
  '24h': { ms: 24 * 3600e3, interval: '5m', intervalMs: 300e3 },
  '7d': { ms: 7 * 86400e3, interval: '30m', intervalMs: 1800e3 },
  '30d': { ms: 30 * 86400e3, interval: '2h', intervalMs: 7200e3 },
};

export const DEFAULT_RANGE = '24h';

const quoteIdent = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** Device filter: "topic" =~ /^tele\/esp32_varanda\// */
export const topicFilter = (prefix) => `"topic" =~ /^${escapeRegex(prefix)}/`;

/**
 * Single SELECT with every field aggregated per time bucket.
 * Generated example (range 3h):
 *
 *   SELECT mean("AM2301_Temperature") AS "temperature", ..., last("UptimeSec") AS "uptime"
 *   FROM "mqtt_consumer"
 *   WHERE "topic" =~ /^tele\/esp32_varanda\// AND time > now() - 3h
 *   GROUP BY time(1m) fill(none)
 */
export function buildSeriesQuery({ measurement, topicPrefix, rangeKey, metrics = METRIC_KEYS }) {
  const range = RANGES[rangeKey];
  if (!range) throw new Error(`invalid range: ${rangeKey}`);
  const select = metrics
    .filter((m) => FIELDS[m])
    .map((m) => `${FIELDS[m].agg}(${quoteIdent(FIELDS[m].field)}) AS ${quoteIdent(m)}`)
    .join(', ');
  if (!select) throw new Error('no valid metric');
  return (
    `SELECT ${select} FROM ${quoteIdent(measurement)} ` +
    `WHERE ${topicFilter(topicPrefix)} AND time > now() - ${rangeKey} ` +
    `GROUP BY time(${range.interval}) fill(none)`
  );
}

/** Latest raw reading of each field (no aggregation). */
export function buildLatestQuery({ measurement, topicPrefix, metrics = METRIC_KEYS, lookback = '30d' }) {
  return metrics
    .filter((m) => FIELDS[m])
    .map(
      (m) =>
        `SELECT last(${quoteIdent(FIELDS[m].field)}) AS "value" FROM ${quoteIdent(measurement)} ` +
        `WHERE ${topicFilter(topicPrefix)} AND time > now() - ${lookback}`
    )
    .join('; ');
}
