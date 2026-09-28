// Перевірка запитів оновлення прайсів. Файл приходить або JSON-ом (рядки розібрав браузер),
// або формою multipart із тими самими полями (rows — JSON-рядок) і самим файлом.
import { z } from 'zod';
import { MAX_IMPORT_ROWS } from '@shared/catalog/limits';
import { PRICE_UPDATE_FIELDS } from '@shared/catalog/priceUpdateFields';
import { AVAILABILITY_STATUSES, CURRENCY_CODES } from '@shared/enums';
import { ApiError } from '../../http/errors';
import { optionalNumberField, optionalRateField, optionalText, trimmed } from '../../lib/fields';

/** Найбільше значення, яке вміщує Decimal(14,4) у базі. */
const MONEY_MAX = 999_999_999;
export { MAX_IMPORT_ROWS };

const supplierId = z.uuid('Невірний ідентифікатор постачальника');

/** Що оновлювати (галочки ручного оновлення); немає — як автооновлення. */
const fieldsSchema = z
  .array(z.enum(PRICE_UPDATE_FIELDS, { message: 'Невідоме поле оновлення прайсу' }))
  .max(PRICE_UPDATE_FIELDS.length)
  .transform((v) => [...new Set(v)])
  .optional();

/** Фото рядка файлу: посилання http(s), до 10. */
const IMAGE_URLS_MAX = 10;

/** '1'/'true'/'yes'/'on' — так; решта — ні; параметра немає — не задано. */
const formFlag = (value: unknown): boolean | undefined =>
  value === undefined || value === '' ? undefined : ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());

export const priceUpdatesQuerySchema = z.object({
  supplierId: z.preprocess((v) => (v === '' || v == null ? undefined : v), supplierId.optional()),
  limit: z.coerce
    .number({ message: 'Ліміт: вкажіть число' })
    .int('Ліміт: вкажіть ціле число')
    .min(1, 'Ліміт: не менше 1')
    .max(500, 'Ліміт: не більше 500')
    .default(100),
});

export const priceUpdateIdSchema = z.object({
  id: z.coerce.number({ message: 'Невірний ідентифікатор оновлення' }).int('Невірний ідентифікатор оновлення').positive('Невірний ідентифікатор оновлення'),
});

export const runBodySchema = z.object({
  supplierId,
  dryRun: z.boolean({ message: 'dryRun: так або ні' }).default(false),
  fields: fieldsSchema,
});

export const priceImportRowSchema = z.object({
  // код із Excel буває числом — приймаємо й так
  code: z.preprocess(
    (v) => (typeof v === 'number' ? String(v) : (v ?? '')),
    z.string({ message: 'Код товару: вкажіть текст' }).max(120, 'Код товару задовгий (до 120 символів)'),
  ),
  sku: optionalText(120),
  name: optionalText(1000),
  brand: optionalText(200),
  unitCode: optionalText(40),
  purchasePrice: optionalNumberField(0, MONEY_MAX, 'Вхідна ціна'),
  currency: z
    .enum(CURRENCY_CODES, { message: 'Невідома валюта' })
    .nullish()
    .transform((v) => v ?? null),
  rrp: optionalNumberField(0, MONEY_MAX, 'РРЦ'),
  stockQty: optionalNumberField(-MONEY_MAX, MONEY_MAX, 'Залишок'),
  availability: z
    .enum(AVAILABILITY_STATUSES, { message: 'Невідомий статус наявності' })
    .nullish()
    .transform((v) => v ?? null),
  multiplicity: optionalNumberField(0, 100_000, 'Кратність'),
  minOrderQty: optionalNumberField(0, MONEY_MAX, 'Мінімальна партія'),
  imageUrls: z
    .array(z.string().trim().max(2000, 'Задовге посилання на фото'))
    .max(IMAGE_URLS_MAX, `Фото: до ${IMAGE_URLS_MAX} посилань`)
    .nullish()
    .transform((v) => (v ?? []).filter((u) => /^https?:\/\//iu.test(u))),
});

export const importBodySchema = z.object({
  supplierId,
  rows: z
    .array(priceImportRowSchema, { message: 'Передайте рядки прайсу списком' })
    .min(1, 'У прайсі немає жодного рядка')
    .max(MAX_IMPORT_ROWS, `За раз завантажуємо до ${MAX_IMPORT_ROWS.toLocaleString('uk-UA')} рядків`),
  fileName: trimmed(255, 'Вкажіть назву файлу прайсу'),
  markMissing: z.boolean({ message: 'markMissing: так або ні' }).default(false),
  dryRun: z.boolean({ message: 'dryRun: так або ні' }).default(false),
  rates: z
    .object({ USD: optionalRateField('Курс USD'), EUR: optionalRateField('Курс EUR') })
    .nullish()
    .transform((v) => (v && (v.USD != null || v.EUR != null) ? v : null)),
  fields: fieldsSchema,
});

export type PriceUpdatesQuery = z.infer<typeof priceUpdatesQuerySchema>;
export type RunBody = z.infer<typeof runBodySchema>;
export type ImportBody = z.infer<typeof importBodySchema>;

/** Поле форми multipart, що несе JSON (рядком); немає — undefined. */
function jsonField(value: unknown, message: string): unknown {
  if (typeof value !== 'string') return value;
  if (!value.trim()) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new ApiError('VALIDATION_ERROR', message);
  }
}

/** Поля форми multipart → те саме тіло, що й у JSON-запиті. Назва файлу за замовчуванням — з самого файлу. */
export function importBodyFromForm(fields: Record<string, unknown>, uploadedName: string | null): unknown {
  let rows: unknown = fields.rows;
  if (typeof rows === 'string') {
    try {
      rows = JSON.parse(rows) as unknown;
    } catch {
      throw new ApiError('VALIDATION_ERROR', 'Рядки прайсу мають бути JSON-списком');
    }
  }
  let rates: unknown = fields.rates;
  if (typeof rates === 'string') {
    try {
      rates = JSON.parse(rates) as unknown;
    } catch {
      throw new ApiError('VALIDATION_ERROR', 'Курс прайсу має бути JSON-об’єктом');
    }
  }
  return {
    supplierId: fields.supplierId,
    rows,
    fileName: typeof fields.fileName === 'string' && fields.fileName.trim() ? fields.fileName : (uploadedName ?? undefined),
    markMissing: formFlag(fields.markMissing),
    dryRun: formFlag(fields.dryRun),
    rates,
    fields: jsonField(fields.fields, 'Поля оновлення мають бути JSON-списком'),
  };
}

/** Тіло запиту на завантаження; помилка в рядку називає номер рядка, щоб його легко знайти у файлі. */
export function parseImportBody(value: unknown): ImportBody {
  const result = importBodySchema.safeParse(value);
  if (result.success) return result.data;
  const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  const first = result.error.issues[0];
  const rowIndex = first?.path[0] === 'rows' && typeof first.path[1] === 'number' ? first.path[1] : null;
  const message = first ? (rowIndex != null ? `Рядок ${rowIndex + 1}: ${first.message}` : first.message) : 'Перевірте заповнені поля';
  throw new ApiError('VALIDATION_ERROR', message, details);
}
