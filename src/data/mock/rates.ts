// Демо-курси НБУ: детермінований плавний ряд за 60 днів (USD ≈ 44,5–45,0; EUR ≈ 51,7–52,2).
import { round4 } from '@shared/pricing';
import type { ForeignCurrency } from '@shared/enums';
import type { CurrencyRateDto, EffectiveRate, EffectiveRates, ISODate } from '@shared/types';

const DAY_MS = 86_400_000;
/** Курс вважається застарілим, якщо останній відомий старший за 3 дні від запитаної дати. */
const STALE_DAYS = 3;

export function generateNbuRates(now: Date, days: number, toIsoDate: (d: Date) => ISODate): CurrencyRateDto[] {
  const out: CurrencyRateDto[] = [];
  let id = 1;
  for (let ago = days; ago >= 0; ago--) {
    const t = days - ago;
    const date = toIsoDate(new Date(now.getTime() - ago * DAY_MS));
    const usd = 44.75 + 0.18 * Math.sin(t / 7) + 0.05 * Math.sin(t / 2.3 + 0.4);
    const eur = 51.95 + 0.17 * Math.sin(t / 9 + 1) + 0.06 * Math.sin(t / 3.1);
    const fetchedAt = `${date}T08:00:00.000Z`;
    out.push({ id: id++, currency: 'USD', rateDate: date, rate: round4(usd), source: 'nbu', fetchedAt, note: null });
    out.push({ id: id++, currency: 'EUR', rateDate: date, rate: round4(eur), source: 'nbu', fetchedAt, note: null });
  }
  return out;
}

/** Останній відомий курс кожної валюти на дату (≤ date). */
export function effectiveRatesOn(rates: readonly CurrencyRateDto[], date: ISODate): EffectiveRates {
  const pick = (cur: ForeignCurrency): EffectiveRate | null => {
    let best: CurrencyRateDto | null = null;
    for (const r of rates) {
      if (r.currency !== cur || r.rateDate > date) continue;
      // за ту саму дату ручний курс переважає НБУ: його вводять саме тоді, коли треба виправити
      if (!best || r.rateDate > best.rateDate || (r.rateDate === best.rateDate && r.source === 'manual')) best = r;
    }
    return best ? { rate: best.rate, rateDate: best.rateDate, source: best.source } : null;
  };
  const USD = pick('USD');
  const EUR = pick('EUR');
  const ageDays = (r: EffectiveRate | null) => (r ? (Date.parse(date) - Date.parse(r.rateDate)) / DAY_MS : Infinity);
  return { date, USD, EUR, stale: ageDays(USD) > STALE_DAYS || ageDays(EUR) > STALE_DAYS };
}
