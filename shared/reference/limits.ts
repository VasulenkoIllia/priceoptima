// Межі «Довідника» (правки замовника 21.10, п.11): однакові для браузера (вставка з Excel) і сервера (перевірка запиту).
// Аркуш зберігається одним запитом, а тіло запиту до API — до 1 МБ (server/http/bodyLimits.ts).
import type { ReferenceSheetInput } from '../types';

export const REFERENCE_MAX_SHEETS = 50;
export const REFERENCE_MAX_COLUMNS = 20;
export const REFERENCE_MAX_ROWS = 1000;
export const REFERENCE_MAX_CELL = 2000;
export const REFERENCE_TITLE_MAX = 80;
/** Ширина колонки, яку задають перетягуванням: таблиця не дасть вийти за ці межі, сервер їх перевіряє. */
export const REFERENCE_COLUMN_MIN_WIDTH = 40;
export const REFERENCE_COLUMN_MAX_WIDTH = 2000;
/** Увесь текст аркуша: з ключами клітинок запит лишається меншим за 1 МБ (кирилиця — 2 байти на символ). */
export const REFERENCE_MAX_SHEET_CHARS = 250_000;

/** Скільки тексту в аркуші: назви колонок і всі клітинки. */
export function sheetTextLength(sheet: Pick<ReferenceSheetInput, 'columns' | 'rows'>): number {
  let total = 0;
  for (const c of sheet.columns) total += c.title.length;
  for (const r of sheet.rows) for (const v of Object.values(r.cells)) total += v.length;
  return total;
}
