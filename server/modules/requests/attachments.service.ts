// Файли заявки (лист чи Excel від клієнта, специфікація, рахунок): на диску uploads/requests/<заявка>/<uuid>,
// у базі — назва, тип і хто додав. Додає й прибирає лише той, хто редагує заявку; віддаємо завжди як завантаження.
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { RequestAttachment, User } from '@prisma/client';
import { ATTACHMENT_KINDS, REQUEST_STATUS_LABELS, type AttachmentKind } from '@shared/enums';
import { isEditableStatus } from '@shared/status';
import type { AttachmentDto, UserRef, UUID } from '@shared/types';
import { config } from '../../config';
import { prisma } from '../../db';
import { ApiError, notFound, validationError } from '../../http/errors';
import { oneOf } from '../../lib/mapping';
import { userRefs } from '../audit/audit.service';
import { removeImageFile, resolveStoredPath, safeFileName, saveImageFile } from '../images/images.storage';
import { assertLockHolder } from './locks.service';

export const MAX_ATTACHMENT_MB = 20;
export const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 200;

export interface UploadedFile {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
}

function toDto(a: RequestAttachment, users: Map<string, UserRef>): AttachmentDto {
  return {
    id: a.id,
    requestId: a.requestId,
    kind: oneOf(ATTACHMENT_KINDS, a.kind, 'other'),
    originalFilename: a.originalFilename,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    note: a.note,
    kpDocumentId: null,
    uploadedBy: a.uploadedById ? (users.get(a.uploadedById) ?? null) : null,
    createdAt: a.createdAt.toISOString(),
    downloadUrl: `/api/requests/${a.requestId}/files/${a.id}`,
  };
}

const safeMime = (m: string | undefined) => (m && /^[\w.+-]+\/[\w.+-]+$/u.test(m) && m.length <= 120 ? m : 'application/octet-stream');

/** Файли заявки, від найновішого. */
export async function listAttachments(requestId: UUID): Promise<AttachmentDto[]> {
  const exists = await prisma.request.findUnique({ where: { id: requestId }, select: { id: true } });
  if (!exists) throw notFound('Заявку не знайдено');
  const rows = await prisma.requestAttachment.findMany({ where: { requestId }, orderBy: { createdAt: 'desc' } });
  const users = await userRefs(rows.map((a) => a.uploadedById));
  return rows.map((a) => toDto(a, users));
}

async function assertCanEdit(requestId: UUID, actor: User, sessionId: string, now: Date): Promise<void> {
  const r = await prisma.request.findUnique({ where: { id: requestId }, select: { status: true } });
  if (!r) throw notFound('Заявку не знайдено');
  if (!isEditableStatus(r.status)) throw new ApiError('READ_ONLY', `Заявка в статусі «${REQUEST_STATUS_LABELS[r.status]}» — лише перегляд`);
  await assertLockHolder(prisma, requestId, actor, sessionId, now);
}

export async function addAttachment(
  requestId: UUID,
  file: UploadedFile,
  input: { kind?: string; note?: string },
  actor: User,
  sessionId: string,
  now = new Date(),
): Promise<AttachmentDto> {
  if (!file.buffer.length) throw validationError('Файл порожній');
  if (file.buffer.length > MAX_ATTACHMENT_BYTES) throw validationError(`Файл завеликий — до ${MAX_ATTACHMENT_MB} МБ`);
  await assertCanEdit(requestId, actor, sessionId, now);
  const count = await prisma.requestAttachment.count({ where: { requestId } });
  if (count >= MAX_FILES_PER_REQUEST) throw validationError(`У заявці вже ${MAX_FILES_PER_REQUEST} файлів — приберіть зайві`);

  const id = randomUUID();
  const name = safeFileName(file.originalname) ?? 'файл';
  const kind: AttachmentKind = oneOf(ATTACHMENT_KINDS, input.kind ?? '', 'client_request');
  const storagePath = path.posix.join('requests', requestId, id);
  await saveImageFile(config.uploadsDir, storagePath, file.buffer);
  try {
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.requestAttachment.create({
        data: {
          id,
          requestId,
          kind,
          originalFilename: name,
          mimeType: safeMime(file.mimetype),
          sizeBytes: file.buffer.length,
          storagePath,
          note: input.note?.trim().slice(0, 500) || null,
          uploadedById: actor.id,
          createdAt: now,
        },
      });
      await tx.request.update({ where: { id: requestId }, data: { filesCount: { increment: 1 }, updatedAt: now, updatedById: actor.id } });
      await tx.requestEvent.create({ data: { requestId, at: now, userId: actor.id, kind: 'files', summary: `Додано файл «${name}»` } });
      return created;
    });
    return toDto(row, new Map([[actor.id, { id: actor.id, shortName: actor.shortName }]]));
  } catch (e) {
    await removeImageFile(config.uploadsDir, storagePath);
    throw e;
  }
}

export async function removeAttachment(requestId: UUID, fileId: UUID, actor: User, sessionId: string, now = new Date()): Promise<void> {
  await assertCanEdit(requestId, actor, sessionId, now);
  const row = await prisma.requestAttachment.findFirst({ where: { id: fileId, requestId } });
  if (!row) throw notFound('Файл не знайдено');
  await prisma.$transaction(async (tx) => {
    await tx.requestAttachment.delete({ where: { id: row.id } });
    await tx.request.update({ where: { id: requestId }, data: { filesCount: { decrement: 1 }, updatedAt: now, updatedById: actor.id } });
    await tx.requestEvent.create({ data: { requestId, at: now, userId: actor.id, kind: 'files', summary: `Прибрано файл «${row.originalFilename}»` } });
  });
  await removeImageFile(config.uploadsDir, row.storagePath);
}

/** Файл для віддачі: шлях лише з бази й лише всередині сховища. */
export async function attachmentFile(requestId: UUID, fileId: UUID): Promise<{ absolutePath: string; filename: string }> {
  const row = await prisma.requestAttachment.findFirst({ where: { id: fileId, requestId } });
  if (!row) throw notFound('Файл не знайдено');
  return { absolutePath: resolveStoredPath(config.uploadsDir, row.storagePath), filename: row.originalFilename };
}
