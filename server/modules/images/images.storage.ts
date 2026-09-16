// Файли фото на диску. Тип перевіряємо за вмістом (назву файлу легко підмінити),
// а шлях завжди беремо з бази й звіряємо, що він не виводить за теку сховища.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ApiError, validationError } from '../../http/errors';

export const MAX_IMAGE_MB = 10;
export const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ImageMimeType = (typeof ALLOWED_IMAGE_TYPES)[number];

const EXTENSION: Record<ImageMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Тип файлу за першими байтами: jpeg, png, webp — або null, якщо це щось інше. */
export function sniffImageType(buffer: Buffer): ImageMimeType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= PNG_MAGIC.length && buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) return 'image/png';
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/** Перевіряє розмір і вміст завантаженого файлу; повертає справжній тип. */
export function assertUploadedImage(buffer: Buffer): ImageMimeType {
  if (buffer.length === 0) throw validationError('Файл порожній');
  if (buffer.length > MAX_IMAGE_BYTES) throw validationError(`Файл завеликий — до ${MAX_IMAGE_MB} МБ`);
  const type = sniffImageType(buffer);
  if (!type) throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 'Підтримуємо лише JPEG, PNG і WebP');
  return type;
}

/** Ім'я файлу з форми — лише для показу, тому лишаємо саму назву без шляху. */
export function safeFileName(name: string | undefined): string | null {
  const base = path.basename((name ?? '').replace(/\\/gu, '/')).trim();
  return base && base !== '.' && base !== '..' ? base.slice(0, 200) : null;
}

/** Куди кладемо новий файл: products/<товар>/<uuid>.<розширення>. */
export function storedPathFor(productId: string, type: ImageMimeType): string {
  return path.posix.join('products', productId, `${randomUUID()}.${EXTENSION[type]}`);
}

/** Шлях зі сховища → абсолютний. Усе, що виводить за теку (../, абсолютний шлях), — помилка. */
export function resolveStoredPath(uploadsDir: string, storedPath: string): string {
  const root = path.resolve(uploadsDir);
  if (!storedPath || storedPath.includes('\0') || path.isAbsolute(storedPath)) {
    throw new ApiError('INTERNAL', 'Некоректний шлях до файлу');
  }
  const absolute = path.resolve(root, storedPath);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new ApiError('INTERNAL', 'Некоректний шлях до файлу');
  }
  return absolute;
}

export async function saveImageFile(uploadsDir: string, storedPath: string, data: Buffer): Promise<void> {
  const absolute = resolveStoredPath(uploadsDir, storedPath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, data);
}

/** Прибирає файл; якщо його вже немає — мовчки, рядок у базі все одно видалено. */
export async function removeImageFile(uploadsDir: string, storedPath: string): Promise<void> {
  try {
    await fs.unlink(resolveStoredPath(uploadsDir, storedPath));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
}

export async function imageFileSize(absolutePath: string): Promise<number | null> {
  try {
    const stat = await fs.stat(absolutePath);
    return stat.isFile() ? stat.size : null;
  } catch {
    return null;
  }
}
