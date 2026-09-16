// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ApiError } from '../http/errors';
import { parse } from '../http/validate';
import {
  importBodyFromForm,
  MAX_IMPORT_ROWS,
  parseImportBody,
  priceUpdateIdSchema,
  priceUpdatesQuerySchema,
  runBodySchema,
} from '../modules/price-updates/priceUpdates.schemas';

const SUPPLIER = 'f2a1c0de-0000-4000-8000-000000000001';

function errorOf(fn: () => unknown): ApiError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).code).toBe('VALIDATION_ERROR');
    return e as ApiError;
  }
  throw new Error('очікували помилку перевірки');
}

describe('журнал оновлень: параметри списку', () => {
  it('без параметрів — усі постачальники, 100 записів', () => {
    expect(parse(priceUpdatesQuerySchema, {})).toEqual({ supplierId: undefined, limit: 100 });
  });

  it('параметри рядками приводяться до типів; порожній постачальник — не задано', () => {
    expect(parse(priceUpdatesQuerySchema, { supplierId: SUPPLIER, limit: '20' })).toEqual({ supplierId: SUPPLIER, limit: 20 });
    expect(parse(priceUpdatesQuerySchema, { supplierId: '' }).supplierId).toBeUndefined();
  });

  it('невірний постачальник чи ліміт — помилка українською', () => {
    expect(errorOf(() => parse(priceUpdatesQuerySchema, { supplierId: 'abc' })).message).toBe('Невірний ідентифікатор постачальника');
    expect(errorOf(() => parse(priceUpdatesQuerySchema, { limit: '0' })).message).toBe('Ліміт: не менше 1');
    expect(errorOf(() => parse(priceUpdatesQuerySchema, { limit: '9999' })).message).toBe('Ліміт: не більше 500');
  });

  it('ідентифікатор запису — додатне ціле', () => {
    expect(parse(priceUpdateIdSchema, { id: '42' })).toEqual({ id: 42 });
    expect(errorOf(() => parse(priceUpdateIdSchema, { id: 'x' })).message).toBe('Невірний ідентифікатор оновлення');
  });
});

describe('оновлення за посиланням', () => {
  it('постачальник обов\'язковий, dryRun — ні за замовчуванням', () => {
    expect(parse(runBodySchema, { supplierId: SUPPLIER })).toEqual({ supplierId: SUPPLIER, dryRun: false });
    expect(parse(runBodySchema, { supplierId: SUPPLIER, dryRun: true }).dryRun).toBe(true);
    expect(errorOf(() => parse(runBodySchema, {})).message).toBe('Невірний ідентифікатор постачальника');
  });
});

describe('прайс файлом', () => {
  const body = {
    supplierId: SUPPLIER,
    fileName: 'прайс-16-09.xlsx',
    markMissing: true,
    rows: [{ code: 'A-1', name: ' Кран ', purchasePrice: 10.5, currency: 'EUR', stockQty: 3 }],
  };

  it('коректне тіло: порожні поля рядка стають null, dryRun — ні', () => {
    const parsed = parseImportBody(body);
    expect(parsed.dryRun).toBe(false);
    expect(parsed.markMissing).toBe(true);
    expect(parsed.rows[0]).toEqual({
      code: 'A-1',
      sku: null,
      name: 'Кран',
      brand: null,
      unitCode: null,
      purchasePrice: 10.5,
      currency: 'EUR',
      rrp: null,
      stockQty: 3,
      availability: null,
      multiplicity: null,
      minOrderQty: null,
    });
  });

  it('числовий код із Excel приймається текстом', () => {
    expect(parseImportBody({ ...body, rows: [{ code: 100500 }] }).rows[0].code).toBe('100500');
  });

  it('помилка в рядку називає його номер', () => {
    const rows = [{ code: 'A-1' }, { code: 'A-2', purchasePrice: -1 }];
    expect(errorOf(() => parseImportBody({ ...body, rows })).message).toBe('Рядок 2: Вхідна ціна: не менше 0');
    expect(errorOf(() => parseImportBody({ ...body, rows: [{ code: 'A', currency: 'PLN' }] })).message).toBe('Рядок 1: Невідома валюта');
  });

  it('порожній список, без назви файлу чи постачальника — помилка', () => {
    expect(errorOf(() => parseImportBody({ ...body, rows: [] })).message).toBe('У прайсі немає жодного рядка');
    expect(errorOf(() => parseImportBody({ ...body, fileName: ' ' })).message).toBe('Вкажіть назву файлу прайсу');
    expect(errorOf(() => parseImportBody({ ...body, supplierId: undefined })).message).toBe('Невірний ідентифікатор постачальника');
  });

  it('завеликий прайс — помилка з межею', () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => ({ code: String(i) }));
    expect(errorOf(() => parseImportBody({ ...body, rows })).message).toMatch(/^За раз завантажуємо до/u);
  });
});

describe('прайс формою multipart', () => {
  it('рядки — JSON-рядок, прапорці — текстом, назва файлу — з самого файлу', () => {
    const value = importBodyFromForm(
      { supplierId: SUPPLIER, rows: JSON.stringify([{ code: 'A-1' }]), markMissing: 'true', dryRun: '0' },
      'Прайс.xlsx',
    );
    expect(parseImportBody(value)).toMatchObject({ fileName: 'Прайс.xlsx', markMissing: true, dryRun: false, rows: [{ code: 'A-1' }] });
  });

  it('назва з поля форми важливіша за назву файлу', () => {
    const value = importBodyFromForm({ supplierId: SUPPLIER, rows: '[{"code":"A"}]', fileName: 'Мій прайс' }, 'x.xlsx');
    expect(parseImportBody(value).fileName).toBe('Мій прайс');
  });

  it('зіпсований JSON рядків — зрозуміла помилка', () => {
    expect(errorOf(() => importBodyFromForm({ supplierId: SUPPLIER, rows: '[{' }, null)).message).toBe(
      'Рядки прайсу мають бути JSON-списком',
    );
  });
});
