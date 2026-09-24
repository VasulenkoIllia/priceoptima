// Ціна входу, введена прямо в клітинці блоку: перетворення в ціну постачальника й назад.
import { describe, expect, it } from 'vitest';
import { computeRequest, purchasePriceFromCell } from '..';
import { makeBlock, makeCtx, makeDoc, makeHeader, makeLine, makeSupplier, uah } from './fixtures';
describe('ціна входу, введена в клітинці блоку (правки замовника 23.09 п.8)', () => {
  it('після перерахунку клітинка показує саме введене: гривня, валюта, націнка постачальника', () => {
    const header = makeHeader({ rates: { USD: 45, EUR: 52.5, date: '2026-09-24' } });
    const cases: { currency: 'UAH' | 'EUR'; rate: number; markup: number; typed: number; withVat: boolean }[] = [
      { currency: 'UAH', rate: 1, markup: 0, typed: 76, withVat: true },
      { currency: 'UAH', rate: 1, markup: 5, typed: 76, withVat: true },
      { currency: 'UAH', rate: 1, markup: 10, typed: 63.33, withVat: false },
      { currency: 'EUR', rate: 52.5, markup: 0, typed: 1932, withVat: true },
      { currency: 'EUR', rate: 51.1864, markup: 0.2, typed: 1895.58, withVat: true },
    ];
    for (const c of cases) {
      const price = purchasePriceFromCell(c.typed, c.withVat, 20, c.rate, c.markup);
      const offer = uah('L1', 'A', price, { currency: c.currency });
      const doc = makeDoc({
        header,
        lines: [makeLine('L1', 1)],
        blocks: [makeBlock('A', 1, { rates: { USD: 45, EUR: c.rate }, supplierMarkupPct: c.markup })],
        offers: [offer],
      });
      const oc = computeRequest(doc, makeCtx([makeSupplier('A')])).offers[offer.id];
      expect(c.withVat ? oc.unitGrossUah : oc.unitNetUah).toBe(c.typed);
    }
  });
});
