// Посилання, які вводять у картках (сайт, B2B, сторінка товару, шаблон пошуку, логотип).
// Відкриваємо в браузері лише http(s): «javascript:…» у полі — це виконання чужого коду в сесії колеги.

const SCHEME = /^[a-z][a-z\d+.-]*:/iu;
const IMAGE_DATA_URL = /^data:image\/(?:png|jpe?g|webp|gif|svg\+xml);base64,/iu;

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Адреса сайту для зберігання й відкриття: «sandi.ua» → «https://sandi.ua»; http(s) — як є;
 * будь-яка інша схема або не схоже на адресу — null.
 */
export function webUrl(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (SCHEME.test(v)) return isHttpUrl(v) ? v : null;
  if (/\s/u.test(v) || !v.includes('.')) return null;
  const withScheme = `https://${v}`;
  return isHttpUrl(withScheme) ? withScheme : null;
}

/** Шаблон пошуку на сайті постачальника: після підстановки {query} і {sku} — посилання http(s). */
export function isSearchUrlTemplate(template: string): boolean {
  return isHttpUrl(template.replaceAll('{query}', 'x').replaceAll('{sku}', 'x'));
}

/** Джерело картинки (логотип, фото): data-URL зображення, посилання http(s) або шлях застосунку «/…». */
export function isImageSrc(value: string): boolean {
  return IMAGE_DATA_URL.test(value) || isHttpUrl(value) || (value.startsWith('/') && !value.startsWith('//'));
}
