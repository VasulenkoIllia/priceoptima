// /api/requests — заявки: реєстр, документ, збереження дельти, статус, копія, КП, історія, файли, блокування.
// Працюють обидві ролі; забрати редагування в іншого може лише адміністратор. Вкладку визначає заголовок X-Session-Id.
import express, { Router, type Request, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { asyncHandler } from '../../http/asyncHandler';
import { validationError } from '../../http/errors';
import { parse, parseBody, parseParams, parseQuery } from '../../http/validate';
import { currentUser, requireAdmin, requireAuth } from '../auth/middleware';
import { addAttachment, attachmentFile, listAttachments, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_MB, removeAttachment } from './attachments.service';
import { createKp, listKps } from './kp.service';
import { acquireLock, forceLock, heartbeatLock, lockStatus, releaseLock } from './locks.service';
import {
  attachmentIdSchema,
  copyRequestSchema,
  createRequestSchema,
  documentPatchSchema,
  kpCreateSchema,
  requestIdSchema,
  requestListQuerySchema,
  requestPageQuerySchema,
  statusChangeSchema,
} from './requests.schemas';
import {
  changeStatus,
  copyRequest,
  createRequest,
  getRequestDocument,
  getRequestHistory,
  listRequests,
  listRequestsPage,
  recordLockForce,
  saveRequestDocument,
} from './requests.service';

const sessionHeaderSchema = z.string().trim().min(1, 'Немає ідентифікатора вкладки').max(64);

/** Ідентифікатор вкладки з заголовка (обов'язковий для блокувань і файлів). */
function sessionOf(req: Request): string {
  return parse(sessionHeaderSchema, req.get('x-session-id') ?? '');
}

const optionalSessionOf = (req: Request): string | null => req.get('x-session-id')?.trim().slice(0, 64) || null;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1, fields: 5 },
  defParamCharset: 'utf8',
});

function uploadSingle(field: string): RequestHandler {
  const handler = upload.single(field);
  return (req, res, next) => {
    handler(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        return next(validationError(err.code === 'LIMIT_FILE_SIZE' ? `Файл завеликий (до ${MAX_ATTACHMENT_MB} МБ)` : 'Не вдалося прочитати файл'));
      }
      return next(err);
    });
  };
}

const uploadFieldsSchema = z.object({ kind: z.string().max(40).optional(), note: z.string().max(500).optional() });

/**
 * Збереження заявки — дельта змін одним JSON: імпорт кількох тисяч рядків або масова зміна пропозицій буває понад 1 МБ.
 * Загальний парсер /api цей маршрут пропускає (http/bodyLimits); тут він після requireAuth.
 */
export const REQUEST_DOC_JSON_MB = 15;
const requestDocJsonParser = express.json({ limit: `${REQUEST_DOC_JSON_MB}mb` });

export const requestsRouter = Router();
requestsRouter.use(requireAuth);

// ── реєстр і створення ────────────────────────────────────────────
requestsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await listRequests(parseQuery(requestListQuerySchema, req), currentUser(req), optionalSessionOf(req)));
  }),
);

requestsRouter.get(
  '/page',
  asyncHandler(async (req, res) => {
    res.json(await listRequestsPage(parseQuery(requestPageQuerySchema, req), currentUser(req), optionalSessionOf(req)));
  }),
);

requestsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    res.status(201).json(await createRequest(parseBody(createRequestSchema, req), currentUser(req)));
  }),
);

// ── документ ──────────────────────────────────────────────────────
requestsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseParams(requestIdSchema, req);
    res.json(await getRequestDocument(id, currentUser(req), optionalSessionOf(req)));
  }),
);

requestsRouter.patch(
  '/:id',
  requestDocJsonParser,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(requestIdSchema, req);
    res.json(await saveRequestDocument(id, parseBody(documentPatchSchema, req), currentUser(req)));
  }),
);

requestsRouter.post(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const { id } = parseParams(requestIdSchema, req);
    res.json(await changeStatus(id, parseBody(statusChangeSchema, req), currentUser(req)));
  }),
);

requestsRouter.post(
  '/:id/copy',
  asyncHandler(async (req, res) => {
    const { id } = parseParams(requestIdSchema, req);
    res.status(201).json(await copyRequest(id, parseBody(copyRequestSchema, req), currentUser(req)));
  }),
);

requestsRouter.get(
  '/:id/history',
  asyncHandler(async (req, res) => {
    const { id } = parseParams(requestIdSchema, req);
    res.json(await getRequestHistory(id));
  }),
);

// ── КП ────────────────────────────────────────────────────────────
requestsRouter.get(
  '/:id/kps',
  asyncHandler(async (req, res) => {
    const { id } = parseParams(requestIdSchema, req);
    res.json(await listKps(id));
  }),
);

requestsRouter.post(
  '/:id/kps',
  asyncHandler(async (req, res) => {
    const { id } = parseParams(requestIdSchema, req);
    res.status(201).json(await createKp(id, parseBody(kpCreateSchema, req), currentUser(req)));
  }),
);

// ── файли ─────────────────────────────────────────────────────────
requestsRouter.get(
  '/:id/files',
  asyncHandler(async (req, res) => {
    const { id } = parseParams(requestIdSchema, req);
    res.json(await listAttachments(id));
  }),
);

requestsRouter.post(
  '/:id/files',
  uploadSingle('file'),
  asyncHandler(async (req, res) => {
    const { id } = parseParams(requestIdSchema, req);
    if (!req.file) throw validationError('Додайте файл у полі «file»');
    const fields = parse(uploadFieldsSchema, req.body ?? {});
    res.status(201).json(await addAttachment(id, req.file, fields, currentUser(req), sessionOf(req)));
  }),
);

requestsRouter.get(
  '/:id/files/:fileId',
  asyncHandler(async (req, res) => {
    const { id, fileId } = parseParams(attachmentIdSchema, req);
    const file = await attachmentFile(id, fileId);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // завжди як завантаження й без типу за розширенням: вміст від клієнта в браузері не відкриваємо
    res.setHeader('Content-Type', 'application/octet-stream');
    res.download(file.absolutePath, file.filename, { dotfiles: 'allow' });
  }),
);

requestsRouter.delete(
  '/:id/files/:fileId',
  asyncHandler(async (req, res) => {
    const { id, fileId } = parseParams(attachmentIdSchema, req);
    await removeAttachment(id, fileId, currentUser(req), sessionOf(req));
    res.status(204).end();
  }),
);

// ── блокування (§6.11) ────────────────────────────────────────────
requestsRouter.get(
  '/:id/lock',
  asyncHandler(async (req, res) => {
    const { id } = parseParams(requestIdSchema, req);
    res.json(await lockStatus(id, currentUser(req), optionalSessionOf(req)));
  }),
);

requestsRouter.post(
  '/:id/lock',
  asyncHandler(async (req, res) => {
    const { id } = parseParams(requestIdSchema, req);
    res.json(await acquireLock(id, currentUser(req), sessionOf(req)));
  }),
);

requestsRouter.post(
  '/:id/lock/heartbeat',
  asyncHandler(async (req, res) => {
    const { id } = parseParams(requestIdSchema, req);
    res.json(await heartbeatLock(id, currentUser(req), sessionOf(req)));
  }),
);

requestsRouter.delete(
  '/:id/lock',
  asyncHandler(async (req, res) => {
    const { id } = parseParams(requestIdSchema, req);
    await releaseLock(id, currentUser(req), sessionOf(req));
    res.status(204).end();
  }),
);

requestsRouter.post(
  '/:id/lock/force',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(requestIdSchema, req);
    const admin = currentUser(req);
    const { lock, previous } = await forceLock(id, admin, sessionOf(req));
    if (previous) await recordLockForce(id, admin, previous.userId);
    res.json(lock);
  }),
);
