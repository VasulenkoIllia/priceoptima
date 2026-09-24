import { describe, expect, it } from 'vitest';
import type { MarkupRowComputed } from '../../types';
import { computeMarkupRow, computeMarkupTotals, computeSalePrice, markupIndicators, resolveMarkupRule } from '../markup';
import { computeRequest } from '../request';
import { makeBlock, makeCtx, makeDoc, makeHeader, makeLine, MARKUP, SETTINGS, uah } from './fixtures';

const base = { vatRatePct: 20, rounding: 'kopecks' as const, discountFormula: 'percent_off' as const, manualPriceNet: null };

describe('F24 правило націнки рядка', () => {
  it('override рядка → налаштування заявки; ручна ціна → manual', () => {
    const defaults = { ...MARKUP, method: 'markup_on_cost' as const, value: 20 };
    expect(resolveMarkupRule(makeLine('L1', 1), defaults)).toEqual({
      method: 'markup_on_cost',
      value: 20,
      manualPriceNet: null,
      manualPriceGross: null,
      isOverride: false,
    });
    expect(
      resolveMarkupRule(makeLine('L1', 1, { markup: { method: 'discount_from_rrp', value: null, manualPriceNet: null } }), defaults),
    ).toEqual({ method: 'discount_from_rrp', value: 20, manualPriceNet: null, manualPriceGross: null, isOverride: true });
    expect(
      resolveMarkupRule(makeLine('L1', 1, { markup: { method: 'rrp', value: 5, manualPriceNet: 99 } }), defaults),
    ).toEqual({ method: 'manual', value: null, manualPriceNet: 99, manualPriceGross: null, isOverride: true });
    // ручна G — лише коли ручної N немає
    expect(
      resolveMarkupRule(makeLine('L1', 1, { markup: { method: null, value: null, manualPriceNet: null, manualPriceGross: 132 } }), defaults),
    ).toEqual({ method: 'manual', value: null, manualPriceNet: null, manualPriceGross: 132, isOverride: true });
    expect(
      resolveMarkupRule(makeLine('L1', 1, { markup: { method: null, value: null, manualPriceNet: 99, manualPriceGross: 132 } }), defaults)
        .manualPriceGross,
    ).toBeNull();
  });
});

describe('F25 ціна продажу', () => {
  it('«як в Excel» зі знижкою −100 % не дає нескінченної ціни', () => {
    const r = computeSalePrice({ ...base, discountFormula: 'excel_divisor', costNet: 100, rrpGross: 180, method: 'discount_from_rrp', value: -100 });
    expect(r.saleNet).toBeNull();
    expect(r.saleGross).toBeNull();
  });

  it('T11: продаж по РРЦ', () => {
    const r = computeSalePrice({ ...base, costNet: 120, rrpGross: 180, method: 'rrp', value: 0 });
    expect(r).toEqual({ saleGross: 180, saleNet: 150, priceBasis: 'gross', warnings: [] });
    expect(markupIndicators(120, 150)).toEqual({ markupPct: 25, marginPct: 20 });
  });

  it('T12: націнка 20 % на вхід без ПДВ', () => {
    const r = computeSalePrice({ ...base, costNet: 470, rrpGross: null, method: 'markup_on_cost', value: 20 });
    expect(r.saleNet).toBe(564);
    expect(r.saleGross).toBe(676.8);
    expect(r.priceBasis).toBe('net');
    expect(markupIndicators(470, 564)).toEqual({ markupPct: 20, marginPct: 16.6667 });
  });

  it('T13: знижка 4 % від РРЦ — percent_off і excel_divisor, обидва нижче собівартості', () => {
    const p = computeSalePrice({ ...base, costNet: 15200, rrpGross: 18880, method: 'discount_from_rrp', value: 4 });
    expect(p.saleGross).toBe(18124.8);
    expect(p.saleNet).toBe(15104);
    expect(markupIndicators(15200, p.saleNet).markupPct).toBe(-0.6316);
    const e = computeSalePrice({
      ...base,
      discountFormula: 'excel_divisor',
      costNet: 15200,
      rrpGross: 18880,
      method: 'discount_from_rrp',
      value: 4,
    });
    expect(e.saleGross).toBe(18153.85);
    expect(e.saleNet).toBe(15128.21);
    expect(markupIndicators(15200, e.saleNet).markupPct).toBe(-0.4723);
  });

  it('T14: округлення до цілих', () => {
    const r = computeSalePrice({ ...base, rounding: 'integer', costNet: 387.09, rrpGross: null, method: 'markup_on_cost', value: 20 });
    expect(r.saleNet).toBe(465);
    expect(r.saleGross).toBe(558);
  });

  it('manual і відсутні дані', () => {
    expect(computeSalePrice({ ...base, costNet: 100, rrpGross: null, method: 'manual', value: null, manualPriceNet: 125.555 })).toEqual({
      saleNet: 125.56,
      saleGross: 150.67,
      priceBasis: 'net',
      warnings: [],
    });
    // Ф14 «Вручну»: введена G — якір, N = round2(G ÷ 1.2) (100.05 через N дало б 100.06)
    expect(
      computeSalePrice({ ...base, costNet: 76.96, rrpGross: null, method: 'manual', value: null, manualPriceGross: 132 }),
    ).toEqual({ saleNet: 110, saleGross: 132, priceBasis: 'gross', warnings: [] });
    expect(
      computeSalePrice({ ...base, costNet: 50, rrpGross: null, method: 'manual', value: null, manualPriceGross: 100.05 }),
    ).toMatchObject({ saleNet: 83.38, saleGross: 100.05 });
    expect(computeSalePrice({ ...base, costNet: 100, rrpGross: null, method: 'rrp', value: 0 }).warnings).toEqual(['NO_RRP']);
    expect(computeSalePrice({ ...base, costNet: 100, rrpGross: null, method: 'discount_from_rrp', value: 4 }).saleNet).toBeNull();
    expect(computeSalePrice({ ...base, costNet: null, rrpGross: null, method: 'markup_on_cost', value: 20 }).saleNet).toBeNull();
    expect(markupIndicators(null, 100)).toEqual({ markupPct: null, marginPct: null });
  });
});

describe('F26–F29 рядки і підсумки націнки', () => {
  // T11 + T12 + T13(percent_off) як рядки заявки (UAH)
  const doc = makeDoc({
    lines: [
      makeLine('L1', 1, { approval: { approved: true, approvedQty: null } }),
      makeLine('L2', 4, {
        markup: { method: 'markup_on_cost', value: 20, manualPriceNet: null },
        approval: { approved: true, approvedQty: 2 },
      }),
      makeLine('L3', 1, { markup: { method: 'discount_from_rrp', value: 4, manualPriceNet: null } }),
    ],
    blocks: [makeBlock('A', 0)],
    offers: [uah('L1', 'A', 120, { rrpCur: 180 }), uah('L2', 'A', 470), uah('L3', 'A', 15200, { rrpCur: 18880 })],
  });
  const c = computeRequest(doc, makeCtx());
  const rows = c.markup.rows;

  it('рядки (T11–T13)', () => {
    expect(rows.L1).toMatchObject({ saleNet: 150, saleGross: 180, markupPct: 25, marginPct: 20, rrpVsCostPct: 25, profitNet: 30 });
    expect(rows.L1!.notApproved).toBe(true);
    expect(rows.L2).toMatchObject({
      saleNet: 564,
      saleGross: 676.8,
      sumNet: 2256,
      sumGross: 2707.2,
      markupPct: 20,
      marginPct: 16.6667,
      profitNet: 376,
      isOverride: true,
    });
    expect(rows.L3).toMatchObject({ saleGross: 18124.8, saleNet: 15104, sumNet: 15104, markupPct: -0.6316, profitNet: -96 });
    expect(rows.L3!.warnings.map((w) => w.code)).toEqual(['BELOW_COST']);
  });

  it('F28 погодження', () => {
    expect(rows.L1).toMatchObject({ approvedQty: 1, approvedSumNet: 150, approvedSumGross: 180 });
    expect(rows.L2).toMatchObject({ approvedQty: 2, approvedSumNet: 1128, approvedSumGross: 1353.6 });
    expect(rows.L3).toMatchObject({ approvedQty: null, approvedSumNet: null, approvedSumGross: null });
  });

  it('F29 підсумки (Ф16, ТОВ без ПДВ: ПДВ від підсумку)', () => {
    expect(c.markup.totals).toEqual({
      costNet: 17200,
      costGross: 20640,
      saleNet: 17510,
      vat: 3502,
      saleGross: 21012,
      profitNet: 310,
      profitGross: 372,
      markupPct: 1.8023,
      marginPct: 1.7704,
      approvedSaleNet: 1278,
      approvedVat: 255.6,
      approvedSaleGross: 1533.6,
      linesPriced: 3,
      linesUnpriced: 0,
    });
  });

  it('Ф16–Ф18: підсумки за режимом цін заявки (ПДВ від підсумку ≠ Σ G × q′)', () => {
    // 3 рядки × q 1, N 0.04 → G = round2(0.048) = 0.05: Σ G × q′ = 0.15, а Ф16 без ПДВ: 0.12 + round2(0.024) = 0.14
    const lines = ['L1', 'L2', 'L3'].map((id) =>
      makeLine(id, 1, { markup: { method: 'manual', value: null, manualPriceNet: 0.04 }, approval: { approved: true, approvedQty: null } }),
    );
    const offers = lines.map((l) => uah(l.id, 'A', 0.03));
    const run = (vatMode: 'without_vat' | 'with_vat' | 'no_vat') =>
      computeRequest(
        makeDoc({ header: makeHeader({ kpSettings: { ...makeHeader().kpSettings, vatMode } }), lines, blocks: [makeBlock('A', 0)], offers }),
        makeCtx(),
      );
    const without = run('without_vat');
    expect(without.markup.totals).toMatchObject({ saleNet: 0.12, vat: 0.02, saleGross: 0.14, approvedSaleGross: 0.14 });
    expect(without.totals.totalSaleGross).toBe(0.14);
    expect(without.totals.approvedSaleGross).toBe(0.14);
    // ТОВ з ПДВ: Разом з ПДВ = Σ round2(G × q′) = 0.15; у т.ч. ПДВ = round2(0.15 × 20 ÷ 120) = 0.03
    const withVat = run('with_vat');
    expect(withVat.markup.totals).toMatchObject({ saleNet: 0.12, vat: 0.03, saleGross: 0.15 });
    expect(withVat.totals.totalSaleGross).toBe(0.15);
    // ФОП: «Разом» = Σ round2(N × q′), без ПДВ
    const fop = run('no_vat');
    expect(fop.markup.totals).toMatchObject({ saleNet: 0.12, vat: 0, saleGross: 0.12, approvedSaleGross: 0.12 });
    expect(fop.totals.totalSaleGross).toBe(0.12);
    // ФОП у цінах з ПДВ (п.6 правок, за замовчуванням): «Разом» = Σ round2(G × q′), як «Разом з ПДВ» у ТОВ; ПДВ не виділяється
    const fopGross = computeRequest(
      makeDoc({
        header: makeHeader({ kpSettings: { ...makeHeader().kpSettings, vatMode: 'no_vat' } }),
        lines,
        blocks: [makeBlock('A', 0)],
        offers,
      }),
      makeCtx([], { settings: { ...makeCtx().settings, fopPriceBasis: 'gross' } }),
    );
    expect(fopGross.markup.totals).toMatchObject({ vat: 0, saleGross: 0.15, approvedSaleGross: 0.15 });
    expect(fopGross.totals.totalSaleGross).toBe(withVat.totals.totalSaleGross);
    // прибуток «з ПДВ» у ФОП той самий, що й звичайний: він і так рахує вхід з ПДВ, а продаж — як у КП
    expect(fop.markup.totals.profitGross).toBe(fop.markup.totals.profitNet);
    expect(fopGross.markup.totals.profitGross).toBe(fopGross.markup.totals.profitNet);
  });

  it('F32 підсумки заявки для реєстру', () => {
    expect(c.totals).toEqual({
      linesCount: 3,
      suppliersCount: 1,
      totalPurchaseGross: 20640,
      totalPurchaseNet: 17200,
      totalSaleNet: 17510,
      totalSaleGross: 21012,
      profitNet: 310,
      approvedSaleGross: 1533.6,
    });
  });

  it('ABOVE_RRP і NO_RRP у рядку', () => {
    const header = makeHeader();
    const line = makeLine('L1', 2, { markup: { method: 'markup_on_cost', value: 50, manualPriceNet: null } });
    const eff = computeRequest(
      makeDoc({ lines: [line], blocks: [makeBlock('A', 0)], offers: [uah('L1', 'A', 100, { rrpCur: 150 })] }),
      makeCtx(),
    );
    expect(eff.markup.rows.L1!.saleGross).toBe(180);
    expect(eff.markup.rows.L1!.sumGross).toBe(360);
    expect(eff.markup.rows.L1!.warnings.map((w) => w.code)).toEqual(['ABOVE_RRP']);

    const noRrp = computeRequest(
      makeDoc({ lines: [makeLine('L1', 1)], blocks: [makeBlock('A', 0)], offers: [uah('L1', 'A', 100)] }),
      makeCtx(),
    );
    const row = noRrp.markup.rows.L1!;
    expect(row.saleNet).toBeNull();
    expect(row.warnings.map((w) => w.code)).toEqual(['NO_RRP']);
    expect(noRrp.markup.totals.linesUnpriced).toBe(1);

    // рядок без пропозиції: NO_RRP не показуємо
    const empty = computeMarkupRow(makeLine('L9', 1), null, null, MARKUP, header);
    expect(empty.warnings).toEqual([]);
    expect(empty.qty).toBe(1);
  });

  it('computeMarkupTotals без рядків', () => {
    const t = computeMarkupTotals([] as MarkupRowComputed[]);
    expect(t.saleGross).toBe(0);
    expect(t.markupPct).toBeNull();
  });

  it('формула знижки — із самої заявки, а не з поточних налаштувань', () => {
    const doc = makeDoc({
      header: makeHeader({ discountFormula: 'excel_divisor' }),
      lines: [makeLine('L1', 1, { markup: { method: 'discount_from_rrp', value: 4, manualPriceNet: null } })],
      blocks: [makeBlock('A', 0)],
      offers: [uah('L1', 'A', 15200, { rrpCur: 18880 })],
    });
    // у налаштуваннях інша формула — заявка лишається на своїй
    const r = computeRequest(doc, makeCtx([], { settings: { ...SETTINGS, discountFormula: 'percent_off' } }));
    expect(r.markup.rows.L1!.saleNet).toBe(15128.21);
  });
});
