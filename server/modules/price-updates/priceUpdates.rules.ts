// Правила оновлення прайсів, які не залежать від бази: ролі джерела, розклад, архівація зниклих, шлях файлу прайсу.
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { PriceFeedKind } from '@prisma/client';
import type { ISODate } from '@shared/types';
import { msUntilDaily } from '../../jobs/schedule';
import { FULL_ROLES, type SourceRoles } from './plan';

/** Товар, якого немає у прайсі довше, ніж стільки днів, іде в архів. */
export const ARCHIVE_AFTER_DAYS = 30;
/** Година щоденного оновлення за київським часом, якщо в постачальнику її не вказано. */
export const DEFAULT_FEED_HOUR = 6;

const DAY_MS = 86_400_000;

/**
 * Що веде джерело прайсу:
 * - посилання auto і файл без змішаного режиму — усе;
 * - hybrid: посилання — асортимент, наявність, описи, фото й РРЦ; файл — вхідні ціни (і наявність, якщо вона є у файлі),
 *   а РРЦ із файлу лише заповнює порожню — так два джерела не перезаписують одне одного щодня.
 */
export function rolesFor(kind: PriceFeedKind | null | undefined, source: 'link' | 'file'): SourceRoles {
  if (kind !== 'hybrid') return FULL_ROLES;
  return source === 'link'
    ? { purchasePrice: false, rrp: 'set', stock: true, assortment: true }
    : { purchasePrice: true, rrp: 'fill', stock: true, assortment: false };
}

export function feedHourOf(scheduleHour: number | null | undefined): number {
  return scheduleHour != null && Number.isInteger(scheduleHour) && scheduleHour >= 0 && scheduleHour <= 23
    ? scheduleHour
    : DEFAULT_FEED_HOUR;
}

/** Найближчий минулий запуск о hour:minute за київським часом (для догону після перезапуску сервера). */
export function lastScheduledAt(now: Date, hour: number, minute = 0): Date {
  return new Date(now.getTime() + msUntilDaily(now, hour, minute) - DAY_MS);
}

/**
 * Межа архівації: товар із missingSince раніше цієї дати відсутній у прайсі понад ARCHIVE_AFTER_DAYS днів.
 * 16.09 → 17.08: позначений 16.08 (31 день) — в архів, 17.08 (30 днів) — ще ні.
 */
export function archiveCutoff(today: ISODate, days = ARCHIVE_AFTER_DAYS): ISODate {
  return new Date(Date.parse(`${today}T00:00:00.000Z`) - days * DAY_MS).toISOString().slice(0, 10);
}

/** Куди кладемо завантажений файл прайсу: price-lists/<постачальник>/<uuid>.<розширення>. */
export function priceFileStoredPath(supplierId: string, fileName: string | null | undefined): string {
  const ext = path.extname(fileName ?? '').toLowerCase();
  const safeExt = /^\.[a-z0-9]{1,5}$/u.test(ext) ? ext : '.bin';
  return path.posix.join('price-lists', supplierId, `${randomUUID()}${safeExt}`);
}
