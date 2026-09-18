// Журнал дій: хто, коли, що зробив. Запис — «найкраща спроба»: збій журналу не скасовує саму дію.
import type { Prisma } from '@prisma/client';
import type { AuditEventDto, AuditPage, UserRef } from '@shared/types';
import { prisma } from '../../db';
import { logger } from '../../logger';
import type { AuditQueryInput } from './audit.schemas';

/** Тип запису, щоб у картці показати його історію: 'client' + id, 'supplier' + id тощо. */
export type AuditEntity = 'user' | 'settings' | 'own_company' | 'supplier' | 'client' | 'product' | 'rate' | 'request';

export interface AuditEntry {
  userId: string | null;
  /** 'user.invite', 'supplier.update', 'product.price' … */
  action: string;
  entityType?: AuditEntity | null;
  entityId?: string | null;
  /** Рядок для людини: «Запрошено користувача (роль Користувач)». */
  summary: string;
  details?: Prisma.InputJsonValue;
}

type Db = Pick<typeof prisma, 'auditEvent'> | Prisma.TransactionClient;

export async function audit(entry: AuditEntry, db: Db = prisma): Promise<void> {
  try {
    await db.auditEvent.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        summary: entry.summary.slice(0, 500),
        details: entry.details,
      },
    });
  } catch (e) {
    logger.error({ err: e, action: entry.action }, 'Не вдалося записати подію журналу');
  }
}

/** Короткі імена користувачів за id (для журналу й «хто змінив»). */
export async function userRefs(ids: readonly (string | null | undefined)[]): Promise<Map<string, UserRef>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, shortName: true } });
  return new Map(users.map((u) => [u.id, { id: u.id, shortName: u.shortName }]));
}

const DEFAULT_LIMIT = 100;

export async function listAudit(query: AuditQueryInput): Promise<AuditPage> {
  const limit = Math.min(query.limit ?? DEFAULT_LIMIT, 500);
  const rows = await prisma.auditEvent.findMany({
    where: {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.before ? { id: { lt: BigInt(query.before) } } : {}),
    },
    orderBy: { id: 'desc' },
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  const users = await userRefs(page.map((r) => r.userId));
  const items: AuditEventDto[] = page.map((r) => ({
    id: r.id.toString(),
    at: r.at.toISOString(),
    user: r.userId ? (users.get(r.userId) ?? { id: r.userId, shortName: '—' }) : null,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    summary: r.summary,
  }));
  return { items, nextBefore: rows.length > limit ? page[page.length - 1].id.toString() : null };
}
