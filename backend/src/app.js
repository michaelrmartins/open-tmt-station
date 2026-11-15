import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createApiRouter } from './routes/api.js';
import { createRepository } from './data/repository.js';
import { TtlCache } from './lib/cache.js';

export function createApp(config, { repo = createRepository(config), cache = new TtlCache() } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',').map((s) => s.trim()), methods: ['GET'] }));
  app.use(
    '/api',
    rateLimit({ windowMs: 60e3, limit: config.rateLimitPerMinute, standardHeaders: 'draft-8', legacyHeaders: false })
  );
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'public, max-age=10');
    next();
  });

  app.use('/api', createApiRouter({ config, repo, cache }));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'endpoint not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || 502;
    if (status >= 500) console.error('[api]', err.message);
    res.status(status).json({ error: status >= 500 ? 'failed to query station data' : err.message });
  });

  return app;
}
