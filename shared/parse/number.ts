export interface ParsedNumber {
  value: number | null;
  valid: boolean;
}

export interface ParseNumberOptions {
  decimal?: 'auto' | ',' | '.';
}

const EMPTY_MARKERS = new Set(['', '-', '—', '–']);
const CURRENCY_MARKERS = /(грн\.?|uah|usd|eur|[$€₴])/giu;
const SPACES_AND_GROUPING = /[\s   '’]/gu;

/**
 * Число з тексту в українському/англійському форматі.
 * Є і ',' і '.' → десятковий той, що останній; один вид роздільника: > 1 разу → тисячний, 1 раз → десятковий.
 */
export function parseLocaleNumber(input: unknown, opts: ParseNumberOptions = {}): ParsedNumber {
  if (input == null) return { value: null, valid: true };
  if (typeof input === 'number') {
    return Number.isFinite(input) ? { value: input, valid: true } : { value: null, valid: false };
  }
  if (typeof input !== 'string') return { value: null, valid: false };

  let s = input.trim().replace(CURRENCY_MARKERS, '').replace(SPACES_AND_GROUPING, '').replace(/[−–]/gu, '-');
  if (EMPTY_MARKERS.has(s)) return { value: null, valid: true };

  let negative = false;
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }

  const decimal = opts.decimal ?? 'auto';
  let dec: ',' | '.' | null;
  if (decimal !== 'auto') {
    dec = decimal;
  } else {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) dec = lastComma > lastDot ? ',' : '.';
    else if (lastComma >= 0) dec = count(s, ',') > 1 ? null : ',';
    else if (lastDot >= 0) dec = count(s, '.') > 1 ? null : '.';
    else dec = null;
  }

  // тисячні роздільники прибираємо, десятковий → '.'
  const thousands = dec === ',' ? '.' : dec === '.' ? ',' : null;
  if (thousands) s = s.split(thousands).join('');
  if (dec === null) s = s.replace(/[.,]/g, '');
  else if (dec === ',') s = s.replace(',', '.');

  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(s)) return { value: null, valid: false };
  const value = Number(s);
  if (!Number.isFinite(value)) return { value: null, valid: false };
  return { value: negative ? -value || 0 : value, valid: true };
}

function count(s: string, ch: string): number {
  let n = 0;
  for (const c of s) if (c === ch) n++;
  return n;
}
