import { describe, expect, it } from 'vitest';
import { isActiveLine } from '../lines';
import { computeRequest } from '../request';
import { makeBlock, makeCtx, makeDoc, makeHeader, makeLine, makeOffer, uah } from './fixtures';

// T6: рядок qty 4; A = 14.484 USD × 45 → 651.78; B = 640.00 UAH; C = 14.9 USD × 45 → 670.5
const blocks = [
  makeBlock('A', 0, { rates: { USD: 45, EUR: null } }),
  makeBlock('B', 1),
  makeBlock('C', 2, { rates: { USD: 45, EUR: null } }),
];
const offersT6 = (patchB: Partial<ReturnType<typeof makeOffer>> = {}) => [
  makeOffer('L1', 'A', { currency: 'USD', purchasePriceCur: 14.484 }),
  uah('L1', 'B', 640, patchB),
  makeOffer('L1', 'C', { currency: 'USD', purchasePriceCur: 14.9 }),
];
const run = (lineSel: string | null, patchB = {}) =>
  computeRequest(
    makeDoc({ lines: [makeLine('L1', 4, { selection: { blockId: lineSel } })], blocks, offers: offersT6(patchB) }),
    makeCtx(),
  );

describe('F9–F11 мінімум, рекомендація, відхилення (T6)', () => {
  it('мінімум — B; diffVsMinPct і spreadPct', () => {
    const c = run(null);
    expect(c.offers['L1:A']!.unitNetUah).toBe(651.78);
    expect(c.offers['L1:C']!.unitNetUah).toBe(670.5);
    expect(c.offers['L1:B']!.isMin).toBe(true);
    expect(c.offers['L1:B']!.isRecommended).toBe(true);
    expect(c.offers['L1:B']!.isSelected).toBe(true);
    expect(c.offers['L1:B']!.diffVsMinPct).toBe(0);
    expect(c.offers['L1:A']!.diffVsMinPct).toBe(1.84);
    expect(c.offers['L1:C']!.diffVsMinPct).toBe(4.77);
    const line = c.lines.L1!;
    expect(line.minUnitNet).toBe(640);
    expect(line.maxUnitNet).toBe(670.5);
    expect(line.spreadPct).toBe(4.77);
    expect(line.filledCount).toBe(3);
    expect(line.candidateCount).toBe(3);
    expect(line.selectionState).toBe('recommended');
    expect(line.effectiveBlockId).toBe('B');
    expect(line.overpayGross).toBe(0);
  });

  it('виключення B → рекомендований A', () => {
    const c = run(null, { excluded: true });
    expect(c.offers['L1:B']!.isCandidate).toBe(false);
    expect(c.offers['L1:B']!.isExcluded).toBe(true);
    expect(c.lines.L1!.recommendedBlockId).toBe('A');
    expect(c.lines.L1!.filledCount).toBe(3);
    expect(c.lines.L1!.candidateCount).toBe(2);
  });

  it('нічия A = B = 651.78 → isMin у обох, рекомендований A (менша позиція)', () => {
    const c = run(null, { purchasePriceCur: 651.78 });
    expect(c.offers['L1:A']!.isMin).toBe(true);
    expect(c.offers['L1:B']!.isMin).toBe(true);
    expect(c.offers['L1:A']!.isRecommended).toBe(true);
    expect(c.offers['L1:B']!.isRecommended).toBe(false);
  });
});

describe('F10 ефективний вибір рядка', () => {
  it('T7: ручний вибір не мінімуму — переплата 146.40', () => {
    const c = run('C');
    const line = c.lines.L1!;
    expect(line.selectionState).toBe('manual_non_optimal');
    expect(line.effectiveBlockId).toBe('C');
    expect(line.recommendedBlockId).toBe('B');
    expect(c.offers['L1:C']!.sumGrossUah).toBe(3218.4);
    expect(c.offers['L1:B']!.sumGrossUah).toBe(3072);
    expect(line.overpayGross).toBe(146.4);
    const w = line.warnings.find((x) => x.code === 'SELECTION_NOT_OPTIMAL');
    expect(w?.params).toEqual({ overpayGross: 146.4 });
    expect(c.offers['L1:C']!.isSelected).toBe(true);
    expect(c.offers['L1:B']!.isSelected).toBe(false);
  });

  it('ручний вибір мінімуму — manual_optimal', () => {
    const c = run('B');
    expect(c.lines.L1!.selectionState).toBe('manual_optimal');
    expect(c.lines.L1!.warnings).toEqual([]);
  });

  it('вибір виключеної → manual_invalid, SELECTED_EXCLUDED, діє рекомендація', () => {
    const c = run('B', { excluded: true });
    expect(c.lines.L1!.selectionState).toBe('manual_invalid');
    expect(c.lines.L1!.effectiveBlockId).toBe('A');
    expect(c.lines.L1!.warnings.map((w) => w.code)).toContain('SELECTED_EXCLUDED');
  });

  it('вибір блоку без пропозиції → manual_invalid', () => {
    const c = computeRequest(
      makeDoc({
        lines: [makeLine('L1', 4, { selection: { blockId: 'Z' } })],
        blocks,
        offers: offersT6(),
      }),
      makeCtx(),
    );
    expect(c.lines.L1!.selectionState).toBe('manual_invalid');
    expect(c.lines.L1!.effectiveBlockId).toBe('B');
  });

  it('рядок без пропозицій → none, NO_OFFERS; без к-сті → QTY_ZERO', () => {
    const c = computeRequest(
      makeDoc({ lines: [makeLine('L1', 0), makeLine('L2', 0, { clientName: '' })], blocks, offers: [] }),
      makeCtx(),
    );
    expect(c.lines.L1!.selectionState).toBe('none');
    expect(c.lines.L1!.effectiveOfferId).toBeNull();
    expect(c.lines.L1!.warnings.map((w) => w.code)).toEqual(['NO_OFFERS', 'QTY_ZERO']);
    // неактивний рядок попереджень не дає
    expect(c.lines.L2!.isActive).toBe(false);
    expect(c.lines.L2!.warnings).toEqual([]);
  });
});

describe('F12 активний рядок', () => {
  it('назва або к-сть', () => {
    expect(isActiveLine({ clientName: 'Змішувач', qty: 0 })).toBe(true);
    expect(isActiveLine({ clientName: '  ', qty: 2 })).toBe(true);
    expect(isActiveLine({ clientName: ' ', qty: 0 })).toBe(false);
  });

  it('неактивний рядок не рахується в покритті', () => {
    const c = computeRequest(
      makeDoc({
        header: makeHeader(),
        lines: [makeLine('L1', 1), makeLine('L2', 0, { clientName: '' })],
        blocks: [makeBlock('B', 0)],
        offers: [uah('L1', 'B', 10)],
      }),
      makeCtx(),
    );
    expect(c.blocks.B!.totalLines).toBe(1);
    expect(c.blocks.B!.coveragePct).toBe(100);
    expect(c.totals.linesCount).toBe(1);
  });
});
