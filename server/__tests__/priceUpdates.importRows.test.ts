// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { PriceImportRow } from '@shared/types';
import { importRowToPriceRow, importRowsToPriceRows } from '../modules/price-updates/importRows';

describe('рядок прайсу з файлу', () => {
  it('поля переносяться як є, тексти обрізаються', () => {
    const row: PriceImportRow = {
      code: '  SD-100 ',
      sku: ' ART-1 ',
      name: ' Змішувач для кухні ',
      brand: 'Grohe',
      unitCode: 'шт.',
      purchasePrice: 1200.5,
      currency: 'EUR',
      rrp: 1999,
      stockQty: 12,
      availability: 'in_stock',
      multiplicity: 2,
      minOrderQty: 4,
    };
    expect(importRowToPriceRow(row)).toEqual({
      code: 'SD-100',
      sku: 'ART-1',
      name: 'Змішувач для кухні',
      brand: 'Grohe',
      unitCode: 'шт.',
      purchasePrice: 1200.5,
      currency: 'EUR',
      rrp: 1999,
      stockQty: 12,
      availability: 'in_stock',
      multiplicity: 2,
      minOrderQty: 4,
      barcode: null,
      categoryPath: null,
      imageUrls: [],
    });
  });

  it('відсутні поля стають null, фото немає', () => {
    expect(importRowToPriceRow({ code: 'A1' })).toMatchObject({
      code: 'A1',
      sku: null,
      name: null,
      purchasePrice: null,
      rrp: null,
      currency: null,
      stockQty: null,
      availability: null,
      imageUrls: [],
    });
  });

  it('порожні тексти — null', () => {
    expect(importRowToPriceRow({ code: 'A1', name: '   ', brand: '', unitCode: ' ' })).toMatchObject({
      name: null,
      brand: null,
      unitCode: null,
    });
  });

  it('нульова або від\'ємна ціна означає «ціни немає» (збережена лишиться)', () => {
    expect(importRowToPriceRow({ code: 'A1', purchasePrice: 0, rrp: -5 })).toMatchObject({ purchasePrice: null, rrp: null });
    expect(importRowToPriceRow({ code: 'A1', purchasePrice: Number.NaN })).toMatchObject({ purchasePrice: null });
  });

  it('залишок нуль лишається нулем, від\'ємний — теж нуль', () => {
    expect(importRowToPriceRow({ code: 'A1', stockQty: 0 }).stockQty).toBe(0);
    expect(importRowToPriceRow({ code: 'A1', stockQty: -3 }).stockQty).toBe(0);
  });

  it('невідома валюта й статус наявності не проходять', () => {
    const row = { code: 'A1', currency: 'PLN', availability: 'maybe' } as unknown as PriceImportRow;
    expect(importRowToPriceRow(row)).toMatchObject({ currency: null, availability: null });
  });

  it('рядок без коду лишається з порожнім кодом — його пропустить звірка', () => {
    const rows = importRowsToPriceRows([{ code: '  ' }, { code: 'B2' }]);
    expect(rows.map((r) => r.code)).toEqual(['', 'B2']);
  });
});
