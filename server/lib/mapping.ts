// Дрібні перетворення «рядок бази → поле DTO»: гроші й відсотки у фронті — звичайні числа,
// дати — рядки ISO. Тримаємо в одному місці, щоб мапери модулів лишалися короткими.
import type { Prisma } from '@prisma/client';
import type { ISODate, ISODateTime } from '@shared/types';

type Decimal = Prisma.Decimal;

/** Decimal → number. */
export function num(value: Decimal): number {
  return value.toNumber();
}

/** Decimal або нічого → number або null. */
export function numOrNull(value: Decimal | null | undefined): number | null {
  return value == null ? null : value.toNumber();
}

/** Колонка @db.Date → '2026-09-11' (у базі це північ UTC, тож беремо календарну частину як є). */
export function isoDate(value: Date | null | undefined): ISODate | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function isoDateTime(value: Date | null | undefined): ISODateTime | null {
  return value ? value.toISOString() : null;
}

/** '2026-09-11' → північ UTC для колонки @db.Date. */
export function dateOnly(value: ISODate): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Значення зі списку або запасний варіант — на випадок, якщо в базі лишилось старе перелічення. */
export function oneOf<T extends string>(allowed: readonly T[], value: string, fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}
