import { config } from './config.js';
import { createApp } from './app.js';

const app = createApp(config);
const server = app.listen(config.port, () => {
  console.log(`[api] listening on port ${config.port} ${config.mock ? '(MOCK_DATA)' : `-> ${config.influx.url} db=${config.influx.database}`}`);
});

// Background OpenWeather scheduler (no-op when not configured)
app.locals.weather.start().catch((e) => console.error('[openweather]', e.message));

const shutdown = () => {
  app.locals.weather.stop();
  server.close(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
