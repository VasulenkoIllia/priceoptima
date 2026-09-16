// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  isSessionExpired,
  newSessionToken,
  sessionExpiry,
  sessionIdOf,
  shouldExtendSession,
} from '../modules/auth/sessions';

const DAY = 24 * 60 * 60 * 1000;
const TTL = 30 * DAY;
const NOW = new Date('2026-09-16T10:00:00.000Z');

describe('токен сесії', () => {
  it('щоразу новий і придатний для cookie', () => {
    const a = newSessionToken();
    const b = newSessionToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[\w-]{40,}$/u);
  });

  it('у базі лежить хеш токена, а не сам токен', () => {
    const token = newSessionToken();
    const id = sessionIdOf(token);
    expect(id).toHaveLength(64);
    expect(id).not.toContain(token);
    expect(sessionIdOf(token)).toBe(id);
    expect(sessionIdOf(newSessionToken())).not.toBe(id);
  });
});

describe('строк життя сесії', () => {
  it('нова сесія живе TTL від моменту входу', () => {
    expect(sessionExpiry(NOW, TTL).toISOString()).toBe('2026-10-16T10:00:00.000Z');
  });

  it('протермінована — це строк у минулому або рівно зараз', () => {
    expect(isSessionExpired(new Date(NOW.getTime() - 1), NOW)).toBe(true);
    expect(isSessionExpired(new Date(NOW.getTime()), NOW)).toBe(true);
    expect(isSessionExpired(new Date(NOW.getTime() + 1), NOW)).toBe(false);
  });

  it('продовжуємо, лише коли лишилося менше половини строку', () => {
    const fresh = new Date(NOW.getTime() + 20 * DAY);
    const half = new Date(NOW.getTime() + 15 * DAY);
    const almostGone = new Date(NOW.getTime() + 2 * DAY);
    expect(shouldExtendSession(fresh, NOW, TTL)).toBe(false);
    expect(shouldExtendSession(half, NOW, TTL)).toBe(false);
    expect(shouldExtendSession(almostGone, NOW, TTL)).toBe(true);
  });

  it('протерміновану сесію не продовжуємо', () => {
    expect(shouldExtendSession(new Date(NOW.getTime() - DAY), NOW, TTL)).toBe(false);
  });
});
