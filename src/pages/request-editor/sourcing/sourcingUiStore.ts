// Тимчасовий стан вкладки «Позиції і підбір» (не зберігається): фільтр, пошук, відкриті панелі й діалоги, невдалі артикули.
import { create } from 'zustand';
import type { UUID } from '@shared/types';
import { missKey, type RowFilter, type SkuMiss } from './rows';

export interface OfferTarget {
  lineId: UUID;
  blockId: UUID;
}

export interface CreateProductTarget extends OfferTarget {
  sku: string;
}

export interface SourcingUiState {
  filter: RowFilter;
  search: string;
  /** Бічна панель режиму «Порівняння». */
  drawer: OfferTarget | null;
  /** Форма «Створити товар» для клітинки блоку. */
  createProduct: CreateProductTarget | null;
  /** Вибір серед кількох товарів з однаковим артикулом. */
  ambiguous: (OfferTarget & { miss: SkuMiss }) | null;
  /** lineId:blockId → невдалий артикул. */
  skuMisses: Record<string, SkuMiss>;
  /** Виділені рядки (☐) — для «Видалити виділені». */
  selectedLineIds: UUID[];
  /** Сфокусувати клітинку рядка після оновлення даних (новий рядок → одразу введення назви). */
  focusRequest: { lineId: UUID; colId: string; edit: boolean } | null;

  setFilter(filter: RowFilter): void;
  setSearch(search: string): void;
  openDrawer(target: OfferTarget | null): void;
  openCreateProduct(target: CreateProductTarget | null): void;
  openAmbiguous(target: (OfferTarget & { miss: SkuMiss }) | null): void;
  setMiss(lineId: UUID, blockId: UUID, miss: SkuMiss | null): void;
  setMisses(entries: { lineId: UUID; blockId: UUID; miss: SkuMiss | null }[]): void;
  setSelectedLineIds(ids: UUID[]): void;
  requestFocus(request: SourcingUiState['focusRequest']): void;
  reset(): void;
}

const INITIAL = {
  filter: 'all' as RowFilter,
  search: '',
  drawer: null,
  createProduct: null,
  ambiguous: null,
  skuMisses: {},
  selectedLineIds: [],
  focusRequest: null,
};

export const useSourcingUi = create<SourcingUiState>()((set) => ({
  ...INITIAL,
  setFilter: (filter) => set({ filter }),
  setSearch: (search) => set({ search }),
  openDrawer: (drawer) => set({ drawer }),
  openCreateProduct: (createProduct) => set({ createProduct }),
  openAmbiguous: (ambiguous) => set({ ambiguous }),
  setMiss: (lineId, blockId, miss) =>
    set((s) => {
      const key = missKey(lineId, blockId);
      if (!miss && !s.skuMisses[key]) return s;
      const next = { ...s.skuMisses };
      if (miss) next[key] = miss;
      else delete next[key];
      return { skuMisses: next };
    }),
  setMisses: (entries) =>
    set((s) => {
      if (!entries.length) return s;
      const next = { ...s.skuMisses };
      for (const e of entries) {
        const key = missKey(e.lineId, e.blockId);
        if (e.miss) next[key] = e.miss;
        else delete next[key];
      }
      return { skuMisses: next };
    }),
  setSelectedLineIds: (selectedLineIds) => set({ selectedLineIds }),
  requestFocus: (focusRequest) => set({ focusRequest }),
  reset: () => set({ ...INITIAL }),
}));
