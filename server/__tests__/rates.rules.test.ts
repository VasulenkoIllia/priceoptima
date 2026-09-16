// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { CurrencyRateDto } from '@shared/types';
import { effectiveRatesOn } from '../modules/rates/rates.rules';

let nextId = 1;
const rate = (
  currency: CurrencyRateDto['currency'],
  rateDate: string,
  value: number,
  source: CurrencyRateDto['source'] = 'nbu',
): CurrencyRateDto => ({
  id: nextId++,
  currency,
  rateDate,
  rate: value,
  source,
  fetchedAt: `${rateDate}T05:45:00.000Z`,
  note: null,
});

const history: CurrencyRateDto[] = [
  rate('USD', '2026-09-14', 44.5),
  rate('EUR', '2026-09-14', 51.9),
  rate('USD', '2026-09-16', 44.8),
  rate('EUR', '2026-09-16', 52.1),
];

describe('діючі курси на дату', () => {
  it('беруть останній відомий курс на цю дату', () => {
    const out = effectiveRatesOn(history, '2026-09-16');
    expect(out.USD).toEqual({ rate: 44.8, rateDate: '2026-09-16', source: 'nbu' });
    expect(out.EUR).toEqual({ rate: 52.1, rateDate: '2026-09-16', source: 'nbu' });
    expect(out.date).toBe('2026-09-16');
    expect(out.stale).toBe(false);
  });

  it('пізніші курси не враховуються', () => {
    expect(effectiveRatesOn(history, '2026-09-15').USD?.rateDate).toBe('2026-09-14');
  });

  it('курс попереднього дня діє й наступного та не вважається застарілим', () => {
    const out = effectiveRatesOn(history, '2026-09-17');
    expect(out.USD?.rateDate).toBe('2026-09-16');
    expect(out.stale).toBe(false);
  });

  it('курс, старший за три дні, позначається застарілим', () => {
    expect(effectiveRatesOn(history, '2026-09-20').stale).toBe(true);
  });

  it('курсу немає зовсім — null і позначка «застарілі»', () => {
    const out = effectiveRatesOn([], '2026-09-16');
    expect(out).toEqual({ date: '2026-09-16', USD: null, EUR: null, stale: true });
  });

  it('валюти рахуються окремо: бракує лише EUR', () => {
    const out = effectiveRatesOn([rate('USD', '2026-09-16', 44.8)], '2026-09-16');
    expect(out.USD).not.toBeNull();
    expect(out.EUR).toBeNull();
    expect(out.stale).toBe(true);
  });

  it('за ту саму дату ручний курс переважає курс НБУ', () => {
    const rows = [rate('USD', '2026-09-16', 44.8), rate('USD', '2026-09-16', 45.2, 'manual')];
    expect(effectiveRatesOn(rows, '2026-09-16').USD).toEqual({ rate: 45.2, rateDate: '2026-09-16', source: 'manual' });
    expect(effectiveRatesOn([...rows].reverse(), '2026-09-16').USD?.source).toBe('manual');
  });

  it('свіжіший курс НБУ важливіший за старіший ручний', () => {
    const rows = [rate('USD', '2026-09-14', 45.2, 'manual'), rate('USD', '2026-09-16', 44.8)];
    expect(effectiveRatesOn(rows, '2026-09-16').USD?.rateDate).toBe('2026-09-16');
  });
});
