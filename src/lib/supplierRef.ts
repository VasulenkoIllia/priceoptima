import type { SupplierRef } from '@shared/types';

/** Лише поля SupplierRef (для refs документа) з ширшого DTO постачальника. */
export function toSupplierRef(s: SupplierRef): SupplierRef {
  return {
    id: s.id,
    name: s.name,
    logoUrl: s.logoUrl,
    color: s.color,
    defaultCurrency: s.defaultCurrency,
    pricesIncludeVat: s.pricesIncludeVat,
    supplierMarkupPct: s.supplierMarkupPct,
    ratePolicy: s.ratePolicy,
    rateAdjustPct: s.rateAdjustPct,
    manualRateUsd: s.manualRateUsd,
    manualRateEur: s.manualRateEur,
    priceListRates: { ...s.priceListRates },
    minOrderAmount: s.minOrderAmount,
    priceStaleDays: s.priceStaleDays,
    searchUrlTemplate: s.searchUrlTemplate,
    website: s.website,
    b2bUrl: s.b2bUrl,
  };
}
