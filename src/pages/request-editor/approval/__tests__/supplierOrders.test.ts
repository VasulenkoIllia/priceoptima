import { describe, expect, it } from 'vitest';
import { computeRequest } from '@shared/pricing';
import { makeBlock, makeCtx, makeDoc, makeLine, makeOffer, makeSupplier, uah } from '@shared/pricing/__tests__/fixtures';
import { buildSupplierOrders, buildSupplierOrdersWorkbook, sheetName } from '../supplierOrders';

const approved = (qty: number | null = null) => ({ approval: { approved: true, approvedQty: qty } });

describe('замовлення постачальникам (п.4.2 правок)', () => {
  const suppliers = [makeSupplier('A', { name: 'Альфа' }), makeSupplier('B', { name: 'Бета' })];
  const doc = makeDoc({
    lines: [
      makeLine('L1', 2, approved()),
      makeLine('L2', 118, approved(118)),
      makeLine('L3', 1, approved()),
      makeLine('L4', 5),
      makeLine('L5', 3, { ...approved(4), selection: { blockId: 'B' } }),
    ],
    blocks: [makeBlock('A', 0), makeBlock('B', 1)],
    offers: [
      uah('L1', 'A', 100, { sku: 'A-1', nameWork: 'Кран', unitCode: 'шт' }),
      uah('L1', 'B', 120),
      uah('L2', 'A', 10, { sku: 'A-2', nameWork: 'Труба', unitCode: 'м', multiplicity: 4 }),
      uah('L4', 'A', 5),
      uah('L5', 'A', 50),
      uah('L5', 'B', 60, { sku: 'B-5', nameWork: 'Змішувач', unitCode: 'шт' }),
    ],
  });
  const computed = computeRequest(doc, makeCtx(suppliers));
  const refs = { suppliers: Object.fromEntries(suppliers.map((s) => [s.id, s])) };
  // L3 був у КП, але пропозицію потім прибрали
  const base = [
    { lineId: 'L1', qty: 2 },
    { lineId: 'L2', qty: 120 },
    { lineId: 'L3', qty: 1 },
    { lineId: 'L5', qty: 3 },
  ];
  const result = buildSupplierOrders({ ...doc, refs }, computed, base);

  it('лише погоджені рядки КП, по постачальниках обраних пропозицій, у порядку блоків', () => {
    expect(result.orders.map((o) => [o.supplierName, o.rows.map((r) => r.sku)])).toEqual([
      ['Альфа', ['A-1', 'A-2']],
      ['Бета', ['B-5']],
    ]);
    expect(result.skipped).toBe(1);
  });

  it('к-сть — погоджена (або з КП), некратна — вгору до кратності пропозиції', () => {
    const [alpha, beta] = result.orders;
    expect(alpha.rows[0]).toMatchObject({ name: 'Кран', unit: 'шт', qty: 2, roundedFrom: null });
    expect(alpha.rows[1]).toMatchObject({ name: 'Труба', unit: 'м', qty: 120, roundedFrom: 118 });
    expect(beta.rows[0]).toMatchObject({ qty: 4, roundedFrom: null });
  });

  it('ціна й сума з ПДВ у грн, як «З ПДВ» у заявці (правки 21.10, п.6)', () => {
    const [alpha, beta] = result.orders;
    expect(alpha.rows[0]).toMatchObject({ price: 120, sum: 240 });
    expect(alpha.rows[1]).toMatchObject({ price: 12, sum: 1440 });
    expect(alpha.rows[1].price).toBe(computed.offers['L2:A'].unitGrossUah);
    // ручний вибір дорожчого блоку: ціна обраної пропозиції (60 × 1,2), а не мінімальної
    expect(beta.rows[0]).toMatchObject({ price: 72, sum: 288 });
  });

  it('валютна пропозиція: прайс × курс блоку × (1 + націнка постачальника) × ПДВ', () => {
    const usdDoc = makeDoc({
      lines: [makeLine('L1', 3, approved())],
      blocks: [makeBlock('A', 0, { defaultCurrency: 'USD', rates: { USD: 41.5, EUR: null }, supplierMarkupPct: 5 })],
      offers: [makeOffer('L1', 'A', { purchasePriceCur: 10, currency: 'USD' })],
    });
    const usd = buildSupplierOrders({ ...usdDoc, refs }, computeRequest(usdDoc, makeCtx(suppliers)), [{ lineId: 'L1', qty: 3 }]);
    // 10 × 41,5 × 1,05 = 435,75 без ПДВ; × 1,2 = 522,90
    expect(usd.orders[0]!.rows[0]).toMatchObject({ price: 522.9, sum: 1568.7 });
  });

  it('аркуш на кожного постачальника', async () => {
    const wb = await buildSupplierOrdersWorkbook(result.orders, { requestNumber: 6, requestDate: '2026-09-14', clientName: 'БУДІНВЕСТ' });
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Альфа', 'Бета']);
    const pipe = wb.getWorksheet('Альфа')!.getRow(6).values as unknown[];
    expect(pipe.slice(1)).toEqual([2, 'Альфа', 'A-2', 'Труба', 'м', 120, 12, 1440]);
    expect((wb.getWorksheet('Альфа')!.getRow(4).values as unknown[]).slice(7)).toEqual(['Ціна з ПДВ', 'Сума з ПДВ']);
    // «Разом» по постачальнику — сума з ПДВ, грн
    const total = wb.getWorksheet('Альфа')!.getRow(7);
    expect([total.getCell(7).value, total.getCell(8).value]).toEqual(['Разом', 1680]);
  });

  it('назва аркуша: без заборонених символів, до 31 знака, унікальна', () => {
    const taken = new Set<string>();
    expect(sheetName('ТОВ «А/Б»: [опт]', taken)).toBe('ТОВ «А Б» опт');
    expect(sheetName('ТОВ «А/Б»: [опт]', taken)).toBe('ТОВ «А Б» опт 2');
    expect(sheetName('Х'.repeat(40), taken)).toHaveLength(31);
  });
});
