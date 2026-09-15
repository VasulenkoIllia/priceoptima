// Кириличні двійники → латиниця (ключ пошуку артикула однаковий для 'ЦР…' і 'ЦP…').
const CYRILLIC_TWINS: Record<string, string> = {
  А: 'A',
  В: 'B',
  Е: 'E',
  К: 'K',
  М: 'M',
  Н: 'H',
  О: 'O',
  Р: 'P',
  С: 'C',
  Т: 'T',
  Х: 'X',
  І: 'I',
  У: 'Y',
};

const SEPARATORS = /[\s\-_./\\]/gu;
const TWINS_RE = new RegExp(`[${Object.keys(CYRILLIC_TWINS).join('')}]`, 'gu');

/** Ключ артикула: trim → upper → без роздільників → кириличні двійники латиницею. */
export function normalizeSku(sku: string): string {
  return sku
    .trim()
    .toUpperCase()
    .replace(SEPARATORS, '')
    .replace(TWINS_RE, (ch) => CYRILLIC_TWINS[ch] ?? ch);
}
