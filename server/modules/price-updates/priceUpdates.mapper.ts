// Запис журналу оновлень прайсів → DTO. PriceUpdateDto (shared) доповнюємо станом запуску,
// новими лічильниками й звітом звірки — фронт, що їх ще не знає, просто не читає зайві поля.
import type { PriceImportFile, PriceImportRun, User } from '@prisma/client';
import type { ISODateTime, PriceUpdateDto, RatesPair, UserRef } from '@shared/types';
import { numOrNull } from '../../lib/mapping';
import type { PlanCounters, PlanReport } from './plan';

export type PriceImportRunRow = PriceImportRun & { user: User | null; file: PriceImportFile | null };

export interface PriceUpdateRunDto extends PriceUpdateDto {
  status: 'ok' | 'error';
  /** Чому оновлення не застосовано (status = 'error'). */
  error: string | null;
  warnings: string[];
  skipped: number;
  relinked: number;
  restored: number;
  detailsDiffer: number;
  finishedAt: ISODateTime | null;
}

/** Запуск разом зі звітом звірки (відповідь на запуск і картка одного запису журналу). */
export interface PriceUpdateRunDetail extends PriceUpdateRunDto {
  report: PlanReport | null;
}

const userRefOf = (user: Pick<User, 'id' | 'shortName'> | null): UserRef | null =>
  user ? { id: user.id, shortName: user.shortName } : null;

export function warningsOf(text: string | null): string[] {
  return (text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function warningsText(warnings: readonly string[]): string | null {
  const lines = warnings.map((w) => w.replace(/\s+/gu, ' ').trim()).filter(Boolean);
  return lines.length ? lines.join('\n') : null;
}

/** Звіт із колонки JSON; щось чуже (старий формат) — звіту немає. */
export function reportOf(value: unknown): PlanReport | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const sections = ['detailsDiffer', 'bigPriceChanges', 'relinked', 'notFound', 'skippedRows'] as const;
  const record = value as Record<string, unknown>;
  return sections.every((key) => typeof record[key] === 'object' && record[key] !== null) ? (value as PlanReport) : null;
}

export function toPriceUpdateDto(row: PriceImportRunRow): PriceUpdateRunDto {
  return {
    id: row.id,
    supplierId: row.supplierId,
    at: row.startedAt.toISOString(),
    productsTotal: row.productsTotal,
    changed: row.changed,
    priceUp: row.priceUp,
    priceDown: row.priceDown,
    added: row.added,
    missing: row.missing,
    stockChanged: row.stockChanged,
    source: row.source,
    fileName: row.fileName ?? row.file?.fileName ?? null,
    rates: { USD: numOrNull(row.rateUsd), EUR: numOrNull(row.rateEur) },
    user: userRefOf(row.user),
    status: row.status,
    error: row.errorText,
    warnings: warningsOf(row.warnings),
    skipped: row.skipped,
    relinked: row.relinked,
    restored: row.restored,
    detailsDiffer: row.detailsDiffer,
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}

export function toPriceUpdateDetail(row: PriceImportRunRow): PriceUpdateRunDetail {
  return { ...toPriceUpdateDto(row), report: reportOf(row.details) };
}

export interface DryRunInput {
  supplierId: string;
  source: 'auto' | 'file';
  startedAt: Date;
  fileName: string | null;
  user: Pick<User, 'id' | 'shortName'> | null;
  rates: RatesPair | null;
  warnings: readonly string[];
  counters: PlanCounters;
  report: PlanReport;
}

/** Попередній розрахунок: те саме, що дав би запуск, але без запису (id = 0). */
export function toDryRunDetail(input: DryRunInput): PriceUpdateRunDetail {
  const { counters } = input;
  return {
    id: 0,
    supplierId: input.supplierId,
    at: input.startedAt.toISOString(),
    productsTotal: counters.productsTotal,
    changed: counters.changed,
    priceUp: counters.priceUp,
    priceDown: counters.priceDown,
    added: counters.added,
    missing: counters.missing,
    stockChanged: counters.stockChanged,
    source: input.source,
    fileName: input.fileName,
    rates: { USD: input.rates?.USD ?? null, EUR: input.rates?.EUR ?? null },
    user: userRefOf(input.user),
    status: 'ok',
    error: null,
    warnings: [...input.warnings],
    skipped: counters.skipped,
    relinked: counters.relinked,
    restored: counters.restored,
    detailsDiffer: counters.detailsDiffer,
    finishedAt: null,
    report: input.report,
  };
}
