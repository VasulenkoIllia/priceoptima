// Рядки прайсу з браузера (PriceImportRow: файл уже розібрано, ПДВ застосовано) → внутрішній PriceRow.
// Далі їх звіряє та сама процедура, що й вигрузки за посиланням (plan.ts).
import { AVAILABILITY_STATUSES, CURRENCY_CODES } from '@shared/enums';
import type { AvailabilityStatus, CurrencyCode } from '@shared/enums';
import type { PriceImportRow } from '@shared/types';
import { emptyRow, type PriceRow } from './connectors/types';

const text = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const finite = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Ціна чи кратність: нуль і від'ємне у прайсі означають «немає значення». */
const positive = (value: number | null | undefined): number | null => {
  const n = finite(value);
  return n != null && n > 0 ? n : null;
};

/** Від'ємний залишок у прайсах трапляється (резерв більший за склад) — це «немає». */
const stock = (value: number | null | undefined): number | null => {
  const n = finite(value);
  return n == null ? null : Math.max(n, 0);
};

const currencyOf = (value: string | null | undefined): CurrencyCode | null =>
  (CURRENCY_CODES as readonly string[]).includes(value ?? '') ? (value as CurrencyCode) : null;

const availabilityOf = (value: string | null | undefined): AvailabilityStatus | null =>
  (AVAILABILITY_STATUSES as readonly string[]).includes(value ?? '') ? (value as AvailabilityStatus) : null;

export function importRowToPriceRow(row: PriceImportRow): PriceRow {
  return {
    ...emptyRow(row.code?.trim() ?? ''),
    sku: text(row.sku),
    name: text(row.name),
    brand: text(row.brand),
    unitCode: text(row.unitCode),
    purchasePrice: positive(row.purchasePrice),
    currency: currencyOf(row.currency),
    rrp: positive(row.rrp),
    stockQty: stock(row.stockQty),
    availability: availabilityOf(row.availability),
    multiplicity: positive(row.multiplicity),
    minOrderQty: positive(row.minOrderQty),
  };
}

/** Рядки без коду не відкидаємо тут — їх рахує звірка як пропущені. */
export function importRowsToPriceRows(rows: readonly PriceImportRow[]): PriceRow[] {
  return rows.map(importRowToPriceRow);
}
