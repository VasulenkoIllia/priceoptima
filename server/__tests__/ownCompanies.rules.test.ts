// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ApiError } from '../http/errors';
import { assertDefaultStaysActive, resolveDefaultFlag } from '../modules/own-companies/ownCompanies.rules';

describe('основна юрособа', () => {
  it('перша юрособа в довіднику стає основною навіть без позначки', () => {
    expect(resolveDefaultFlag(false, { hasOthers: false, wasDefault: false })).toBe(true);
  });

  it('позначена основною — основна', () => {
    expect(resolveDefaultFlag(true, { hasOthers: true, wasDefault: false })).toBe(true);
  });

  it('звичайна юрособа лишається звичайною', () => {
    expect(resolveDefaultFlag(false, { hasOthers: true, wasDefault: false })).toBe(false);
  });

  it('зняти позначку з основної не можна — треба призначити іншу', () => {
    let thrown: unknown;
    try {
      resolveDefaultFlag(false, { hasOthers: true, wasDefault: true });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).code).toBe('VALIDATION_ERROR');
    expect((thrown as ApiError).message).toBe('Щоб змінити основну юрособу, позначте основною іншу');
  });
});

describe('активність юрособи', () => {
  it('основну не можна вимкнути', () => {
    expect(() => assertDefaultStaysActive(true, false)).toThrow(/Основну юрособу/u);
  });

  it('решту вимикати можна', () => {
    expect(() => assertDefaultStaysActive(false, false)).not.toThrow();
    expect(() => assertDefaultStaysActive(true, true)).not.toThrow();
  });
});
