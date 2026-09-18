// Вибір діючих курсів на дату: останній відомий курс кожної валюти на дату або раніше.
import { FOREIGN_CURRENCIES } from '@shared/enums';
import type { CurrencyRateDto, EffectiveRate, EffectiveRates, ISODate } from '@shared/types';

const DAY_MS = 86_400_000;

/** Курс вважається застарілим, якщо останній відомий старший за 3 дні від запитаної дати. */
export const RATE_STALE_DAYS = 3;

/**
 * Останній відомий курс кожної валюти на дату (≤ date).
 * За однакову дату ручний курс переважає курс НБУ: його вводять саме тоді, коли треба виправити.
 */
export function effectiveRatesOn(rates: readonly CurrencyRateDto[], date: ISODate): EffectiveRates {
  const pick = (currency: (typeof FOREIGN_CURRENCIES)[number]): EffectiveRate | null => {
    let best: CurrencyRateDto | null = null;
    for (const r of rates) {
      if (r.currency !== currency || r.rateDate > date) continue;
      if (!best || r.rateDate > best.rateDate || (r.rateDate === best.rateDate && r.source === 'manual')) best = r;
    }
    return best ? { rate: best.rate, rateDate: best.rateDate, source: best.source } : null;
  };
  const USD = pick('USD');
  const EUR = pick('EUR');
  const ageDays = (r: EffectiveRate | null) => (r ? (Date.parse(date) - Date.parse(r.rateDate)) / DAY_MS : Infinity);
  return { date, USD, EUR, stale: ageDays(USD) > RATE_STALE_DAYS || ageDays(EUR) > RATE_STALE_DAYS };
}
