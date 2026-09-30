// Excel бланка КП (КП-4): той самий знімок, що й PDF; к-сті, ціни й суми — числові клітинки.
// Вигляд — як у бланку замовника (зразок 29.09): шапка в рамці з логотипом, сторони, таблиця, підсумки в клітинках, примітка.
import type { Border, Borders, Cell, Workbook, Worksheet } from 'exceljs';
import type { KpSnapshot } from '@shared/types';
import { loadExcelJs, qtyNumFmt, saveBlob, XLSX_MIME } from '@/lib/files';
import {
  KP_SIGN_LABEL,
  kpAmountLine,
  kpContactsLine,
  kpCountLine,
  kpFileName,
  kpHasHead,
  kpPartyRows,
  kpPartyTitle,
  kpTableHead,
  kpTermRows,
  kpTitle,
  kpTotalLines,
  kpValidLine,
} from './kpLayout';
import { loadKpLogo, loadRowPhotos, type KpLogoImage } from './kpPhotos';

const MONEY = '#,##0.00';
const LINE: Partial<Border> = { style: 'thin', color: { argb: 'FF222222' } };
const THICK: Partial<Border> = { style: 'medium', color: { argb: 'FF222222' } };
const BOX: Partial<Borders> = { top: LINE, left: LINE, bottom: LINE, right: LINE };
const HEAD_FILL = 'FFC6D9F1';
/** Шрифт бланка (як у бланку замовника); розмір за замовчуванням — 10. */
const FONT_NAME = 'Arial';
/** Сторона фото в клітинці, пікселі; висота рядка з фото — у пунктах. */
const PHOTO_SIDE_PX = 56;
const PHOTO_ROW_PT = 46;
/** Шапка: два рядки по стільки пунктів; логотип — не вищий за них. */
const HEAD_ROW_PT = 30;
const LOGO_MAX_H_PX = 68;

interface TextOptions {
  bold?: boolean;
  size?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  underline?: boolean;
}

/** Ширина колонки Excel у пікселях (ширина в символах × 7 + поля). */
const colPx = (chars: number) => Math.round(chars * 7 + 5);

/**
 * Рамка клітинки. Об'єднані клітинки в ExcelJS ділять один об'єкт стилю з головною,
 * тож стиль копіюємо — інакше рамка одного краю ляже на всі.
 */
function setBorder(cell: Cell, border: Partial<Borders>): void {
  cell.style = { ...cell.style, border: { ...cell.style.border, ...border } };
}

/**
 * Книга Excel зі знімка (без завантаження — для файлу й перевірок). Фото — data URL (JPEG) за шляхом фото рядка;
 * у КП з фото колонка «Фото» є завжди, фото немає — клітинка порожня. Логотип — PNG (loadKpLogo).
 */
export async function buildKpWorkbook(
  s: KpSnapshot,
  photos: ReadonlyMap<string, string> = new Map(),
  logo: KpLogoImage | null = null,
): Promise<Workbook> {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  const ws: Worksheet = wb.addWorksheet('КП', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const withPhotos = s.columns.showImages;
  const COLS = withPhotos ? 8 : 7;
  // колонки після «Код» зсуваються на одну, коли є «Фото»
  const at = (col: number) => (withPhotos && col >= 3 ? col + 1 : col);
  const widths = [5, 14, ...(withPhotos ? [10] : []), 52, 8, 10, 15, 16];
  ws.columns = widths.map((width) => ({ width }));
  let r = 1;

  const styleText = (c: Cell, o: TextOptions) => {
    c.font = { bold: o.bold, underline: o.underline, size: o.size ?? 10, ...(o.color ? { color: { argb: o.color } } : {}) };
    c.alignment = { horizontal: o.align ?? 'left', vertical: 'middle', wrapText: true };
  };

  /** Рядок тексту на всю ширину бланка. */
  const text = (value: string, o: TextOptions = {}) => {
    ws.mergeCells(r, 1, r, COLS);
    const c = ws.getCell(r, 1);
    c.value = value;
    styleText(c, o);
    return r++;
  };

  /** Товста лінія під рядком на всю ширину (під заголовком, над приміткою). */
  const underline = (row: number) => {
    for (let c = 1; c <= COLS; c++) setBorder(ws.getCell(row, c), { bottom: THICK });
  };

  // ── шапка в рамці: гасло й контакти ліворуч, логотип праворуч; нічого з цього немає — без рамки ──
  if (kpHasHead(s, !!logo)) {
    const textCols = logo ? COLS - 2 : COLS;
    const headRows = [r, r + 1];
    ws.mergeCells(r, 1, r, textCols);
    const slogan = ws.getCell(r, 1);
    slogan.value = s.header.slogan ? s.header.slogan.toLocaleUpperCase('uk-UA') : '';
    styleText(slogan, { bold: true, size: 11, align: 'center' });
    ws.mergeCells(r + 1, 1, r + 1, textCols);
    const contacts = ws.getCell(r + 1, 1);
    contacts.value = kpContactsLine(s);
    styleText(contacts, { bold: true, align: 'center' });
    for (const row of headRows) ws.getRow(row).height = HEAD_ROW_PT;
    for (let c = 1; c <= COLS; c++) {
      setBorder(ws.getCell(headRows[0], c), { top: LINE });
      setBorder(ws.getCell(headRows[1], c), { bottom: LINE });
    }
    for (const row of headRows) {
      setBorder(ws.getCell(row, 1), { left: LINE });
      setBorder(ws.getCell(row, COLS), { right: LINE });
    }
    if (logo) {
      // праворуч у двох останніх колонках: не вище за шапку й не ширше за ці колонки (широкі логотипи-написи)
      const left = colPx(widths[COLS - 2]);
      const right = colPx(widths[COLS - 1]);
      const maxW = left + right - 12;
      const h = Math.min(LOGO_MAX_H_PX, logo.height, (maxW * logo.height) / logo.width);
      const w = Math.round((logo.width * h) / logo.height);
      // зсув від початку передостанньої колонки — частками колонок
      const offset = Math.max(4, left + right - w - 8);
      const col = offset < left ? COLS - 2 + offset / left : COLS - 1 + (offset - left) / right;
      const id = wb.addImage({ base64: logo.dataUrl, extension: 'png' });
      ws.addImage(id, { tl: { col, row: headRows[0] - 1 + 0.1 }, ext: { width: w, height: Math.round(h) } });
    }
    r += 3;
  }

  underline(text(kpTitle(s), { bold: true, size: 13 }));
  if (s.final) text('Фінальна: погоджені позиції і кількості', { color: 'FF6A1B9A' });
  r++;

  // ── сторони: «Постачальник:» / «Покупець:» підкреслені, назва великими; контакти покупця — підпис праворуч ──
  for (const p of kpPartyRows(s)) {
    if (p.gap) r++;
    ws.mergeCells(r, 1, r, 2);
    ws.mergeCells(r, 3, r, COLS);
    const label = ws.getCell(r, 1);
    label.value = p.label;
    const value = ws.getCell(r, 3);
    if (p.kind === 'party') {
      label.font = { underline: true, size: 10 };
      label.alignment = { vertical: 'top' };
      value.value = {
        richText: [
          ...(p.title ? [{ text: kpPartyTitle(p.title), font: { name: FONT_NAME, bold: true, size: 10 } }] : []),
          ...(p.lines.length ? [{ text: `${p.title ? '\n' : ''}${p.lines.join('\n')}`, font: { name: FONT_NAME, size: 9 } }] : []),
        ],
      };
      value.alignment = { vertical: 'top', wrapText: true };
      ws.getRow(r).height = Math.max(15, 13 * ((p.title ? 1 : 0) + p.lines.length));
      r++;
      r++;
    } else {
      label.font = { size: 9 };
      label.alignment = { horizontal: 'right', vertical: 'top' };
      value.value = p.lines.join('\n');
      value.font = { size: 9 };
      value.alignment = { vertical: 'top', wrapText: true };
      r++;
    }
  }
  r++;

  // ── таблиця ──
  const head = ws.getRow(r);
  head.values = kpTableHead(s);
  head.eachCell((c) => {
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } };
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
    x.getCell(at(5)).alignment = { horizontal: 'center', vertical: 'top' };
    x.getCell(at(5)).numFmt = qtyNumFmt(row.qty);
    x.getCell(at(6)).numFmt = MONEY;
    x.getCell(at(7)).numFmt = MONEY;
    x.getCell(at(6)).alignment = { vertical: 'top' };
    x.getCell(at(7)).alignment = { vertical: 'top' };
    const photo = withPhotos && row.imagePath ? photos.get(row.imagePath) : undefined;
    if (withPhotos) x.height = PHOTO_ROW_PT;
    if (photo) {
      const id = wb.addImage({ base64: photo, extension: 'jpeg' });
      // зсув у межах клітинки (частки колонки/рядка), щоб фото не лягало на рамку
      ws.addImage(id, { tl: { col: 2.1, row: r - 1 + 0.08 }, ext: { width: PHOTO_SIDE_PX, height: PHOTO_SIDE_PX } });
    }
    r++;
  }

  // підсумки: підпис праворуч, сума в клітинці під колонкою суми
  for (const t of kpTotalLines(s)) {
    ws.mergeCells(r, 1, r, COLS - 1);
    const label = ws.getCell(r, 1);
    label.value = t.label;
    label.alignment = { horizontal: 'right' };
    label.font = { bold: true };
    const value = ws.getCell(r, COLS);
    value.value = t.value;
    value.numFmt = MONEY;
    value.font = { bold: true };
    value.border = BOX;
    r++;
  }
  r++;

  text(kpCountLine(s));
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
  if (s.managerName) text(`Менеджер: ${s.managerName}`);

  // ── лінія, примітка, «Виписав(ла)» (підпис і печатка — на роздрукованому) ──
  underline(r++);
  if (s.footer) {
    ws.mergeCells(r, 1, r, at(3));
    const note = ws.getCell(r, 1);
    note.value = s.footer;
    note.font = { size: 8 };
    note.alignment = { vertical: 'top', wrapText: true };
    ws.getRow(r).height = 36;
    r++;
  }
  r++;
  ws.mergeCells(r, 1, r, COLS - 2);
  const sign = ws.getCell(r, 1);
  sign.value = KP_SIGN_LABEL;
  sign.alignment = { horizontal: 'right' };
  for (let c = COLS - 1; c <= COLS; c++) setBorder(ws.getCell(r, c), { bottom: LINE });

  // один шрифт на весь бланк: клітинки без явного шрифту інакше отримують шрифт програми, що відкриває файл
  ws.eachRow((row) =>
    row.eachCell((c) => {
      c.font = { size: 10, ...c.font, name: FONT_NAME };
    }),
  );
  return wb;
}

export async function downloadKpExcel(s: KpSnapshot, version?: number): Promise<void> {
  const [photos, logo] = await Promise.all([
    s.columns.showImages ? loadRowPhotos(s.rows.map((r) => r.imagePath).filter((p): p is string => !!p)) : new Map<string, string>(),
    loadKpLogo(s.header.logoPath),
  ]);
  const data = await (await buildKpWorkbook(s, photos, logo)).xlsx.writeBuffer();
  saveBlob(new Blob([data], { type: XLSX_MIME }), kpFileName(s, 'xlsx', version));
}
