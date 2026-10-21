// «Довідник» (правки замовника 21.10, п.11): чисті дії над аркушем — нові рядки й колонки, вставка з Excel,
// посилання в тексті клітинки. Межі ті самі, що перевіряє сервер (shared/reference/limits).
// Дія без змін повертає той самий аркуш: тоді нічого не зберігається.
import {
  REFERENCE_COLUMN_MAX_WIDTH,
  REFERENCE_COLUMN_MIN_WIDTH,
  REFERENCE_MAX_CELL,
  REFERENCE_MAX_COLUMNS,
  REFERENCE_MAX_ROWS,
} from '@shared/reference/limits';
import { webUrl } from '@shared/parse';
import type { ReferenceColumn, ReferenceRow, ReferenceSheetDto, ReferenceSheetInput } from '@shared/types';
import { newId } from '@/lib/ids';

/** Те, що правлять у браузері й зберігають цілком. */
export type SheetContent = Pick<ReferenceSheetInput, 'title' | 'columns' | 'rows'>;

const NEW_SHEET_COLUMNS = 3;
const NEW_SHEET_ROWS = 3;

export const contentOf = (sheet: ReferenceSheetDto): SheetContent => ({ title: sheet.title, columns: sheet.columns, rows: sheet.rows });

export const newRow = (): ReferenceRow => ({ id: newId().replace(/-/gu, ''), cells: {} });

/** Текст клітинки; лише власні ключі (id колонки «constructor» не дасть функцію з прототипу). */
export const cellText = (row: ReferenceRow, colId: string): string => (Object.hasOwn(row.cells, colId) ? row.cells[colId] : '');

/**
 * Колонка з першим вільним номером: id «cN» не збігається ні з наявними колонками, ні з reserved
 * (колонки, видалені в діалозі, але ще з клітинками в аркуші).
 */
function newColumn(columns: readonly ReferenceColumn[], reserved: readonly ReferenceColumn[] = []): ReferenceColumn {
  let max = 0;
  for (const c of [...columns, ...reserved]) {
    const m = /^c(\d+)$/u.exec(c.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return { id: `c${max + 1}`, title: `Колонка ${columns.length + 1}` };
}

export function newColumnFor(columns: readonly ReferenceColumn[], reserved: readonly ReferenceColumn[]): ReferenceColumn | null {
  return columns.length < REFERENCE_MAX_COLUMNS ? newColumn(columns, reserved) : null;
}

/** Назва нового аркуша: «Аркуш N» з першим номером, якого ще немає. */
export function newSheetTitle(titles: readonly string[]): string {
  const taken = new Set(titles);
  let n = titles.length + 1;
  while (taken.has(`Аркуш ${n}`)) n++;
  return `Аркуш ${n}`;
}

export function newSheet(title: string): SheetContent {
  const columns: ReferenceColumn[] = [];
  for (let i = 0; i < NEW_SHEET_COLUMNS; i++) columns.push(newColumn(columns));
  return { title, columns, rows: Array.from({ length: NEW_SHEET_ROWS }, newRow) };
}

function withCell(cells: Record<string, string>, colId: string, value: string): Record<string, string> {
  const text = value.slice(0, REFERENCE_MAX_CELL);
  const empty = text.trim() === '';
  if (empty ? !Object.hasOwn(cells, colId) : cells[colId] === text) return cells;
  const next = { ...cells };
  if (empty) delete next[colId];
  else next[colId] = text;
  return next;
}

export function setCell(sheet: SheetContent, rowId: string, colId: string, value: string): SheetContent {
  const index = sheet.rows.findIndex((r) => r.id === rowId);
  if (index < 0) return sheet;
  const cells = withCell(sheet.rows[index].cells, colId, value);
  if (cells === sheet.rows[index].cells) return sheet;
  const rows = [...sheet.rows];
  rows[index] = { ...rows[index], cells };
  return { ...sheet, rows };
}

/** Рядок під afterId (немає — у кінці). */
export function addRow(sheet: SheetContent, afterId: string | null, row: ReferenceRow): SheetContent {
  if (sheet.rows.length >= REFERENCE_MAX_ROWS) return sheet;
  const at = afterId ? sheet.rows.findIndex((r) => r.id === afterId) + 1 : 0;
  const rows = [...sheet.rows];
  rows.splice(at > 0 ? at : rows.length, 0, row);
  return { ...sheet, rows };
}

export function addColumn(sheet: SheetContent): SheetContent {
  const column = newColumnFor(sheet.columns, []);
  return column ? { ...sheet, columns: [...sheet.columns, column] } : sheet;
}

export function deleteRows(sheet: SheetContent, ids: ReadonlySet<string>): SheetContent {
  const rows = sheet.rows.filter((r) => !ids.has(r.id));
  return rows.length === sheet.rows.length ? sheet : { ...sheet, rows };
}

/** Скільки заповнених клітинок у кожній колонці. */
export function filledCounts(rows: readonly ReferenceRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) for (const key of Object.keys(r.cells)) counts.set(key, (counts.get(key) ?? 0) + 1);
  return counts;
}

/**
 * Правки з діалогу «Колонки» поверх поточного аркуша: original — колонки, з якими діалог відкрили, edited — результат.
 * Колонка, яку тим часом додав колега, лишається (у кінці); ширина — поточна; клітинки видалених колонок прибираються.
 */
export function applyColumnEdits(sheet: SheetContent, original: readonly ReferenceColumn[], edited: readonly ReferenceColumn[]): SheetContent {
  const current = new Map(sheet.columns.map((c) => [c.id, c]));
  const known = new Set([...original, ...edited].map((c) => c.id));
  const columns = [
    ...edited.flatMap((c) => {
      const now = current.get(c.id);
      if (!now && original.some((o) => o.id === c.id)) return []; // колега вже видалив
      return [{ ...c, ...(now?.width !== undefined ? { width: now.width } : {}) }];
    }),
    ...sheet.columns.filter((c) => !known.has(c.id)),
  ];
  const same = columns.length === sheet.columns.length && columns.every((c, i) => {
    const was = sheet.columns[i];
    return c.id === was.id && c.title === was.title && c.width === was.width;
  });
  if (same) return sheet;
  const keep = new Set(columns.map((c) => c.id));
  const rows = sheet.rows.map((r) => {
    if (Object.keys(r.cells).every((key) => keep.has(key))) return r;
    return { ...r, cells: Object.fromEntries(Object.entries(r.cells).filter(([key]) => keep.has(key))) };
  });
  return { ...sheet, columns, rows };
}

export function renameColumn(sheet: SheetContent, colId: string, title: string): SheetContent {
  const next = title.trim();
  if (!sheet.columns.some((c) => c.id === colId && c.title !== next)) return sheet;
  return { ...sheet, columns: sheet.columns.map((c) => (c.id === colId ? { ...c, title: next } : c)) };
}

/** Колонка з меню заголовка: разом з її клітинками; остання колонка лишається. */
export function removeColumn(sheet: SheetContent, colId: string): SheetContent {
  if (sheet.columns.length <= 1 || !sheet.columns.some((c) => c.id === colId)) return sheet;
  return applyColumnEdits(sheet, sheet.columns, sheet.columns.filter((c) => c.id !== colId));
}

/** Порядок колонок після перетягування заголовка. */
export function reorderColumns(sheet: SheetContent, order: readonly string[]): SheetContent {
  const byId = new Map(sheet.columns.map((c) => [c.id, c]));
  const columns = order.flatMap((id) => byId.get(id) ?? []);
  if (columns.length !== sheet.columns.length || columns.every((c, i) => c === sheet.columns[i])) return sheet;
  return { ...sheet, columns };
}

export function setColumnWidth(sheet: SheetContent, colId: string, width: number): SheetContent {
  const clamped = Math.min(REFERENCE_COLUMN_MAX_WIDTH, Math.max(REFERENCE_COLUMN_MIN_WIDTH, Math.round(width)));
  if (!sheet.columns.some((c) => c.id === colId && c.width !== clamped)) return sheet;
  return { ...sheet, columns: sheet.columns.map((c) => (c.id === colId ? { ...c, width: clamped } : c)) };
}

export interface PasteTarget {
  /** Рядки, у які пишемо по черзі (видимі, від клітинки з фокусом униз); бракує — нові в кінці аркуша. */
  rowIds: readonly string[];
  colId: string;
}

/** Вставка таблиці з Excel від клітинки. clipped — частина не влізла в межі аркуша (рядки, колонки, довжина клітинки). */
export function applyPaste(sheet: SheetContent, target: PasteTarget, matrix: readonly string[][]): { sheet: SheetContent; clipped: boolean } {
  const colIndex = sheet.columns.findIndex((c) => c.id === target.colId);
  let width = 0;
  for (const line of matrix) width = Math.max(width, line.length);
  if (colIndex < 0 || !width) return { sheet, clipped: false };

  const columns = [...sheet.columns];
  while (columns.length < Math.min(colIndex + width, REFERENCE_MAX_COLUMNS)) columns.push(newColumn(columns));
  const rows = [...sheet.rows];
  const targetIds = [...target.rowIds];
  while (targetIds.length < matrix.length && rows.length < REFERENCE_MAX_ROWS) {
    const row = newRow();
    rows.push(row);
    targetIds.push(row.id);
  }
  const indexOf = new Map(rows.map((r, i) => [r.id, i]));
  let clipped = colIndex + width > REFERENCE_MAX_COLUMNS || matrix.length > targetIds.length;
  matrix.forEach((line, i) => {
    const at = i < targetIds.length ? indexOf.get(targetIds[i]) : undefined;
    if (at === undefined) return;
    let cells = rows[at].cells;
    line.forEach((value, j) => {
      const col = columns[colIndex + j];
      if (!col) return;
      if (value.length > REFERENCE_MAX_CELL) clipped = true;
      cells = withCell(cells, col.id, value.trim());
    });
    if (cells !== rows[at].cells) rows[at] = { ...rows[at], cells };
  });
  return { sheet: { ...sheet, columns, rows }, clipped };
}

export interface TextPart {
  text: string;
  /** Є — частина тексту є посиланням http(s). */
  href?: string;
}

// Посилання в тексті: з http(s)://, з www. або домен із поширеною зоною («brand.ua», «brand.com.ua»).
// Зони перелічено, щоб назви файлів («прайс.xlsx») чи «1.5» не ставали посиланнями.
const TLD = 'ua|com|net|org|info|biz|eu|pl|de|it|cz|sk|ro|hu|at|es|fr|uk|io|co|me|pro|shop|store|online|site|top|tech|cn|tr|lt|lv|ee|md';
const LINK = new RegExp(
  String.raw`(?<![\w@.\-/])(?:https?://[^\s<>"]+|www\.[^\s<>"]+|(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+(?:${TLD})(?![\w-])(?:[/?#][^\s<>"]*)?)`,
  'giu',
);
const TRAILING = '.,;:!?)»"\'';

/** Розділові знаки після посилання — не частина адреси; «)» лишається, якщо в адресі є своя «(». */
function trimLink(raw: string): string {
  let end = raw.length;
  while (end > 0 && TRAILING.includes(raw[end - 1])) {
    if (raw[end - 1] === ')') {
      const head = raw.slice(0, end);
      if (head.split('(').length > head.split(')').length - 1) break;
    }
    end--;
  }
  return raw.slice(0, end);
}

/** Текст клітинки частинами: посилання відкриваються в новій вкладці, решта — як є. */
export function linkParts(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    const raw = trimLink(m[0]);
    const href = webUrl(raw);
    if (!href) continue;
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ text: raw, href });
    last = m.index + raw.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
