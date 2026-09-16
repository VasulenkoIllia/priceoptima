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
  minOrderQty: number | null;
  notes: string | null;
  priceSource: PriceSource | null;
  lastImportId: UUID | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
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
>;

/** Ручна зміна ціни — лише для товару, доданого вручну (решту оновлюють прайси постачальників). */
export interface ProductPriceUpdateInput {
  currency: CurrencyCode;
  purchasePrice: number | null;
  rrp: number | null;
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
}
