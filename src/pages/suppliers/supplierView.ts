// Підписи для карток постачальників.
import { formatDate, formatPct, formatRate } from '@shared/format';
import type { PriceListRates, PriceSourceKind, SupplierPriceSource } from '@shared/types';

const FORMAT_LABELS: Record<string, string> = { json: 'JSON', yml: 'YML', xml: 'XML', csv: 'CSV', xlsx: 'Excel' };

const KIND_LABELS: Record<PriceSourceKind, string> = { auto: 'Автоматично', manual: 'Вручну', hybrid: 'Гібрид' };

/** Частина прайсу приходить за посиланням (кнопка «Оновити зараз», розклад). */
export const viaLink = (kind: PriceSourceKind) => kind !== 'manual';

/** Ціни приносить менеджер файлом (кнопка «Завантажити прайс» — основна дія). */
export const pricesFromFile = (kind: PriceSourceKind) => kind !== 'auto';

export const PRICE_SOURCE_COLORS: Record<PriceSourceKind, string> = { auto: 'green', manual: 'blue', hybrid: 'cyan' };

/** «Автоматично · JSON · щодня о 06:00», «Вручну · файлом» або «Гібрид · XML · щодня о 06:00 · ціни файлом». */
export function priceSourceLabel(s: SupplierPriceSource): string {
  const parts = [KIND_LABELS[s.kind] ?? s.kind];
  if (viaLink(s.kind)) {
    if (s.format) parts.push(FORMAT_LABELS[s.format] ?? s.format.toUpperCase());
    if (s.scheduleHour != null) parts.push(`щодня о ${String(s.scheduleHour).padStart(2, '0')}:00`);
  }
  if (s.kind === 'manual') parts.push('файлом');
  if (s.kind === 'hybrid') parts.push('ціни файлом');
  return parts.join(' · ');
}

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
