// Курс валюти з бази → CurrencyRateDto. У довіднику курсів живуть лише USD і EUR
// із джерелом 'nbu' або 'manual'; курс із прайсу постачальника зберігається в самому постачальнику.
import type { CurrencyRate } from '@prisma/client';
import { FOREIGN_CURRENCIES, RATE_SOURCES } from '@shared/enums';
import type { CurrencyRateDto } from '@shared/types';
import { isoDate, num, oneOf } from '../../lib/mapping';

export function toCurrencyRateDto(row: CurrencyRate): CurrencyRateDto {
  return {
    id: row.id,
    currency: oneOf(FOREIGN_CURRENCIES, row.currency, 'USD'),
    rateDate: isoDate(row.rateDate) ?? '',
    rate: num(row.rate),
    source: oneOf(RATE_SOURCES, row.source, 'manual'),
    fetchedAt: row.fetchedAt.toISOString(),
    note: row.note,
  };
}
