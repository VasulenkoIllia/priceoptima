// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { shortNameOf } from '@shared/format';
import { linkState, linkTokenHash, newLinkToken } from '../modules/access/access.rules';

describe('разові посилання', () => {
  it('токен випадковий, у базі — його хеш', () => {
    const a = newLinkToken();
    expect(a).not.toBe(newLinkToken());
    expect(a.length).toBeGreaterThan(40);
    expect(linkTokenHash(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(linkTokenHash(a)).toBe(linkTokenHash(a));
  });

  it('стан: дійсне / використане / скасоване / прострочене', () => {
    const now = new Date('2026-09-18T12:00:00Z');
    const base = { usedAt: null, revokedAt: null, expiresAt: new Date('2026-09-25T12:00:00Z') };
    expect(linkState(base, now)).toBe('valid');
    expect(linkState({ ...base, usedAt: now }, now)).toBe('used');
    expect(linkState({ ...base, revokedAt: now }, now)).toBe('revoked');
    expect(linkState({ ...base, expiresAt: now }, now)).toBe('expired');
  });
});

describe('коротке ім’я з ПІБ', () => {
  it('прізвище й ініціали', () => {
    expect(shortNameOf('Коваль Олена Василівна')).toBe('Коваль О.В.');
    expect(shortNameOf('  бондар   ігор ')).toBe('бондар І.');
    expect(shortNameOf('Адміністратор')).toBe('Адміністратор');
    expect(shortNameOf('')).toBe('');
  });
});
