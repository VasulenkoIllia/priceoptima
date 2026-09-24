import { describe, expect, it } from 'vitest';
import { makeLine } from '@shared/pricing/__tests__/fixtures';
import { markupFillPatch } from '../markupFill';

describe('протягування способу націнки (правки замовника 23.09 п.9)', () => {
  it('спосіб і % рядка-джерела; «Як у заявці» — скидає власний спосіб', () => {
    const pct = makeLine('l1', 1, { markup: { method: 'markup_on_cost', value: 25, manualPriceNet: null } });
    expect(markupFillPatch(pct)).toEqual({ method: 'markup_on_cost', value: 25, manualPriceNet: null, manualPriceGross: null });
    const rrp = makeLine('l2', 1, { markup: { method: 'rrp', value: null, manualPriceNet: null } });
    expect(markupFillPatch(rrp)).toEqual({ method: 'rrp', value: null, manualPriceNet: null, manualPriceGross: null });
    const asRequest = makeLine('l3', 1, { markup: { method: null, value: 40, manualPriceNet: null } });
    expect(markupFillPatch(asRequest)).toEqual({ method: null, value: null, manualPriceNet: null, manualPriceGross: null });
  });

  it('ручну ціну не протягуємо', () => {
    expect(markupFillPatch(makeLine('l1', 1, { markup: { method: 'manual', value: null, manualPriceNet: 100 } }))).toBeNull();
    expect(markupFillPatch(makeLine('l2', 1, { markup: { method: 'manual', value: null, manualPriceNet: null, manualPriceGross: 120 } }))).toBeNull();
  });
});
