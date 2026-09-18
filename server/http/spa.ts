// Віддача зібраного застосунку тим самим процесом, що й API (раніше це робив nginx).
// Файли збірки мають хеш у назві — кешуються надовго; index.html — без кешу, щоб нова версія підхоплювалась одразу.
import fs from 'node:fs';
import path from 'node:path';
import express, { Router, type RequestHandler } from 'express';
import { logger } from '../logger';

const INDEX_CACHE = 'no-cache';
const ASSET_CACHE = 'public, max-age=31536000, immutable';

/** Файли з хешем у назві живуть у /assets. */
function isHashedAsset(filePath: string): boolean {
  return path.basename(path.dirname(filePath)) === 'assets';
}

export function spaRouter(clientDir: string): Router {
  const router = Router();
  const indexFile = path.join(clientDir, 'index.html');

  // внутрішній застосунок — не для пошукових систем
  router.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send('User-agent: *\nDisallow: /\n');
  });

  router.use(
    express.static(clientDir, {
      index: false,
      // невідомий файл — це маршрут застосунку, віддамо index.html нижче
      fallthrough: true,
      setHeaders(res, filePath) {
        res.setHeader('Cache-Control', isHashedAsset(filePath) ? ASSET_CACHE : INDEX_CACHE);
      },
    }),
  );

  // файлу збірки немає — це 404, а не сторінка застосунку (інакше браузер отримає html замість скрипта)
  router.use('/assets', (_req, res) => {
    res.status(404).type('text/plain').send('Not Found\n');
  });

  router.use(sendIndex(indexFile));
  return router;
}

/** Будь-який інший шлях — сторінка застосунку (маршрутизація на клієнті). */
function sendIndex(indexFile: string): RequestHandler {
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (!fs.existsSync(indexFile)) {
      logger.warn({ indexFile }, 'Збірки застосунку немає — віддаємо лише API');
      res.status(404).type('text/plain').send('Збірку застосунку не знайдено. Виконайте npm run build.\n');
      return;
    }
    res.setHeader('Cache-Control', INDEX_CACHE);
    res.sendFile(indexFile);
  };
}
