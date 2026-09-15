/**
 * Нормалізований текст для пошуку (і для товару, і для запиту):
 * lower (uk) → ё→е → без апострофів → '500 х 500' / '500*500' → '500x500' → '0,5' → '0.5'
 * → лапки й інша пунктуація (крім . / x -) → пробіл → стиснуті пробіли.
 */
export function buildSearchText(...parts: (string | null | undefined)[]): string {
  return parts
    .filter((p): p is string => typeof p === 'string' && p.trim() !== '')
    .join(' ')
    .toLocaleLowerCase('uk')
    .replace(/ё/gu, 'е')
    .replace(/[ʼ’'`]/gu, '')
    .replace(/(\d)\s*[хx×*]\s*(?=\d)/gu, '$1x')
    .replace(/(\d),(?=\d)/gu, '$1.')
    .replace(/["″“”«»„]/gu, ' ')
    .replace(/[^\p{L}\p{N}\s./x-]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Токени запиту (усі мають входити в searchText товару). */
export function searchTokens(query: string): string[] {
  const text = buildSearchText(query);
  return text === '' ? [] : text.split(' ');
}

/** Чи містить нормалізований текст усі токени. */
export function matchesAllTokens(searchText: string, tokens: readonly string[]): boolean {
  return tokens.every((t) => searchText.includes(t));
}
