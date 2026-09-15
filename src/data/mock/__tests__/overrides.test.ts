import { describe, expect, it } from 'vitest';
import { overridesFingerprint, withEnvAuth } from '../overrides';

describe('withEnvAuth — вхід зі змінних збірки (сервер)', () => {
  it('без змінних — оверрайди без змін', () => {
    const o = { ownCompany: { nameShort: 'ТОВ «ДЕМО»' } };
    expect(withEnvAuth(o, {})).toBe(o);
    expect(withEnvAuth(null, { VITE_AUTH_LOGIN: ' ', VITE_AUTH_PASSWORD_SHA256: '' })).toBeNull();
  });

  it('логін і хеш зі змінних мають перевагу над overrides.json', () => {
    const o = { ownCompany: { nameShort: 'ТОВ «ДЕМО»' }, auth: { login: 'local', password: 'secret' } };
    expect(withEnvAuth(o, { VITE_AUTH_LOGIN: ' manager ', VITE_AUTH_PASSWORD_SHA256: 'ABC123' })).toEqual({
      ownCompany: { nameShort: 'ТОВ «ДЕМО»' },
      auth: { login: 'manager', password: 'secret', passwordSha256: 'abc123' },
    });
    expect(withEnvAuth(null, { VITE_AUTH_PASSWORD_SHA256: 'def' })).toEqual({ auth: { passwordSha256: 'def' } });
  });

  it('новий пароль змінює відбиток — демо-дані в браузерах перестворюються', () => {
    const a = withEnvAuth(null, { VITE_AUTH_PASSWORD_SHA256: 'aaa' });
    const b = withEnvAuth(null, { VITE_AUTH_PASSWORD_SHA256: 'bbb' });
    expect(overridesFingerprint(a)).not.toBe(overridesFingerprint(b));
    expect(overridesFingerprint(a)).not.toBe(overridesFingerprint(null));
  });
});
