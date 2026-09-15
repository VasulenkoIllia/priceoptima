import { describe, expect, it } from 'vitest';
import { computeRequest } from '@shared/pricing';
import { makeBlock, makeCtx, makeDoc, makeLine, makeSupplier, uah } from '@shared/pricing/__tests__/fixtures';
import type { RequestDocInput } from '@shared/pricing';
import type { ProductPickDto } from '@shared/types';
import { buildLineRows, buildTotalsRow, countByFilter, filterRows, isNotApproved, isSimilarMiss, missKey, type LineRow } from '../rows';

const CTX = makeCtx([makeSupplier('b1'), makeSupplier('b2')]);

function docWith(patch: Partial<RequestDocInput> = {}): RequestDocInput {
  return makeDoc({
    lines: [
      makeLine('l1', 2, { clientName: 'Змішувач д/раковини' }),
      makeLine('l2', 1, { selection: { blockId: 'b2' }, clientName: 'Кран кульовий 1/2"' }),
      makeLine('l3', 4, { clientName: 'Труба ППР 20' }),
      makeLine('l4', 0, { clientName: '' }),
    ],
    blocks: [makeBlock('b1', 1), makeBlock('b2', 2)],
    offers: [
      uah('l1', 'b1', 100),
      uah('l1', 'b2', 90),
      uah('l2', 'b1', 50),
      uah('l2', 'b2', 55),
      uah('l3', 'b1', 10, { stockQty: 1 }),
    ],
    ...patch,
  });
}

function rowsOf(doc: RequestDocInput, prev?: LineRow[], misses = {}) {
  return buildLineRows({ doc, computed: computeRequest(doc, CTX), misses, prev: prev && new Map(prev.map((r) => [r.id, r])) });
}

describe('buildLineRows', () => {
  it('рядок: пропозиції по блоках і ефективний вибір', () => {
    const [r1, r2, r3, r4] = rowsOf(docWith());
    expect(r1.chosen?.blockId).toBe('b2');
    expect(r1.cmp?.selectionState).toBe('recommended');
    expect(r2.chosen?.blockId).toBe('b2');
    expect(r2.cmp?.selectionState).toBe('manual_non_optimal');
    expect(r3.cells.b2.offer).toBeNull();
    expect(r4.chosen).toBeNull();
  });

  it('незмінені рядки зберігають посилання, змінений — новий об’єкт', () => {
    const doc = docWith();
    const first = rowsOf(doc);
    const same = rowsOf(doc, first);
    expect(same.every((r, i) => r === first[i])).toBe(true);
    // зміна ціни в l1/b1 не чіпає інші рядки
    const doc2 = { ...doc, offers: doc.offers.map((o) => (o.id === 'l1:b1' ? { ...o, purchasePriceCur: 80 } : o)) };
    const next = rowsOf(doc2, first);
    expect(next[0]).not.toBe(first[0]);
    expect(next[0].chosen?.blockId).toBe('b1');
    expect(next.slice(1).every((r, i) => r === first[i + 1])).toBe(true);
  });

  it('невдалий артикул показується лише в порожній клітинці', () => {
    const doc = docWith();
    const misses = { [missKey('l3', 'b2')]: { sku: 'X-1', kind: 'not_found' as const }, [missKey('l1', 'b1')]: { sku: 'X-2', kind: 'not_found' as const } };
    const first = rowsOf(doc);
    const rows = rowsOf(doc, first, misses);
    expect(rows[2].cells.b2.miss?.sku).toBe('X-1');
    expect(rows[2]).not.toBe(first[2]);
    expect(rows[0].cells.b1.miss).toBeNull();
    expect(rows[0]).toBe(first[0]);
  });
});

describe('фільтр і пошук рядків', () => {
  const rows = rowsOf(docWith());

  it('не підібрані / без затвердження / з попередженнями', () => {
    const doc = docWith({ offers: docWith().offers.filter((o) => o.lineId !== 'l3') });
    const r = rowsOf(doc);
    expect(filterRows(r, 'unmatched', '').map((x) => x.id)).toEqual(['l3']);
    expect(filterRows(rows, 'unapproved', '').map((x) => x.id)).toEqual(['l1', 'l3']);
    // l3: к-сть 4 при наявності 1
    expect(filterRows(rows, 'warnings', '').map((x) => x.id)).toEqual(['l3']);
    expect(countByFilter(rows)).toEqual({ all: 4, unmatched: 0, unapproved: 2, warnings: 1, stock: 1, stale: 0 });
  });

  it('пошук по назві клієнта, артикулу пропозиції і № рядка', () => {
    expect(filterRows(rows, 'all', 'кран 1/2').map((x) => x.id)).toEqual(['l2']);
    expect(filterRows(rows, 'all', 'SKU-l3-b1').map((x) => x.id)).toEqual(['l3']);
    expect(filterRows(rows, 'all', '').length).toBe(4);
    expect(filterRows(rows, 'unapproved', 'труба').map((x) => x.id)).toEqual(['l3']);
  });

  it('рядок підсумків', () => {
    const doc = docWith();
    const t = buildTotalsRow(doc, computeRequest(doc, CTX));
    expect(t).toMatchObject({ kind: 'totals', activeCount: 3, approvedCount: 1 });
    expect(t.blocks.b1.filledCount).toBe(3);
    expect(t.overpayGross).toBeGreaterThan(0);
  });
});

describe('підсумки і стани вибору — з computeRequest', () => {
  it('підсумки блоків, закупівля і переплата — з рушія (сценарій «Поточний вибір» vs мікс)', () => {
    const doc = docWith();
    const computed = computeRequest(doc, CTX);
    const t = buildTotalsRow(doc, computed);
    const current = computed.scenarios.find((s) => s.kind === 'current_selection')!;
    expect(t.blocks).toBe(computed.blocks);
    expect(t.totals).toBe(computed.totals);
    expect(t.totals.totalPurchaseGross).toBe(current.totalGross);
    // l2: затверджено 55 замість 50 → (55 − 50) × 1,2 = 6,00
    expect(t.overpayGross).toBe(6);
    expect(t.overpayGross).toBe(current.diffVsMixGross);
  });

  it('виключена пропозиція не входить у «Всього з ПДВ», покриття і Дельту блоку', () => {
    const base = docWith();
    const doc = { ...base, offers: base.offers.map((o) => (o.id === 'l1:b1' ? { ...o, excluded: true } : o)) };
    const t = buildTotalsRow(doc, computeRequest(doc, CTX));
    // b1: l2 50 × 1,2 = 60,00; l3 10 × 1,2 × 4 = 48,00; l1 (виключено) 100 × 1,2 × 2 = 240,00 — лише довідково
    expect(t.blocks.b1).toMatchObject({ filledCount: 2, totalGross: 108, totalGrossWithExcluded: 348, deltaGross: 0 });
    // b2: l1 90 × 1,2 × 2 = 216,00 (мінімум); l2 55 × 1,2 = 66,00 vs 60,00 → Дельта 6,00
    expect(t.blocks.b2).toMatchObject({ filledCount: 2, totalGross: 282, deltaGross: 6 });
  });

  it('«не затверджено»: рекомендація без галочки або затверджена стала недійсною; ручний вибір — ні', () => {
    const doc = docWith({
      lines: [...docWith().lines, makeLine('l5', 1, { selection: { blockId: 'b1' }, clientName: 'Вентиль' })],
      offers: [...docWith().offers, uah('l5', 'b1', 10, { purchasePriceCur: null }), uah('l5', 'b2', 12)],
    });
    const [r1, r2, , r4, r5] = rowsOf(doc);
    expect(isNotApproved(r1.cmp)).toBe(true);
    expect(isNotApproved(r2.cmp)).toBe(false);
    expect(isNotApproved(r4.cmp)).toBe(false);
    expect(r5.cmp?.selectionState).toBe('manual_invalid');
    expect(r5.chosen?.blockId).toBe('b2');
    expect(isNotApproved(r5.cmp)).toBe(true);
    expect(filterRows(rowsOf(doc), 'unapproved', '').map((x) => x.id)).toEqual(['l1', 'l3', 'l5']);
  });

  it('невдалий артикул: лише схожі (префікс) vs кілька точних збігів', () => {
    const pick = (matchKind: ProductPickDto['matchKind']) => ({ matchKind }) as ProductPickDto;
    expect(isSimilarMiss({ sku: 'ЦР00', kind: 'ambiguous', candidates: [pick('sku_prefix'), pick('sku_prefix')] })).toBe(true);
    expect(isSimilarMiss({ sku: 'ЦР1', kind: 'ambiguous', candidates: [pick('sku_exact'), pick('sku_exact')] })).toBe(false);
    expect(isSimilarMiss({ sku: 'X', kind: 'not_found' })).toBe(false);
  });
});
