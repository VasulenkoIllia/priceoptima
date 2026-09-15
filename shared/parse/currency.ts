import type { CurrencyCode } from '../enums';

const CURRENCY_ALIASES: Record<string, CurrencyCode> = {
  uah: 'UAH',
  грн: 'UAH',
  гривня: 'UAH',
  гривні: 'UAH',
  гривень: 'UAH',
  '₴': 'UAH',
  '980': 'UAH',
  usd: 'USD',
  $: 'USD',
  дол: 'USD',
  долар: 'USD',
  долари: 'USD',
  доларів: 'USD',
  '840': 'USD',
  eur: 'EUR',
  '€': 'EUR',
  євро: 'EUR',
  евро: 'EUR',
  '978': 'EUR',
};

/** 'грн', 'UAH', '₴' → UAH; '$', 'usd' → USD; '€', 'eur' → EUR; інше → null. */
export function parseCurrency(raw: unknown): CurrencyCode | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const key = String(raw).trim().toLocaleLowerCase('uk').replace(/\.+$/u, '');
  return CURRENCY_ALIASES[key] ?? null;
}
