// Правила довідника одиниць виміру, які не залежать від бази.
// Синоніми звіряються з прайсами й листами клієнтів (normalizeUnit із shared/parse),
// тому зберігаємо їх у нижньому регістрі, без повторів і без самого коду одиниці.

/** Синонім до запису: нижній регістр, обрізані й стиснуті пробіли. */
export function normalizeAlias(raw: string): string {
  return raw.trim().toLocaleLowerCase('uk').replace(/\s+/gu, ' ');
}

/**
 * Ключ порівняння з іншими одиницями — як у normalizeUnit (shared/parse):
 * без пробілів і без крапки в кінці, тож 'кв. м', 'кв.м' і 'КВ.М' — це одне й те саме.
 */
export function aliasKey(raw: string): string {
  return raw
    .toLocaleLowerCase('uk')
    .replace(/\s+/gu, '')
    .replace(/\.+$/u, '');
}

/** Синоніми до запису: нижній регістр, без порожніх, без повторів і без самого коду одиниці. */
export function normalizeAliases(code: string, aliases: readonly string[]): string[] {
  const codeAlias = normalizeAlias(code);
  const seen = new Set<string>([codeAlias]);
  const out: string[] = [];
  for (const raw of aliases) {
    const alias = normalizeAlias(raw);
    if (alias === '' || seen.has(alias)) continue;
    seen.add(alias);
    out.push(alias);
  }
  return out;
}
