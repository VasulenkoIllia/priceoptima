// Підписи курсу: однакові назви джерел на картці постачальника, у «Курсах валют» і в блоці заявки.
import type { CurrencyCode, ForeignCurrency, RatePolicy } from '@shared/enums';
import { formatDate, formatRate } from '@shared/format';
import { supplierDefaultRatesInfo } from '@shared/pricing';
import { toSupplierRef } from '@shared/requests';
import type { EffectiveRates, HeaderRates, ISODate, SupplierBlock, SupplierListItem } from '@shared/types';

/** «загальний» — ручний курс із «Курси валют» на цю дату, якщо його задано, інакше НБУ. */
export const GENERAL_RATE_HINT = 'Загальний курс — ручний курс із розділу «Курси валют» на цю дату, якщо його задано, інакше курс НБУ';

/** Звідки курс: «з прайсу від 12.09.2026», «ручний курс постачальника», «загальний на 12.09.2026», «НБУ ± %». */
export function rateOriginLabel(origin: RatePolicy | null, date: ISODate | null): string {
  switch (origin) {
    case 'price_list':
      return date ? `з прайсу від ${formatDate(date)}` : 'з прайсу';
    case 'manual':
      return 'ручний курс постачальника';
    case 'nbu':
      return date ? `загальний на ${formatDate(date)}` : 'загальний';
    case 'nbu_adjusted':
      return 'НБУ ± %';
    default:
      return 'немає курсу';
  }
}

/** Джерело курсу блоку: змінений у заявці — «змінено в заявці 12.09.2026», інакше як у постачальника. */
export function blockRateLabel(block: Pick<SupplierBlock, 'rateSource' | 'ratesDate'>): string {
  if (block.rateSource === 'manual' && block.ratesDate) return `змінено в заявці ${formatDate(block.ratesDate)}`;
  return rateOriginLabel(block.rateSource, block.ratesDate);
}

/** Валюти, для яких курс має сенс: валюта прайсу (якщо не гривня) і валюти товарів у блоці. */
export function relevantCurrencies(defaultCurrency: CurrencyCode, used: Iterable<CurrencyCode> = []): ForeignCurrency[] {
  const set = new Set<CurrencyCode>([defaultCurrency, ...used]);
  return (['USD', 'EUR'] as const).filter((c) => set.has(c));
}

export function headerRatesOf(eff: EffectiveRates | undefined): HeaderRates {
  return { USD: eff?.USD?.rate ?? null, EUR: eff?.EUR?.rate ?? null, date: eff?.date ?? null };
}

/** «Курс для заявок»: який курс отримає новий блок цього постачальника сьогодні — «USD 41,20 (з прайсу від 12.09.2026)». */
export function requestRatesLabel(s: SupplierListItem, eff: EffectiveRates | undefined): string {
  const currencies = relevantCurrencies(s.defaultCurrency);
  if (!currencies.length) return 'не потрібен — прайс у гривнях';
  const info = supplierDefaultRatesInfo(toSupplierRef(s), headerRatesOf(eff));
  return currencies
    .map((c) => {
      const rate = info.rates[c];
      if (rate == null) return `${c} — немає курсу`;
      const origin = info.origins[c];
      const date = origin === 'price_list' ? info.date : origin === 'nbu' || origin === 'nbu_adjusted' ? (eff?.date ?? null) : null;
      return `${c} ${formatRate(rate)} (${rateOriginLabel(origin, date)})`;
    })
    .join(' · ');
}
