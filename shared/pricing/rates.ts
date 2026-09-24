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
  /** Курс із прайсу є, але старший за строк дії — не застосовано. */
  priceListExpired: boolean;
}

export interface DefaultRatesOptions {
  /** Курс із прайсу діє стільки днів від дати прайсу (налаштування); не задано — без обмеження. */
  maxAgeDays?: number | null;
  /** На яку дату рахувати строк; за замовчуванням — дата курсів шапки заявки. */
  on?: ISODate | null;
}

const DAY_MS = 86_400_000;

/** Курс із прайсу ще діє на дату on (дати немає — вік невідомий, курс лишається). */
export function priceListRateFresh(rateDate: ISODate | null, on: ISODate | null, maxAgeDays: number | null | undefined): boolean {
  if (maxAgeDays == null || !rateDate || !on) return true;
  return (Date.parse(on) - Date.parse(rateDate)) / DAY_MS <= maxAgeDays;
}

/** F33 з деталізацією джерела по валютах. */
export function supplierDefaultRatesInfo(
  supplier: SupplierRef | null,
  headerRates: HeaderRates | RatesPair,
  opts: DefaultRatesOptions = {},
): DefaultRatesInfo {
  const headerDate = 'date' in headerRates ? headerRates.date : null;
  const rates: RatesPair = { USD: null, EUR: null };
  const origins: Record<ForeignCurrency, RatePolicy | null> = { USD: null, EUR: null };
  const policy: RatePolicy = supplier?.ratePolicy ?? 'nbu';
  let date: ISODate | null = headerDate;
  const fresh = !supplier || priceListRateFresh(supplier.priceListRates.date, opts.on ?? headerDate, opts.maxAgeDays);
  let priceListExpired = false;

  for (const cur of FOREIGN_CURRENCIES) {
    const nbu = headerRates[cur];
    let rate: number | null = nbu;
    let origin: RatePolicy | null = nbu != null ? 'nbu' : null;
    if (supplier) {
      const listed = policy === 'price_list' ? supplier.priceListRates[cur] : null;
      if (listed != null && !fresh) priceListExpired = true;
      const pl = fresh ? listed : null;
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
  return { rates, origins, date, priceListExpired };
}

/**
 * F33 (Ф2, ДОВ-3): курси нового блоку. price_list → прайс (не старший за строк дії з налаштувань) → ручний курс постачальника → загальний курс із шапки
 * (більший із НБУ й ручного з «Курсів валют», general-rates.ts); manual → ручні (fallback — шапка);
 * nbu → шапка; nbu_adjusted → round6(шапка × (1 + adj/100)).
 */
export function supplierDefaultRates(supplier: SupplierRef | null, headerRates: RatesPair, opts: DefaultRatesOptions = {}): RatesPair {
  return supplierDefaultRatesInfo(supplier, headerRates, opts).rates;
}

/** Курс (F33) і націнка постачальника для блоку: новий блок і «Оновити курс і націнку» в наявному. */
export function supplierBlockDefaults(
  supplier: SupplierRef,
  headerRates: HeaderRates,
  opts: DefaultRatesOptions = {},
): Pick<SupplierBlock, 'rates' | 'rateSource' | 'ratesDate' | 'supplierMarkupPct'> {
  const info = supplierDefaultRatesInfo(supplier, headerRates, opts);
  // підпис джерела — за фактичним джерелом курсу валюти прайсу (для гривневого прайсу — долара)
  const mainCurrency: ForeignCurrency = supplier.defaultCurrency === 'EUR' ? 'EUR' : 'USD';
  return {
    rates: info.rates,
    rateSource: info.origins[mainCurrency] ?? supplier.ratePolicy,
    ratesDate: info.date,
    supplierMarkupPct: supplier.supplierMarkupPct,
  };
}

/** Новий блок постачальника з курсами за F33. */
export function createSupplierBlock(
  supplier: SupplierRef,
  headerRates: HeaderRates,
  init: { id: UUID; position: number },
  opts: DefaultRatesOptions = {},
): SupplierBlock {
  return {
    id: init.id,
    position: init.position,
    supplierId: supplier.id,
    legalEntityId: null,
    defaultCurrency: supplier.defaultCurrency,
    ...supplierBlockDefaults(supplier, headerRates, opts),
    pricesIncludeVat: supplier.pricesIncludeVat,
    note: null,
  };
}
