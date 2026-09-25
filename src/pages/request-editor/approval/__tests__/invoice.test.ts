// «Рахунок» для бухгалтера (правки замовника 25.09 п.14).
import { describe, expect, it } from 'vitest';
import { computeRequest } from '@shared/pricing';
import { makeBlock, makeCtx, makeDoc, makeLine, makeSupplier, uah } from '@shared/pricing/__tests__/fixtures';
import type { KpRow, KpSnapshot } from '@shared/types';
import { buildInvoice, buildInvoiceWorkbook, missing1cText } from '../invoice';

const approved = (qty: number | null = null) => ({ approval: { approved: true, approvedQty: qty } });
const kpRow = (n: number, lineId: string, code: string, name: string, unit: string, qty: number, price: number): KpRow => ({
  n,
  lineId,
  code,
  imagePath: null,
  name,
  nameSecondary: null,
  unit,
  qty,
  price,
  sum: price * qty,
});

describe('рахунок (п.14 правок 25.09)', () => {
  const suppliers = [makeSupplier('A', { name: 'САНДІ' }), makeSupplier('B', { name: 'ТЕПЛОАРМАТУРА' })];
  const doc = makeDoc({
    lines: [makeLine('L1', 2, approved()), makeLine('L2', 120, approved()), makeLine('L4', 5), makeLine('L5', 3, { ...approved(4), selection: { blockId: 'B' } })],
    blocks: [makeBlock('A', 0), makeBlock('B', 1)],
    offers: [
      uah('L1', 'A', 100, { sku: 'A-1', name1c: 'Кран кульовий 1/2 (1С)' }),
      // назву 1С додали в каталог уже після підбору — береться з каталогу
      uah('L2', 'A', 10, {
        sku: 'A-2',
        catalog: { productId: 'p2', currency: 'UAH', purchasePrice: 10, rrp: null, priceUpdatedAt: null, stockQty: null, availability: 'unknown', isArchived: false, name1c: 'Труба PPR 20 (1С)' },
      }),
      uah('L4', 'A', 5, { sku: 'A-4' }),
      uah('L5', 'A', 50, { sku: 'A-5' }),
      uah('L5', 'B', 60, { sku: 'B-5', name1c: null }),
    ],
  });
  const computed = computeRequest(doc, makeCtx(suppliers));
  const refs = { suppliers: Object.fromEntries(suppliers.map((s) => [s.id, s])) };
  const base: Pick<KpSnapshot, 'rows' | 'totals' | 'columns'> = {
    rows: [
      kpRow(1, 'L1', 'A-1', 'Кран кульовий', 'шт', 2, 120),
      kpRow(2, 'L2', 'A-2', 'Труба PPR 20', 'м', 120, 12),
      kpRow(3, 'L4', 'A-4', 'Не погоджено', 'шт', 5, 6),
      kpRow(4, 'L5', 'B-5', 'Змішувач', 'шт', 3, 70),
    ],
    totals: { vatMode: 'without_vat', vatRatePct: 20, totalNet: 1920, vat: 384, totalGross: 2304, payable: 2304 },
    columns: { showSku: true, showImages: false, priceHeader: 'Ціна без ПДВ, грн', sumHeader: 'Сума без ПДВ, грн' },
  };
  const invoice = buildInvoice({ ...doc, refs }, computed, base)!;

  it('лише погоджені позиції в порядку КП, погоджена к-сть, ціни КП; постачальник і назва 1С', () => {
    expect(invoice.rows.map((r) => [r.n, r.sku, r.supplierName, r.qty, r.price, r.sum, r.name1c])).toEqual([
      [1, 'A-1', 'САНДІ', 2, 120, 240, 'Кран кульовий 1/2 (1С)'],
      [2, 'A-2', 'САНДІ', 120, 12, 1440, 'Труба PPR 20 (1С)'],
      [3, 'B-5', 'ТЕПЛОАРМАТУРА', 4, 70, 280, null],
    ]);
    expect(invoice.missing1c).toBe(1);
    expect(invoice).toMatchObject({ withVat: true, totalNet: 1960, vat: 392, totalGross: 2352 });
  });

  it('пропозицію з КП прибрали з рядка — постачальника й назву 1С не підставляємо з іншої', () => {
    const gone = { ...doc, refs, offers: doc.offers.filter((o) => o.sku !== 'A-1') };
    const row = buildInvoice(gone, computeRequest(gone, makeCtx(suppliers)), base)!.rows[0]!;
    expect(row).toMatchObject({ sku: 'A-1', supplierName: '', name1c: null, price: 120 });
    expect(missing1cText(row)).toBe('Немає назви 1С: запросити в постачальника (артикул A-1)');
  });

  it('немає погоджених — рахунку немає', () => {
    const none = { ...doc, refs, lines: doc.lines.map((l) => ({ ...l, approval: { approved: false, approvedQty: null } })) };
    expect(buildInvoice(none, computed, base)).toBeNull();
  });

  it('Excel: шапка, колонки, жовта клітинка без назви 1С, підсумки з ПДВ', async () => {
    const wb = await buildInvoiceWorkbook(invoice, {
      requestNumber: 7,
      kp: { numberLabel: '2114 / 000007', date: '2026-09-25', seller: { title: 'ТОВ «ТЕСТ»', lines: ['ЄДРПОУ 12345678'] }, buyer: { title: 'ТОВ «КЛІЄНТ»', lines: [], contactName: null, email: null, phone: null } },
    });
    const ws = wb.getWorksheet('Рахунок')!;
    expect(ws.getCell(1, 1).value).toBe('Для рахунку: КП № 2114 / 000007 від 25.09.2026');
    expect(ws.getCell(4, 1).value).toContain('Без назви 1С: 1');
    expect((ws.getRow(6).values as unknown[]).slice(1)).toEqual(['№', 'Найменування 1С', 'Найменування в КП', 'Артикул', 'Постачальник', 'Од.', 'Кількість', 'Ціна без ПДВ, грн', 'Сума без ПДВ, грн']);
    const noName = ws.getRow(9);
    expect(noName.getCell(2).value).toBe(missing1cText({ supplierName: 'ТЕПЛОАРМАТУРА', sku: 'B-5' }));
    expect(noName.getCell(2).value).toBe('Немає назви 1С: запросити в постачальника ТЕПЛОАРМАТУРА (артикул B-5)');
    expect((noName.getCell(2).fill as { fgColor?: { argb?: string } }).fgColor?.argb).toBe('FFFFF3C4');
    expect([ws.getRow(10).getCell(8).value, ws.getRow(11).getCell(8).value, ws.getRow(12).getCell(8).value]).toEqual(['Разом без ПДВ', 'ПДВ', 'Разом з ПДВ']);
    expect(ws.getRow(12).getCell(9).value).toBe(2352);
  });
});
