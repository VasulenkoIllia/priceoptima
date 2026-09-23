import { describe, expect, it } from 'vitest';
import { computeRequest } from '../request';
import { makeBlock, makeCtx, makeDoc, makeLine, makeSupplier, uah } from './fixtures';

describe('F13–F14 підсумки блоків і дельта (T8)', () => {
  // ціни без ПДВ, UAH: L1 qty 2: A 100, B 90; L2 qty 10: A 50, B 55; L3 qty 1: A 300, B —
  const doc = makeDoc({
    lines: [makeLine('L1', 2), makeLine('L2', 10), makeLine('L3', 1)],
    blocks: [makeBlock('A', 0), makeBlock('B', 1)],
    offers: [uah('L1', 'A', 100), uah('L1', 'B', 90), uah('L2', 'A', 50), uah('L2', 'B', 55), uah('L3', 'A', 300)],
  });
  const c = computeRequest(doc, makeCtx([makeSupplier('A'), makeSupplier('B')]));

  it('рекомендації L1→B, L2→A, L3→A', () => {
    expect(c.lines.L1!.recommendedBlockId).toBe('B');
    expect(c.lines.L2!.recommendedBlockId).toBe('A');
    expect(c.lines.L3!.recommendedBlockId).toBe('A');
  });

  it('блок A', () => {
    const a = c.blocks.A!;
    expect(a.totalGross).toBe(1200);
    expect(a.totalGrossIncluded).toBe(1200);
    expect(a.selectedGross).toBe(960);
    expect(a.selectedNet).toBe(800);
    expect(a.selectedCount).toBe(2);
    expect(a.deltaGross).toBe(24);
    expect(a.deltaNet).toBe(20);
    expect(a.deltaPct).toBe(2.04);
    expect(a.totalNet).toBe(1000);
    expect(a.coveragePct).toBe(100);
    expect(a.filledCount).toBe(3);
  });

  it('блок B', () => {
    const b = c.blocks.B!;
    expect(b.totalGross).toBe(876);
    expect(b.selectedGross).toBe(216);
    expect(b.deltaGross).toBe(60);
    expect(b.deltaPct).toBe(7.35);
    expect(b.coveragePct).toBe(66.67);
    expect(b.belowMinOrder).toBe(false);
  });

  it('виключена пропозиція (Ф10, РЕД-13): не входить у «Всього з ПДВ», покриття і дельту', () => {
    const excl = computeRequest(
      { ...doc, offers: doc.offers.map((o) => (o.id === 'L2:B' ? { ...o, excluded: true } : o)) },
      makeCtx(),
    );
    const b = excl.blocks.B!;
    expect(b.totalGross).toBe(216);
    expect(b.totalGrossIncluded).toBe(216);
    expect(b.totalGrossWithExcluded).toBe(876);
    expect(b.filledCount).toBe(1);
    expect(b.coveragePct).toBe(33.33);
    expect(b.deltaGross).toBe(0);
    expect(b.deltaPct).toBe(0);
  });
});

describe('«найдешевший» і дельта за сумою з урахуванням кратності', () => {
  // L1 qty 10: A 10 грн, кратність 12 (у постачальника 12 шт) = 120; B 11 грн, кратність 1 → 110. За ціною дешевший A, за сумою — B.
  const doc = makeDoc({
    lines: [makeLine('L1', 10)],
    blocks: [makeBlock('A', 0), makeBlock('B', 1)],
    offers: [uah('L1', 'A', 10, { multiplicity: 12, qty: 12 }), uah('L1', 'B', 11)],
  });
  const c = computeRequest(doc, makeCtx([makeSupplier('A'), makeSupplier('B')]));

  it('дельта — проти найменшої суми рядка: A дорожчий, B без переплати', () => {
    expect(c.blocks.A!.deltaNet).toBe(10);
    expect(c.blocks.A!.deltaGross).toBe(12);
    expect(c.blocks.B!.deltaNet).toBe(0);
  });

  it('«найдешевший» — лише B', () => {
    expect(c.blocks.A!.cheapest).toBe(false);
    expect(c.blocks.B!.cheapest).toBe(true);
  });

  it('кілька блоків без переплати — позначка в того, що покриває більше рядків', () => {
    const two = makeDoc({
      lines: [makeLine('L1', 1), makeLine('L2', 1)],
      blocks: [makeBlock('A', 0), makeBlock('B', 1)],
      offers: [uah('L1', 'A', 10), uah('L1', 'B', 10), uah('L2', 'B', 5)],
    });
    const r = computeRequest(two, makeCtx([makeSupplier('A'), makeSupplier('B')]));
    expect([r.blocks.A!.cheapest, r.blocks.B!.cheapest]).toEqual([false, true]);
  });
});

describe('F16–F18 сценарії (T9) і F15 мін. сума (T10)', () => {
  const lines = [makeLine('L1', 1), makeLine('L2', 4), makeLine('L3', 2)];
  const blocks = [makeBlock('A', 0), makeBlock('B', 1), makeBlock('C', 2)];
  const offers = [
    uah('L1', 'A', 387.09),
    uah('L1', 'B', 400),
    uah('L2', 'A', 651.78),
    uah('L2', 'B', 640),
    uah('L2', 'C', 670.5),
    uah('L3', 'B', 480),
    uah('L3', 'C', 470),
  ];
  const suppliers = [makeSupplier('A'), makeSupplier('B'), makeSupplier('C')];
  const c = computeRequest(makeDoc({ lines, blocks, offers }), makeCtx(suppliers));
  const [mix, current, singleA, singleB, singleC] = c.scenarios;

  it('порядок сценаріїв', () => {
    expect(c.scenarios.map((s) => `${s.kind}:${s.blockId ?? ''}`)).toEqual([
      'optimal_mix:',
      'current_selection:',
      'single_supplier:A',
      'single_supplier:B',
      'single_supplier:C',
    ]);
  });

  it('оптимальний мікс', () => {
    expect(mix!.totalGross).toBe(4664.51);
    expect(mix!.totalNet).toBe(3887.09);
    expect(mix!.suppliersUsed).toBe(3);
    expect(mix!.blockIds).toEqual(['A', 'B', 'C']);
    expect(mix!.coveredLines).toBe(3);
    expect(mix!.missingLines).toBe(0);
    expect(mix!.diffVsMixGross).toBeNull();
  });

  it('поточний вибір без галочок = мікс', () => {
    expect(current!.totalGross).toBe(4664.51);
    expect(current!.diffVsMixGross).toBe(0);
    expect(current!.diffVsMixPct).toBe(0);
  });

  it('все у A / B / C', () => {
    // L2 у A: Cg = round2(651.78 × 1.2) = 782.14; × 4 = 3128.56 (Ф4/Ф6)
    expect(singleA!.totalGross).toBe(3593.07);
    expect(singleA!.coveredLines).toBe(2);
    expect(singleA!.missingLines).toBe(1);
    expect(singleA!.missingLineIds).toEqual(['L3']);
    expect(singleA!.diffVsMixGross).toBe(56.56);
    expect(singleA!.diffVsMixPct).toBe(1.5993);

    expect(singleB!.totalGross).toBe(4704);
    expect(singleB!.coveredLines).toBe(3);
    expect(singleB!.suppliersUsed).toBe(1);
    expect(singleB!.diffVsMixGross).toBe(39.49);
    expect(singleB!.diffVsMixPct).toBe(0.8466);

    expect(singleC!.totalGross).toBe(4346.4);
    expect(singleC!.coveredLines).toBe(2);
    expect(singleC!.missingLineIds).toEqual(['L1']);
    expect(singleC!.diffVsMixGross).toBe(146.4);
  });

  it('F17: поточний вибір з галочкою C у L2 — переплата vs мікс', () => {
    const sel = computeRequest(
      makeDoc({ lines: lines.map((l) => (l.id === 'L2' ? { ...l, selection: { blockId: 'C' } } : l)), blocks, offers }),
      makeCtx(suppliers),
    );
    const cur = sel.scenarios[1]!;
    expect(cur.totalGross).toBe(4810.91);
    expect(cur.diffVsMixGross).toBe(146.4);
    expect(cur.blockIds).toEqual(['A', 'C']);
  });

  it('Ф13: «все в одного» без виключених пропозицій', () => {
    const excl = computeRequest(
      makeDoc({ lines, blocks, offers: offers.map((o) => (o.id === 'L1:B' ? { ...o, excluded: true } : o)) }),
      makeCtx(suppliers),
    );
    const b = excl.scenarios[3]!;
    expect(b.totalGross).toBe(4224);
    expect(b.coveredLines).toBe(2);
    expect(b.missingLineIds).toEqual(['L1']);
    expect(b.diffVsMixGross).toBe(24);
    expect(b.diffVsMixPct).toBe(0.5714);
  });

  it('T10: A.minOrderAmount = 1000 → мікс і блок A нижче мін. замовлення', () => {
    const withMin = computeRequest(
      makeDoc({ lines, blocks, offers }),
      makeCtx([makeSupplier('A', { minOrderAmount: 1000 }), makeSupplier('B'), makeSupplier('C')]),
    );
    expect(withMin.scenarios[0]!.belowMinOrderBlockIds).toEqual(['A']);
    expect(withMin.scenarios[2]!.belowMinOrderBlockIds).toEqual([]); // все у A = 3593.07
    const a = withMin.blocks.A!;
    expect(a.selectedGross).toBe(464.51);
    expect(a.minOrderAmount).toBe(1000);
    expect(a.belowMinOrder).toBe(true);
    expect(a.warnings).toEqual([
      { code: 'BELOW_MIN_ORDER', severity: 'warning', blockId: 'A', params: { selectedGross: 464.51, minOrderAmount: 1000 } },
    ]);
    expect(withMin.warnings.map((w) => w.code)).toContain('BELOW_MIN_ORDER');
  });
});
