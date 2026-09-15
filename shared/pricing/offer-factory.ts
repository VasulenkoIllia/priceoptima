import type { ProductNameKind } from '../enums';
import type { CatalogSnapshot, Offer, ProductListItem, UUID } from '../types';
import { initialOfferQty } from './multiplicity';

export type ProductForOffer = Pick<
  ProductListItem,
  | 'id'
  | 'sku'
  | 'nameWork'
  | 'name1c'
  | 'unitCode'
  | 'currency'
  | 'purchasePrice'
  | 'rrp'
  | 'multiplicity'
  | 'stockQty'
  | 'availability'
  | 'priceUpdatedAt'
  | 'isArchived'
>;

export function catalogSnapshotOf(product: ProductForOffer): CatalogSnapshot {
  return {
    productId: product.id,
    currency: product.currency,
    purchasePrice: product.purchasePrice,
    rrp: product.rrp,
    priceUpdatedAt: product.priceUpdatedAt,
    stockQty: product.stockQty,
    availability: product.availability,
    isArchived: product.isArchived,
  };
}

/**
 * Знімок товару в пропозицію (клітинка «рядок × блок»).
 * К-сть: кратна вгору при автоокругленні (T5: 118 → 120), інакше null (= к-сть рядка).
 */
export function createOfferFromProduct(
  product: ProductForOffer,
  init: {
    id: UUID;
    lineId: UUID;
    blockId: UUID;
    lineQty: number;
    autoRoundMultiplicity: boolean;
    nameKind?: ProductNameKind;
    note?: string | null;
  },
): Offer {
  return {
    id: init.id,
    lineId: init.lineId,
    blockId: init.blockId,
    productId: product.id,
    sku: product.sku,
    nameWork: product.nameWork,
    name1c: product.name1c,
    nameKind: init.nameKind ?? 'work',
    unitCode: product.unitCode,
    currency: product.currency,
    purchasePriceCur: product.purchasePrice,
    rrpCur: product.rrp,
    qty: initialOfferQty(init.lineQty, product.multiplicity, init.autoRoundMultiplicity),
    multiplicity: product.multiplicity,
    stockQty: product.stockQty,
    availability: product.availability,
    priceDate: product.priceUpdatedAt,
    excluded: false,
    excludeReason: null,
    note: init.note ?? null,
    priceChange: null,
    catalog: catalogSnapshotOf(product),
  };
}

/** Назва пропозиції за обраним видом (робоча / 1С), з fallback на іншу. */
export function offerDisplayName(offer: Pick<Offer, 'nameWork' | 'name1c' | 'nameKind'>): string | null {
  return offer.nameKind === 'accounting' ? (offer.name1c ?? offer.nameWork) : (offer.nameWork ?? offer.name1c);
}
