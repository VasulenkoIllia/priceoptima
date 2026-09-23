// Спільне для адаптерів: розбір XML і кінець обробки — пропуск позицій без коду, повтори коду,
// підсумкові попередження про ціни.
import { XMLValidator, type XMLParser } from 'fast-xml-parser';
import type { PriceRow } from './types';

/**
 * Текст XML → об'єкт. Спершу перевіряємо розмітку: сам розбір терпить обірваний файл і мовчки
 * віддає лише його початок (недокачана вигрузка виглядала б як «зникли позиції»).
 * Перевірка займає ~150 мс на 23 МБ.
 */
export function parseXml(parser: XMLParser, body: string, feedName: string): unknown {
  const valid = XMLValidator.validate(body);
  if (valid !== true) {
    throw new Error(`Вигрузка ${feedName} не є коректним XML (рядок ${valid.err.line}): файл обірваний або пошкоджений`);
  }
  try {
    return parser.parse(body) as unknown;
  } catch (e) {
    throw new Error(`Вигрузка ${feedName} не є коректним XML`, { cause: e });
  }
}

/** Скільки повторених кодів називаємо в попередженні. */
const DUPLICATE_EXAMPLES = 5;

export const NO_PURCHASE_PRICES_WARNING = 'У прайсі немає закупівельних цін, оновлюємо лише РРЦ і наявність';

/**
 * Кандидати (null — позиція без коду) → рядки з унікальним кодом і попередження.
 * Повтор коду відкидаємо: лишається перший рядок, як він ішов у вигрузці.
 */
export function finishRows(candidates: Iterable<PriceRow | null>): { rows: PriceRow[]; warnings: string[] } {
  const rows: PriceRow[] = [];
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  let duplicateCount = 0;
  let withoutCode = 0;

  for (const row of candidates) {
    if (!row) {
      withoutCode++;
      continue;
    }
    if (seen.has(row.code)) {
      duplicateCount++;
      duplicates.add(row.code);
      continue;
    }
    seen.add(row.code);
    rows.push(row);
  }

  const warnings: string[] = [];
  if (withoutCode) warnings.push(`Пропущено позицій без коду: ${withoutCode}`);
  if (duplicateCount) {
    const examples = [...duplicates].slice(0, DUPLICATE_EXAMPLES).join(', ');
    const more = duplicates.size > DUPLICATE_EXAMPLES ? ', …' : '';
    warnings.push(`Повтори коду: ${duplicateCount}, узято перший рядок (${examples}${more})`);
  }
  warnings.push(...priceWarnings(rows));
  return { rows, warnings };
}

function priceWarnings(rows: readonly PriceRow[]): string[] {
  if (rows.length === 0) return ['У прайсі не знайдено жодної позиції'];
  const warnings: string[] = [];
  const withoutPurchase = rows.filter((r) => r.purchasePrice == null).length;
  const withoutAnyPrice = rows.filter((r) => r.purchasePrice == null && r.rrp == null).length;
  if (withoutPurchase === rows.length) warnings.push(NO_PURCHASE_PRICES_WARNING);
  else if (withoutPurchase) warnings.push(`Позицій без закупівельної ціни: ${withoutPurchase}`);
  if (withoutAnyPrice) warnings.push(`Позицій без жодної ціни: ${withoutAnyPrice}`);
  return warnings;
}
