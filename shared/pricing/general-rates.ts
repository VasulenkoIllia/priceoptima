// Загальний курс на дату («Курси валют»): діє більший із двох — останній курс НБУ і останній нескасований ручний.
// Одне правило для сервера (курс заявки, «Курс для заявок») і сторінки курсів (графік, таблиця).
import type { ForeignCurrency } from '../enums';
import type { CurrencyRateDto, EffectiveRate, EffectiveRates, ISODate, RateValue } from '../types';

const DAY_MS = 86_400_000;

/** Курс НБУ вважається застарілим, якщо останній відомий старший за 3 дні від запитаної дати. */
export const RATE_STALE_DAYS = 3;

const later = (a: CurrencyRateDto | null, b: CurrencyRateDto): CurrencyRateDto => (!a || b.rateDate > a.rateDate ? b : a);
const valueOf = (r: CurrencyRateDto | null): RateValue | null => (r ? { rate: r.rate, rateDate: r.rateDate } : null);

/**
 * Загальний курс валюти на дату (правки замовника 23.09): більший із двох — останній відомий курс НБУ і останній ручний.
 * Ручний діє, доки не введуть новий або не скасують, тож нижчий курс НБУ наступного дня його не перебиває. Однакові — НБУ.
 */
export function effectiveRateOn(rates: readonly CurrencyRateDto[], currency: ForeignCurrency, date: ISODate): EffectiveRate | null {
  let nbu: CurrencyRateDto | null = null;
  let manual: CurrencyRateDto | null = null;
  for (const r of rates) {
    if (r.currency !== currency || r.rateDate > date || r.cancelledAt) continue;
    if (r.source === 'manual') manual = later(manual, r);
    else nbu = later(nbu, r);
  }
  const chosen = manual && (!nbu || manual.rate > nbu.rate) ? manual : nbu;
  if (!chosen) return null;
  return { rate: chosen.rate, rateDate: chosen.rateDate, source: chosen.source, nbu: valueOf(nbu), manual: valueOf(manual) };
}

/** Діючі курси обох валют на дату; «застарілі» — коли курс НБУ (або, без нього, діючий) старший за RATE_STALE_DAYS. */
export function effectiveRatesOn(rates: readonly CurrencyRateDto[], date: ISODate): EffectiveRates {
  const USD = effectiveRateOn(rates, 'USD', date);
  const EUR = effectiveRateOn(rates, 'EUR', date);
  const ageDays = (r: EffectiveRate | null) => {
    const basis = r?.nbu ?? r;
    return basis ? (Date.parse(date) - Date.parse(basis.rateDate)) / DAY_MS : Infinity;
  };
  return { date, USD, EUR, stale: ageDays(USD) > RATE_STALE_DAYS || ageDays(EUR) > RATE_STALE_DAYS };
}

/** Діючий курс на день: date — день, rateDate — дата курсу, з якого він узятий (ручний може бути давнішим). */
export type EffectiveRateOnDay = EffectiveRate & { date: ISODate };

/** Діючий курс валюти по днях (графік і таблиця сторінки курсів): на кожну дату, де є курс НБУ чи ручний. */
export function effectiveSeries(rates: readonly CurrencyRateDto[], currency: ForeignCurrency): EffectiveRateOnDay[] {
  const dates = [...new Set(rates.filter((r) => r.currency === currency && !r.cancelledAt).map((r) => r.rateDate))].sort();
  const out: EffectiveRateOnDay[] = [];
  for (const date of dates) {
    const eff = effectiveRateOn(rates, currency, date);
    if (eff) out.push({ ...eff, date });
  }
  return out;
}
