// Блокування редагування заявки (4.10): одна вкладка одного користувача. Блокування живе, поки вкладка шле сигнал
// (раз на lockHeartbeatSeconds); без сигналу понад lockTtlSeconds його може взяти інший. Поки ж ніхто не взяв —
// запис лишається за вкладкою, і вона (після сну ноутбука чи у фоні) продовжує роботу. Адміністратор може забрати собі.
import { Prisma, type RequestLock, type User } from '@prisma/client';
import type { LockInfo, LockStatusResponse, UUID } from '@shared/types';
import { prisma } from '../../db';
import { ApiError, notFound } from '../../http/errors';
import { userRefs } from '../audit/audit.service';
import { getSettings } from '../settings/settings.service';
import { onUserBlocked } from '../users/users.service';
import { toLockInfo } from './requests.mapper';

type Db = Prisma.TransactionClient | typeof prisma;

async function ttlMs(): Promise<number> {
  return (await getSettings()).lockTtlSeconds * 1000;
}

async function lockInfoOf(lock: RequestLock | null, actor: User, sessionId: string | null): Promise<LockInfo | null> {
  if (!lock) return null;
  return toLockInfo(lock, await userRefs([lock.userId]), actor.id, sessionId);
}

/** Чинне блокування заявки (протерміноване вважаємо відсутнім). */
export async function activeLock(requestId: UUID, now = new Date(), db: Db = prisma): Promise<RequestLock | null> {
  const lock = await db.requestLock.findUnique({ where: { requestId } });
  return lock && lock.expiresAt > now ? lock : null;
}

export async function acquireLock(requestId: UUID, actor: User, sessionId: string, now = new Date()): Promise<{ acquired: boolean; lock: LockInfo | null }> {
  const request = await prisma.request.findUnique({ where: { id: requestId }, select: { id: true } });
  if (!request) throw notFound('Заявку не знайдено');
  const expiresAt = new Date(now.getTime() + (await ttlMs()));
  await prisma.requestLock.deleteMany({ where: { requestId, expiresAt: { lte: now } } });
  try {
    const lock = await prisma.requestLock.create({ data: { requestId, userId: actor.id, sessionId, lockedAt: now, expiresAt } });
    return { acquired: true, lock: await lockInfoOf(lock, actor, sessionId) };
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
  }
  // блокування вже є: наше (та сама вкладка) — продовжуємо, чуже — показуємо, хто редагує
  const current = await prisma.requestLock.findUnique({ where: { requestId } });
  if (current && current.userId === actor.id && current.sessionId === sessionId) {
    const lock = await prisma.requestLock.update({ where: { requestId }, data: { expiresAt } });
    return { acquired: true, lock: await lockInfoOf(lock, actor, sessionId) };
  }
  return { acquired: false, lock: await lockInfoOf(current, actor, sessionId) };
}

/** Сигнал вкладки: продовжує блокування; LOCK_LOST — його взяв інший або забрав адміністратор. */
export async function heartbeatLock(requestId: UUID, actor: User, sessionId: string, now = new Date()): Promise<LockInfo> {
  const expiresAt = new Date(now.getTime() + (await ttlMs()));
  const { count } = await prisma.requestLock.updateMany({ where: { requestId, userId: actor.id, sessionId }, data: { expiresAt } });
  if (count !== 1) throw await lockLost(requestId, actor, sessionId, now);
  const lock = await prisma.requestLock.findUnique({ where: { requestId } });
  return (await lockInfoOf(lock, actor, sessionId))!;
}

export async function releaseLock(requestId: UUID, actor: User, sessionId: string): Promise<void> {
  await prisma.requestLock.deleteMany({ where: { requestId, userId: actor.id, sessionId } });
}

/** Адміністратор забирає редагування собі; власник дізнається при наступному сигналі чи збереженні. */
export async function forceLock(requestId: UUID, admin: User, sessionId: string, now = new Date()): Promise<{ lock: LockInfo; previous: RequestLock | null }> {
  const request = await prisma.request.findUnique({ where: { id: requestId }, select: { id: true } });
  if (!request) throw notFound('Заявку не знайдено');
  const expiresAt = new Date(now.getTime() + (await ttlMs()));
  const previous = await activeLock(requestId, now);
  const lock = await prisma.requestLock.upsert({
    where: { requestId },
    create: { requestId, userId: admin.id, sessionId, lockedAt: now, expiresAt },
    update: { userId: admin.id, sessionId, lockedAt: now, expiresAt },
  });
  return { lock: (await lockInfoOf(lock, admin, sessionId))!, previous: previous && previous.sessionId !== sessionId ? previous : null };
}

export async function lockStatus(requestId: UUID, actor: User, sessionId: string | null, now = new Date()): Promise<LockStatusResponse> {
  const request = await prisma.request.findUnique({ where: { id: requestId }, select: { version: true, status: true, updatedAt: true } });
  if (!request) throw notFound('Заявку не знайдено');
  return {
    lock: await lockInfoOf(await activeLock(requestId, now), actor, sessionId),
    version: request.version,
    status: request.status,
    updatedAt: request.updatedAt.toISOString(),
  };
}

/** Зміни приймаються лише від вкладки, за якою запис блокування (БЛК-4; строк міг минути, якщо ніхто не взяв). */
export async function assertLockHolder(db: Db, requestId: UUID, actor: User, sessionId: string, now = new Date()): Promise<void> {
  const lock = await db.requestLock.findUnique({ where: { requestId } });
  if (lock && lock.userId === actor.id && lock.sessionId === sessionId) return;
  throw await lockLost(requestId, actor, sessionId, now, db);
}

async function lockLost(requestId: UUID, actor: User, sessionId: string, now: Date, db: Db = prisma): Promise<ApiError> {
  const holder = await activeLock(requestId, now, db);
  const info = await lockInfoOf(holder, actor, sessionId);
  return new ApiError(
    'LOCK_LOST',
    info ? `Заявку зараз редагує ${info.userShortName}, зміни не збережено` : 'Редагування заявки втрачено, відкрийте її знову',
    { lock: info },
  );
}

// заблокований користувач звільняє всі свої заявки
onUserBlocked(async (userId) => {
  await prisma.requestLock.deleteMany({ where: { userId } });
});
