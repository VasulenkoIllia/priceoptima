// Excel бланка КП (КП-4): той самий знімок, що й PDF; к-сті, ціни й суми — числові клітинки.
import type { Border, Workbook, Worksheet } from 'exceljs';
import type { KpSnapshot } from '@shared/types';
import { loadExcelJs, saveBlob, XLSX_MIME } from '@/lib/files';
import { kpAmountLine, kpContactsLine, kpFileName, kpPartyRows, kpTermRows, kpTitle, kpTotalLines, kpValidLine } from './kpLayout';
import { loadRowPhotos } from './kpPhotos';

const MONEY = '#,##0.00';
const QTY = '#,##0.###';
const LINE: Partial<Border> = { style: 'thin', color: { argb: 'FFB8C2D0' } };
const BOX = { top: LINE, left: LINE, bottom: LINE, right: LINE };
/** Сторона фото в клітинці, пікселі; висота рядка з фото — у пунктах. */
const PHOTO_SIDE_PX = 56;
const PHOTO_ROW_PT = 46;

interface TextOptions {
  bold?: boolean;
  size?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
}

/**
 * Книга Excel зі знімка (без завантаження — для файлу й перевірок). Фото — data URL (JPEG) за шляхом фото рядка;
 * у КП з фото колонка «Фото» є завжди, фото немає — клітинка порожня.
 */
export async function buildKpWorkbook(s: KpSnapshot, photos: ReadonlyMap<string, string> = new Map()): Promise<Workbook> {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  const ws: Worksheet = wb.addWorksheet('КП', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const withPhotos = s.columns.showImages;
  const COLS = withPhotos ? 8 : 7;
  // колонки після «Код» зсуваються на одну, коли є «Фото»
  const at = (col: number) => (withPhotos && col >= 3 ? col + 1 : col);
  ws.columns = [
    { width: 5 },
    { width: 14 },
    ...(withPhotos ? [{ width: 10 }] : []),
    { width: 52 },
    { width: 7 },
    { width: 10 },
    { width: 15 },
    { width: 16 },
  ];
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
  head.values = ['№', 'Код', ...(withPhotos ? ['Фото'] : []), 'Товари (роботи, послуги)', 'Од.', 'Кількість', s.columns.priceHeader, s.columns.sumHeader];
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
    const name = row.nameSecondary ? `${row.name}\n${row.nameSecondary}` : row.name;
    x.values = [row.n, row.code ?? '', ...(withPhotos ? [''] : []), name, row.unit, row.qty, row.price, row.sum];
    for (let c = 1; c <= COLS; c++) x.getCell(c).border = BOX;
    x.getCell(1).alignment = { horizontal: 'center', vertical: 'top' };
    x.getCell(2).alignment = { vertical: 'top' };
    x.getCell(at(3)).alignment = { wrapText: true, vertical: 'top' };
    x.getCell(at(4)).alignment = { horizontal: 'center', vertical: 'top' };
    x.getCell(at(5)).numFmt = QTY;
    x.getCell(at(6)).numFmt = MONEY;
    x.getCell(at(7)).numFmt = MONEY;
    const photo = withPhotos && row.imagePath ? photos.get(row.imagePath) : undefined;
    if (withPhotos) x.height = PHOTO_ROW_PT;
    if (photo) {
      const id = wb.addImage({ base64: photo, extension: 'jpeg' });
      // зсув у межах клітинки (частки колонки/рядка), щоб фото не лягало на рамку
      ws.addImage(id, { tl: { col: 2.1, row: r - 1 + 0.08 }, ext: { width: PHOTO_SIDE_PX, height: PHOTO_SIDE_PX } });
    }
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
  const photos = s.columns.showImages ? await loadRowPhotos(s.rows.map((r) => r.imagePath).filter((p): p is string => !!p)) : new Map<string, string>();
  const data = await (await buildKpWorkbook(s, photos)).xlsx.writeBuffer();
  saveBlob(new Blob([data], { type: XLSX_MIME }), kpFileName(s, 'xlsx', version));
}
