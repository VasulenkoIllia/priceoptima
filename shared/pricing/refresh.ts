import type { CatalogSnapshot, Offer, OfferPriceChange } from '../types';
import { round2 } from './money';

/**
 * F34: оновити знімок пропозиції з каталогу (ціни, валюта, наявність, дата ціни).
 * Якщо змінились валюта/вхід/РРЦ — записується priceChange з попередніми значеннями.
 */
export function refreshOfferFromCatalog(
  offer: Offer,
  catalog: CatalogSnapshot,
  prevRate: number | null,
  now: Date,
  reason: OfferPriceChange['reason'],
  supplierMarkupPct = 0,
): Offer {
  const changed =
    catalog.currency !== offer.currency || catalog.purchasePrice !== offer.purchasePriceCur || catalog.rrp !== offer.rrpCur;
  const rate = offer.currency === 'UAH' ? 1 : prevRate;
  const prevUnitNetUah =
    offer.purchasePriceCur != null && rate != null
      ? round2(offer.purchasePriceCur * rate * (1 + supplierMarkupPct / 100)) // Ф3
      : null;
  return {
    ...offer,
    currency: catalog.currency,
    purchasePriceCur: catalog.purchasePrice,
    rrpCur: catalog.rrp,
    stockQty: catalog.stockQty,
    availability: catalog.availability,
    priceDate: catalog.priceUpdatedAt,
    catalog,
    priceChange: changed
      ? {
          prevCurrency: offer.currency,
          prevPurchasePriceCur: offer.purchasePriceCur,
          prevRrpCur: offer.rrpCur,
          prevRate: rate,
          prevUnitNetUah,
          reason,
          changedAt: now.toISOString(),
        }
      : offer.priceChange,
  };
}

/**
 * Ручна ціна входу в цій заявці (РЕД-10): знімок пропозиції отримує нову ціну,
 * а попередня лишається в priceChange — щоб у сітці було видно «було → стало».
 */
export function offerWithManualPrice(
  offer: Offer,
  purchasePriceCur: number | null,
  prevRate: number | null,
  now: Date,
  supplierMarkupPct = 0,
): Offer {
  if (purchasePriceCur === offer.purchasePriceCur) return offer;
  const rate = offer.currency === 'UAH' ? 1 : prevRate;
  const prevUnitNetUah =
    offer.purchasePriceCur != null && rate != null ? round2(offer.purchasePriceCur * rate * (1 + supplierMarkupPct / 100)) : null;
  return {
    ...offer,
    purchasePriceCur,
    priceChange: {
      prevCurrency: offer.currency,
      prevPurchasePriceCur: offer.purchasePriceCur,
      prevRrpCur: offer.rrpCur,
      prevRate: rate,
      prevUnitNetUah,
      reason: 'manual_edit',
      changedAt: now.toISOString(),
    },
  };
}
