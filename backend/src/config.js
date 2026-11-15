// Central configuration. Everything comes from environment variables (see .env.example).

const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
const bool = (v, d = false) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));

export const config = {
  port: num(process.env.PORT, 3001),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  trustProxy: num(process.env.TRUST_PROXY, 1),
  rateLimitPerMinute: num(process.env.RATE_LIMIT_PER_MINUTE, 120),

  // Generate synthetic data instead of querying InfluxDB (development / demo).
  mock: bool(process.env.MOCK_DATA, false),

  influx: {
    url: (process.env.INFLUX_URL || 'http://localhost:8086').replace(/\/+$/, ''),
    database: process.env.INFLUX_DB || 'telegraf',
    retentionPolicy: process.env.INFLUX_RP || '',
    username: process.env.INFLUX_USER || '',
    password: process.env.INFLUX_PASSWORD || '',
    // InfluxDB 2.x with the v1 compatibility API (DBRP): set the token.
    token: process.env.INFLUX_TOKEN || '',
    timeoutMs: num(process.env.INFLUX_TIMEOUT_MS, 10000),
    measurement: process.env.INFLUX_MEASUREMENT || 'mqtt_consumer',
    // Tasmota topic prefix of the device (matches .../SENSOR and .../STATE).
    topicPrefix: process.env.DEVICE_TOPIC_PREFIX || 'tele/esp32_varanda/',
  },

  station: {
    name: process.env.STATION_NAME || 'Weather Station',
    location: process.env.STATION_LOCATION || '',
    // Power source on the DC input: 'solar' (panel) or 'psu' (5 V USB supply).
    powerMode: process.env.POWER_MODE === 'psu' ? 'psu' : 'solar',
  },

  battery: {
    // Grafana dashboard constants: $BAT_EMPTY and $BAT_MAX
    empty: num(process.env.BAT_EMPTY, 3.0),
    full: num(process.env.BAT_MAX, 4.135),
  },

  // External weather (OpenWeather). Fetched by a background scheduler, never per request.
  openWeather: {
    apiKey: process.env.OPENWEATHER_API_KEY || '',
    // Location: latitude/longitude (preferred) or a city query such as "Sao Paulo,BR"
    lat: process.env.OPENWEATHER_LAT || '',
    lon: process.env.OPENWEATHER_LON || '',
    city: process.env.OPENWEATHER_CITY || '',
    // Optional display name; defaults to the name OpenWeather returns
    locationName: process.env.OPENWEATHER_LOCATION_NAME || '',
    units: 'metric',
    lang: process.env.OPENWEATHER_LANG || 'en',
    // Refresh interval in minutes (default 60, minimum 10 to stay inside free-plan limits)
    refreshMs: Math.max(10, num(process.env.OPENWEATHER_REFRESH_MINUTES, 60)) * 60e3,
    // Where the last response is persisted, so restarts don't trigger extra calls
    cacheFile: process.env.OPENWEATHER_CACHE_FILE || './data/openweather.json',
    baseUrl: 'https://api.openweathermap.org/data/2.5',
    timeoutMs: num(process.env.OPENWEATHER_TIMEOUT_MS, 10000),
  },

  cache: {
    snapshotTtlMs: num(process.env.CACHE_SNAPSHOT_TTL_MS, 15000),
    historyTtlMs: num(process.env.CACHE_HISTORY_TTL_MS, 60000),
  },
};
