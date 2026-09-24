// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { CurrencyRateDto } from '@shared/types';
import { effectiveSeries } from '@shared/pricing';
import { effectiveRatesOn } from '../modules/rates/rates.rules';

let nextId = 1;
const rate = (
  currency: CurrencyRateDto['currency'],
  rateDate: string,
  value: number,
  source: CurrencyRateDto['source'] = 'nbu',
  cancelledAt: string | null = null,
): CurrencyRateDto => ({
  id: nextId++,
  currency,
  rateDate,
  rate: value,
  source,
  fetchedAt: `${rateDate}T05:45:00.000Z`,
  note: null,
  cancelledAt,
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
    expect(out.USD).toEqual({ rate: 44.8, rateDate: '2026-09-16', source: 'nbu', nbu: { rate: 44.8, rateDate: '2026-09-16' }, manual: null });
    expect(out.EUR).toMatchObject({ rate: 52.1, rateDate: '2026-09-16', source: 'nbu' });
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

});

describe('більший із НБУ й ручного (правки замовника 23.09)', () => {
  it('ручний вищий за НБУ — діє ручний, обидва кандидати видно', () => {
    const rows = [rate('USD', '2026-09-16', 44.8), rate('USD', '2026-09-16', 45.2, 'manual')];
    expect(effectiveRatesOn(rows, '2026-09-16').USD).toEqual({
      rate: 45.2,
      rateDate: '2026-09-16',
      source: 'manual',
      nbu: { rate: 44.8, rateDate: '2026-09-16' },
      manual: { rate: 45.2, rateDate: '2026-09-16' },
    });
    expect(effectiveRatesOn([...rows].reverse(), '2026-09-16').USD?.source).toBe('manual');
  });

  it('ручний діє й наступними днями, поки нижчий курс НБУ його не перебиває', () => {
    const rows = [rate('USD', '2026-09-24', 45.1, 'manual'), rate('USD', '2026-09-24', 44.86), rate('USD', '2026-09-25', 44.9)];
    expect(effectiveRatesOn(rows, '2026-09-25').USD).toMatchObject({ rate: 45.1, source: 'manual', rateDate: '2026-09-24' });
  });

  it('вищий курс НБУ перебиває ручний', () => {
    const rows = [rate('USD', '2026-09-24', 45.1, 'manual'), rate('USD', '2026-09-26', 45.3)];
    expect(effectiveRatesOn(rows, '2026-09-26').USD).toMatchObject({ rate: 45.3, source: 'nbu', manual: { rate: 45.1, rateDate: '2026-09-24' } });
  });

  it('нижчий за НБУ ручний не діє; однакові — НБУ', () => {
    expect(effectiveRatesOn([rate('USD', '2026-09-16', 44.8), rate('USD', '2026-09-16', 44.5, 'manual')], '2026-09-16').USD?.source).toBe('nbu');
    expect(effectiveRatesOn([rate('USD', '2026-09-16', 44.8), rate('USD', '2026-09-16', 44.8, 'manual')], '2026-09-16').USD?.source).toBe('nbu');
  });

  it('новий ручний замінює старий, навіть нижчий', () => {
    const rows = [rate('USD', '2026-09-20', 46, 'manual'), rate('USD', '2026-09-22', 45.5, 'manual'), rate('USD', '2026-09-22', 45)];
    expect(effectiveRatesOn(rows, '2026-09-23').USD).toMatchObject({ rate: 45.5, source: 'manual' });
  });

  it('скасований ручний не діє', () => {
    const rows = [rate('USD', '2026-09-24', 45.1, 'manual', '2026-09-24T12:00:00.000Z'), rate('USD', '2026-09-24', 44.86)];
    expect(effectiveRatesOn(rows, '2026-09-24').USD).toMatchObject({ rate: 44.86, source: 'nbu', manual: null });
  });

  it('«застарілі» — за віком курсу НБУ, а не давнього ручного', () => {
    const rows = [rate('USD', '2026-09-01', 46, 'manual'), rate('USD', '2026-09-16', 44.8), rate('EUR', '2026-09-16', 52.1)];
    const out = effectiveRatesOn(rows, '2026-09-17');
    expect(out.USD?.source).toBe('manual');
    expect(out.stale).toBe(false);
  });

  it('ряд по днях для графіка: ручний тягнеться, поки вищий', () => {
    const rows = [rate('USD', '2026-09-23', 44.7), rate('USD', '2026-09-24', 44.86), rate('USD', '2026-09-24', 45.1, 'manual'), rate('USD', '2026-09-25', 45.2)];
    expect(effectiveSeries(rows, 'USD').map((e) => [e.date, e.rate, e.source])).toEqual([
      ['2026-09-23', 44.7, 'nbu'],
      ['2026-09-24', 45.1, 'manual'],
      ['2026-09-25', 45.2, 'nbu'],
    ]);
  });
});
