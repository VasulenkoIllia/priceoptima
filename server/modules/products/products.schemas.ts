// Перевірка даних каталогу. Параметри списків приходять рядками, тому їх спершу приводимо до типів.
import { z } from 'zod';
import { AVAILABILITY_STATUSES, CURRENCY_CODES } from '@shared/enums';
import type { ProductSortField } from '@shared/types';

/** Найбільше значення, яке вміщує Decimal(14,4) у базі. */
const MONEY_MAX = 999_999_999;

const trimmed = (max: number, required: string) =>
  z.string({ message: required }).trim().min(1, required).max(max, `Задовге значення (до ${max} символів)`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Задовге значення (до ${max} символів)`)
    .nullish()
    .transform((v) => v || null);

const money = (label: string) =>
  z
    .number({ message: `${label}: вкажіть число` })
    .min(0, `${label}: не може бути відʼємною`)
    .max(MONEY_MAX, `${label}: завелике значення`)
    .nullish()
    .transform((v) => v ?? null);

const qty = (label: string) =>
  z
    .number({ message: `${label}: вкажіть число` })
    .min(0, `${label}: не може бути відʼємною`)
    .max(MONEY_MAX, `${label}: завелике значення`)
    .nullish()
    .transform((v) => v ?? null);

const availability = z.enum(AVAILABILITY_STATUSES, { message: 'Невідомий статус наявності' });
const currency = z.enum(CURRENCY_CODES, { message: 'Невідома валюта' });

/** '1'/'true'/'yes' — так, решта — ні; параметра немає — значення не задано. */
const queryFlag = z.preprocess(
  (v) => (v === undefined ? undefined : ['1', 'true', 'yes'].includes(String(v).toLowerCase())),
  z.boolean().optional(),
);

/** 'in_stock,low_stock' або повторений параметр — однаково список статусів. */
const queryAvailability = z.preprocess((v) => {
  if (v === undefined) return undefined;
  const raw = Array.isArray(v) ? v : [v];
  return raw
    .flatMap((x) => String(x).split(','))
    .map((s) => s.trim())
    .filter(Boolean);
}, z.array(availability).optional());

export const PRODUCT_SORT_FIELDS = [
  'supplier',
  'sku',
  'nameWork',
  'name1c',
  'unitCode',
  'multiplicity',
  'purchasePrice',
  'rrp',
  'availability',
  'priceUpdatedAt',
  'priceSource',
] as const satisfies readonly ProductSortField[];

const queryUuid = (message: string) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), z.uuid(message).optional());

export const productIdSchema = z.object({ id: z.uuid('Невірний ідентифікатор товару') });

export const productListQuerySchema = z
  .object({
    supplierId: queryUuid('Невірний ідентифікатор постачальника'),
    availability: queryAvailability,
    stale: queryFlag,
    /** true — показувати й архівні позиції. */
    archived: queryFlag,
    currency: z.preprocess((v) => (v === '' || v === null ? undefined : v), currency.optional()),
    q: z.string().trim().max(200, 'Задовгий запит').optional(),
    /** Синонім q — так само називається поле в ListQuery. */
    search: z.string().trim().max(200, 'Задовгий запит').optional(),
    limit: z.coerce.number().int('Ліміт: вкажіть ціле число').min(1, 'Ліміт: не менше 1').max(2000, 'Ліміт: не більше 2000').default(500),
    offset: z.coerce.number().int('Зсув: вкажіть ціле число').min(0, 'Зсув: не менше 0').default(0),
    manual: queryFlag,
    missing: queryFlag,
    sortField: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.enum(PRODUCT_SORT_FIELDS, { message: 'Невідоме поле сортування' }).optional()),
    sortDir: z.enum(['asc', 'desc'], { message: 'Напрям сортування: asc або desc' }).default('asc'),
  })
  .transform((v) => ({ ...v, q: v.q || v.search || '' }));

export const productSearchQuerySchema = z.object({
  q: z.string().trim().max(200, 'Задовгий запит').default(''),
  supplierId: queryUuid('Невірний ідентифікатор постачальника'),
  limit: z.coerce.number().int('Ліміт: вкажіть ціле число').min(1, 'Ліміт: не менше 1').max(50, 'Ліміт: не більше 50').default(20),
  includeArchived: queryFlag,
});

export const skuLookupSchema = z.object({
  supplierId: z.uuid('Невірний ідентифікатор постачальника').nullish().transform((v) => v ?? null),
  skus: z
    .array(z.string().max(120, 'Задовгий артикул'), { message: 'Передайте список артикулів' })
    .min(1, 'Передайте хоча б один артикул')
    .max(1000, 'За раз перевіряємо до 1000 артикулів'),
});

export const productInputSchema = z.object({
  supplierId: z.uuid('Оберіть постачальника'),
  sku: trimmed(120, 'Вкажіть артикул'),
  nameWork: trimmed(300, 'Вкажіть робочу назву'),
  name1c: optionalText(300),
  brand: optionalText(120),
  unitCode: z.string().trim().max(20, 'Задовга одиниця виміру').optional().transform((v) => v || 'шт'),
  currency,
  purchasePrice: money('Вхідна ціна'),
  rrp: money('РРЦ'),
  multiplicity: z
    .number({ message: 'Кратність: вкажіть число' })
    .gt(0, 'Кратність: більше нуля')
    .max(100_000, 'Кратність: завелике значення')
    .optional()
    .transform((v) => v ?? 1),
  minOrderQty: qty('Мінімальна партія'),
  stockQty: qty('Залишок'),
  availability: availability.optional(),
  productUrl: optionalText(500),
  notes: optionalText(2000),
  /** true — вхідну ціну введено з ПДВ, нормалізуємо її до ціни без ПДВ (Ф1). */
  priceIncludesVat: z.boolean().optional(),
});

/** Картка товару: артикул, валюта й ціни тут не змінюються (ціни — окремим методом). */
export const productPatchSchema = z
  .object({
    nameWork: trimmed(300, 'Вкажіть робочу назву'),
    name1c: optionalText(300),
    brand: optionalText(120),
    unitCode: z.string().trim().min(1, 'Вкажіть одиницю виміру').max(20, 'Задовга одиниця виміру'),
    multiplicity: z.number({ message: 'Кратність: вкажіть число' }).gt(0, 'Кратність: більше нуля').max(100_000, 'Кратність: завелике значення'),
    minOrderQty: qty('Мінімальна партія'),
    productUrl: optionalText(500),
    notes: optionalText(2000),
    isArchived: z.boolean(),
  })
  .partial();

export const productPriceUpdateSchema = z.object({
  currency,
  purchasePrice: money('Вхідна ціна'),
  rrp: money('РРЦ'),
  stockQty: qty('Залишок').optional(),
  availability: availability.optional(),
  source: z.literal('manual', { message: 'Ціну в каталозі змінюють лише вручну' }),
  note: optionalText(500),
});

export type ProductListQueryInput = z.infer<typeof productListQuerySchema>;
export type ProductSearchQueryInput = z.infer<typeof productSearchQuerySchema>;
export type SkuLookupInput = z.infer<typeof skuLookupSchema>;
export type ProductInputBody = z.infer<typeof productInputSchema>;
export type ProductPatchBody = z.infer<typeof productPatchSchema>;
export type ProductPriceUpdateBody = z.infer<typeof productPriceUpdateSchema>;
