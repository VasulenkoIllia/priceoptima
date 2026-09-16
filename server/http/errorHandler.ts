// Обробники express: невідомий маршрут API і перетворення будь-якої помилки на відповідь.
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { logger } from '../logger';
import { notFound, toApiError } from './errors';

/** Невідомий маршрут під /api (щоб не віддавати замість нього index.html). */
export const apiNotFound: RequestHandler = (_req, _res, next) => {
  next(notFound('Метод API не знайдено'));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const { status, body, internal } = toApiError(err);
  const where = { method: req.method, url: req.originalUrl };
  if (internal) logger.error({ err, ...where }, 'Помилка запиту');
  else logger.debug({ code: body.error.code, ...where }, 'Запит відхилено');
  res.status(status).json(body);
};
