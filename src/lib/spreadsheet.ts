// Читання таблиці в браузері (прайс постачальника, заявка клієнта): xlsx (ExcelJS підвантажується за потреби), csv/tsv/txt (UTF-8 або Windows-1251).
// Чисті функції (крім читання File) — покриті тестами.
import type { CellValue, Worksheet } from 'exceljs';
import { parseTsv } from '@shared/parse';
import { formatDate } from '@shared/format';
import { loadExcelJs } from '@/lib/files';

export interface SheetData {
  name: string;
  rows: string[][];
}

/** Найбільший прайс — ~18 тис. рядків; беремо із запасом. */
const MAX_ROWS = 60000;
const MAX_COLS = 60;

export class SpreadsheetError extends Error {}

export const XLS_MESSAGE = 'Файл у старому форматі .xls — збережіть як .xlsx і завантажте ще раз';

/** Текст клітинки ExcelJS: формула → результат, rich text / гіперпосилання → текст, дата → ДД.ММ.РРРР. */
export function cellText(v: CellValue | unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'так' : 'ні';
  if (v instanceof Date) return formatDate(v);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return o.richText.map((r) => cellText((r as { text?: unknown }).text)).join('');
    if ('result' in o || 'formula' in o || 'sharedFormula' in o) return cellText(o.result);
    if ('text' in o) return cellText(o.text);
  }
  return '';
}

/** Текст CSV: UTF-8 (з BOM чи без), інакше Windows-1251 (так зберігає CSV українська версія Excel). */
export function decodeText(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/u, '');
  } catch {
    return new TextDecoder('windows-1251').decode(bytes);
  }
}

/** Роздільник CSV: той із «;», «,», Tab, що найчастіше трапляється поза лапками в перших рядках. */
export function detectDelimiter(text: string): ';' | ',' | '\t' {
  const sample = text.split(/\r?\n/u).slice(0, 10).join('\n').replace(/"[^"]*"/gu, '');
  const count = (ch: string) => sample.split(ch).length - 1;
  const candidates: (';' | ',' | '\t')[] = ['\t', ';', ','];
  return candidates.reduce((best, ch) => (count(ch) > count(best) ? ch : best), ';');
}

/** CSV з лапками ('"' усередині — '""'), рядки через \n або \r\n. */
export function parseCsv(text: string, delimiter: string = detectDelimiter(text)): string[][] {
  if (delimiter === '\t') return parseTsv(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Буква колонки Excel: 0 → A, 26 → AA. */
export function columnLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Без порожніх рядків у кінці і порожніх колонок праворуч. */
function trimRows(rows: string[][]): string[][] {
  let end = rows.length;
  while (end > 0 && rows[end - 1].every((c) => c === '')) end--;
  const out = rows.slice(0, Math.min(end, MAX_ROWS));
  const width = out.reduce((w, r) => {
    let last = r.length;
    while (last > 0 && r[last - 1] === '') last--;
    return Math.max(w, last);
  }, 0);
  return out.map((r) => r.slice(0, Math.min(width, MAX_COLS)));
}

const clean = (s: string) => s.replace(/\s+/gu, ' ').trim();

function sheetRows(ws: Worksheet): string[][] {
  const rows: string[][] = [];
  const last = Math.min(ws.rowCount, MAX_ROWS);
  const cols = Math.min(ws.columnCount, MAX_COLS);
  for (let r = 1; r <= last; r++) {
    const row = ws.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= cols; c++) cells.push(clean(cellText(row.getCell(c).value)));
    rows.push(cells);
  }
  return trimRows(rows);
}

/** Сигнатура OLE2 — старий бінарний .xls (BIFF), ExcelJS його не читає. */
function isOle2(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf, 0, Math.min(8, buf.byteLength));
  const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return b.length === 8 && sig.every((v, i) => b[i] === v);
}

/** xlsx → аркуші (приховані пропускаються); csv/tsv/txt → один «аркуш». */
export async function readSpreadsheetFile(file: File): Promise<SheetData[]> {
  const name = file.name.toLowerCase();
  if (/\.xls$/u.test(name)) throw new SpreadsheetError(XLS_MESSAGE);
  const buf = await file.arrayBuffer();
  if (/\.(csv|txt|tsv)$/u.test(name)) {
    const rows = parseCsv(decodeText(buf)).map((r) => r.map(clean));
    return [{ name: file.name, rows: trimRows(rows) }];
  }
  if (isOle2(buf)) throw new SpreadsheetError(XLS_MESSAGE);
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf);
  } catch {
    throw new SpreadsheetError('Не вдалося прочитати файл — це не xlsx або файл пошкоджено');
  }
  const sheets = wb.worksheets.filter((ws) => ws.state === 'visible' || ws.state == null);
  const out = sheets.map((ws) => ({ name: ws.name, rows: sheetRows(ws) }));
  if (!out.some((s) => s.rows.length)) throw new SpreadsheetError('У файлі немає даних');
  return out;
}

/** Текст із буфера обміну (таблиця з Excel) → «аркуш». */
export function sheetFromText(text: string, name = 'Вставлено з буфера'): SheetData {
  return { name, rows: trimRows(parseCsv(text).map((r) => r.map(clean))) };
}
