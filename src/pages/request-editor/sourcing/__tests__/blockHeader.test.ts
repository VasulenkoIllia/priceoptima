import { describe, expect, it } from 'vitest';
import { rateSourceLabel } from '../BlockHeader';

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
