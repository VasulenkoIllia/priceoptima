import type { ISODateTime } from '../types';

const DAY_MS = 86_400_000;

/** F21: вік ціни в повних добах. */
export function priceAgeDays(priceDate: ISODateTime | null, now: Date): number | null {
  if (!priceDate) return null;
  const t = Date.parse(priceDate);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / DAY_MS));
}

export function isPriceStale(ageDays: number | null, staleDays: number): boolean {
  return ageDays != null && ageDays > staleDays;
}
