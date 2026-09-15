import { describe, expect, it } from 'vitest';
import { computeRequest } from '@shared/pricing';
import { makeBlock, makeCtx, makeDoc, makeLine, makeSupplier, uah } from '@shared/pricing/__tests__/fixtures';
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
    expect(view.mix).toEqual({ totalGross: 264, suppliersUsed: 1, covered: 2, missing: 1, total: 3 });
    expect(view.current).toEqual({ approved: 1, total: 3, totalGross: 276, overpayGross: 12, overpayPct: 4.5455 });
  });

  it('«все у постачальника»: сума, покриття, бракує, різниця з міксом, мін. замовлення, скільки рядків затвердить кнопка', () => {
    expect(view.singles.map((s) => [s.blockId, s.totalGross, s.covered, s.missing, s.diffVsMixGross, s.belowMinOrder, s.approvable])).toEqual([
      ['b1', 300, 2, 1, 36, true, 1],
      ['b2', 264, 2, 1, 0, false, 2],
    ]);
  });

  it('попередження мін. замовлення — за поточним вибором', () => {
    expect(view.minOrder).toHaveLength(1);
    expect(view.minOrder[0]).toMatchObject({ blockId: 'b1', supplierName: 'Постачальник b1', warning: { code: 'BELOW_MIN_ORDER' } });
  });
});
