// Рядок ProductImage → DTO. Фронт працює з одним полем url: посилання з прайсу або наш метод віддачі файлу.
import type { ProductImage } from '@prisma/client';
import { directImageUrl } from '@shared/catalog/imageUrl';
import type { ProductImageDto } from '@shared/types';

/** Шлях, за яким браузер бере файл із нашого сховища. */
export const servedImageUrl = (id: string): string => `/api/images/${id}`;

/**
 * Посилання для показу: у фото з прайсу — його власне (посилання Google Диска — пряме на зображення, і в уже збережених),
 * у завантаженого — наш метод.
 */
export function imageUrlOf(row: Pick<ProductImage, 'id' | 'source' | 'url'>): string {
  return row.source === 'feed' ? directImageUrl(row.url ?? '') : servedImageUrl(row.id);
}

export function toProductImageDto(row: ProductImage): ProductImageDto {
  return {
    id: row.id,
    productId: row.productId,
    source: row.source,
    url: imageUrlOf(row),
    isMain: row.isMain,
    sortOrder: row.sortOrder,
    fileName: row.fileName,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
  };
}
