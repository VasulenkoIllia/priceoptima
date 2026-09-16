// Правила каталогу, які не залежать від бази: текст пошуку, межа застарілості,
// ознака зміни ціни й заборона правити ціну імпортованого товару.
import { buildSearchText } from '@shared/parse';
import type { AvailabilityStatus, CurrencyCode } from '@shared/enums';
import { forbidden } from '../../http/errors';

const DAY_MS = 86_400_000;

/** Нормалізований текст, за яким шукає каталог (колонка Product.searchText). */
export function searchTextOf(p: {
  sku: string;
  nameWork: string;
  name1c?: string | null;
  brand?: string | null;
}): string {
  return buildSearchText(p.sku, p.nameWork, p.name1c, p.brand);
}

/**
 * Ціна застаріла, якщо їй більше ніж staleDays повних діб (isPriceStale + priceAgeDays).
 * Та сама умова через межу часу — щоб фільтр «лише застарілі» виконувала база, а не пам'ять сервера.
 */
export function staleBefore(now: Date, staleDays: number): Date {
  return new Date(now.getTime() - (staleDays + 1) * DAY_MS);
}

/** Наявність за залишком, коли постачальник не передав статус. */
export function availabilityOf(stockQty: number | null): AvailabilityStatus {
  return stockQty == null ? 'unknown' : stockQty > 0 ? 'in_stock' : 'out_of_stock';
}

export interface PriceState {
  currency: CurrencyCode;
  purchasePrice: number | null;
  rrp: number | null;
  stockQty: number | null;
  availability: AvailabilityStatus;
}

/** Чи змінилось хоч щось — якщо ні, запис в історію цін не створюємо. */
export function priceChanged(before: PriceState, after: PriceState): boolean {
  return (
    before.currency !== after.currency ||
    before.purchasePrice !== after.purchasePrice ||
    before.rrp !== after.rrp ||
    before.stockQty !== after.stockQty ||
    before.availability !== after.availability
  );
}

/** Ціну з прайсу вручну не правлять: інакше наступне оновлення прайсу її мовчки перезапише. */
export function assertManualPrice(priceOrigin: 'import' | 'manual'): void {
  if (priceOrigin === 'manual') return;
  throw forbidden('Ціну цього товару оновлює прайс постачальника. Скоригувати ціну для клієнта можна в заявці');
}

/** Екранування % і _ для LIKE (артикул може містити «%»). */
export function likePattern(value: string): string {
  return value.replace(/[\\%_]/gu, (ch) => `\\${ch}`);
}
