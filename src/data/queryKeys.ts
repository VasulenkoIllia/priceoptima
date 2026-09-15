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
  priceUpdates: (supplierId?: UUID) => ['price-updates', supplierId ?? 'all'] as const,
  priceUpdatesAll: ['price-updates'] as const,
  products: (query: ProductListQuery) => ['products', query] as const,
  productsAll: ['products'] as const,
  product: (id: UUID) => ['product', id] as const,
  productAll: ['product'] as const,
  priceHistory: (id: UUID) => ['price-history', id] as const,
  priceHistoryAll: ['price-history'] as const,
  requests: (query: RequestListQuery) => ['requests', query] as const,
  requestsAll: ['requests'] as const,
  kps: (requestId: UUID) => ['kps', requestId] as const,
  history: (requestId: UUID) => ['history', requestId] as const,
  rates: (date: string) => ['rates', date] as const,
  ratesList: ['rates-list'] as const,
};
