import { describe, expect, it } from 'vitest';
import { deltaLabel, rateSourceLabel } from '../BlockHeader';

describe('шапка блоку — джерело курсу (ТЗ РЕД-4)', () => {
  it('прайс з датою, картка постачальника, загальний курс (ручний або НБУ), вручну', () => {
    expect(rateSourceLabel({ rateSource: 'price_list', ratesDate: '2026-09-01' })).toBe('прайс 01.09.2026');
    expect(rateSourceLabel({ rateSource: 'price_list', ratesDate: null })).toBe('картка');
    expect(rateSourceLabel({ rateSource: 'manual', ratesDate: null })).toBe('картка');
    expect(rateSourceLabel({ rateSource: 'manual', ratesDate: '2026-09-12' })).toBe('вручну 12.09.2026');
    expect(rateSourceLabel({ rateSource: 'nbu', ratesDate: '2026-09-11' })).toBe('загальний 11.09.2026');
    expect(rateSourceLabel({ rateSource: 'nbu_adjusted', ratesDate: '2026-09-11' })).toBe('НБУ ± %');
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
