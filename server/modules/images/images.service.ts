// Фото товару: список, завантаження файлу, посилання з прайсу, головне фото й видалення.
// Product.imageUrl тримаємо синхронним із головним фото — списки й КП беруть звідти одне поле.
import type { Prisma, ProductImage, User } from '@prisma/client';
import type { ProductImageDto, UUID } from '@shared/types';
import { config } from '../../config';
import { prisma } from '../../db';
import { notFound } from '../../http/errors';
import { logger } from '../../logger';
import { productOrFail } from '../products/products.service';
import { imageUrlOf, servedImageUrl, toProductImageDto } from './images.mapper';
import { nextMainId } from './images.rules';
import type { ProductImagePatchBody, ProductImageUrlBody } from './images.schemas';
import {
  assertUploadedImage,
  imageFileSize,
  MAX_IMAGE_BYTES,
  removeImageFile,
  resolveStoredPath,
  safeFileName,
  saveImageFile,
  storedPathFor,
  type ImageMimeType,
} from './images.storage';

/** Головне фото першим, далі за порядком показу. */
const IMAGE_ORDER: Prisma.ProductImageOrderByWithRelationInput[] = [
  { isMain: 'desc' },
  { sortOrder: 'asc' },
  { createdAt: 'asc' },
];

/** Скільки чекаємо фото з сайту постачальника — КП не має через нього зависати. */
const FEED_IMAGE_TIMEOUT_MS = 10_000;

/**
 * Головні фото товарів для КП: посилання на файл у нашому сховищі.
 * Фото з прайсу зберігаємо локально при першій потребі — бланк не має залежати від сайту постачальника.
 */
export async function mainImagesFor(productIds: readonly UUID[]): Promise<Map<UUID, string>> {
  const ids = [...new Set(productIds)];
  const out = new Map<UUID, string>();
  if (!ids.length) return out;
  const rows = await prisma.productImage.findMany({ where: { productId: { in: ids }, isMain: true }, orderBy: IMAGE_ORDER });
  for (const row of rows) {
    const stored = row.storedPath ? row : await storeFeedImage(row);
    if (stored) out.set(row.productId, servedImageUrl(stored.id));
  }
  return out;
}

/** Фото з прайсу → файл у сховищі (один раз). Не вийшло — КП просто буде без фото. */
async function storeFeedImage(row: ProductImage): Promise<ProductImage | null> {
  if (!row.url) return null;
  try {
    const file = await downloadImage(row.url);
    const storedPath = storedPathFor(row.productId, file.type);
    await saveImageFile(config.uploadsDir, storedPath, file.data);
    return await prisma.productImage.update({
      where: { id: row.id },
      data: { storedPath, mimeType: file.type, sizeBytes: file.data.length },
    });
  } catch (e) {
    logger.warn({ err: e, imageId: row.id }, 'Не вдалося зберегти фото з прайсу');
    return null;
  }
}

async function downloadImage(url: string): Promise<{ data: Buffer; type: ImageMimeType }> {
  if (!/^https?:\/\//iu.test(url)) throw new Error('Фото беремо лише за http(s)');
  const response = await fetch(url, { signal: AbortSignal.timeout(FEED_IMAGE_TIMEOUT_MS), redirect: 'follow' });
  if (!response.ok) throw new Error(`Фото недоступне (HTTP ${response.status})`);
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) throw new Error('Фото завелике');
  const data = await readLimited(response, MAX_IMAGE_BYTES);
  return { data, type: assertUploadedImage(data) };
}

/** Читаємо потоком і обриваємо, щойно перевищено межу: заявлений розмір буває брехливим. */
async function readLimited(response: Response, maxBytes: number): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Порожня відповідь');
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('Фото завелике');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export async function listImages(productId: UUID): Promise<ProductImageDto[]> {
  await productOrFail(productId);
  const rows = await prisma.productImage.findMany({ where: { productId }, orderBy: IMAGE_ORDER });
  return rows.map(toProductImageDto);
}

export interface UploadedFile {
  buffer: Buffer;
  originalname?: string;
}

/** Завантажений файл: спершу пишемо на диск, потім рядок у базу; не вдалося — файл прибираємо. */
export async function addUploadedImage(productId: UUID, file: UploadedFile, actor: User): Promise<ProductImageDto> {
  await productOrFail(productId);
  const mimeType: ImageMimeType = assertUploadedImage(file.buffer);
  const storedPath = storedPathFor(productId, mimeType);
  await saveImageFile(config.uploadsDir, storedPath, file.buffer);
  try {
    return await prisma.$transaction(async (tx) => {
      const count = await tx.productImage.count({ where: { productId } });
      const row = await tx.productImage.create({
        data: {
          productId,
          source: 'upload',
          storedPath,
          fileName: safeFileName(file.originalname),
          mimeType,
          sizeBytes: file.buffer.length,
          // перше фото товару одразу стає головним
          isMain: count === 0,
          sortOrder: count,
          uploadedBy: actor.id,
        },
      });
      await syncMainImageUrl(tx, productId);
      return toProductImageDto(row);
    });
  } catch (e) {
    await removeImageFile(config.uploadsDir, storedPath);
    throw e;
  }
}

/** Фото з прайсу постачальника. Те саме посилання не дублюємо — імпорт викликає це на кожне оновлення. */
export async function addFeedImage(
  productId: UUID,
  input: ProductImageUrlBody,
): Promise<{ image: ProductImageDto; created: boolean }> {
  await productOrFail(productId);
  const existing = await prisma.productImage.findFirst({ where: { productId, source: 'feed', url: input.url } });
  if (existing) return { image: toProductImageDto(existing), created: false };

  const image = await prisma.$transaction(async (tx) => {
    const count = await tx.productImage.count({ where: { productId } });
    const isMain = input.isMain ?? count === 0;
    if (isMain) await tx.productImage.updateMany({ where: { productId }, data: { isMain: false } });
    const row = await tx.productImage.create({
      data: {
        productId,
        source: 'feed',
        url: input.url,
        fileName: input.fileName,
        isMain,
        sortOrder: input.sortOrder ?? count,
      },
    });
    await syncMainImageUrl(tx, productId);
    return toProductImageDto(row);
  });
  return { image, created: true };
}

export async function updateImage(
  productId: UUID,
  imageId: UUID,
  patch: ProductImagePatchBody,
): Promise<ProductImageDto> {
  await imageOrFail(productId, imageId);
  return prisma.$transaction(async (tx) => {
    // головне фото рівно одне: спершу знімаємо позначку з решти
    if (patch.isMain === true) {
      await tx.productImage.updateMany({ where: { productId, id: { not: imageId } }, data: { isMain: false } });
    }
    await tx.productImage.update({
      where: { id: imageId },
      data: {
        ...(patch.isMain !== undefined ? { isMain: patch.isMain } : {}),
        ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      },
    });
    if (patch.isMain === false) await promoteMain(tx, productId);
    await syncMainImageUrl(tx, productId);
    const row = await tx.productImage.findUniqueOrThrow({ where: { id: imageId } });
    return toProductImageDto(row);
  });
}

export async function removeImage(productId: UUID, imageId: UUID): Promise<void> {
  const row = await imageOrFail(productId, imageId);
  await prisma.$transaction(async (tx) => {
    await tx.productImage.delete({ where: { id: imageId } });
    // видалили головне — головним стає наступне за порядком
    if (row.isMain) await promoteMain(tx, productId);
    await syncMainImageUrl(tx, productId);
  });
  if (row.source === 'upload' && row.storedPath) await removeImageFile(config.uploadsDir, row.storedPath);
}

export interface ImageFile {
  absolutePath: string;
  mimeType: string;
  sizeBytes: number;
  etag: string;
}

/** Файл для віддачі: шлях беремо лише з бази й перевіряємо, що він усередині сховища. */
export async function getImageFile(imageId: UUID): Promise<ImageFile> {
  const row = await prisma.productImage.findUnique({ where: { id: imageId } });
  // фото з прайсу теж віддаємо з файлу, щойно воно збережене (див. mainImagesFor)
  if (!row?.storedPath) throw notFound('Фото не знайдено');
  const absolutePath = resolveStoredPath(config.uploadsDir, row.storedPath);
  const sizeBytes = row.sizeBytes ?? (await imageFileSize(absolutePath));
  if (sizeBytes === null) throw notFound('Фото не знайдено');
  return {
    absolutePath,
    mimeType: row.mimeType ?? 'application/octet-stream',
    sizeBytes,
    // файл незмінний (ім'я з uuid), тож ідентифікатора й розміру досить
    etag: `"${row.id}-${sizeBytes}"`,
  };
}

// ── дрібниці ────────────────────────────────────────────────────────

async function imageOrFail(productId: UUID, imageId: UUID): Promise<ProductImage> {
  const row = await prisma.productImage.findFirst({ where: { id: imageId, productId } });
  if (!row) throw notFound('Фото не знайдено');
  return row;
}

/** Робить головним перше фото за порядком, якщо позначки не лишилось. */
async function promoteMain(tx: Prisma.TransactionClient, productId: UUID): Promise<void> {
  const rest = await tx.productImage.findMany({ where: { productId }, orderBy: IMAGE_ORDER });
  const id = nextMainId(rest);
  if (id) await tx.productImage.update({ where: { id }, data: { isMain: true } });
}

/** Копія посилання на головне фото в картці товару. */
async function syncMainImageUrl(tx: Prisma.TransactionClient, productId: UUID): Promise<void> {
  const main = await tx.productImage.findFirst({ where: { productId, isMain: true }, orderBy: IMAGE_ORDER });
  await tx.product.update({ where: { id: productId }, data: { imageUrl: main ? imageUrlOf(main) : null } });
}
