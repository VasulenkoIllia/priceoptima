// Золотий тест: наскрізний приклад ТЗ §5.3 (заявка 000001). Кожне число ТЗ — точним збігом до копійки;
// відсотки — з точністю показу (2 знаки).
import { describe, expect, it } from 'vitest';
import type { CurrencyCode, KpVatMode } from '../../enums';
import { formatKpNumber } from '../../format/numbering';
import type { LineMarkupOverride, RequestComputed, RequestLine } from '../../types';
import { approvedKpRows, buildKpRows, computeKpTotals } from '../kp-totals';
import { pct, round2, sumMoney } from '../money';
import { createOfferFromProduct } from '../offer-factory';
import { createSupplierBlock } from '../rates';
import { computeRequest, type RequestDocInput } from '../request';
import { MARKUP, makeCtx, makeHeader, makeLine, makeSupplier } from './fixtures';

let checked = 0;
/** Число з ТЗ — точний збіг. */
function num(actual: number | null | undefined, expected: number): void {
  expect(actual).toBe(expected);
  checked++;
}
/** Відсоток з ТЗ — як показано (2 знаки). */
function pct2(actual: number | null | undefined, expected: number): void {
  expect(actual == null ? null : round2(actual)).toBe(expected);
  checked++;
}

// ── Вхідні дані §5.3 ───────────────────────────────────────────────
const CR = 'santeh';
const WI = 'akva';
const PL = 'termo';

// Ф2: курси блоків — з прайсу постачальника; НБУ в шапці навмисно інший
const SUPPLIERS = [
  makeSupplier(CR, { name: 'САНТЕХ-ІМПОРТ', defaultCurrency: 'USD', priceListRates: { USD: 45, EUR: 52.1, date: '2026-09-01' } }),
  makeSupplier(WI, { name: 'АКВА-ТРЕЙД', defaultCurrency: 'USD', priceListRates: { USD: 44.9, EUR: 52.2, date: '2026-09-01' } }),
  makeSupplier(PL, { name: 'ТЕРМО-ПЛАСТ', defaultCurrency: 'UAH', priceListRates: { USD: 45, EUR: 52, date: '2026-09-01' } }),
];
const header = makeHeader({ rates: { USD: 45.05, EUR: 52.15, date: '2026-09-11' } });
const blocks = SUPPLIERS.map((s, i) => createSupplierBlock(s, header.rates, { id: s.id, position: i + 1 }));

// Позиції клієнта: [найменування, од., q]
const CLIENT_LINES: [string, string, number][] = [
  ['Змішувач д/раковини', 'шт', 1],
  ['Кран кульовий 1/2"', 'шт', 4],
  ['Мийка 500*500', 'шт', 1],
  ['Кран кульовий 3/4"', 'шт', 2],
  ['Душовий піддон', 'шт', 1],
  ['Шланг 0,8м вв 1/2"', 'шт', 4],
  ['Американка 2"', 'шт', 2],
  ['Фільтр косий 1/2"', 'шт', 1],
  ['Клапан вв Ду15', 'шт', 1],
  ['Муфта 20х1/2" З', 'шт', 8],
  ['Кріплення для труб 40', 'шт', 20],
  ['Труба ппр ду40', 'м', 118],
];
const lineId = (n: number) => `L${n}`;
const offerId = (n: number, block: string) => `L${n}:${block}`;

interface TzProduct {
  line: number;
  block: string;
  sku: string;
  currency: CurrencyCode;
  price: number;
  rrp: number | null;
  multiplicity?: number;
}
// 12 товарів (Excel + скориговані ціни з примітки до 5.3) і альтернативи кроку 1 (*)
const PRODUCTS: TzProduct[] = [
  { line: 1, block: CR, sku: 'ЦР0000123', currency: 'USD', price: 8.602, rrp: 18.3 },
  { line: 2, block: CR, sku: 'ЦР0000124', currency: 'USD', price: 2.648, rrp: 5.38 },
  { line: 3, block: CR, sku: 'ЦР0000125', currency: 'USD', price: 24.695, rrp: 52.54 },
  { line: 4, block: CR, sku: 'ЦР0000126', currency: 'EUR', price: 3.438, rrp: 7.44 },
  { line: 5, block: WI, sku: 'WI0000127', currency: 'USD', price: 48.08, rrp: 102.3 },
  { line: 6, block: WI, sku: 'WI0000128', currency: 'USD', price: 1.985, rrp: 4.08 },
  { line: 7, block: WI, sku: 'WI0000129', currency: 'EUR', price: 9.284, rrp: 19.75 },
  { line: 8, block: WI, sku: 'WI0000130', currency: 'EUR', price: 15.554, rrp: 33.09 },
  { line: 9, block: PL, sku: 'PL0000131', currency: 'UAH', price: 124.81, rrp: 266 },
  { line: 10, block: PL, sku: 'PL0000132', currency: 'UAH', price: 23.92, rrp: 51 },
  { line: 11, block: PL, sku: 'PL0000133', currency: 'USD', price: 0.382, rrp: 0.81 },
  { line: 12, block: PL, sku: 'PL0000134', currency: 'EUR', price: 1.48, rrp: 3.2, multiplicity: 4 },
  { line: 1, block: WI, sku: 'WI-ALT-01', currency: 'USD', price: 9.1, rrp: null },
  { line: 1, block: PL, sku: 'PL-ALT-01', currency: 'UAH', price: 372, rrp: null },
  { line: 2, block: WI, sku: 'WI-ALT-02', currency: 'USD', price: 2.78, rrp: null },
  { line: 12, block: WI, sku: 'WI-ALT-12', currency: 'USD', price: 1.8, rrp: null },
];

const baseLines: RequestLine[] = CLIENT_LINES.map(([name, unit, qty], i) =>
  makeLine(lineId(i + 1), qty, { position: i + 1, clientName: name, clientUnit: unit }),
);
const offers = PRODUCTS.map((p) => {
  const unit = CLIENT_LINES[p.line - 1]![1];
  return createOfferFromProduct(
    {
      id: `p-${p.sku}`,
      sku: p.sku,
      nameWork: p.sku,
      name1c: null,
      unitCode: unit,
      currency: p.currency,
      purchasePrice: p.price,
      rrp: p.rrp,
      multiplicity: p.multiplicity ?? 1,
      stockQty: null,
      availability: 'in_stock',
      priceUpdatedAt: '2026-09-10T09:00:00Z',
      isArchived: false,
    },
    {
      id: offerId(p.line, p.block),
      lineId: lineId(p.line),
      blockId: p.block,
      lineQty: CLIENT_LINES[p.line - 1]![2],
      autoRoundMultiplicity: true,
    },
  );
});
const ctx = makeCtx(SUPPLIERS);

// ── Кроки 1–6 ──────────────────────────────────────────────────────
const doc1: RequestDocInput = { header, markup: MARKUP, lines: baseLines, blocks, offers };
const step1 = computeRequest(doc1, ctx);

// Крок 2: ТЕРМО-ПЛАСТ у рядку 1 — «під замовлення, 14 днів»
const doc2: RequestDocInput = {
  ...doc1,
  offers: offers.map((o) => (o.id === offerId(1, PL) ? { ...o, excluded: true, excludeReason: 'під замовлення, 14 днів' } : o)),
};
const step2 = computeRequest(doc2, ctx);

// Крок 3: «Прийняти всі рекомендації» — ✔ на мінімальних у рядках без ✔
const doc3: RequestDocInput = {
  ...doc2,
  lines: doc2.lines.map((l) =>
    l.selection.blockId ? l : { ...l, selection: { blockId: step2.lines[l.id]!.recommendedBlockId } },
  ),
};
const step3 = computeRequest(doc3, ctx);

// Крок 4: метод заявки — РРЦ; власні методи рядків 4, 10, 11, 12; режим — ТОВ без ПДВ
const OVERRIDES: Record<string, LineMarkupOverride> = {
  L4: { method: 'discount_from_rrp', value: 4, manualPriceNet: null },
  L10: { method: 'markup_on_cost', value: 30, manualPriceNet: null },
  L11: { method: 'markup_on_cost', value: 25, manualPriceNet: null },
  L12: { method: 'manual', value: null, manualPriceNet: 110 },
};
const doc4: RequestDocInput = {
  ...doc3,
  markup: { ...MARKUP, method: 'rrp', value: 0 },
  lines: doc3.lines.map((l) => (OVERRIDES[l.id] ? { ...l, markup: OVERRIDES[l.id]! } : l)),
};
const step4 = computeRequest(doc4, ctx);

// Крок 5: КП № 2114 у трьох режимах
const kpSettings = (vatMode: KpVatMode) => ({ ...header.kpSettings, vatMode });
const kp = (vatMode: KpVatMode) => {
  const rows = buildKpRows(doc4, step4, kpSettings(vatMode), ctx);
  return { rows, totals: computeKpTotals(rows.map((r) => r.sum), vatMode, header.vatRatePct) };
};
const withMode = (doc: RequestDocInput, vatMode: KpVatMode): RequestDocInput => ({
  ...doc,
  header: { ...doc.header, kpSettings: kpSettings(vatMode) },
});

// Крок 6: погоджено 8 з 12 (к-сть з КП; рядок 2 — 2 шт, рядок 12 — 80 м)
const APPROVED: Record<string, number> = { L1: 1, L2: 2, L3: 1, L5: 1, L6: 4, L9: 1, L11: 20, L12: 80 };
const doc6: RequestDocInput = {
  ...doc4,
  lines: doc4.lines.map((l) =>
    APPROVED[l.id] != null ? { ...l, approval: { approved: true, approvedQty: APPROVED[l.id]! } } : l,
  ),
};
const step6 = computeRequest(doc6, ctx);

const off = (c: RequestComputed, n: number, block: string) => c.offers[offerId(n, block)]!;
const mixOf = (c: RequestComputed) => c.scenarios[0]!;
const singleOf = (c: RequestComputed, block: string) => c.scenarios.find((s) => s.kind === 'single_supplier' && s.blockId === block)!;

describe('ТЗ §5.3 — вхідні дані', () => {
  it('Ф2: курси блоків з прайсу', () => {
    expect(blocks.map((b) => [b.rates.USD, b.rates.EUR, b.ratesDate])).toEqual([
      [45, 52.1, '2026-09-01'],
      [44.9, 52.2, '2026-09-01'],
      [45, 52, '2026-09-01'],
    ]);
  });
});

describe('ТЗ §5.3 — крок 1. Підбір', () => {
  // [рядок, блок, C, сума з ПДВ (Ф6)]
  const CELLS: [number, string, number, number][] = [
    [1, CR, 387.09, 464.51],
    [1, WI, 408.59, 490.31],
    [1, PL, 372.0, 446.4],
    [2, CR, 119.16, 571.96],
    [2, WI, 124.82, 599.12],
    [3, CR, 1111.28, 1333.54],
    [4, CR, 179.12, 429.88],
    [5, WI, 2158.79, 2590.55],
    [6, WI, 89.13, 427.84],
    [7, WI, 484.62, 1163.08],
    [8, WI, 811.92, 974.3],
    [9, PL, 124.81, 149.77],
    [10, PL, 23.92, 229.6],
    [11, PL, 17.19, 412.6],
    [12, WI, 80.82, 11443.64],
    [12, PL, 76.96, 11082.0],
  ];
  // [ ] — мінімум рядка
  const MIN: string[] = [PL, CR, CR, CR, WI, WI, WI, WI, PL, PL, PL, PL];

  it('таблиця: C / сума з ПДВ, «—» — немає пропозиції', () => {
    expect(Object.keys(step1.offers)).toHaveLength(CELLS.length);
    for (const [n, block, c, sum] of CELLS) {
      num(off(step1, n, block).unitNetUah, c);
      num(off(step1, n, block).sumGrossUah, sum);
    }
  });

  it('мінімум рядка', () => {
    MIN.forEach((block, i) => {
      expect(step1.lines[lineId(i + 1)]!.recommendedBlockId).toBe(block);
      expect(off(step1, i + 1, block).isMin).toBe(true);
    });
  });

  it('труба: 118 м → 120 м (кратно 4) у ТЕРМО-ПЛАСТ, 118 м у АКВА-ТРЕЙД', () => {
    const pipe = off(step1, 12, PL);
    num(pipe.qtyEffective, 120);
    num(off(step1, 12, WI).qtyEffective, 118);
    expect(pipe.warnings.find((w) => w.code === 'QTY_ROUNDED')?.params).toMatchObject({ from: 118, to: 120, multiplicity: 4 });
  });

  it('докладно: 464.508 → 464.51; 1 111.275 → 1 111.28; × 1.2 → 1 333.54; 92.352 → 92.35', () => {
    num(off(step1, 1, CR).unitGrossUah, 464.51);
    num(off(step1, 3, CR).unitNetUah, 1111.28);
    num(off(step1, 3, CR).unitGrossUah, 1333.54);
    num(off(step1, 12, PL).unitGrossUah, 92.35);
  });

  it('після кроку 1: мікс 19 811.52; Дельта САНТЕХ-ІМПОРТ 18.11, АКВА-ТРЕЙД 432.71 (43.91 + 27.16 + 361.64), ТЕРМО-ПЛАСТ 0.00', () => {
    num(mixOf(step1).totalGross, 19811.52);
    num(step1.blocks[CR]!.deltaGross, 18.11);
    num(round2(off(step1, 1, CR).sumGrossUah! - off(step1, 1, PL).sumGrossUah!), 18.11);
    num(step1.blocks[WI]!.deltaGross, 432.71);
    num(round2(off(step1, 1, WI).sumGrossUah! - off(step1, 1, PL).sumGrossUah!), 43.91);
    num(round2(off(step1, 2, WI).sumGrossUah! - off(step1, 2, CR).sumGrossUah!), 27.16);
    num(round2(off(step1, 12, WI).sumGrossUah! - off(step1, 12, PL).sumGrossUah!), 361.64);
    num(step1.blocks[PL]!.deltaGross, 0);
  });
});

describe('ТЗ §5.3 — крок 2. Виключення', () => {
  it('мінімум рядка 1 — САНТЕХ-ІМПОРТ 387.09; ТЕРМО-ПЛАСТ «Всього з ПДВ» 12 320.37 → 11 873.97, покриття 5/12 → 4/12', () => {
    expect(step2.lines.L1!.recommendedBlockId).toBe(CR);
    num(step2.lines.L1!.minUnitNet, 387.09);
    const before = step1.blocks[PL]!;
    const after = step2.blocks[PL]!;
    num(before.totalGross, 12320.37);
    num(after.totalGross, 11873.97);
    num(before.filledCount, 5);
    num(before.totalLines, 12);
    num(after.filledCount, 4);
    num(after.totalLines, 12);
    // виключена лишається видимою (довідкова сума з виключеними)
    expect(after.totalGrossWithExcluded).toBe(12320.37);
    expect(off(step2, 1, PL).isExcluded).toBe(true);
  });
});

describe('ТЗ §5.3 — крок 3. «Прийняти всі рекомендації»', () => {
  // [блок, Всього з ПДВ, Всього по обраних, Дельта, покриття N, бракує рядків]
  const TABLE: [string, number, number, number, number, number][] = [
    [CR, 2799.89, 2799.89, 0, 4, 8],
    [WI, 17688.84, 5155.77, 414.6, 7, 5],
    [PL, 11873.97, 11873.97, 0, 4, 8],
  ];

  it('✔ на мінімальних у всіх 12 рядках', () => {
    for (const l of doc3.lines) expect(step3.lines[l.id]!.selectionState).toBe('manual_optimal');
  });

  it('таблиця блоків і «все в X»', () => {
    for (const [block, total, selected, delta, covered, missing] of TABLE) {
      const t = step3.blocks[block]!;
      num(t.totalGross, total);
      num(t.selectedGross, selected);
      num(t.deltaGross, delta);
      num(t.filledCount, covered);
      num(t.totalLines, 12);
      const single = singleOf(step3, block);
      num(single.missingLines, missing);
      expect(single.coveredLines).toBe(covered);
      expect(single.totalGross).toBe(total);
      expect(single.diffVsMixGross).toBe(delta); // Ф13: різниця з міксом = Дельта X
    }
    const wi = singleOf(step3, WI);
    num(wi.diffVsMixGross, 414.6);
    pct2(wi.diffVsMixPct, 2.4);
    pct2(step3.blocks[WI]!.deltaPct, 2.4);
  });

  it('закупівля по обраних = оптимальний мікс = 19 829.63; 12/12, 3 постачальники', () => {
    num(step3.totals.totalPurchaseGross, 19829.63);
    num(mixOf(step3).totalGross, 19829.63);
    num(step3.scenarios[1]!.totalGross, 19829.63);
    num(mixOf(step3).coveredLines, 12);
    num(step3.totals.linesCount, 12);
    num(mixOf(step3).suppliersUsed, 3);
    num(step3.totals.suppliersCount, 3);
    expect(step3.scenarios.filter((s) => s.kind === 'single_supplier').every((s) => s.missingLines > 0)).toBe(true);
  });

  it('Дельта АКВА-ТРЕЙД = 25.80 + 27.16 + 361.64 = 414.60; 414.60 ÷ 17 274.24 = 2.40 %', () => {
    num(round2(off(step3, 1, WI).sumGrossUah! - off(step3, 1, CR).sumGrossUah!), 25.8);
    num(round2(off(step3, 2, WI).sumGrossUah! - off(step3, 2, CR).sumGrossUah!), 27.16);
    num(round2(off(step3, 12, WI).sumGrossUah! - off(step3, 12, PL).sumGrossUah!), 361.64);
    const wiLines = doc3.lines.filter((l) => step3.offerIndex[l.id]?.[WI]);
    const mixOnWi = sumMoney(wiLines.map((l) => step3.offers[step3.lines[l.id]!.recommendedOfferId!]!.sumGrossUah));
    num(mixOnWi, 17274.24);
    pct2(pct(414.6, mixOnWi), 2.4);
  });
});

describe('ТЗ §5.3 — крок 4. Націнка', () => {
  // [рядок, q′, C, R, метод, N, G, сума без ПДВ, прибуток]
  const TABLE: [number, number, number, number, string, number, number, number, number][] = [
    [1, 1, 387.09, 823.5, 'rrp', 686.25, 823.5, 686.25, 299.16],
    [2, 4, 119.16, 242.1, 'rrp', 201.75, 242.1, 807.0, 330.36],
    [3, 1, 1111.28, 2364.3, 'rrp', 1970.25, 2364.3, 1970.25, 858.97],
    [4, 2, 179.12, 387.62, 'discount_from_rrp', 310.1, 372.12, 620.2, 261.96],
    [5, 1, 2158.79, 4593.27, 'rrp', 3827.73, 4593.27, 3827.73, 1668.94],
    [6, 4, 89.13, 183.19, 'rrp', 152.66, 183.19, 610.64, 254.12],
    [7, 2, 484.62, 1030.95, 'rrp', 859.13, 1030.95, 1718.26, 749.02],
    [8, 1, 811.92, 1727.3, 'rrp', 1439.42, 1727.3, 1439.42, 627.5],
    [9, 1, 124.81, 266.0, 'rrp', 221.67, 266.0, 221.67, 96.86],
    [10, 8, 23.92, 51.0, 'markup_on_cost', 31.1, 37.32, 248.8, 57.44],
    [11, 20, 17.19, 36.45, 'markup_on_cost', 21.49, 25.79, 429.8, 86.0],
    [12, 120, 76.96, 166.4, 'manual', 110.0, 132.0, 13200.0, 3964.8],
  ];
  const row = (n: number) => step4.markup.rows[lineId(n)]!;

  it('таблиця рядків', () => {
    for (const [n, q, c, r, method, saleNet, saleGross, sumNet, profit] of TABLE) {
      const m = row(n);
      expect(m.method).toBe(method);
      num(m.qty, q);
      num(m.costNet, c);
      num(m.rrpGross, r);
      num(m.saleNet, saleNet);
      num(m.saleGross, saleGross);
      num(m.sumNet, sumNet);
      num(m.profitNet, profit);
    }
    expect([row(4).value, row(10).value, row(11).value]).toEqual([4, 30, 25]);
  });

  it('разом: сума без ПДВ 25 780.02, прибуток 9 255.13', () => {
    num(sumMoney(TABLE.map(([n]) => row(n).sumNet)), 25780.02);
    num(sumMoney(TABLE.map(([n]) => row(n).profitNet)), 9255.13);
  });

  it('докладно: рядок 12 — прибуток 13 200.00 − 9 235.20, маржа 30.04 %, нижче РРЦ', () => {
    num(round2(row(12).sumNet! - row(12).profitNet!), 9235.2);
    pct2(row(12).marginPct, 30.04);
    expect(row(12).warnings.map((w) => w.code)).not.toContain('ABOVE_RRP');
  });

  it('підсумки: собівартість 16 524.89; 25 780.02 + ПДВ 5 156.00 = 30 936.02 («Сума» в реєстрі); прибуток 9 255.13; маржа 35.90 %; націнка 56.01 %', () => {
    const t = step4.markup.totals;
    num(t.costNet, 16524.89);
    num(t.saleNet, 25780.02);
    num(t.vat, 5156.0);
    num(t.saleGross, 30936.02);
    num(step4.totals.totalSaleGross, 30936.02);
    num(t.profitNet, 9255.13);
    pct2(t.marginPct, 35.9);
    pct2(t.markupPct, 56.01);
  });
});

describe('ТЗ §5.3 — крок 5. КП № 2114 / 000001', () => {
  it('«ТОВ без ПДВ»: 12 рядків, 25 780.02 / 5 156.00 / 30 936.02', () => {
    const { rows, totals } = kp('without_vat');
    expect(formatKpNumber(2114, header.number)).toBe('2114 / 000001');
    num(rows.length, 12);
    num(totals.totalNet, 25780.02);
    num(totals.vat, 5156.0);
    num(totals.totalGross, 30936.02);
  });

  it('«ТОВ з ПДВ» — 30 936.03 (у т.ч. ПДВ 5 156.01); «ФОП» — 25 780.02', () => {
    const withVat = kp('with_vat').totals;
    num(withVat.totalGross, 30936.03);
    num(withVat.vat, 5156.01);
    num(kp('no_vat').totals.totalGross, 25780.02);
  });

  it('Ф17: «Сума» в реєстрі = КП у режимі цін заявки', () => {
    num(computeRequest(withMode(doc4, 'with_vat'), ctx).totals.totalSaleGross, 30936.03);
    num(computeRequest(withMode(doc4, 'no_vat'), ctx).totals.totalSaleGross, 25780.02);
  });
});

describe('ТЗ §5.3 — крок 6. Погодження', () => {
  // [рядок, к-сть, сума без ПДВ]
  const APPROVED_ROWS: [number, number, number][] = [
    [1, 1, 686.25],
    [2, 2, 403.5],
    [3, 1, 1970.25],
    [5, 1, 3827.73],
    [6, 4, 610.64],
    [9, 1, 221.67],
    [11, 20, 429.8],
    [12, 80, 8800.0],
  ];
  const base = kp('without_vat');

  it('погоджено 8 з 12; 16 949.84 / ПДВ 3 389.97 / погоджена сума 20 339.81 (65.75 % від КП)', () => {
    const t = step6.markup.totals;
    num(doc6.lines.filter((l) => l.approval.approved).length, 8);
    num(t.approvedSaleNet, 16949.84);
    num(t.approvedVat, 3389.97);
    num(t.approvedSaleGross, 20339.81);
    num(step6.totals.approvedSaleGross, 20339.81);
    pct2(pct(step6.totals.approvedSaleGross!, base.totals.totalGross), 65.75);
    expect(step6.totals.totalSaleGross).toBe(30936.02);
  });

  it('Ф18 від КП-основи: рядки й суми погоджених', () => {
    const rows = approvedKpRows(base.rows, doc6.lines);
    num(rows.length, 8);
    APPROVED_ROWS.forEach(([n, qty, sum], i) => {
      expect(rows[i]!.lineId).toBe(lineId(n));
      num(rows[i]!.qty, qty);
      num(rows[i]!.sum, sum);
    });
    const t = computeKpTotals(rows.map((r) => r.sum), base.totals.vatMode, base.totals.vatRatePct);
    num(t.totalNet, 16949.84);
    num(t.vat, 3389.97);
    num(t.totalGross, 20339.81);
    // AC-ПОГ-3: зміна методу рядка 2 після погодження ціни КП-основи не змінює
    const changed = { ...doc6, lines: doc6.lines.map((l) => (l.id === 'L2' ? { ...l, markup: { ...OVERRIDES.L10! } } : l)) };
    expect(computeRequest(changed, ctx).markup.rows.L2!.saleNet).not.toBe(201.75);
    expect(sumMoney(approvedKpRows(base.rows, changed.lines).map((r) => r.sum))).toBe(16949.84);
  });

  it('фінальне КП № 2115 / 000001 — 8 рядків з тими самими підсумками', () => {
    const rows = buildKpRows(doc6, step6, { ...kpSettings('without_vat'), onlyApproved: true }, ctx);
    const t = computeKpTotals(rows.map((r) => r.sum), 'without_vat', header.vatRatePct);
    expect(formatKpNumber(2115, header.number)).toBe('2115 / 000001');
    num(rows.length, 8);
    expect(rows.map((r) => [r.lineId, r.qty, r.sum])).toEqual(APPROVED_ROWS.map(([n, qty, sum]) => [lineId(n), qty, sum]));
    num(t.totalNet, 16949.84);
    num(t.vat, 3389.97);
    num(t.totalGross, 20339.81);
  });
});

describe('ТЗ §5.2 — приклади формул на даних 5.3', () => {
  it('Ф3 при s = 2 %: 394.83; Ф7: Rn 686.25; Ф8: 372.00 < 387.09 < 408.59; Ф12: переплата 18.11; Ф15: 77.28 % / 43.59 %', () => {
    const s2 = computeRequest({ ...doc1, blocks: blocks.map((b) => (b.id === CR ? { ...b, supplierMarkupPct: 2 } : b)) }, ctx);
    num(off(s2, 1, CR).unitNetUah, 394.83);
    num(off(step1, 1, CR).rrpNetUah, 686.25);
    expect([off(step1, 1, PL), off(step1, 1, CR), off(step1, 1, WI)].map((o) => o.unitNetUah)).toEqual([372, 387.09, 408.59]);
    const overpay = computeRequest(
      { ...doc1, lines: doc1.lines.map((l) => (l.id === 'L1' ? { ...l, selection: { blockId: CR } } : l)) },
      ctx,
    );
    num(overpay.lines.L1!.overpayGross, 18.11);
    pct2(step4.markup.rows.L1!.markupPct, 77.28);
    pct2(step4.markup.rows.L1!.marginPct, 43.59);
  });
});

describe('ТЗ §5.3 — підсумок', () => {
  it('перевірено всі числа прикладу (221 з §5.3 + 5 прикладів §5.2)', () => {
    expect(checked).toBe(226);
  });
});
