// Один застосунок express: /api — дані, /health — перевірка, решта — зібраний інтерфейс.
import express, { type Express } from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { config } from './config';
import { pingDb } from './db';
import { logger } from './logger';
import { errorHandler } from './http/errorHandler';
import { spaRouter } from './http/spa';
import { priceImportJsonParser } from './modules/price-updates/priceUpdates.routes';
import { apiRouter } from './routes';

export function createApp(): Express {
  const app = express();

  if (config.TRUST_PROXY) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.set('etag', 'strong');

  app.use(
    pinoHttp({
      logger,
      // перевірки стану не засмічують лог
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );
  app.use(compression());
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });

  // перевірка стану контейнера: застосунок піднявся і база відповідає
  app.get('/health', (_req, res) => {
    void pingDb().then((db) => {
      res.status(db ? 200 : 503).json({ status: db ? 'ok' : 'error', db });
    });
  });

  // прайс файлом — десятки тисяч рядків одним JSON, тому цей маршрут має власну, більшу межу розміру
  app.use('/api/price-updates/import', priceImportJsonParser);
  app.use('/api', express.json({ limit: '1mb' }), cookieParser(config.SESSION_SECRET), apiRouter);
  app.use(spaRouter(config.clientDir));
  app.use(errorHandler);

  return app;
}
