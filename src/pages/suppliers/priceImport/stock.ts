// Наявність з прайсу: у файлах постачальників це вільний текст — «100+», «30+», «є», «під замовлення», «2».
import type { AvailabilityStatus } from '@shared/enums';
import { parseLocaleNumber } from '@shared/parse';

export interface ParsedStock {
  /** Кількість, якщо її видно з тексту («100+» → 100); інакше null. */
  stockQty: number | null;
  availability: AvailabilityStatus;
}

/** До цієї кількості наявність вважаємо «мало». */
export const LOW_STOCK_MAX = 5;

const UNKNOWN: ParsedStock = { stockQty: null, availability: 'unknown' };

const EMPTY = /^[\s\-–—?.]*$/u;
/** «100+», «30 +», «> 100», «від 100», «100 шт» → число. */
const NUMBER_ONLY = /^(?:від|от|more|більше|больше)?\s*[<>≥≤~]?\s*(\d[\d\s .,]*)\s*\+?\s*(?:шт\.?|од\.?|pcs|ед\.?)?$/iu;
/** Число на початку тексту: «100+ на складі». */
const LEADING_NUMBER = /^\s*[<>≥≤~]?\s*(\d[\d\s .,]*)/u;

const WORDS: { re: RegExp; status: AvailabilityStatus }[] = [
  { re: /(під\s*замовлен|на\s*замовлен|под\s*заказ|подзаказ|очікує|ожидае|транзит|в\s*дороз|в\s*пути|on\s*order|preorder)/u, status: 'on_order' },
  { re: /(не\s*ма|відсутн|отсутств|^нет|закінчил|закончил|розпродан|распродан|out\s*of\s*stock|недоступ)/u, status: 'out_of_stock' },
  { re: /(мало|обмежен|ограничен|закінчу|заканчив|під\s*запит|low)/u, status: 'low_stock' },
  { re: /(наявн|налич|^є$|^есть|^\+$|багато|много|достатньо|склад|available|in\s*stock|^так$|^да$|^yes$)/u, status: 'in_stock' },
];

function statusForQty(qty: number): AvailabilityStatus {
  if (qty <= 0) return 'out_of_stock';
  return qty <= LOW_STOCK_MAX ? 'low_stock' : 'in_stock';
}

/**
 * Текст наявності → кількість і статус: «100+» → 100 / є, «2» → 2 / мало, «немає» → 0 позицій / немає,
 * порожньо → невідомо. Число розпізнається й разом зі словами («100+ на складі»).
 */
export function parseStockText(raw: unknown): ParsedStock {
  if (raw == null) return UNKNOWN;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? { stockQty: raw, availability: statusForQty(raw) } : UNKNOWN;
  }
  if (typeof raw !== 'string') return UNKNOWN;
  const text = raw.replace(/\s+/gu, ' ').trim();
  if (!text || EMPTY.test(text)) return UNKNOWN;

  const only = NUMBER_ONLY.exec(text);
  if (only) {
    const n = parseLocaleNumber(only[1]);
    if (n.valid && n.value != null) return { stockQty: n.value, availability: statusForQty(n.value) };
  }

  const key = text.toLocaleLowerCase('uk');
  const word = WORDS.find((w) => w.re.test(key));
  if (word) {
    const lead = LEADING_NUMBER.exec(key);
    const n = lead ? parseLocaleNumber(lead[1]) : null;
    const stockQty = n?.valid && n.value != null ? n.value : null;
    return { stockQty, availability: word.status };
  }
  return UNKNOWN;
}
