// Тимчасовий стан вкладки «Позиції і підбір» (не зберігається): фільтр, пошук, відкриті панелі й діалоги, невдалі артикули.
// Фільтр, пошук і прокрутка запам'ятовуються для кожної заявки окремо (поки відкрита вкладка браузера).
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

/** Вигляд підбору конкретної заявки: повернулись до неї — той самий фільтр, пошук і місце в таблиці. */
export interface SourcingView {
  filter: RowFilter;
  search: string;
  /** Перший видимий рядок таблиці. */
  firstRow: number;
}

export interface SourcingUiState {
  /** Заявка, до якої належить стан. */
  requestId: UUID | null;
  views: Record<UUID, SourcingView>;
  /** Прокрутити до цього рядка, щойно таблиця покаже рядки заявки. */
  pendingScroll: number | null;
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
  rememberScroll(firstRow: number): void;
  takePendingScroll(): number | null;
  /** Інша заявка: чистий стан вкладки, а фільтр, пошук і прокрутка — як були в цій заявці. */
  open(requestId: UUID | null): void;
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

const DEFAULT_VIEW: SourcingView = { filter: 'all', search: '', firstRow: 0 };

/** Запам'ятати частину вигляду поточної заявки. */
function remember(s: SourcingUiState, patch: Partial<SourcingView>): Pick<SourcingUiState, 'views'> {
  if (!s.requestId) return { views: s.views };
  return { views: { ...s.views, [s.requestId]: { ...(s.views[s.requestId] ?? DEFAULT_VIEW), ...patch } } };
}

export const useSourcingUi = create<SourcingUiState>()((set, get) => ({
  ...INITIAL,
  requestId: null,
  views: {},
  pendingScroll: null,
  setFilter: (filter) => set((s) => ({ filter, ...remember(s, { filter }) })),
  setSearch: (search) => set((s) => ({ search, ...remember(s, { search }) })),
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
  rememberScroll: (firstRow) =>
    set((s) => (s.requestId && s.views[s.requestId]?.firstRow === firstRow ? s : remember(s, { firstRow }))),
  takePendingScroll: () => {
    const row = get().pendingScroll;
    if (row != null) set({ pendingScroll: null });
    return row;
  },
  open: (requestId) =>
    set((s) => {
      const view = requestId ? s.views[requestId] : undefined;
      return {
        ...INITIAL,
        requestId,
        views: s.views,
        filter: view?.filter ?? 'all',
        search: view?.search ?? '',
        pendingScroll: view?.firstRow || null,
      };
    }),
}));
