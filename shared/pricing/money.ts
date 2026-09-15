import type { PriceRounding } from '../enums';

/**
 * Half-up (від нуля) через десятковий зсув експонентою — без артефактів double
 * (1.005 → 1.01, 2.675 → 2.68). Спершу гасимо шум множення (15 значущих цифр).
 */
export function roundHalfUp(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  const abs = Number(Math.abs(value).toPrecision(15));
  const shifted = Math.round(Number(`${abs}e${decimals}`));
  const result = Number.isNaN(shifted)
    ? Math.round(abs * 10 ** decimals) / 10 ** decimals
    : Number(`${shifted}e-${decimals}`);
  return sign * result || 0; // без -0
}

export const round0 = (v: number): number => roundHalfUp(v, 0);
export const round2 = (v: number): number => roundHalfUp(v, 2);
export const round3 = (v: number): number => roundHalfUp(v, 3);
export const round4 = (v: number): number => roundHalfUp(v, 4);
export const round6 = (v: number): number => roundHalfUp(v, 6);

/** Базова сторона ціни продажу: до копійок або до цілих. */
export function roundSale(value: number, rounding: PriceRounding): number {
  return rounding === 'integer' ? round0(value) : round2(value);
}

/** round2(Σ) без null/undefined. */
export function sumMoney(values: Iterable<number | null | undefined>): number {
  let total = 0;
  for (const v of values) if (v != null && Number.isFinite(v)) total += v;
  return round2(total);
}

/** round4(part / base × 100); base = 0 → null. */
export function pct(part: number, base: number): number | null {
  if (!base) return null;
  return round4((part / base) * 100);
}
