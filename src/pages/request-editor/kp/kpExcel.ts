// Excel бланка КП (КП-4): той самий знімок, що й PDF; к-сті, ціни й суми — числові клітинки.
import type { Border, Workbook, Worksheet } from 'exceljs';
import type { KpSnapshot } from '@shared/types';
import { loadExcelJs, saveBlob, XLSX_MIME } from '@/lib/files';
import { kpAmountLine, kpContactsLine, kpFileName, kpPartyRows, kpTermRows, kpTitle, kpTotalLines, kpValidLine } from './kpLayout';

const MONEY = '#,##0.00';
const QTY = '#,##0.###';
const LINE: Partial<Border> = { style: 'thin', color: { argb: 'FFB8C2D0' } };
const BOX = { top: LINE, left: LINE, bottom: LINE, right: LINE };
const COLS = 7;

interface TextOptions {
  bold?: boolean;
  size?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
}

/** Книга Excel зі знімка (без завантаження — для файлу й перевірок). */
export async function buildKpWorkbook(s: KpSnapshot): Promise<Workbook> {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  const ws: Worksheet = wb.addWorksheet('КП', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [{ width: 5 }, { width: 14 }, { width: 52 }, { width: 7 }, { width: 10 }, { width: 15 }, { width: 16 }];
  let r = 1;

  /** Рядок тексту на всю ширину бланка. */
  const text = (value: string, o: TextOptions = {}) => {
    ws.mergeCells(r, 1, r, COLS);
    const c = ws.getCell(r, 1);
    c.value = value;
    c.font = { bold: o.bold, size: o.size ?? 10, ...(o.color ? { color: { argb: o.color } } : {}) };
    c.alignment = { horizontal: o.align ?? 'left', vertical: 'middle', wrapText: true };
    r++;
  };

  if (s.header.slogan) text(s.header.slogan, { bold: true, size: 12, color: 'FF1050B8' });
  text(kpContactsLine(s), { size: 9, color: 'FF555555' });
  r++;
  text(kpTitle(s), { bold: true, size: 13, align: 'center' });
  if (s.final) text('Фінальна: погоджені позиції і кількості', { align: 'center', color: 'FF6A1B9A' });
  r++;

  for (const p of kpPartyRows(s)) {
    const lines = [p.title, ...p.lines].filter((x): x is string => !!x);
    ws.mergeCells(r, 1, r, 2);
    ws.mergeCells(r, 3, r, COLS);
    const label = ws.getCell(r, 1);
    label.value = p.label;
    label.font = { bold: true, color: { argb: 'FF555555' } };
    label.alignment = { vertical: 'top' };
    const value = ws.getCell(r, 3);
    value.value = lines.join('\n');
    value.alignment = { vertical: 'top', wrapText: true };
    ws.getRow(r).height = Math.max(15, 14 * lines.length);
    r++;
  }
  r++;

  const head = ws.getRow(r);
  head.values = ['№', 'Код', 'Товари (роботи, послуги)', 'Од.', 'Кількість', s.columns.priceHeader, s.columns.sumHeader];
  head.eachCell((c) => {
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2F8' } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = BOX;
  });
  head.height = 30;
  r++;

  for (const row of s.rows) {
    const x = ws.getRow(r);
    x.values = [row.n, row.code ?? '', row.nameSecondary ? `${row.name}\n${row.nameSecondary}` : row.name, row.unit, row.qty, row.price, row.sum];
    for (let c = 1; c <= COLS; c++) x.getCell(c).border = BOX;
    x.getCell(1).alignment = { horizontal: 'center', vertical: 'top' };
    x.getCell(2).alignment = { vertical: 'top' };
    x.getCell(3).alignment = { wrapText: true, vertical: 'top' };
    x.getCell(4).alignment = { horizontal: 'center', vertical: 'top' };
    x.getCell(5).numFmt = QTY;
    x.getCell(6).numFmt = MONEY;
    x.getCell(7).numFmt = MONEY;
    r++;
  }
  r++;

  for (const t of kpTotalLines(s)) {
    ws.mergeCells(r, 1, r, COLS - 1);
    const label = ws.getCell(r, 1);
    label.value = t.label;
    label.alignment = { horizontal: 'right' };
    label.font = { bold: t.strong };
    const value = ws.getCell(r, COLS);
    value.value = t.value;
    value.numFmt = MONEY;
    value.font = { bold: t.strong };
    r++;
  }
  r++;

  text(kpAmountLine(s));
  const valid = kpValidLine(s);
  if (valid) text(valid);
  const terms = kpTermRows(s);
  if (terms.length) r++;
  for (const t of terms) {
    ws.mergeCells(r, 1, r, 2);
    ws.mergeCells(r, 3, r, COLS);
    const label = ws.getCell(r, 1);
    label.value = t.label;
    label.font = { bold: true, color: { argb: 'FF555555' } };
    label.alignment = { vertical: 'top', wrapText: true };
    const value = ws.getCell(r, 3);
    value.value = t.value;
    value.alignment = { vertical: 'top', wrapText: true };
    r++;
  }
  r++;
  text(`Менеджер: ${s.managerName}`);
  if (s.footer) text(s.footer, { size: 9, color: 'FF666666' });
  return wb;
}

export async function downloadKpExcel(s: KpSnapshot, version?: number): Promise<void> {
  const data = await (await buildKpWorkbook(s)).xlsx.writeBuffer();
  saveBlob(new Blob([data], { type: XLSX_MIME }), kpFileName(s, 'xlsx', version));
}
