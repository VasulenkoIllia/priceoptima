// Разові посилання (запрошення, скидання пароля) — чиста логіка без бази.
// У посиланні — випадковий токен, у базі — лише його SHA-256: витік бази не дає скористатися посиланням.
import { createHash, randomBytes } from 'node:crypto';

/** Запрошення діє 7 днів (рішення 18.09), скидання пароля — добу. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 24 * 60 * 60 * 1000;

export function newLinkToken(): string {
  return randomBytes(32).toString('base64url');
}

export function linkTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type LinkState = 'valid' | 'used' | 'revoked' | 'expired';

export function linkState(link: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date }, now: Date): LinkState {
  if (link.usedAt) return 'used';
  if (link.revokedAt) return 'revoked';
  if (link.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'valid';
}

export const LINK_STATE_MESSAGES: Record<Exclude<LinkState, 'valid'>, string> = {
  used: 'Цим посиланням уже скористалися. Попросіть адміністратора надіслати нове',
  revoked: 'Посилання скасовано. Попросіть адміністратора надіслати нове',
  expired: 'Строк дії посилання минув. Попросіть адміністратора надіслати нове',
};
