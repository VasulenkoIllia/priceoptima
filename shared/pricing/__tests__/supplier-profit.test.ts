import { describe, expect, it } from 'vitest';
import { computeRequest } from '../request';
import { MARKUP, makeBlock, makeCtx, makeDoc, makeLine, makeSupplier, uah } from './fixtures';

describe('заробіток по постачальниках', () => {
  // націнка на вхід 20 %: заробіток рядка = вхід × 0,2 × к-сть
  const doc = makeDoc({
    markup: { ...MARKUP, method: 'markup_on_cost', value: 20 },
    lines: [
      makeLine('L1', 1),
      makeLine('L2', 4, { selection: { blockId: 'B' } }),
      makeLine('L3', 2),
      makeLine('L4', 1),
      makeLine('L5', 1, { markup: { method: null, value: null, manualPriceNet: 300 } }),
      makeLine('L6', 1, { markup: { method: 'rrp', value: null, manualPriceNet: null } }),
    ],
    blocks: [makeBlock('A', 0), makeBlock('B', 1)],
    offers: [
      uah('L1', 'A', 100),
      uah('L1', 'B', 120),
      uah('L2', 'A', 600),
      uah('L2', 'B', 640),
      uah('L3', 'A', 50),
      uah('L4', 'B', 200, { excluded: true }),
      uah('L5', 'A', 250),
      uah('L5', 'B', 280),
      uah('L6', 'A', 10), // «по РРЦ», а РРЦ немає — без ціни продажу
    ],
  });
  const c = computeRequest(doc, makeCtx([makeSupplier('A'), makeSupplier('B')]));

  it('за поточним вибором: рядки, де обрано постачальника; разом = прибуток заявки', () => {
    expect(c.supplierProfit.A!.selected).toEqual({ lines: 3, unpriced: 1, costNet: 450, saleNet: 540, profitNet: 90, markupPct: 20 });
    expect(c.supplierProfit.B!.selected).toEqual({ lines: 1, unpriced: 0, costNet: 2560, saleNet: 3072, profitNet: 512, markupPct: 20 });
    expect(c.supplierProfit.A!.selected.profitNet + c.supplierProfit.B!.selected.profitNet).toBe(c.markup.totals.profitNet);
  });

  it('«якщо все в цього постачальника»: покриті рядки, ручна ціна рядка лишається, виключені не входять', () => {
    // A: L1 20 + L2 480 + L3 20 + L5 (300 − 250) 50; L6 без ціни
    expect(c.supplierProfit.A!.allIn).toMatchObject({ lines: 4, unpriced: 1, costNet: 2850, saleNet: 3420, profitNet: 570 });
    // B: L1 24 + L2 512 + L5 (300 − 280) 20; L4 виключено
    expect(c.supplierProfit.B!.allIn).toMatchObject({ lines: 3, unpriced: 0, costNet: 2960, saleNet: 3516, profitNet: 556 });
  });

  it('порожній рядок (без назви й к-сті) не рахується ні там, ні там', () => {
    const excluded = computeRequest(
      { ...doc, lines: doc.lines.map((l) => (l.id === 'L2' ? { ...l, clientName: '', qty: 0 } : l)) },
      makeCtx([makeSupplier('A'), makeSupplier('B')]),
    );
    expect(excluded.supplierProfit.B!.selected.lines).toBe(0);
    expect(excluded.supplierProfit.A!.allIn.profitNet).toBe(90);
  });
});
