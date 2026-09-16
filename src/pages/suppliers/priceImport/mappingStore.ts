// Останнє зіставлення колонок прайсу — по постачальниках, у localStorage: наступного разу підставляємо його.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CurrencyCode } from '@shared/enums';
import type { UUID } from '@shared/types';
import {
  EMPTY_COLUMN_MAP,
  PRICE_COLUMN_ROLES,
  headerKey,
  type PriceColumnMap,
  type PriceColumnRole,
} from './priceRows';

export interface SavedPriceMapping {
  sheetName: string | null;
  headerRow: number | null;
  /** Індекс колонки + її заголовок — якщо колонки посунуться, знайдемо за заголовком. */
  columns: Partial<Record<PriceColumnRole, { index: number; header: string }>>;
  pricesIncludeVat: boolean;
  currency: CurrencyCode;
  skipRowsWithoutPrice: boolean;
  markMissing: boolean;
}

interface PriceImportMappingState {
  bySupplier: Record<UUID, SavedPriceMapping>;
  get(supplierId: UUID): SavedPriceMapping | null;
  save(supplierId: UUID, mapping: SavedPriceMapping): void;
  forget(supplierId: UUID): void;
}

export const usePriceMappingStore = create<PriceImportMappingState>()(
  persist(
    (set, get) => ({
      bySupplier: {},
      get: (supplierId) => get().bySupplier[supplierId] ?? null,
      save: (supplierId, mapping) => set((s) => ({ bySupplier: { ...s.bySupplier, [supplierId]: mapping } })),
      forget: (supplierId) =>
        set((s) => {
          const next = { ...s.bySupplier };
          delete next[supplierId];
          return { bySupplier: next };
        }),
    }),
    {
      name: 'po-price-import-mapping',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ bySupplier: s.bySupplier }),
    },
  ),
);

export function savedMappingOf(supplierId: UUID): SavedPriceMapping | null {
  return usePriceMappingStore.getState().get(supplierId);
}

export function rememberMapping(supplierId: UUID, mapping: SavedPriceMapping): void {
  usePriceMappingStore.getState().save(supplierId, mapping);
}

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
