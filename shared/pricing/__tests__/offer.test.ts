import { describe, expect, it } from 'vitest';
import { formatWarning } from '../../format';
import { catalogChangeParams, computeOfferBase, isCatalogChanged } from '../offer';
import { resolveRate } from '../rates';
import { makeBlock, makeCtx, makeHeader, makeLine, makeOffer, makeSupplier } from './fixtures';

const header = makeHeader({ rates: { USD: 44.5, EUR: 51.9, date: '2026-09-11' } });
const ctx = makeCtx([makeSupplier('A')]);
const codes = (ws: { code: string }[]) => ws.map((w) => w.code);

describe('F1 resolveRate', () => {
  it('UAH → 1; блок → шапка → null', () => {
    expect(resolveRate('UAH', { USD: null, EUR: null }, { USD: null, EUR: null })).toBe(1);
    expect(resolveRate('USD', { USD: 45, EUR: null }, { USD: 44.5, EUR: null })).toBe(45);
    expect(resolveRate('USD', { USD: null, EUR: null }, { USD: 44.5, EUR: null })).toBe(44.5);
    expect(resolveRate('EUR', { USD: 45, EUR: null }, { USD: 44.5, EUR: null })).toBeNull();
  });

  it('немає курсу → RATE_MISSING, пропозиція не заповнена', () => {
    const r = computeOfferBase(
      makeOffer('L1', 'A', { currency: 'EUR', purchasePriceCur: 10 }),
      makeLine('L1', 1),
      makeBlock('A', 0),
      makeHeader({ rates: { USD: 45, EUR: null, date: null } }),
      ctx,
    );
    expect(r.rate).toBeNull();
    expect(r.unitNetUah).toBeNull();
    expect(r.isFilled).toBe(false);
    expect(codes(r.warnings)).toContain('RATE_MISSING');
    expect(r.warnings.find((w) => w.code === 'RATE_MISSING')?.severity).toBe('error');
  });
});

// ТЗ §5.1: ціни в грн — round2 одразу після перерахунку з валюти; Cg і суми — від округленої C
describe('F3–F7: ціни пропозиції (T1–T4)', () => {
  it('T1: 8.602 USD × 45, РРЦ 18.3 USD (Ф3/Ф4: 464.508 → 464.51)', () => {
    const r = computeOfferBase(
      makeOffer('L1', 'A', { currency: 'USD', purchasePriceCur: 8.602, rrpCur: 18.3 }),
      makeLine('L1', 1),
      makeBlock('A', 0, { rates: { USD: 45, EUR: 52.1 } }),
      header,
      ctx,
    );
    expect(r.rate).toBe(45);
    expect(r.unitNetUah).toBe(387.09);
    expect(r.unitGrossUah).toBe(464.51);
    expect(r.sumGrossUah).toBe(464.51);
    expect(r.sumNetUah).toBe(387.09);
    expect(r.rrpGrossUah).toBe(823.5);
    expect(r.rrpNetUah).toBe(686.25);
    expect(r.isFilled).toBe(true);
  });

  it('T2: націнка постачальника 2 % додається до входу (664.8156 → 664.82)', () => {
    const r = computeOfferBase(
      makeOffer('L1', 'A', { currency: 'USD', purchasePriceCur: 14.484 }),
      makeLine('L1', 4),
      makeBlock('A', 0, { rates: { USD: 45, EUR: null }, supplierMarkupPct: 2 }),
      header,
      ctx,
    );
    expect(r.unitNetUah).toBe(664.82);
    expect(r.unitGrossUah).toBe(797.78);
    expect(r.sumGrossUah).toBe(3191.12);
    expect(r.sumNetUah).toBe(2659.28);
  });

  it('Ф4: ціна з ПДВ збігається з каталогом (100,05 з ПДВ → 83,375 без ПДВ → знову 100,05, а не 100,06)', () => {
    const r = computeOfferBase(makeOffer('L1', 'A', { currency: 'UAH', purchasePriceCur: 83.375 }), makeLine('L1', 120), makeBlock('A', 0), header, ctx);
    expect(r.unitNetUah).toBe(83.38);
    expect(r.unitGrossUah).toBe(100.05);
    expect(r.sumGrossUah).toBe(12006);
  });

  it('Ф3 приклад ТЗ: 8.602 × 45 при s = 2 % → 394.83', () => {
    const r = computeOfferBase(
      makeOffer('L1', 'A', { currency: 'USD', purchasePriceCur: 8.602 }),
      makeLine('L1', 1),
      makeBlock('A', 0, { rates: { USD: 45, EUR: null }, supplierMarkupPct: 2 }),
      header,
      ctx,
    );
    expect(r.unitNetUah).toBe(394.83);
  });

  it('F7: націнка постачальника на РРЦ не діє', () => {
    const r = computeOfferBase(
      makeOffer('L1', 'A', { currency: 'USD', purchasePriceCur: 10, rrpCur: 20 }),
      makeLine('L1', 1),
      makeBlock('A', 0, { rates: { USD: 45, EUR: null }, supplierMarkupPct: 2 }),
      header,
      ctx,
    );
    expect(r.unitNetUah).toBe(459);
    expect(r.rrpGrossUah).toBe(900);
    expect(r.rrpNetUah).toBe(750);
  });

  it('T3: EUR 44.375 × 52.1, qty 2 (half-up 2311.9375 → 2311.94)', () => {
    const r = computeOfferBase(
      makeOffer('L1', 'A', { currency: 'EUR', purchasePriceCur: 44.375 }),
      makeLine('L1', 2),
      makeBlock('A', 0, { rates: { USD: null, EUR: 52.1 } }),
      header,
      ctx,
    );
    expect(r.unitNetUah).toBe(2311.94);
    expect(r.unitGrossUah).toBe(2774.33);
    expect(r.sumGrossUah).toBe(5548.66);
    expect(r.sumNetUah).toBe(4623.88);
  });

  it('T4: UAH, курс 1', () => {
    const r = computeOfferBase(
      makeOffer('L1', 'A', { purchasePriceCur: 1248.07 }),
      makeLine('L1', 1),
      makeBlock('A', 0),
      header,
      ctx,
    );
    expect(r.rate).toBe(1);
    expect(r.unitGrossUah).toBe(1497.68);
    expect(r.sumGrossUah).toBe(1497.68);
  });

  it('F5: к-сть пропозиції перекриває к-сть рядка', () => {
    const r = computeOfferBase(
      makeOffer('L1', 'A', { purchasePriceCur: 100, qty: 120, multiplicity: 4 }),
      makeLine('L1', 118),
      makeBlock('A', 0),
      header,
      ctx,
    );
    expect(r.qtyEffective).toBe(120);
    expect(r.sumGrossUah).toBe(14400);
  });
});

describe('F8, F22, F23 і попередження пропозиції', () => {
  it('F8: без ціни — не заповнена, PRICE_MISSING', () => {
    const r = computeOfferBase(makeOffer('L1', 'A'), makeLine('L1', 1), makeBlock('A', 0), header, ctx);
    expect(r.isFilled).toBe(false);
    expect(codes(r.warnings)).toEqual(['PRICE_MISSING']);
  });

  it('F8: нульова ціна — не заповнена', () => {
    const r = computeOfferBase(makeOffer('L1', 'A', { purchasePriceCur: 0 }), makeLine('L1', 1), makeBlock('A', 0), header, ctx);
    expect(r.isFilled).toBe(false);
  });

  it('F22: знімок ≠ каталог → CATALOG_PRICE_CHANGED (info)', () => {
    const offer = makeOffer('L1', 'A', {
      currency: 'USD',
      purchasePriceCur: 10,
      rrpCur: 20,
      catalog: {
        productId: 'p1',
        currency: 'USD',
        purchasePrice: 11,
        rrp: 20,
        priceUpdatedAt: null,
        stockQty: null,
        availability: 'in_stock',
        isArchived: false,
      },
    });
    expect(isCatalogChanged(offer)).toBe(true);
    const r = computeOfferBase(offer, makeLine('L1', 1), makeBlock('A', 0), header, ctx);
    expect(r.catalogChanged).toBe(true);
    const w = r.warnings.find((x) => x.code === 'CATALOG_PRICE_CHANGED');
    expect(w?.severity).toBe('info');
    expect(w?.params).toMatchObject({ catalogPrice: 11, snapshotPrice: 10, manual: 0 });
    expect(formatWarning(w!)).toBe('У каталозі змінились: вхід без ПДВ 10,00 → 11,00 USD');
    // змінилась лише РРЦ — текст про РРЦ, а не «10,00 → 10,00»
    const rrpOnly = { ...offer, catalog: { ...offer.catalog!, purchasePrice: 10, rrp: 25 } };
    expect(formatWarning({ code: 'CATALOG_PRICE_CHANGED', params: catalogChangeParams(rrpOnly)! })).toBe(
      'У каталозі змінились: РРЦ 20,00 → 25,00 USD',
    );
    // ціну змінили вручну в заявці
    const manual = {
      ...offer,
      priceChange: { prevCurrency: 'USD' as const, prevPurchasePriceCur: 11, prevRrpCur: 20, prevRate: 41, prevUnitNetUah: 451, reason: 'manual_edit' as const, changedAt: '2026-09-11T09:00:00Z' },
    };
    expect(formatWarning({ code: 'CATALOG_PRICE_CHANGED', params: catalogChangeParams(manual)! })).toBe(
      'Ціну входу змінено вручну в заявці: 10,00 USD, у прайсі 11,00 USD',
    );
    expect(isCatalogChanged({ ...offer, catalog: { ...offer.catalog!, purchasePrice: 10 } })).toBe(false);
    expect(isCatalogChanged({ ...offer, catalog: null })).toBe(false);
  });

  it('F23: вхід без ПДВ > РРЦ без ПДВ → INPUT_ABOVE_RRP', () => {
    const r = computeOfferBase(
      makeOffer('L1', 'A', { purchasePriceCur: 200, rrpCur: 230 }),
      makeLine('L1', 1),
      makeBlock('A', 0),
      header,
      ctx,
    );
    expect(r.rrpNetUah).toBe(191.67);
    expect(codes(r.warnings)).toContain('INPUT_ABOVE_RRP');
  });

  it('UNIT_MISMATCH лише для різних одиниць після нормалізації', () => {
    const same = computeOfferBase(
      makeOffer('L1', 'A', { purchasePriceCur: 10, unitCode: 'шт' }),
      makeLine('L1', 1, { clientUnit: 'шт.' }),
      makeBlock('A', 0),
      header,
      ctx,
    );
    expect(codes(same.warnings)).not.toContain('UNIT_MISMATCH');
    const diff = computeOfferBase(
      makeOffer('L1', 'A', { purchasePriceCur: 10, unitCode: 'м' }),
      makeLine('L1', 1, { clientUnit: 'шт' }),
      makeBlock('A', 0),
      header,
      ctx,
    );
    expect(codes(diff.warnings)).toContain('UNIT_MISMATCH');
  });
});
