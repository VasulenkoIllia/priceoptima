// Строк життя сесії — чиста логіка, без бази й express (зручно перевіряти тестами).
// У cookie лежить випадковий токен, у базі — його SHA-256: викрадений дамп бази не дає увійти.
import { createHash, randomBytes } from 'node:crypto';

/** Ім'я cookie сесії. */
export const SESSION_COOKIE = 'po_session';

/** Новий токен сесії (32 випадкові байти). */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Ідентифікатор рядка Session у базі за токеном із cookie. */
export function sessionIdOf(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function sessionExpiry(now: Date, ttlMs: number): Date {
  return new Date(now.getTime() + ttlMs);
}

export function isSessionExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/**
 * Сесія «ковзна»: продовжуємо її під час роботи, але не на кожному запиті —
 * лише коли лишилося менше половини строку (щоб не писати в базу постійно).
 */
export function shouldExtendSession(expiresAt: Date, now: Date, ttlMs: number): boolean {
  if (isSessionExpired(expiresAt, now)) return false;
  return expiresAt.getTime() - now.getTime() < ttlMs / 2;
}
