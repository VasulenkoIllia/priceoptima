import { describe, expect, it } from 'vitest';
import { computeRequest } from '../request';
import { makeBlock, makeCtx, makeDoc, makeHeader, makeLine, makeOffer, makeSupplier, uah } from './fixtures';

describe('computeRequest — інтеграція', () => {
  const doc = makeDoc({
    header: makeHeader({ clientId: null }),
    lines: [makeLine('L1', 1), makeLine('L2', 4, { selection: { blockId: 'B' } })],
    blocks: [makeBlock('B', 1), makeBlock('A', 0, { rates: { USD: 45, EUR: null } })],
    offers: [
      makeOffer('L1', 'A', { currency: 'USD', purchasePriceCur: 8.602, rrpCur: 18.3 }),
      uah('L1', 'B', 400, { rrpCur: 600 }),
      uah('L2', 'B', 640, { rrpCur: 900 }),
      uah('L2', 'B', 1, { id: 'dup' }), // дублікат пари — ігнорується
      uah('LX', 'A', 1, { id: 'orphan' }), // рядка немає — ігнорується
    ],
  });
  const ctx = makeCtx([makeSupplier('A'), makeSupplier('B')]);
  const c = computeRequest(doc, ctx);

  it('індекс пропозицій, сироти й дублікати', () => {
    expect(c.offerIndex).toEqual({ L1: { A: 'L1:A', B: 'L1:B' }, L2: { B: 'L2:B' } });
    expect(Object.keys(c.offers).sort()).toEqual(['L1:A', 'L1:B', 'L2:B']);
  });

  it('блоки — за position, рекомендація, ефективний вибір', () => {
    expect(c.scenarios.map((s) => s.blockId)).toEqual([null, null, 'A', 'B']);
    expect(c.lines.L1!.effectiveBlockId).toBe('A');
    expect(c.lines.L2!.selectionState).toBe('manual_optimal');
    expect(c.markup.rows.L1!.saleGross).toBe(823.5);
    expect(c.markup.rows.L2!.saleGross).toBe(900);
    expect(c.markup.rows.L2!.notApproved).toBe(false);
  });

  it('F32 підсумки і плаский список попереджень', () => {
    expect(c.totals).toEqual({
      linesCount: 2,
      suppliersCount: 2,
      totalPurchaseGross: 3536.51,
      totalPurchaseNet: 2947.09,
      totalSaleNet: 3686.25,
      totalSaleGross: 4423.5,
      profitNet: 739.16,
      approvedSaleGross: null,
    });
    expect(c.warnings[0]).toEqual({ code: 'NO_CLIENT', severity: 'warning' });
  });

  it('чиста функція: вхід не мутується, результат детермінований', () => {
    const snapshot = JSON.stringify(doc);
    const again = computeRequest(doc, ctx);
    expect(JSON.stringify(doc)).toBe(snapshot);
    expect(again).toEqual(c);
  });

  it('150 рядків × 4 блоки рахуються швидко', () => {
    const lines = Array.from({ length: 150 }, (_, i) => makeLine(`L${i}`, (i % 7) + 1, { position: i }));
    const blocks = ['A', 'B', 'C', 'D'].map((id, i) => makeBlock(id, i));
    const offers = lines.flatMap((l, i) => blocks.map((b, j) => uah(l.id, b.id, 100 + ((i * 7 + j * 13) % 50), { rrpCur: 200 })));
    const big = makeDoc({ lines, blocks, offers });
    const t0 = performance.now();
    const r = computeRequest(big, makeCtx());
    const ms = performance.now() - t0;
    expect(Object.keys(r.offers)).toHaveLength(600);
    expect(r.scenarios).toHaveLength(6);
    expect(ms).toBeLessThan(200);
  });
});
