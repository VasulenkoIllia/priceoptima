import { FOREIGN_CURRENCIES } from '../enums';
import type { CurrencyCode, ForeignCurrency, RatePolicy } from '../enums';
import type { HeaderRates, ISODate, RatesPair, SupplierBlock, SupplierRef, UUID } from '../types';
import { round6 } from './money';

/** F1: курс пропозиції — блок → шапка заявки → null (RATE_MISSING). */
export function resolveRate(currency: CurrencyCode, blockRates: RatesPair, headerRates: RatesPair): number | null {
  if (currency === 'UAH') return 1;
  return blockRates[currency] ?? headerRates[currency] ?? null;
}

export interface DefaultRatesInfo {
  rates: RatesPair;
  /** Фактичне джерело кожного курсу (price_list з null-полем → 'manual' або 'nbu'); null — курсу немає. */
  origins: Record<ForeignCurrency, RatePolicy | null>;
  date: ISODate | null;
}

/** F33 з деталізацією джерела по валютах. */
export function supplierDefaultRatesInfo(supplier: SupplierRef | null, headerRates: HeaderRates | RatesPair): DefaultRatesInfo {
  const headerDate = 'date' in headerRates ? headerRates.date : null;
  const rates: RatesPair = { USD: null, EUR: null };
  const origins: Record<ForeignCurrency, RatePolicy | null> = { USD: null, EUR: null };
  const policy: RatePolicy = supplier?.ratePolicy ?? 'nbu';
  let date: ISODate | null = headerDate;

  for (const cur of FOREIGN_CURRENCIES) {
    const nbu = headerRates[cur];
    let rate: number | null = nbu;
    let origin: RatePolicy | null = nbu != null ? 'nbu' : null;
    if (supplier) {
      const pl = policy === 'price_list' ? supplier.priceListRates[cur] : null;
      const manual = cur === 'USD' ? supplier.manualRateUsd : supplier.manualRateEur;
      if (pl != null) {
        rate = pl;
        origin = 'price_list';
      } else if ((policy === 'price_list' || policy === 'manual') && manual != null) {
        rate = manual;
        origin = 'manual';
      } else if (policy === 'nbu_adjusted' && nbu != null) {
        rate = round6(nbu * (1 + supplier.rateAdjustPct / 100));
        origin = 'nbu_adjusted';
      }
    }
    rates[cur] = rate;
    origins[cur] = origin;
  }

  if (supplier && (origins.USD === 'price_list' || origins.EUR === 'price_list')) {
    date = supplier.priceListRates.date ?? headerDate;
  } else if (origins.USD === 'manual' || origins.EUR === 'manual') {
    date = null;
  }
  return { rates, origins, date };
}

/**
 * F33 (Ф2, ДОВ-3): курси нового блоку. price_list → прайс → ручний курс постачальника → НБУ з шапки;
 * manual → ручні (fallback — шапка); nbu → шапка; nbu_adjusted → round6(шапка × (1 + adj/100)).
 */
export function supplierDefaultRates(supplier: SupplierRef | null, headerRates: RatesPair): RatesPair {
  return supplierDefaultRatesInfo(supplier, headerRates).rates;
}

/** Новий блок постачальника з курсами за F33. */
export function createSupplierBlock(
  supplier: SupplierRef,
  headerRates: HeaderRates,
  init: { id: UUID; position: number },
): SupplierBlock {
  const info = supplierDefaultRatesInfo(supplier, headerRates);
  return {
    id: init.id,
    position: init.position,
    supplierId: supplier.id,
    legalEntityId: null,
    defaultCurrency: supplier.defaultCurrency,
    rates: info.rates,
    rateSource: supplier.ratePolicy,
    ratesDate: info.date,
    supplierMarkupPct: supplier.supplierMarkupPct,
    pricesIncludeVat: supplier.pricesIncludeVat,
    note: null,
  };
}
