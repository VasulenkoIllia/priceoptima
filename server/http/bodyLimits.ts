// JSON-тіла запитів. Звичайно — до 1 МБ. Великі тіла (прайс файлом, збереження великої заявки) розбирає сам маршрут
// своїм парсером і лише після перевірки входу: інакше будь-хто без сесії змусить сервер розбирати мегабайти JSON.
import express, { type RequestHandler } from 'express';

const smallJson = express.json({ limit: '1mb' });

/** Маршрути під /api із власним JSON-парсером (priceUpdates.routes, requests.routes). */
const OWN_PARSER: ReadonlyArray<{ method: string; path: RegExp }> = [
  { method: 'POST', path: /^\/price-updates\/import\/?$/u },
  { method: 'PATCH', path: /^\/requests\/[^/]+\/?$/u },
];

export function hasOwnJsonParser(method: string, path: string): boolean {
  return OWN_PARSER.some((r) => r.method === method && r.path.test(path));
}

/** Загальний парсер /api: пропускає маршрути, що розбирають тіло самі. */
export const apiJson: RequestHandler = (req, res, next) => {
  if (hasOwnJsonParser(req.method, req.path)) return next();
  return smallJson(req, res, next);
};
