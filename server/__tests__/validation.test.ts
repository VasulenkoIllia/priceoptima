// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ApiError } from '../http/errors';
import { parse } from '../http/validate';
import { loginSchema } from '../modules/auth/auth.schemas';
import { registerSchema } from '../modules/access/access.schemas';
import { profileSchema, roleSchema, userUpdateSchema } from '../modules/users/users.schemas';
import { settingsPatchSchema } from '../modules/settings/settings.schemas';

function errorOf(fn: () => unknown): ApiError {
  try {
    fn();
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error('очікували помилку перевірки');
}

describe('перевірка входу', () => {
  it('прибирає пробіли в логіні, пароль лишає як є', () => {
    expect(parse(loginSchema, { login: '  admin ', password: '  пароль  ' })).toEqual({
      login: 'admin',
      password: '  пароль  ',
    });
  });

  it('порожні поля — VALIDATION_ERROR з повідомленням українською', () => {
    const e = errorOf(() => parse(loginSchema, { login: '   ', password: '' }));
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(e.message).toBe('Вкажіть логін');
  });

  it('тіло не того типу теж відхиляється', () => {
    expect(errorOf(() => parse(loginSchema, { login: 123, password: null })).code).toBe('VALIDATION_ERROR');
    expect(errorOf(() => parse(loginSchema, 'admin:admin')).code).toBe('VALIDATION_ERROR');
  });
});

describe('перевірка користувача', () => {
  it('нормалізує поля: пробіли обрізаються, логін малими, порожні контакти стають null', () => {
    expect(
      parse(userUpdateSchema, {
        login: ' Koval ',
        fullName: ' Коваль Олександр Вікторович ',
        shortName: ' Коваль О.В. ',
        email: '   ',
        role: 'admin',
      }),
    ).toEqual({
      login: 'koval',
      fullName: 'Коваль Олександр Вікторович',
      shortName: 'Коваль О.В.',
      email: null,
      phone: null,
    });
  });

  it('роль поза списком не проходить', () => {
    expect(errorOf(() => parse(roleSchema, { role: 'root' })).message).toBe('Невідома роль');
  });

  it('реєстрація за запрошенням: логін латиницею, пароль від 8 символів, e-mail перевіряється', () => {
    const base = { login: ' Olena.K ', fullName: ' Коваль Олена ', password: '12345678' };
    expect(parse(registerSchema, base)).toEqual({ login: 'olena.k', fullName: 'Коваль Олена', phone: null, email: null, password: '12345678' });
    expect(errorOf(() => parse(registerSchema, { ...base, login: 'олена' })).message).toBe(
      'Логін: латинські літери, цифри, крапка, дефіс або підкреслення',
    );
    expect(errorOf(() => parse(registerSchema, { ...base, password: '1234' })).message).toBe('Пароль: не менше 8 символів');
    expect(errorOf(() => parse(registerSchema, { ...base, email: 'не пошта' })).message).toBe('Невірний e-mail');
  });

  it('свій профіль: логін і роль до бази не доходять', () => {
    expect(
      parse(profileSchema, {
        fullName: 'Коваль О. В.',
        shortName: 'Коваль О.В.',
        login: 'hacker',
        role: 'admin',
        isActive: false,
      }),
    ).toEqual({ fullName: 'Коваль О. В.', shortName: 'Коваль О.В.', email: null, phone: null });
  });
});

describe('перевірка налаштувань', () => {
  it('приймає часткові зміни й відкидає невідомі поля', () => {
    expect(parse(settingsPatchSchema, { vatRatePct: 20, kpShowImages: true, hackField: 1 })).toEqual({
      vatRatePct: 20,
      kpShowImages: true,
    });
  });

  it('межі значень перевіряються', () => {
    expect(errorOf(() => parse(settingsPatchSchema, { vatRatePct: 120 })).code).toBe('VALIDATION_ERROR');
    expect(errorOf(() => parse(settingsPatchSchema, { priceStaleDays: 0 })).code).toBe('VALIDATION_ERROR');
    expect(errorOf(() => parse(settingsPatchSchema, { kpValidityDays: 1.5 })).code).toBe('VALIDATION_ERROR');
    // 0 — термін дії КП не вказано (правки замовника 25.09 п.6)
    expect(parse(settingsPatchSchema, { kpValidityDays: 0 })).toEqual({ kpValidityDays: 0 });
    expect(errorOf(() => parse(settingsPatchSchema, { kpValidityDays: -1 })).code).toBe('VALIDATION_ERROR');
    expect(errorOf(() => parse(settingsPatchSchema, { priceRounding: 'hundreds' })).message).toBe(
      'Невідоме значення: округлення ціни',
    );
  });

  it('умови КП: пробіли прибираються, без назви — не зберігаються, не більше 12', () => {
    expect(
      parse(settingsPatchSchema, {
        kpTerms: [
          { label: ' Умови оплати ', value: ' Передоплата ' },
          { label: '  ', value: 'без назви' },
          { label: 'Гарантійний термін', value: '' },
        ],
      }),
    ).toEqual({
      kpTerms: [
        { label: 'Умови оплати', value: 'Передоплата' },
        { label: 'Гарантійний термін', value: '' },
      ],
    });
    const many = Array.from({ length: 13 }, (_, i) => ({ label: `Умова ${i}`, value: 'x' }));
    expect(errorOf(() => parse(settingsPatchSchema, { kpTerms: many })).message).toBe('Умов у КП: не більше 12');
  });
});
