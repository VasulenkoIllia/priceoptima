import type { ProductListQuery, RequestListQuery, UUID } from '@shared/types';

/** Ключі TanStack Query (зміни з інших вкладок інвалідовують усе — див. DataSync). */
export const qk = {
  me: ['me'] as const,
  users: ['users'] as const,
  settings: ['settings'] as const,
  ownCompanies: ['own-companies'] as const,
  clients: ['clients'] as const,
  client: (id: UUID) => ['client', id] as const,
  suppliers: ['suppliers'] as const,
  supplier: (id: UUID) => ['supplier', id] as const,
  supplierPriceSource: (id: UUID) => ['supplier-price-source', id] as const,
  priceUpdates: (supplierId?: UUID) => ['price-updates', supplierId ?? 'all'] as const,
  priceUpdatesAll: ['price-updates'] as const,
  priceUpdate: (id: number) => ['price-update', id] as const,
  priceMapping: (supplierId: UUID) => ['price-mapping', supplierId] as const,
  products: (query: ProductListQuery) => ['products', query] as const,
  productsAll: ['products'] as const,
  /** Позначка «каталог змінився» для сторінки номенклатури: інвалідується разом з усім ['products']. */
  productsVersion: ['products', 'version'] as const,
  product: (id: UUID) => ['product', id] as const,
  productAll: ['product'] as const,
  productImages: (id: UUID) => ['product-images', id] as const,
  productImagesAll: ['product-images'] as const,
  priceHistory: (id: UUID) => ['price-history', id] as const,
  priceHistoryAll: ['price-history'] as const,
  requests: (query: RequestListQuery) => ['requests', query] as const,
  requestsAll: ['requests'] as const,
  /** Позначка «реєстр змінився» — інвалідується разом з усім ['requests']; реєстр перечитує підвантажені порції. */
  requestsVersion: ['requests', 'version'] as const,
  kps: (requestId: UUID) => ['kps', requestId] as const,
  attachments: (requestId: UUID) => ['attachments', requestId] as const,
  history: (requestId: UUID) => ['history', requestId] as const,
  rates: (date: string) => ['rates', date] as const,
  ratesList: ['rates-list'] as const,
};
