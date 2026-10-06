// Посилання на фото товару. Посилання Google Диска на файл («…/file/d/ID/view») веде на сторінку перегляду, а не на
// картинку, тож фото не показувалось (правки замовника 07.10). Перетворюємо його на пряме посилання на зображення.

/** Пряме посилання на файл Google Диска як на зображення (відкритий доступ за посиланням). */
export const DRIVE_IMAGE_BASE = 'https://lh3.googleusercontent.com/d/';
/** Розмір, до якого Google зменшує фото (оригінал з телефона буває понад 10 МБ — межа завантаження фото для КП). */
export const DRIVE_IMAGE_SIZE = '=w1600';

const DRIVE_HOST = /^https?:\/\/(drive|docs|drive\.usercontent)\.google\.com\//iu;
/**
 * ID файлу: «/file/d/ID…» (і «/file/u/0/d/ID…» з адресного рядка) або «id=ID» лише в open, uc, thumbnail, download.
 * Папки, документи й таблиці не чіпаємо.
 */
const DRIVE_FILE_ID = /\/file\/(?:u\/\d+\/)?d\/([\w-]{10,})|\/(?:open|uc|thumbnail|download)\?(?:[^#]*&)?id=([\w-]{10,})/u;

/** Посилання Google Диска на файл → пряме посилання на зображення (до 1600 px); решта — як є. */
export function directImageUrl(url: string): string {
  if (!DRIVE_HOST.test(url)) return url;
  const match = DRIVE_FILE_ID.exec(url);
  const id = match?.[1] ?? match?.[2];
  return id ? `${DRIVE_IMAGE_BASE}${id}${DRIVE_IMAGE_SIZE}` : url;
}

/** Те саме для значення, якого може не бути (Product.imageUrl). */
export function directImageUrlOrNull(url: string | null | undefined): string | null {
  return url ? directImageUrl(url) : null;
}
