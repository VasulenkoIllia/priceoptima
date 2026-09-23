// Вивантаження номенклатури в Excel (НОМ-7): ті самі колонки й фільтри, що на екрані.
// Файл пишемо потоком у відповідь — на десятках тисяч позицій книга не збирається в пам'яті.
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import { AVAILABILITY_LABELS } from '@shared/enums';
import { formatDate } from '@shared/format';
import { netToGross, round2 } from '@shared/pricing';
import type { ProductDetail } from '@shared/types';
import { validationError } from '../../http/errors';
import { getSettings } from '../settings/settings.service';
import { productDetailsByIds, productIdsForExport } from './products.service';
import type { ProductListQueryInput } from './products.schemas';

/** За раз вивантажуємо стільки позицій: більше — просимо уточнити фільтри. */
export const MAX_EXPORT_ROWS = 100_000;
const BATCH = 2000;

type Column = { header: string; width: number; numFmt?: string; value: (p: ProductDetail, vatRatePct: number) => string | number | null };

const MONEY = '#,##0.00';
const QTY = '#,##0.###';
const gross = (net: number | null, vatRatePct: number) => (net == null ? null : netToGross(net, vatRatePct, 2));

/** Ті самі колонки, що на екрані «Номенклатура» (ціни з ПДВ, 2 знаки); валюта й залишок — окремими колонками, щоб лишались числами. */
const COLUMNS: Column[] = [
  { header: 'Постачальник', width: 26, value: (p) => p.supplierName },
  { header: 'Артикул', width: 18, value: (p) => p.sku },
  { header: 'Найменування робоче', width: 52, value: (p) => p.nameWork },
  { header: 'Найменування 1С', width: 40, value: (p) => p.name1c },
  { header: 'Од.', width: 8, value: (p) => p.unitCode },
  { header: 'Кратн.', width: 10, numFmt: QTY, value: (p) => p.multiplicity },
  { header: 'Вхід з ПДВ', width: 14, numFmt: MONEY, value: (p, vat) => gross(p.purchasePrice, vat) },
  { header: 'Валюта', width: 8, value: (p) => p.currency },
  { header: 'Вхід з ПДВ, грн', width: 16, numFmt: MONEY, value: (p, vat) => gross(p.purchasePriceUah, vat) },
  { header: 'РРЦ з ПДВ', width: 14, numFmt: MONEY, value: (p) => (p.rrp == null ? null : round2(p.rrp)) },
  { header: 'Наявність', width: 14, value: (p) => AVAILABILITY_LABELS[p.availability] },
  { header: 'Залишок', width: 10, numFmt: QTY, value: (p) => p.stockQty },
  { header: 'Немає у прайсі з', width: 16, value: (p) => (p.missingSince ? formatDate(p.missingSince) : null) },
  { header: 'Дата ціни', width: 12, value: (p) => (p.priceUpdatedAt ? formatDate(p.priceUpdatedAt) : null) },
  { header: 'Ціна застаріла', width: 14, value: (p) => (p.isStale ? 'так' : '') },
  { header: 'Джерело', width: 10, value: (p) => (p.priceSource === 'manual' ? 'Вручну' : 'Прайс') },
];

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
  const { total, ids } = await productIdsForExport(query, MAX_EXPORT_ROWS);
  if (total > MAX_EXPORT_ROWS) {
    throw validationError(
      `Позицій ${total.toLocaleString('uk-UA')} — за раз вивантажуємо до ${MAX_EXPORT_ROWS.toLocaleString('uk-UA')}. Уточніть фільтри (постачальник, пошук).`,
    );
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', contentDisposition(exportFileName()));
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
  const ws = wb.addWorksheet('Номенклатура', { views: [{ state: 'frozen', ySplit: 1 }] });
  const { vatRatePct } = await getSettings();
  ws.columns = COLUMNS.map((c) => ({ header: c.header, width: c.width }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).commit();

  for (let i = 0; i < ids.length; i += BATCH) {
    for (const p of await productDetailsByIds(ids.slice(i, i + BATCH))) {
      const row = ws.addRow(COLUMNS.map((c) => c.value(p, vatRatePct)));
      COLUMNS.forEach((c, i) => {
        if (c.numFmt) row.getCell(i + 1).numFmt = c.numFmt;
      });
      row.commit();
    }
  }
  ws.commit();
  await wb.commit();
}
