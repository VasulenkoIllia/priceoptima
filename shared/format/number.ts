import { roundHalfUp } from '../pricing/money';

const LOCALE = 'uk-UA';
const DASH = '—';
const NBSP = ' ';

const cache = new Map<string, Intl.NumberFormat>();
function nf(min: number, max: number): Intl.NumberFormat {
  const key = `${min}:${max}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: true });
    cache.set(key, f);
  }
  return f;
}

/** Єдиний вигляд: групи через U+00A0, звичайний мінус. */
function fmt(v: number, min: number, max: number): string {
  const rounded = roundHalfUp(v, max);
  return nf(min, max)
    .format(rounded === 0 ? 0 : rounded)
    .replace(/[   ]/gu, NBSP)
    .replace(/−/gu, '-');
}

const isNum = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/** '1 234,56' (U+00A0); null → '—'. */
export function formatMoney(v: number | null | undefined, decimals = 2): string {
  return isNum(v) ? fmt(v, decimals, decimals) : DASH;
}

/** До 3 знаків, без зайвих нулів: 120 → '120', 1,5 → '1,5'. */
export function formatQty(v: number | null | undefined): string {
  return isNum(v) ? fmt(v, 0, 3) : DASH;
}

/** '16,67 %' (перед % — U+00A0). */
export function formatPct(v: number | null | undefined, decimals = 2): string {
  return isNum(v) ? `${fmt(v, decimals, decimals)}${NBSP}%` : DASH;
}

/** Курс: від 2 до 4 знаків — '44,5526', '45,00'. */
export function formatRate(v: number | null | undefined): string {
  return isNum(v) ? fmt(v, 2, 4) : DASH;
}

/** Сума з позначкою валюти: '1 234,56 грн'. */
export function formatMoneyUah(v: number | null | undefined, decimals = 2): string {
  return isNum(v) ? `${formatMoney(v, decimals)}${NBSP}грн` : DASH;
}
