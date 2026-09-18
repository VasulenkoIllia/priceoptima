// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ApiError } from '../http/errors';
import { parse } from '../http/validate';
import { loginSchema } from '../modules/auth/auth.schemas';
import { selfProfileSchema, userInputSchema } from '../modules/users/users.schemas';
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
  it('нормалізує поля: пробіли обрізаються, порожні контакти стають null', () => {
    expect(
      parse(userInputSchema, {
        login: ' koval ',
        fullName: ' Коваль Олександр Вікторович ',
        shortName: ' Коваль О.В. ',
        email: '   ',
        role: 'user',
      }),
    ).toEqual({
      login: 'koval',
      fullName: 'Коваль Олександр Вікторович',
      shortName: 'Коваль О.В.',
      email: null,
      phone: null,
      role: 'user',
    });
  });

  it('роль поза списком і короткий пароль не проходять', () => {
    const base = { login: 'koval', fullName: 'Коваль', shortName: 'Коваль О.В.' };
    expect(errorOf(() => parse(userInputSchema, { ...base, role: 'root' })).message).toBe('Невідома роль');
    expect(errorOf(() => parse(userInputSchema, { ...base, role: 'user', password: '1234' })).message).toBe(
      'Пароль — не менше 8 символів',
    );
  });

  it('свій профіль: логін і роль до бази не доходять', () => {
    expect(
      parse(selfProfileSchema, {
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
    expect(errorOf(() => parse(settingsPatchSchema, { kpTerms: many })).message).toBe('Умов у КП — не більше 12');
  });
});
