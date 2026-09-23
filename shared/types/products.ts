import type { AvailabilityStatus, CurrencyCode, PriceSource } from '../enums';
import type { ISODate, ISODateTime, ListQuery, UUID, UserRef } from './common';

export interface ProductListItem {
  id: UUID;
  supplierId: UUID;
  supplierName: string;
  sku: string;
  nameWork: string;
  name1c: string | null;
  brand: string | null;
  unitCode: string;
  currency: CurrencyCode;
  /** Вхід без ПДВ у валюті. */
  purchasePrice: number | null;
  /** РРЦ з ПДВ у валюті. */
  rrp: number | null;
  /** За поточними курсами постачальника — лише для показу. */
  purchasePriceUah: number | null;
  multiplicity: number;
  stockQty: number | null;
  availability: AvailabilityStatus;
  priceUpdatedAt: ISODateTime | null;
  isStale: boolean;
  /** Дата, з якої позиції немає у прайсі постачальника (ціна лишається останньою відомою). */
  missingSince: ISODate | null;
  imageUrl: string | null;
  productUrl: string | null;
  isArchived: boolean;
}

export interface ProductDetail extends ProductListItem {
  /** Версія картки: передається назад при збереженні, щоб не стерти чужі правки (ДОВ-6). */
  version: number;
  minOrderQty: number | null;
  notes: string | null;
  priceSource: PriceSource | null;
  lastImportId: UUID | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// ── Фото товару ───────────────────────────────────────────────────

/** Звідки фото: посилання з прайсу постачальника чи файл, завантажений нами. */
export type ProductImageSource = 'feed' | 'upload';

/** Фото товару. Головне (isMain) дублюється в ProductListItem.imageUrl — щоб списки й КП брали одне поле. */
export interface ProductImageDto {
  id: UUID;
  productId: UUID;
  source: ProductImageSource;
  /** Готове посилання для показу: адреса з прайсу або '/api/images/<id>' для завантаженого файлу. */
  url: string;
  isMain: boolean;
  sortOrder: number;
  /** Ім'я файлу (лише для завантажених). */
  fileName: string | null;
  /** Розмір файлу в байтах (лише для завантажених). */
  sizeBytes: number | null;
  createdAt: ISODateTime;
}

/** Зміна фото: головне й порядок показу. */
export interface ProductImagePatch {
  isMain?: boolean;
  sortOrder?: number;
}

/** Додати фото за посиланням із прайсу постачальника. */
export interface ProductImageUrlInput {
  url: string;
  fileName?: string | null;
  isMain?: boolean;
  sortOrder?: number;
}

export type ProductMatchKind = 'sku_exact' | 'sku_prefix' | 'text' | 'fuzzy';

export interface ProductPickDto extends ProductListItem {
  matchKind: ProductMatchKind;
  score: number;
}

export interface ProductListQuery extends ListQuery {
  supplierId?: UUID;
  availability?: AvailabilityStatus[];
  stale?: boolean;
  archived?: boolean;
  currency?: CurrencyCode;
  /** Лише додані вручну (ціну ведуть вручну). */
  manual?: boolean;
  /** Лише позначені «немає у прайсі». */
  missing?: boolean;
}

/** Колонки, за якими сортує база (ціну в гривнях рахує сервер — за нею не сортуємо). */
export type ProductSortField =
  | 'supplier'
  | 'sku'
  | 'nameWork'
  | 'name1c'
  | 'unitCode'
  | 'multiplicity'
  | 'purchasePrice'
  | 'rrp'
  | 'availability'
  | 'priceUpdatedAt'
  | 'priceSource';

/** Сторінка номенклатури: каталог на десятки тисяч позицій читається шматками. */
export interface ProductPageQuery extends ProductListQuery {
  offset: number;
  limit: number;
  sortField?: ProductSortField;
  sortDir?: 'asc' | 'desc';
}

export interface ProductPage {
  items: ProductDetail[];
  /** Скільки всього позицій під фільтрами; null — не рахували (не перша сторінка: кількість у клієнта вже є). */
  total: number | null;
}

export interface ProductSearchQuery {
  q: string;
  supplierId?: UUID | null;
  /** d: 20, max 50 */
  limit?: number;
  includeArchived?: boolean;
}

export interface ProductInput {
  supplierId: UUID;
  sku: string;
  nameWork: string;
  name1c?: string | null;
  brand?: string | null;
  unitCode: string;
  currency: CurrencyCode;
  purchasePrice?: number | null;
  rrp?: number | null;
  multiplicity?: number;
  minOrderQty?: number | null;
  stockQty?: number | null;
  availability?: AvailabilityStatus;
  productUrl?: string | null;
  notes?: string | null;
  /** true — purchasePrice введено з ПДВ, нормалізується /k (F2). */
  priceIncludesVat?: boolean;
}

export type ProductPatch = Partial<
  Omit<ProductInput, 'supplierId' | 'currency' | 'purchasePrice' | 'rrp' | 'stockQty' | 'availability'>
> & {
  /** Версія картки, з якою її відкрили (ДОВ-6). */
  version: number;
  /** Архівна позиція не пропонується в підборі (товар не видаляємо — на нього посилаються заявки). */
  isArchived?: boolean;
};

/** Ручна зміна ціни — лише для товару, доданого вручну (решту оновлюють прайси постачальників). */
export interface ProductPriceUpdateInput {
  /** Валюта ціни; при purchaseOnly — лише перевірка, що валюта товару не змінилась. */
  currency: CurrencyCode;
  purchasePrice: number | null;
  /** true — purchasePrice введено з ПДВ, зберігається без ПДВ (Ф1). */
  priceIncludesVat?: boolean;
  /** true — змінюється лише вхідна ціна (із заявки, РЕД-10); РРЦ, валюта й наявність лишаються як у каталозі. */
  purchaseOnly?: boolean;
  /** Не потрібна при purchaseOnly. */
  rrp?: number | null;
  stockQty?: number | null;
  availability?: AvailabilityStatus;
  source: 'manual';
  note?: string | null;
}

export interface PriceHistoryEntry {
  id: number;
  productId: UUID;
  effectiveAt: ISODateTime;
  currency: CurrencyCode;
  purchasePrice: number | null;
  rrp: number | null;
  stockQty: number | null;
  availability: AvailabilityStatus | null;
  source: PriceSource;
  importId: UUID | null;
  requestId: UUID | null;
  requestNumber: number | null;
  user: UserRef | null;
  note: string | null;
}

export interface ProductPriceUpdateResult {
  product: ProductDetail;
  /** null — нічого не змінилось. */
  historyEntry: PriceHistoryEntry | null;
}

export interface SkuLookupBody {
  supplierId?: UUID | null;
  skus: string[];
}

export interface SkuLookupResult {
  /** Ключ — вхідний артикул як є. */
  results: Record<string, ProductPickDto[]>;
}

/** Поточний стан товару в каталозі (для порівняння зі знімком у пропозиції, F22/F34). */
export interface CatalogSnapshot {
  productId: UUID;
  currency: CurrencyCode;
  purchasePrice: number | null;
  rrp: number | null;
  priceUpdatedAt: ISODateTime | null;
  stockQty: number | null;
  availability: AvailabilityStatus;
  isArchived: boolean;
  /** Назва 1С у каталозі зараз: у КП «Назва 1С» — якщо в пропозиції (знімку) її ще немає. */
  name1c?: string | null;
  /** Головне фото товару зараз — для попереднього перегляду КП з фото. */
  imageUrl?: string | null;
  /** З якої дати товару немає у прайсі постачальника (ціна — остання відома). */
  missingSince?: ISODate | null;
}

/** Масове завантаження назв 1С: «артикул → назва 1С» у товари одного постачальника. */
export interface Name1cImportBody {
  supplierId: UUID;
  rows: { sku: string; name1c: string }[];
  /** Лише порахувати, нічого не змінювати. */
  dryRun?: boolean;
}

export interface Name1cImportResult {
  matched: number;
  /** Змінено (або буде змінено при dryRun). */
  updated: number;
  unchanged: number;
  /** Артикули, яких немає в каталозі постачальника (до 500). */
  notFound: string[];
  notFoundCount: number;
  skipped: number;
  duplicates: number;
}
