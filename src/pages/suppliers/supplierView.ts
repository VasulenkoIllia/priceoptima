// Підписи для карток постачальників.
import { formatDate, formatPct, formatRate } from '@shared/format';
import { FEED_CONNECTOR_INFO } from '@shared/catalog/connectors';
import type { PriceListRates, PriceSourceKind, SupplierListItem, SupplierPriceSource } from '@shared/types';

const KIND_LABELS: Record<PriceSourceKind, string> = { auto: 'Автоматично', manual: 'Вручну', hybrid: 'Гібрид' };

/** Частина прайсу приходить за посиланням (кнопка «Оновити зараз», розклад). */
export const viaLink = (kind: PriceSourceKind) => kind !== 'manual';

/** Ціни приносить менеджер файлом (кнопка «Завантажити прайс» — основна дія). */
export const pricesFromFile = (kind: PriceSourceKind) => kind !== 'auto';

export const PRICE_SOURCE_COLORS: Record<PriceSourceKind, string> = { auto: 'green', manual: 'blue', hybrid: 'cyan' };

/** «Автоматично · САНДІ — JSON · щодня о 06:00», «Вручну · файлом» або «Гібрид · SANWELL — XML · щодня о 06:00 · ціни файлом». */
export function priceSourceLabel(s: SupplierPriceSource): string {
  const parts = [KIND_LABELS[s.kind] ?? s.kind];
  if (viaLink(s.kind)) {
    if (s.connector) parts.push(FEED_CONNECTOR_INFO[s.connector]?.label ?? s.connector);
    if (s.scheduleHour != null) parts.push(`щодня о ${String(s.scheduleHour).padStart(2, '0')}:00`);
  }
  if (s.kind === 'manual') parts.push('файлом');
  if (s.kind === 'hybrid') parts.push('ціни файлом');
  return parts.join(' · ');
}

/**
 * Спосіб курсу постачальника тими самими словами, що й у блоці заявки: «з прайсу; якщо немає — ручний курс постачальника
 * USD 41,20», «ручний курс постачальника: USD 41,20», «загальний», «НБУ + 1,5 %».
 */
export function ratePolicyLabel(s: Pick<SupplierListItem, 'ratePolicy' | 'rateAdjustPct' | 'manualRateUsd' | 'manualRateEur'>): string {
  if (s.ratePolicy === 'nbu_adjusted') return `НБУ ${s.rateAdjustPct >= 0 ? '+' : '−'} ${pctLabel(Math.abs(s.rateAdjustPct))}`;
  if (s.ratePolicy === 'nbu') return 'загальний';
  const parts = [s.manualRateUsd != null ? `USD ${formatRate(s.manualRateUsd)}` : null, s.manualRateEur != null ? `EUR ${formatRate(s.manualRateEur)}` : null].filter(Boolean);
  if (s.ratePolicy === 'manual') return parts.length ? `ручний курс постачальника: ${parts.join(' · ')}` : 'ручний курс постачальника (не вказано), поки що загальний';
  return parts.length ? `з прайсу; якщо немає, ручний курс постачальника ${parts.join(' · ')}` : 'з прайсу; якщо немає, загальний';
}

/** 'USD 45,00 · EUR 52,10 (від 12.09.2026)'; курсів немає — 'немає'. */
export function priceListRatesLabel(r: PriceListRates): string {
  const parts: string[] = [];
  if (r.USD != null) parts.push(`USD ${formatRate(r.USD)}`);
  if (r.EUR != null) parts.push(`EUR ${formatRate(r.EUR)}`);
  if (!parts.length) return 'немає';
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

/** Перетягнута картка стає перед чи після картки, над якою її відпустили (порядок постачальників, правки 25.09 п.3). */
export function moveSupplier(ids: readonly string[], dragId: string, targetId: string, after: boolean): string[] {
  if (dragId === targetId || !ids.includes(dragId) || !ids.includes(targetId)) return [...ids];
  const rest = ids.filter((id) => id !== dragId);
  const at = rest.indexOf(targetId) + (after ? 1 : 0);
  return [...rest.slice(0, at), dragId, ...rest.slice(at)];
}

