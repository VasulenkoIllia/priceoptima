import { describe, expect, it } from 'vitest';
import { computeRequest } from '@shared/pricing';
import { MARKUP, makeBlock, makeCtx, makeDoc, makeLine, makeSupplier, uah } from '@shared/pricing/__tests__/fixtures';
import { buildScenarioView } from '../scenarios';

describe('buildScenarioView — панель «Сценарії закупівлі»', () => {
  const ctx = makeCtx([makeSupplier('b1', { minOrderAmount: 1000 }), makeSupplier('b2')]);
  // l1: b1 100 / b2 90 (мінімум b2); l2: b1 50 / b2 40, затверджено b1 вручну; l3 — без пропозицій
  const doc = makeDoc({
    lines: [makeLine('l1', 2), makeLine('l2', 1, { selection: { blockId: 'b1' } }), makeLine('l3', 1)],
    blocks: [makeBlock('b1', 1), makeBlock('b2', 2)],
    offers: [uah('l1', 'b1', 100), uah('l1', 'b2', 90), uah('l2', 'b1', 50), uah('l2', 'b2', 40)],
  });
  const view = buildScenarioView({ lines: doc.lines, blocks: doc.blocks, suppliers: ctx.suppliers }, computeRequest(doc, ctx));

  it('оптимальний мікс і поточний вибір (переплата vs мікс)', () => {
    // усе без ПДВ
    expect(view.mix).toEqual({ totalNet: 220, suppliersUsed: 1, covered: 2, missing: 1, total: 3 });
    expect(view.current).toEqual({ approved: 1, total: 3, totalNet: 230, overpayNet: 10, overpayPct: 4.5455, profitNet: 0 });
  });

  it('«все у постачальника»: сума, покриття, бракує, різниця з міксом, мін. замовлення, скільки рядків затвердить кнопка', () => {
    expect(view.singles.map((s) => [s.blockId, s.totalNet, s.covered, s.missing, s.diffVsMixNet, s.belowMinOrder, s.approvable])).toEqual([
      ['b1', 250, 2, 1, 30, true, 1],
      ['b2', 220, 2, 1, 0, false, 2],
    ]);
  });

  it('заробіток: поточний вибір і «якщо все в цього постачальника» (націнка на вхід 10 %)', () => {
    const withMarkup = { ...doc, markup: { ...MARKUP, method: 'markup_on_cost' as const, value: 10 } };
    const v = buildScenarioView({ lines: doc.lines, blocks: doc.blocks, suppliers: ctx.suppliers }, computeRequest(withMarkup, ctx));
    // поточний: l1 у b2 (90 × 2 × 0,1 = 18) + l2 у b1 (5)
    expect(v.current.profitNet).toBe(23);
    expect(v.singles.map((s) => [s.blockId, s.profitNet])).toEqual([
      ['b1', 25],
      ['b2', 22],
    ]);
  });

  it('попередження мін. замовлення — за поточним вибором', () => {
    expect(view.minOrder).toHaveLength(1);
    expect(view.minOrder[0]).toMatchObject({ blockId: 'b1', supplierName: 'Постачальник b1', warning: { code: 'BELOW_MIN_ORDER' } });
  });
});
