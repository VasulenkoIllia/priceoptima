import { describe, expect, it } from 'vitest';
import { blockRateLabel, relevantCurrencies, requestRatesLabel } from '@/lib/rateLabels';
import { deltaLabel } from '../BlockHeader';

describe('джерело курсу — однакові назви в блоці й на картці постачальника (4.7)', () => {
  it('блок: з прайсу, ручний курс постачальника, загальний, змінено в заявці', () => {
    expect(blockRateLabel({ rateSource: 'price_list', ratesDate: '2026-09-01' })).toBe('з прайсу від 01.09.2026');
    expect(blockRateLabel({ rateSource: 'manual', ratesDate: null })).toBe('ручний курс постачальника');
    expect(blockRateLabel({ rateSource: 'manual', ratesDate: '2026-09-12' })).toBe('змінено в заявці 12.09.2026');
    expect(blockRateLabel({ rateSource: 'nbu', ratesDate: '2026-09-11' })).toBe('загальний на 11.09.2026');
    expect(blockRateLabel({ rateSource: 'nbu_adjusted', ratesDate: '2026-09-11' })).toBe('НБУ ± %');
  });

  it('у шапці — лише валюта прайсу і валюти товарів блоку', () => {
    expect(relevantCurrencies('USD')).toEqual(['USD']);
    expect(relevantCurrencies('UAH')).toEqual([]);
    expect(relevantCurrencies('UAH', ['EUR', 'UAH'])).toEqual(['EUR']);
  });

  it('«Курс для заявок» на картці постачальника — фактичний курс нового блоку', () => {
    const base = {
      id: 's1',
      name: 'S',
      defaultCurrency: 'USD' as const,
      ratePolicy: 'price_list' as const,
      priceListRates: { USD: 41.2, EUR: null, date: '2026-09-12' },
      manualRateUsd: null,
      manualRateEur: null,
      rateAdjustPct: 0,
    };
    const eff = { date: '2026-09-13', USD: { rate: 41.5, rateDate: '2026-09-13', source: 'nbu' as const }, EUR: null, stale: false };
    const s = base as unknown as Parameters<typeof requestRatesLabel>[0];
    expect(requestRatesLabel(s, eff)).toBe('USD 41,20 (з прайсу від 12.09.2026)');
    const nbu = { ...base, ratePolicy: 'nbu' } as unknown as Parameters<typeof requestRatesLabel>[0];
    expect(requestRatesLabel(nbu, eff)).toBe('USD 41,50 (загальний на 13.09.2026)');
    const uah = { ...base, defaultCurrency: 'UAH' } as unknown as Parameters<typeof requestRatesLabel>[0];
    expect(requestRatesLabel(uah, eff)).toBe('не потрібен — прайс у гривнях');
  });
});

describe('шапка блоку — підпис дельти (п.5 правок)', () => {
  it('дорожче за найдешевші / найдешевший / нічого не покрито', () => {
    expect(deltaLabel({ deltaNet: 1016.05, filledCount: 12, cheapest: false })).toEqual({ text: 'Дорожче за найдешевші +1\u00a0016,05', cheapest: false });
    expect(deltaLabel({ deltaNet: 1016.05, filledCount: 12, cheapest: false }, true)?.text).toBe('дорожче +1\u00a0016,05');
    expect(deltaLabel({ deltaNet: 0, filledCount: 5, cheapest: true })).toEqual({ text: 'найдешевший', cheapest: true });
    expect(deltaLabel({ deltaNet: 0, filledCount: 0, cheapest: false })).toBeNull();
  });

  it('«найдешевший» лише в одного блоку: інший без переплати — без підпису', () => {
    expect(deltaLabel({ deltaNet: 0, filledCount: 3, cheapest: false })).toBeNull();
  });
});
