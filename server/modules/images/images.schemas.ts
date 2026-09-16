// Перевірка даних фото. Сам файл перевіряє images.storage — за вмістом, а не за назвою.
import { z } from 'zod';

const HTTP_URL = /^https?:\/\//iu;

export const imageIdSchema = z.object({ imageId: z.uuid('Невірний ідентифікатор фото') });

export const productImageParamsSchema = z.object({
  id: z.uuid('Невірний ідентифікатор товару'),
  imageId: z.uuid('Невірний ідентифікатор фото'),
});

const sortOrder = z
  .number({ message: 'Порядок: вкажіть число' })
  .int('Порядок: вкажіть ціле число')
  .min(0, 'Порядок: не менше 0')
  .max(9999, 'Порядок: не більше 9999');

export const productImagePatchSchema = z
  .object({
    isMain: z.boolean(),
    sortOrder,
  })
  .partial()
  .refine((v) => v.isMain !== undefined || v.sortOrder !== undefined, 'Змінювати нічого');

export const productImageUrlSchema = z.object({
  url: z
    .string({ message: 'Вкажіть посилання на фото' })
    .trim()
    .min(1, 'Вкажіть посилання на фото')
    .max(1000, 'Задовге посилання')
    .refine((v) => HTTP_URL.test(v), 'Посилання має починатися з http:// або https://'),
  fileName: z
    .string()
    .trim()
    .max(200, 'Задовга назва файлу')
    .nullish()
    .transform((v) => v || null),
  isMain: z.boolean().optional(),
  sortOrder: sortOrder.optional(),
});

export type ProductImagePatchBody = z.infer<typeof productImagePatchSchema>;
export type ProductImageUrlBody = z.infer<typeof productImageUrlSchema>;
