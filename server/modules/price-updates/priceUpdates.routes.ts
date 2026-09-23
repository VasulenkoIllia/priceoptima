// /api/price-updates — журнал оновлень прайсів, оновлення за посиланням і прайс файлом.
// Доступно будь-якому користувачу, що увійшов.
import express, { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../http/asyncHandler';
import { validationError } from '../../http/errors';
import { parseBody, parseParams, parseQuery } from '../../http/validate';
import { currentUser, requireAuth } from '../auth/middleware';
import { safeFileName } from '../images/images.storage';
import {
  importBodyFromForm,
  parseImportBody,
  priceUpdateIdSchema,
  priceUpdatesQuerySchema,
  runBodySchema,
} from './priceUpdates.schemas';
import { getPriceUpdate, importPriceRows, listPriceUpdates, runFeedUpdate } from './priceUpdates.service';

export const MAX_PRICE_FILE_MB = 25;
/** Рядки прайсу JSON-ом: 20 тис. позицій — кілька мегабайт, межа із запасом. */
export const MAX_PRICE_ROWS_MB = 100;

/**
 * JSON-парсер із більшою межею саме для завантаження прайсу: загальний парсер /api обмежений 1 МБ і цей маршрут пропускає
 * (http/bodyLimits). Стоїть у маршруті після requireAuth — тіло розбирається лише для того, хто увійшов.
 */
export const priceImportJsonParser: RequestHandler = express.json({ limit: `${MAX_PRICE_ROWS_MB}mb` });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PRICE_FILE_MB * 1024 * 1024,
    fieldSize: MAX_PRICE_ROWS_MB * 1024 * 1024,
    files: 1,
    fields: 20,
  },
  // без цього назва файлу з кирилицею приїжджає як latin1 і псується
  defParamCharset: 'utf8',
});

/** Форма multipart із необов'язковим файлом «file»; JSON-запит проходить далі як є. */
const priceForm: RequestHandler = (req, res, next) => {
  if (!req.is('multipart/form-data')) return next();
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `Файл прайсу завеликий (до ${MAX_PRICE_FILE_MB} МБ)`
          : err.code === 'LIMIT_FIELD_VALUE'
            ? `Забагато рядків прайсу (до ${MAX_PRICE_ROWS_MB} МБ даних за раз)`
            : 'Не вдалося прочитати форму з прайсом';
      return next(validationError(message));
    }
    return next(err);
  });
};

export const priceUpdatesRouter = Router();

priceUpdatesRouter.use(requireAuth);

priceUpdatesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await listPriceUpdates(parseQuery(priceUpdatesQuerySchema, req)));
  }),
);

priceUpdatesRouter.post(
  '/run',
  asyncHandler(async (req, res) => {
    const body = parseBody(runBodySchema, req);
    const result = await runFeedUpdate(body.supplierId, { user: currentUser(req), dryRun: body.dryRun });
    res.status(body.dryRun ? 200 : 201).json(result);
  }),
);

priceUpdatesRouter.post(
  '/import',
  priceImportJsonParser,
  priceForm,
  asyncHandler(async (req, res) => {
    const file = req.file ?? null;
    const raw = req.is('multipart/form-data')
      ? importBodyFromForm((req.body ?? {}) as Record<string, unknown>, safeFileName(file?.originalname))
      : req.body;
    const body = parseImportBody(raw ?? {});
    const result = await importPriceRows(body, currentUser(req), file);
    res.status(body.dryRun ? 200 : 201).json(result);
  }),
);

priceUpdatesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseParams(priceUpdateIdSchema, req);
    res.json(await getPriceUpdate(id));
  }),
);
