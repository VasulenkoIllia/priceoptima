// Межі файлів прайсів: однакові для браузера (розбір файлу) і сервера (перевірка запиту).

/** Скільки рядків прайсу приймаємо за раз (найбільший відомий прайс — близько 20 тис.). */
export const MAX_IMPORT_ROWS = 200_000;

/**
 * Колонки номенклатури, за якими сортуємо весь каталог (під них є індекси). Решту — лише з вибраним постачальником
 * або пошуком: сортування мільйона позицій за довільною колонкою тривало секунди.
 */
export const CATALOG_SORT_ANYTIME = ['sku', 'nameWork', 'purchasePrice'] as const;

export function catalogSortAllowed(field: string | undefined, narrowed: boolean): boolean {
  return !field || narrowed || (CATALOG_SORT_ANYTIME as readonly string[]).includes(field);
}
