// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_SETTINGS } from '@shared/pricing';
import type { AppSettings } from '@shared/types';
import { ApiError } from '../http/errors';
import { applySettingsPatch, assertCountersOnlyGrow } from '../modules/settings/settings.rules';

const current: AppSettings = { ...DEFAULT_APP_SETTINGS, nextRequestNumber: 42, nextKpNumber: 2114 };

describe('лічильники номерів', () => {
  it('те саме значення або більше — можна', () => {
    expect(() => assertCountersOnlyGrow(current, { nextRequestNumber: 42 })).not.toThrow();
    expect(() => assertCountersOnlyGrow(current, { nextRequestNumber: 100, nextKpNumber: 3000 })).not.toThrow();
  });

  it('без лічильників у змінах перевіряти нічого', () => {
    expect(() => assertCountersOnlyGrow(current, { vatRatePct: 20 })).not.toThrow();
  });

  it('менший номер заявки — помилка з підказкою, від якого числа можна', () => {
    let thrown: unknown;
    try {
      assertCountersOnlyGrow(current, { nextRequestNumber: 41 });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).code).toBe('VALIDATION_ERROR');
    expect((thrown as ApiError).message).toBe('Наступний номер заявки: не менше 42');
  });

  it('номер КП — стала частина («2114 / номер заявки»), його можна й зменшити', () => {
    expect(() => assertCountersOnlyGrow(current, { nextKpNumber: 2000 })).not.toThrow();
  });
});

describe('застосування змін', () => {
  it('змінює лише передані поля', () => {
    const next = applySettingsPatch(current, { vatRatePct: 7, kpShowImages: true });
    expect(next.vatRatePct).toBe(7);
    expect(next.kpShowImages).toBe(true);
    expect(next.priceStaleDays).toBe(current.priceStaleDays);
    expect(next.nextKpNumber).toBe(2114);
  });

  it('поле зі значенням undefined не затирає збережене', () => {
    expect(applySettingsPatch(current, { vatRatePct: undefined }).vatRatePct).toBe(current.vatRatePct);
  });

  it('вихідні налаштування не змінюються', () => {
    applySettingsPatch(current, { vatRatePct: 0 });
    expect(current.vatRatePct).toBe(DEFAULT_APP_SETTINGS.vatRatePct);
  });
});
