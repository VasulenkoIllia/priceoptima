// Підписи для карток постачальників.
import { formatDate, formatPct, formatRate } from '@shared/format';
import type { PriceListRates } from '@shared/types';

/** 'USD 45,00 · EUR 52,10 (від 12.09.2026)'; курсів немає — '—'. */
export function priceListRatesLabel(r: PriceListRates): string {
  const parts: string[] = [];
  if (r.USD != null) parts.push(`USD ${formatRate(r.USD)}`);
  if (r.EUR != null) parts.push(`EUR ${formatRate(r.EUR)}`);
  if (!parts.length) return '—';
  return `${parts.join(' · ')}${r.date ? ` (від ${formatDate(r.date)})` : ''}`;
}

/** 2 → '2 %', 1,5 → '1,50 %'. */
export function pctLabel(v: number): string {
  return formatPct(v, Number.isInteger(v) ? 0 : 2);
}

/** 'https://b2b.example.com/' → 'b2b.example.com'. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}
