// Перевірка даних постачальника, його юросіб, контактів і джерела прайсу.
import { z } from 'zod';
import { FEED_CONNECTORS } from '@shared/catalog/connectors';
import { CURRENCY_CODES, PRICE_COLUMN_ROLES, RATE_POLICIES } from '@shared/enums';
import { numberField, optionalIsoDateString, optionalNumberField, optionalText, trimmed } from '../../lib/fields';

const FEED_AUTH = ['none', 'bearer', 'basic', 'query'] as const;
const FEED_KINDS = ['auto', 'manual', 'hybrid'] as const;

const optionalRate = optionalNumberField(0, 10_000, 'Курс');

export const legalEntityInputSchema = z.object({
  id: z.uuid('Невірний ідентифікатор юрособи').optional(),
  nameShort: trimmed(200, 'Вкажіть назву юрособи'),
  nameFull: optionalText(400),
  edrpou: optionalText(20),
  ipn: optionalText(20),
  isVatPayer: z.boolean().default(true),
  iban: optionalText(40),
  bankName: optionalText(160),
  address: optionalText(400),
  note: optionalText(1000),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const supplierContactInputSchema = z.object({
  id: z.uuid('Невірний ідентифікатор контакту').optional(),
  fullName: trimmed(160, 'Вкажіть ПІБ контакту'),
  position: optionalText(120),
  phone: optionalText(40),
  email: optionalText(160),
  note: optionalText(1000),
});

export const supplierInputSchema = z.object({
  /** Версія картки, яку відкрив користувач: чужі правки не перезаписуємо (ДОВ-6). */
  version: z.number().int().min(1).optional(),
  name: trimmed(200, 'Вкажіть назву постачальника'),
  logoUrl: optionalText(300_000),
  color: optionalText(20),
  defaultCurrency: z.enum(CURRENCY_CODES, { message: 'Невідома валюта' }).default('UAH'),
  pricesIncludeVat: z.boolean().default(false),
  rrpIncludesVat: z.boolean().default(true),
  supplierMarkupPct: numberField(-100, 1000, 'Націнка постачальника, %').default(0),
  ratePolicy: z.enum(RATE_POLICIES, { message: 'Невідома політика курсу' }).default('price_list'),
  rateAdjustPct: numberField(-100, 100, 'Поправка до курсу, %').default(0),
  manualRateUsd: optionalRate,
  manualRateEur: optionalRate,
  manualRatesDate: optionalIsoDateString('Дата ручних курсів'),
  /** Курси з прайсу оновлює завантаження прайсу; якщо поле не передали — лишаються збережені. */
  priceListRates: z
    .object({
      USD: optionalRate,
      EUR: optionalRate,
      date: optionalIsoDateString('Дата курсів прайсу'),
    })
    .optional(),
  minOrderAmount: optionalNumberField(0, 100_000_000, 'Мінімальне замовлення'),
  priceStaleDays: z
    .number({ message: 'Актуальність ціни: вкажіть число' })
    .int('Актуальність ціни: вкажіть ціле число')
    .min(1, 'Актуальність ціни: не менше 1')
    .max(365, 'Актуальність ціни: не більше 365')
    .nullish()
    .transform((v) => v ?? null),
  searchUrlTemplate: optionalText(500),
  website: optionalText(300),
  b2bUrl: optionalText(300),
  notes: optionalText(4000),
  deliveryInfo: optionalText(2000),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int('Порядок: вкажіть ціле число').min(0, 'Порядок: не менше 0').max(9999, 'Порядок: не більше 9999').default(0),
  legalEntities: z.array(legalEntityInputSchema).max(20, 'Забагато юросіб (до 20)').optional(),
  contacts: z.array(supplierContactInputSchema).max(50, 'Забагато контактів (до 50)').optional(),
});

export const supplierIdSchema = z.object({ id: z.uuid('Невірний ідентифікатор постачальника') });

export const priceSourceSchema = z
  .object({
    kind: z.enum(FEED_KINDS, { message: 'Невідомий спосіб отримання прайсу' }),
    connector: z
      .enum(FEED_CONNECTORS, { message: 'Невідоме підключення постачальника' })
      .nullish()
      .transform((v) => v ?? null),
    /**
     * Посилання на вигрузку; назовні не повертається — лише хост.
     * Як і секрет: поле відсутнє — лишається збережене, порожнє або null — прибираємо.
     */
    url: z.string().trim().max(2000, 'Задовге посилання (до 2000 символів)').nullish(),
    auth: z.enum(FEED_AUTH, { message: 'Невідомий спосіб доступу' }).default('none'),
    /**
     * Токен або пароль відкритим текстом: поле відсутнє — лишається збережений,
     * порожнє значення або null — секрет прибираємо.
     */
    secret: z.string().max(500, 'Задовгий токен (до 500 символів)').nullish(),
    scheduleHour: z
      .number({ message: 'Година оновлення: вкажіть число' })
      .int('Година оновлення: вкажіть ціле число')
      .min(0, 'Година оновлення: від 0')
      .max(23, 'Година оновлення: до 23')
      .nullish()
      .transform((v) => v ?? null),
    hasPurchasePrice: z.boolean().default(true),
    note: optionalText(1000),
  })
  .superRefine((value, ctx) => {
    // чи є посилання взагалі, перевіряє сервіс: воно могло лишитися збереженим з минулого разу
    if (value.url && !isHttpUrl(value.url)) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: 'Посилання має починатися з http:// або https://' });
    }
    if (value.kind !== 'manual' && !value.connector) {
      ctx.addIssue({ code: 'custom', path: ['connector'], message: 'Оберіть, чия це вигрузка' });
    }
  });

/** Посилання на вигрузку буває лише http(s): інші схеми — це вже читання файлів сервера. */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const columnRef = z.object({
  index: z.number().int('Номер колонки: ціле число').min(0, 'Номер колонки: від 0').max(500, 'Номер колонки: до 500'),
  header: z.string().max(300, 'Задовгий заголовок колонки'),
});

/** Зіставлення колонок файлу прайсу — зберігається для постачальника, щоб наступного разу підставити. */
export const priceMappingSchema = z.object({
  sheetName: z.string().max(200, 'Задовга назва аркуша').nullable().default(null),
  headerRow: z.number().int().min(0).max(1000).nullable().default(null),
  columns: z.partialRecord(z.enum(PRICE_COLUMN_ROLES), columnRef).default({}),
  pricesIncludeVat: z.boolean().default(false),
  rrpIncludesVat: z.boolean().default(true),
  currency: z.enum(CURRENCY_CODES, { message: 'Невідома валюта' }).default('UAH'),
  skipRowsWithoutPrice: z.boolean().default(true),
  markMissing: z.boolean().default(false),
});

export type SupplierInputBody = z.infer<typeof supplierInputSchema>;
export type PriceMappingBody = z.infer<typeof priceMappingSchema>;
export type LegalEntityInputBody = z.infer<typeof legalEntityInputSchema>;
export type SupplierContactInputBody = z.infer<typeof supplierContactInputSchema>;
export type PriceSourceBody = z.infer<typeof priceSourceSchema>;
