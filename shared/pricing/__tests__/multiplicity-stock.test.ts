import { describe, expect, it } from 'vitest';
import { checkMultiplicity, initialOfferQty } from '../multiplicity';
import { createOfferFromProduct, offerDisplayName } from '../offer-factory';
import { computeOfferBase } from '../offer';
import { computeRequest } from '../request';
import { isPriceStale, priceAgeDays } from '../staleness';
import { checkStock } from '../stock';
import { makeBlock, makeCtx, makeDoc, makeHeader, makeLine, makeOffer, makeSupplier, MARKUP, NOW, uah } from './fixtures';

const codes = (ws: { code: string }[]) => ws.map((w) => w.code);

describe('F19 кратність (T5)', () => {
  it('checkMultiplicity', () => {
    expect(checkMultiplicity(118, 4)).toEqual({ isMultiple: false, suggestedQty: 120 });
    expect(checkMultiplicity(120, 4)).toEqual({ isMultiple: true, suggestedQty: 120 });
    expect(checkMultiplicity(6, 4)).toEqual({ isMultiple: false, suggestedQty: 8 });
    expect(checkMultiplicity(1.5, 0.5)).toEqual({ isMultiple: true, suggestedQty: 1.5 });
    expect(checkMultiplicity(0.7, 0.25)).toEqual({ isMultiple: false, suggestedQty: 0.75 });
    expect(checkMultiplicity(3, null)).toEqual({ isMultiple: true, suggestedQty: 3 });
  });

  it('initialOfferQty: автоокруглення лише для некратних', () => {
    expect(initialOfferQty(118, 4, true)).toBe(120);
    expect(initialOfferQty(120, 4, true)).toBeNull();
    expect(initialOfferQty(118, 4, false)).toBeNull();
    expect(initialOfferQty(0, 4, true)).toBeNull();
  });

  it('труба 118 м, кратно 4: пропозиція з qty 120 → QTY_ROUNDED, сума від 120', () => {
    const offer = createOfferFromProduct(
      {
        id: 'pipe',
        sku: 'PPR-40',
        nameWork: 'Труба ППР ду40',
        name1c: null,
        unitCode: 'м',
        currency: 'UAH',
        purchasePrice: 50,
        rrp: null,
        multiplicity: 4,
        stockQty: null,
        availability: 'in_stock',
        priceUpdatedAt: '2026-09-10T09:00:00Z',
        isArchived: false,
      },
      { id: 'o1', lineId: 'L1', blockId: 'A', lineQty: 118, autoRoundMultiplicity: true },
    );
    expect(offer.qty).toBe(120);
    expect(offer.catalog?.purchasePrice).toBe(50);
    expect(offerDisplayName(offer)).toBe('Труба ППР ду40');
    expect(offerDisplayName({ ...offer, nameKind: 'accounting' })).toBe('Труба ППР ду40');

    const r = computeOfferBase(offer, makeLine('L1', 118, { clientUnit: 'м' }), makeBlock('A', 0), makeHeader(), makeCtx());
    expect(r.qtyEffective).toBe(120);
    expect(r.sumGrossUah).toBe(7200);
    const rounded = r.warnings.find((w) => w.code === 'QTY_ROUNDED');
    expect(rounded?.severity).toBe('info');
    expect(rounded?.params).toMatchObject({ from: 118, to: 120, multiplicity: 4 });
    expect(codes(r.warnings)).not.toContain('MULTIPLICITY_MISMATCH');
  });

  it('некратна к-сть без округлення → MULTIPLICITY_MISMATCH', () => {
    const r = computeOfferBase(
      uah('L1', 'A', 50, { multiplicity: 4 }),
      makeLine('L1', 6),
      makeBlock('A', 0),
      makeHeader(),
      makeCtx(),
    );
    expect(r.multiplicity).toEqual({ isMultiple: false, suggestedQty: 8 });
    const w = r.warnings.find((x) => x.code === 'MULTIPLICITY_MISMATCH');
    expect(w?.params).toMatchObject({ qty: 6, multiplicity: 4, suggestedQty: 8 });
  });
});

describe('F20–F21 наявність і застарілість (T16)', () => {
  it('priceAgeDays / isPriceStale', () => {
    const age = priceAgeDays('2026-09-01T09:00:00Z', NOW);
    expect(age).toBe(10);
    expect(isPriceStale(age, 7)).toBe(true);
    expect(isPriceStale(age, 14)).toBe(false);
    expect(priceAgeDays(null, NOW)).toBeNull();
    expect(isPriceStale(null, 7)).toBe(false);
  });

  it('checkStock', () => {
    expect(checkStock(4, 3, 'in_stock')).toEqual({ insufficient: true, outOfStock: false });
    expect(checkStock(4, 10, 'in_stock')).toEqual({ insufficient: false, outOfStock: false });
    expect(checkStock(4, null, 'out_of_stock')).toEqual({ insufficient: false, outOfStock: true });
    expect(checkStock(4, 0, 'in_stock')).toEqual({ insufficient: false, outOfStock: true });
  });

  it('PRICE_STALE з нормою постачальника; INSUFFICIENT_STOCK', () => {
    const offer = uah('L1', 'A', 100, { priceDate: '2026-09-01T09:00:00Z', stockQty: 3 });
    const line = makeLine('L1', 4);
    const r1 = computeOfferBase(offer, line, makeBlock('A', 0), makeHeader(), makeCtx([makeSupplier('A')]));
    expect(r1.stale).toEqual({ isStale: true, ageDays: 10 });
    expect(codes(r1.warnings)).toEqual(expect.arrayContaining(['PRICE_STALE', 'INSUFFICIENT_STOCK']));
    const r2 = computeOfferBase(offer, line, makeBlock('A', 0), makeHeader(), makeCtx([makeSupplier('A', { priceStaleDays: 14 })]));
    expect(r2.stale.isStale).toBe(false);
    expect(codes(r2.warnings)).not.toContain('PRICE_STALE');
  });

  it('out_of_stock + excludeUnavailable → не кандидат, рекомендація переходить далі', () => {
    const lines = [makeLine('L1', 4)];
    const blocks = [makeBlock('A', 0), makeBlock('B', 1)];
    const offers = [uah('L1', 'A', 90, { availability: 'out_of_stock' }), uah('L1', 'B', 100)];
    const off = computeRequest(makeDoc({ lines, blocks, offers }), makeCtx());
    expect(off.lines.L1!.recommendedBlockId).toBe('A');
    expect(codes(off.offers['L1:A']!.warnings)).toContain('OUT_OF_STOCK');

    const on = computeRequest(makeDoc({ lines, blocks, offers, markup: { ...MARKUP, excludeUnavailable: true } }), makeCtx());
    expect(on.offers['L1:A']!.isCandidate).toBe(false);
    expect(on.lines.L1!.recommendedBlockId).toBe('B');

    // ручний вибір відсутньої на складі лишається валідним
    const manual = computeRequest(
      makeDoc({
        lines: [makeLine('L1', 4, { selection: { blockId: 'A' } })],
        blocks,
        offers,
        markup: { ...MARKUP, excludeUnavailable: true },
      }),
      makeCtx(),
    );
    expect(manual.lines.L1!.effectiveBlockId).toBe('A');
    expect(manual.lines.L1!.selectionState).toBe('manual_optimal');
  });
});

describe('makeOffer sanity', () => {
  it('порожня пропозиція без товару не дає PRICE_MISSING', () => {
    const r = computeOfferBase(
      makeOffer('L1', 'A', { productId: null, sku: null }),
      makeLine('L1', 1),
      makeBlock('A', 0),
      makeHeader(),
      makeCtx(),
    );
    expect(r.warnings).toEqual([]);
  });
});
