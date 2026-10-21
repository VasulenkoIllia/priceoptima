// «Довідник» (правки замовника 21.10, п.11): аркуші бачать і правлять усі користувачі. Аркуш зберігається цілком
// з перевіркою версії, щоб чужі правки не зникали мовчки. У журнал дій — створення, перейменування й видалення;
// видалений аркуш записується в журнал цілком у тій самій транзакції, щоб його можна було відновити.
import type { Prisma, User } from '@prisma/client';
import { REFERENCE_MAX_SHEETS } from '@shared/reference/limits';
import type { ReferenceSheetDto, ReferenceSheetMeta } from '@shared/types';
import { prisma } from '../../db';
import { notFound, validationError } from '../../http/errors';
import { expectedVersion, staleCardError } from '../../lib/cardVersion';
import { audit, userRefs } from '../audit/audit.service';
import { toReferenceSheetDto, toReferenceSheetMeta } from './reference.mapper';
import type { ReferenceSheetInputBody } from './reference.schemas';

const ORDER: Prisma.ReferenceSheetOrderByWithRelationInput[] = [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }];
const META_SELECT = { id: true, version: true, title: true, sortOrder: true, updatedAt: true, updatedById: true } as const;

const contentOf = (input: ReferenceSheetInputBody) => ({ title: input.title, columns: input.columns, rows: input.rows });

/** Вкладки: лише назви й версії, без вмісту (список перечитується, поки сторінка відкрита). */
export async function listReferenceSheets(): Promise<ReferenceSheetMeta[]> {
  const rows = await prisma.referenceSheet.findMany({ select: META_SELECT, orderBy: ORDER, take: REFERENCE_MAX_SHEETS });
  const users = await userRefs(rows.map((r) => r.updatedById));
  return rows.map((r) => toReferenceSheetMeta(r, users));
}

export async function getReferenceSheet(id: string): Promise<ReferenceSheetDto> {
  const row = await prisma.referenceSheet.findUnique({ where: { id } });
  if (!row) throw notFound('Аркуш не знайдено');
  return toReferenceSheetDto(row, await userRefs([row.updatedById]));
}

/** Новий аркуш — останнім. Межу кількості для 2–5 користувачів перевіряємо без блокування. */
export async function createReferenceSheet(input: ReferenceSheetInputBody, actor: User): Promise<ReferenceSheetDto> {
  const id = await prisma.$transaction(async (tx) => {
    if ((await tx.referenceSheet.count()) >= REFERENCE_MAX_SHEETS) throw validationError(`Забагато аркушів (до ${REFERENCE_MAX_SHEETS})`);
    const last = await tx.referenceSheet.aggregate({ _max: { sortOrder: true } });
    const row = await tx.referenceSheet.create({
      data: { ...contentOf(input), sortOrder: (last._max.sortOrder ?? -1) + 1, createdById: actor.id, updatedById: actor.id },
    });
    return row.id;
  });
  await audit({ userId: actor.id, action: 'reference.create', entityType: 'reference', entityId: id, summary: `Додано аркуш довідника «${input.title}»` });
  return getReferenceSheet(id);
}

/** Зберегти аркуш цілком: лише з версією, яку бачив користувач. Відповідь читаємо в тій самій транзакції,
 *  щоб клієнт не отримав чужу версію з нашим вмістом. */
export async function updateReferenceSheet(id: string, input: ReferenceSheetInputBody, actor: User): Promise<ReferenceSheetDto> {
  const version = expectedVersion(input);
  if (version == null) throw validationError('Не вказано версію аркуша. Оновіть сторінку');
  const { before, after } = await prisma.$transaction(async (tx) => {
    const current = await tx.referenceSheet.findUnique({ where: { id }, select: { title: true } });
    if (!current) throw notFound('Аркуш не знайдено');
    const saved = await tx.referenceSheet.updateMany({
      where: { id, version },
      data: { ...contentOf(input), updatedById: actor.id, version: { increment: 1 } },
    });
    if (saved.count !== 1) {
      throw await staleCardError('Аркуш', await tx.referenceSheet.findUnique({ where: { id }, select: { version: true, updatedById: true, updatedAt: true } }));
    }
    return { before: current.title, after: await tx.referenceSheet.findUniqueOrThrow({ where: { id } }) };
  });
  if (before !== input.title) {
    await audit({
      userId: actor.id,
      action: 'reference.rename',
      entityType: 'reference',
      entityId: id,
      summary: `Аркуш довідника «${before}» перейменовано на «${input.title}»`,
    });
  }
  return toReferenceSheetDto(after, await userRefs([after.updatedById]));
}

export async function deleteReferenceSheet(id: string, actor: User): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const row = await tx.referenceSheet.findUnique({ where: { id } });
    if (!row) throw notFound('Аркуш не знайдено');
    if ((await tx.referenceSheet.deleteMany({ where: { id } })).count !== 1) throw notFound('Аркуш не знайдено');
    // не audit(): той ковтає збій, а без копії в журналі аркуш видаляти не можна
    await tx.auditEvent.create({
      data: {
        userId: actor.id,
        action: 'reference.delete',
        entityType: 'reference',
        entityId: id,
        summary: `Видалено аркуш довідника «${row.title}»`.slice(0, 500),
        details: { title: row.title, columns: row.columns ?? [], rows: row.rows ?? [] },
      },
    });
  });
}
