// Один внутрішній рядок прайсу для всіх джерел: вигрузки постачальників і файли від менеджера
// зводяться до нього, далі каталог оновлює одна й та сама процедура (priceUpdates.apply).
// Поля — як у PriceImportRow (shared/types), плюс те, що є лише у вигрузках: штрихкод, категорія, фото.
import type { AvailabilityStatus, CurrencyCode } from '@shared/enums';
import { parseLocaleNumber } from '@shared/parse';

/** Скільки фото з прайсу чіпляємо до нової позиції. */
export const MAX_FEED_IMAGES = 5;

export interface PriceRow {
  /** Код постачальника — за ним звіряємо каталог. */
  code: string;
  sku: string | null;
  name: string | null;
  brand: string | null;
  /** Одиниця як у прайсі; код довідника підбирає завантаження (apply). */
  unitCode: string | null;
  /** Вхідна ціна у валюті прайсу; null — у вигрузці її немає. */
  purchasePrice: number | null;
  currency: CurrencyCode | null;
  rrp: number | null;
  stockQty: number | null;
  availability: AvailabilityStatus | null;
  multiplicity: number | null;
  minOrderQty: number | null;
  barcode: string | null;
  categoryPath: string | null;
  imageUrls: string[];
}

export interface AdapterResult {
  rows: PriceRow[];
  /** Курси з прайсу (YML): гривень за одиницю валюти. */
  rates?: { USD: number | null; EUR: number | null };
  /** Те, про що варто сказати користувачу: немає цін, пропущені рядки тощо. */
  warnings: string[];
}

export interface AdapterOptions {
  /** У вигрузці ціна — закупівельна (інакше читаємо її як РРЦ). */
  hasPurchasePrice: boolean;
  /** Валюта, коли у вигрузці її немає. */
  defaultCurrency: CurrencyCode;
}

export const DEFAULT_ADAPTER_OPTIONS: AdapterOptions = { hasPurchasePrice: true, defaultCurrency: 'UAH' };

/** Порожній рядок із заповненим кодом — адаптери лише дописують знайдені поля. */
export function emptyRow(code: string): PriceRow {
  return {
    code,
    sku: null,
    name: null,
    brand: null,
    unitCode: null,
    purchasePrice: null,
    currency: null,
    rrp: null,
    stockQty: null,
    availability: null,
    multiplicity: null,
    minOrderQty: null,
    barcode: null,
    categoryPath: null,
    imageUrls: [],
  };
}

/** Значення вигрузки → текст без пробілів по краях і без подвійних пробілів; порожнє — null. */
export function textOf(value: unknown): string | null {
  if (value == null || typeof value === 'object') return null;
  // нерозривні й подвійні пробіли в назвах (у САНДІ — майже в третині) зводимо до звичайного
  const text = String(value).replace(/\s+/gu, ' ').trim();
  return text === '' ? null : text;
}

/** Число з вигрузки ('52.76', '0,038', 92) → додатне число; інше — null. */
export function positiveOrNull(value: unknown): number | null {
  const parsed = parseLocaleNumber(textOf(value));
  return parsed.valid && parsed.value != null && parsed.value > 0 ? parsed.value : null;
}

/** Те саме, але нуль лишається нулем (залишки). */
export function numberOrNull(value: unknown): number | null {
  const parsed = parseLocaleNumber(textOf(value));
  return parsed.valid && parsed.value != null ? parsed.value : null;
}

/** До цієї кількості наявність вважаємо «мало» (та сама межа, що й у розборі файлів). */
export const LOW_STOCK_MAX = 5;

export function availabilityForQty(qty: number | null): AvailabilityStatus {
  if (qty == null) return 'unknown';
  if (qty <= 0) return 'out_of_stock';
  return qty <= LOW_STOCK_MAX ? 'low_stock' : 'in_stock';
}

/**
 * Посилання на фото: лише http(s), без повторів, не більше MAX_FEED_IMAGES.
 * У вигрузках трапляються пробіли й кирилиця в шляху ('…/5168 /5168 _2.jpg') — кодуємо їх через URL.
 */
export function imageList(urls: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const raw of urls) {
    const url = normalizedUrl(raw);
    if (!url || out.includes(url)) continue;
    out.push(url);
    if (out.length >= MAX_FEED_IMAGES) break;
  }
  return out;
}

/** Посилання як є (без зведення пробілів, як у textOf), лише перевірене й закодоване. */
function normalizedUrl(raw: unknown): string | null {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!/^https?:\/\//iu.test(text)) return null;
  try {
    return new URL(text).href;
  } catch {
    return null;
  }
}

/** Вузол XML буває один або списком — працюємо завжди зі списком. */
export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export type Dict = Record<string, unknown>;

/** Об'єкт (не масив і не null) — вузол JSON чи розібраного XML. */
export function isRecord(value: unknown): value is Dict {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Одне значення з вигрузки, де воно буває текстом або вузлом із #text (тег з атрибутами). */
export function nodeText(value: unknown): string | null {
  return isRecord(value) ? textOf(value['#text']) : textOf(value);
}

/** Опції адаптера з частково заданих — решта за замовчуванням. */
export function adapterOptions(options: Partial<AdapterOptions> = {}): AdapterOptions {
  // явне undefined у переданих опціях теж означає «за замовчуванням»
  return {
    hasPurchasePrice: options.hasPurchasePrice ?? DEFAULT_ADAPTER_OPTIONS.hasPurchasePrice,
    defaultCurrency: options.defaultCurrency ?? DEFAULT_ADAPTER_OPTIONS.defaultCurrency,
  };
}
