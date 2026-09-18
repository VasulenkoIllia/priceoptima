import { describe, expect, it } from 'vitest';
import { makeLine } from '@shared/pricing/__tests__/fixtures';
import { COL } from '../colIds';
import { dragTargets, fillDownTargets, fillFieldOf, planFill } from '../fill';

describe('протягування одиниці й кількості (п.2.2 правок)', () => {
  it('протягуються лише «Од.» і «К-сть» клієнта', () => {
    expect(fillFieldOf(COL.line('clientUnit'))).toBe('clientUnit');
    expect(fillFieldOf(COL.line('qty'))).toBe('qty');
    expect(fillFieldOf(COL.line('clientName'))).toBeNull();
    expect(fillFieldOf(COL.block('b1', 'qty'))).toBeNull();
  });

  it('план: значення джерела, рядки з тим самим значенням пропускаються', () => {
    const src = makeLine('a', 5, { clientUnit: 'м' });
    const targets = [makeLine('b', 1, { clientUnit: 'шт' }), makeLine('c', 5, { clientUnit: 'м' }), makeLine('d', 2, { clientUnit: null })];
    expect(planFill('clientUnit', src, targets)).toEqual([
      { id: 'b', patch: { clientUnit: 'м' } },
      { id: 'd', patch: { clientUnit: 'м' } },
    ]);
    expect(planFill('qty', src, targets)).toEqual([
      { id: 'b', patch: { qty: 5 } },
      { id: 'd', patch: { qty: 5 } },
    ]);
  });

  it('Ctrl+D: з рядка вище; у першому рядку — нема звідки', () => {
    const shown = ['a', 'b', 'c', 'd'];
    expect(fillDownTargets(shown, 'c', [])).toEqual({ sourceId: 'b', targetIds: ['c'] });
    expect(fillDownTargets(shown, 'a', [])).toBeNull();
  });

  it('Ctrl+D з виділеними рядками: верхній виділений — у решту (порядок сітки)', () => {
    const shown = ['a', 'b', 'c', 'd'];
    expect(fillDownTargets(shown, 'c', ['d', 'b', 'c'])).toEqual({ sourceId: 'b', targetIds: ['c', 'd'] });
    // фокус поза виділенням — як без виділення
    expect(fillDownTargets(shown, 'a', ['c', 'd'])).toBeNull();
  });

  it('протягування вниз і вгору, за межами — до краю', () => {
    const shown = ['a', 'b', 'c', 'd'];
    expect(dragTargets(shown, 'b', 3)).toEqual(['c', 'd']);
    expect(dragTargets(shown, 'c', 0)).toEqual(['a', 'b']);
    expect(dragTargets(shown, 'b', 1)).toEqual([]);
    expect(dragTargets(shown, 'b', 99)).toEqual(['c', 'd']);
    expect(dragTargets(shown, 'x', 2)).toEqual([]);
  });
});
