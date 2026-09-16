// Останнє зіставлення колонок прайсу постачальника: зберігається на сервері (ds.savePriceImportMapping),
// тут — перетворення «поточне зіставлення ↔ збережене».
import type { PriceImportMapping } from '@shared/types';
import {
  EMPTY_COLUMN_MAP,
  PRICE_COLUMN_ROLES,
  headerKey,
  type PriceColumnMap,
} from './priceRows';

export type SavedPriceMapping = PriceImportMapping;

/** Зіставлення → те, що зберігаємо (разом із заголовками колонок). */
export function toSavedMapping(
  mapping: PriceColumnMap,
  header: readonly string[],
  options: Omit<SavedPriceMapping, 'sheetName' | 'headerRow' | 'columns'>,
  sheetName: string | null,
): SavedPriceMapping {
  const columns: SavedPriceMapping['columns'] = {};
  for (const role of PRICE_COLUMN_ROLES) {
    const index = mapping[role];
    if (index != null) columns[role] = { index, header: (header[index] ?? '').trim() };
  }
  return { sheetName, headerRow: mapping.headerRow, columns, ...options };
}

/**
 * Збережене зіставлення на поточний файл: колонку шукаємо спершу за заголовком, потім за індексом;
 * чого не знайшли — лишаємо з автовизначення.
 */
export function applySavedMapping(
  detected: PriceColumnMap,
  saved: SavedPriceMapping | null,
  rows: readonly string[][],
): PriceColumnMap {
  if (!saved) return detected;
  const headerRow = saved.headerRow != null && saved.headerRow < rows.length ? saved.headerRow : detected.headerRow;
  const header = headerRow != null ? (rows[headerRow] ?? []) : [];
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const keys = header.map((c) => headerKey(c ?? ''));
  const result: PriceColumnMap = { ...EMPTY_COLUMN_MAP, headerRow };

  for (const role of PRICE_COLUMN_ROLES) {
    const s = saved.columns[role];
    const key = s ? headerKey(s.header) : '';
    const byHeader = key ? keys.indexOf(key) : -1;
    // заголовок збігся → беремо його колонку; заголовків немає → колишній індекс; інакше — автовизначення
    if (byHeader >= 0) result[role] = byHeader;
    else if (s && !key && s.index < width) result[role] = s.index;
    else result[role] = detected[role];
  }
  return result;
}
