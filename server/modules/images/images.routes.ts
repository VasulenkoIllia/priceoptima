// Фото товарів: /api/products/:id/images — ведення, /api/images/:imageId — віддача файлу.
// Обидва маршрути доступні будь-якому користувачу, що увійшов.
import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../http/asyncHandler';
import { validationError } from '../../http/errors';
import { parseBody, parseParams } from '../../http/validate';
import { currentUser, requireAuth } from '../auth/middleware';
import { productIdSchema } from '../products/products.schemas';
import {
  imageIdSchema,
  productImageParamsSchema,
  productImagePatchSchema,
  productImageUrlSchema,
} from './images.schemas';
import { addFeedImage, addUploadedImage, getImageFile, listImages, removeImage, updateImage } from './images.service';
import { MAX_IMAGE_BYTES, MAX_IMAGE_MB } from './images.storage';

/** Файл кешуємо в браузері на добу, але лише для того, хто увійшов (спільні кеші його не тримають). */
const IMAGE_CACHE = 'private, max-age=86400';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  // без цього назва файлу з кирилицею приїжджає як latin1 і псується
  defParamCharset: 'utf8',
});

/** Помилки multer (завеликий файл, не та форма) → звичайна відповідь API. */
function uploadSingle(field: string): RequestHandler {
  const handler = upload.single(field);
  return (req, res, next) => {
    handler(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        const message =
          err.code === 'LIMIT_FILE_SIZE' ? `Файл завеликий (до ${MAX_IMAGE_MB} МБ)` : 'Не вдалося прочитати файл';
        return next(validationError(message));
      }
      return next(err);
    });
  };
}

/** Заголовок If-None-Match може містити перелік міток. */
function matchesEtag(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  return header
    .split(',')
    .map((v) => v.trim().replace(/^W\//u, ''))
    .some((v) => v === etag || v === '*');
}

// ── /api/products/:id/images ────────────────────────────────────────

export const productImagesRouter = Router({ mergeParams: true });

productImagesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { id } = parseParams(productIdSchema, req);
    res.json(await listImages(id));
  }),
);

productImagesRouter.post(
  '/',
  uploadSingle('file'),
  asyncHandler(async (req, res) => {
    const { id } = parseParams(productIdSchema, req);
    const file = req.file;
    if (!file) throw validationError('Додайте файл фото у полі «file»');
    res.status(201).json(await addUploadedImage(id, file, currentUser(req)));
  }),
);

productImagesRouter.post(
  '/from-url',
  asyncHandler(async (req, res) => {
    const { id } = parseParams(productIdSchema, req);
    const { image, created } = await addFeedImage(id, parseBody(productImageUrlSchema, req));
    res.status(created ? 201 : 200).json(image);
  }),
);

productImagesRouter.put(
  '/:imageId',
  asyncHandler(async (req, res) => {
    const { id, imageId } = parseParams(productImageParamsSchema, req);
    res.json(await updateImage(id, imageId, parseBody(productImagePatchSchema, req)));
  }),
);

productImagesRouter.delete(
  '/:imageId',
  asyncHandler(async (req, res) => {
    const { id, imageId } = parseParams(productImageParamsSchema, req);
    await removeImage(id, imageId);
    res.status(204).end();
  }),
);

// ── /api/images ─────────────────────────────────────────────────────

export const imagesRouter = Router();

imagesRouter.get(
  '/:imageId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { imageId } = parseParams(imageIdSchema, req);
    const file = await getImageFile(imageId);
    res.setHeader('Cache-Control', IMAGE_CACHE);
    res.setHeader('ETag', file.etag);
    res.setHeader('Content-Type', file.mimeType);
    if (matchesEtag(req.headers['if-none-match'], file.etag)) {
      res.status(304).end();
      return;
    }
    res.sendFile(file.absolutePath, { cacheControl: false, etag: false, lastModified: false });
  }),
);
