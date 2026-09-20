// Вивантаження номенклатури в Excel (НОМ-7): те саме, що видно на екрані з поточними фільтрами.
// Файл пишемо потоком у відповідь — на десятках тисяч позицій книга не збирається в пам'яті.
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import { AVAILABILITY_LABELS } from '@shared/enums';
import { formatDate } from '@shared/format';
import type { ProductDetail } from '@shared/types';
import { validationError } from '../../http/errors';
import { listProductsPage } from './products.service';
import type { ProductListQueryInput } from './products.schemas';

/** За раз вивантажуємо стільки позицій: більше — просимо уточнити фільтри. */
export const MAX_EXPORT_ROWS = 100_000;
const BATCH = 2000;

const COLUMNS: { header: string; width: number; value: (p: ProductDetail) => string | number | null }[] = [
  { header: 'Постачальник', width: 26, value: (p) => p.supplierName },
  { header: 'Артикул', width: 18, value: (p) => p.sku },
  { header: 'Найменування', width: 52, value: (p) => p.nameWork },
  { header: 'Найменування 1С', width: 40, value: (p) => p.name1c },
  { header: 'Бренд', width: 18, value: (p) => p.brand },
  { header: 'Од.', width: 8, value: (p) => p.unitCode },
  { header: 'Кратність', width: 10, value: (p) => p.multiplicity },
  { header: 'Валюта', width: 8, value: (p) => p.currency },
  { header: 'Вхід без ПДВ', width: 14, value: (p) => p.purchasePrice },
  { header: 'Вхід без ПДВ, грн', width: 16, value: (p) => p.purchasePriceUah },
  { header: 'РРЦ з ПДВ', width: 14, value: (p) => p.rrp },
  { header: 'Залишок', width: 10, value: (p) => p.stockQty },
  { header: 'Наявність', width: 14, value: (p) => AVAILABILITY_LABELS[p.availability] },
  { header: 'Дата ціни', width: 12, value: (p) => (p.priceUpdatedAt ? formatDate(p.priceUpdatedAt) : null) },
  { header: 'Джерело ціни', width: 14, value: (p) => (p.priceSource === 'manual' ? 'Вручну' : 'Прайс') },
  { header: 'Немає у прайсі з', width: 16, value: (p) => (p.missingSince ? formatDate(p.missingSince) : null) },
  { header: 'Архів', width: 8, value: (p) => (p.isArchived ? 'так' : '') },
];

const MONEY = '#,##0.0000';
const QTY = '#,##0.###';
const NUMERIC = new Map<number, string>([
  [7, QTY],
  [9, MONEY],
  [10, MONEY],
  [11, MONEY],
  [12, QTY],
]);

export function exportFileName(now = new Date()): string {
  return `Номенклатура ${formatDate(now.toISOString())}.xlsx`;
}

/** Назва файлу з кирилицею — і як є (для старих клієнтів), і у вигляді RFC 5987. */
function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7E]/gu, '_').replace(/"/gu, '');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Пише книгу прямо у відповідь; кількість позицій перевіряємо до заголовків, щоб помилка лишилася звичайною відповіддю API. */
export async function exportProducts(query: ProductListQueryInput, res: Response): Promise<void> {
  const first = await listProductsPage({ ...query, offset: 0, limit: Math.min(BATCH, MAX_EXPORT_ROWS) });
  if (first.total > MAX_EXPORT_ROWS) {
    throw validationError(
      `Позицій ${first.total.toLocaleString('uk-UA')} — за раз вивантажуємо до ${MAX_EXPORT_ROWS.toLocaleString('uk-UA')}. Уточніть фільтри (постачальник, пошук).`,
    );
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', contentDisposition(exportFileName()));
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
  const ws = wb.addWorksheet('Номенклатура', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: c.header, width: c.width }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).commit();

  let written = 0;
  let items = first.items;
  for (;;) {
    for (const p of items) {
      const row = ws.addRow(COLUMNS.map((c) => c.value(p)));
      for (const [index, format] of NUMERIC) row.getCell(index).numFmt = format;
      row.commit();
    }
    written += items.length;
    if (items.length < BATCH || written >= first.total) break;
    items = (await listProductsPage({ ...query, offset: written, limit: BATCH })).items;
    if (!items.length) break;
  }
  ws.commit();
  await wb.commit();
}
