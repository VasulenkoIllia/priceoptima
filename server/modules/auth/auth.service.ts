// Вхід, сесія і вихід. Сесія живе в базі, у браузері — лише httpOnly-cookie з токеном.
import type { Session, User } from '@prisma/client';
import { config } from '../../config';
import { prisma } from '../../db';
import { logger } from '../../logger';
import { unauthorized } from '../../http/errors';
import { verifyPassword } from './password';
import { isSessionExpired, newSessionToken, sessionExpiry, sessionIdOf, shouldExtendSession } from './sessions';

export interface SessionUser {
  user: User;
  session: Session;
}

export interface SessionMeta {
  ip?: string | null;
  userAgent?: string | null;
}

/** Перевіряє логін і пароль; повертає користувача або кидає UNAUTHORIZED. */
export async function authenticate(login: string, password: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { login } });
  // пароль перевіряємо навіть для невідомого логіна, щоб відповідь не підказувала, хто є в системі
  const ok = await verifyPassword(user?.passwordHash, password);
  if (!user || !user.isActive || !ok) throw unauthorized('Невірний логін або пароль');
  return user;
}

/** Створює сесію: повертає токен для cookie й користувача з оновленим часом входу. */
export async function startSession(
  user: User,
  meta: SessionMeta,
  now = new Date(),
): Promise<{ token: string; user: User }> {
  const token = newSessionToken();
  await prisma.session.create({
    data: {
      id: sessionIdOf(token),
      userId: user.id,
      expiresAt: sessionExpiry(now, config.sessionTtlMs),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    },
  });
  const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
  return { token, user: updated };
}

/** Сесія за токеном із cookie; протерміновану одразу прибираємо. */
export async function resolveSession(token: string, now = new Date()): Promise<SessionUser | null> {
  const id = sessionIdOf(token);
  const found = await prisma.session.findUnique({ where: { id }, include: { user: true } });
  if (!found) return null;
  const { user, ...session } = found;
  if (isSessionExpired(session.expiresAt, now) || !user.isActive) {
    await endSession(token);
    return null;
  }
  if (shouldExtendSession(session.expiresAt, now, config.sessionTtlMs)) {
    const expiresAt = sessionExpiry(now, config.sessionTtlMs);
    await prisma.session.update({ where: { id }, data: { expiresAt } });
    return { user, session: { ...session, expiresAt } };
  }
  return { user, session };
}

export async function endSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionIdOf(token) } });
}

/** Прибирання протермінованих сесій (за розкладом). */
export async function sweepExpiredSessions(now = new Date()): Promise<number> {
  const { count } = await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  if (count > 0) logger.debug({ count }, 'Прибрано протерміновані сесії');
  return count;
}
