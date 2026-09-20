// Перевірка даних заявок: реєстр, створення, збереження дельти, статус, копія, КП, файли.
import { z } from 'zod';
import {
  AVAILABILITY_STATUSES,
  CURRENCY_CODES,
  DISCOUNT_FORMULAS,
  KP_NAME_SOURCES,
  KP_VAT_MODES,
  MARKUP_METHODS,
  PRICE_ROUNDINGS,
  PRODUCT_NAME_KINDS,
  RATE_POLICIES,
  REQUEST_STATUSES,
} from '@shared/enums';

const id = z.string().min(1).max(64);
const uuid = (label: string) => z.uuid(`Невірний ідентифікатор: ${label}`);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'Дата — у форматі РРРР-ММ-ДД');
const isoDateTime = z.string().max(40);
const text = (max: number) => z.string().max(max, `Задовге значення (до ${max} символів)`);
const nullableText = (max: number) => text(max).nullable();
const num = z.number().finite();
const nullableNum = num.nullable();

// ── реєстр ────────────────────────────────────────────────────────
const csvStatuses = z.preprocess(
  (v) => (typeof v === 'string' ? v.split(',').filter(Boolean) : v),
  z.array(z.enum(REQUEST_STATUSES)).optional(),
);
const optional = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === '' || v == null ? undefined : v), s.optional());

export const requestListQuerySchema = z.object({
  search: optional(z.string().max(200)),
  status: csvStatuses,
  clientId: optional(uuid('клієнт')),
  managerId: optional(uuid('відповідальний')),
  dateFrom: optional(isoDate),
  dateTo: optional(isoDate),
  mine: z.preprocess((v) => v === 'true' || v === '1' || v === true, z.boolean()).optional(),
  sort: optional(z.enum(['number', '-number', 'requestDate', '-requestDate', 'totalSaleGross', '-totalSaleGross'])),
  limit: z.coerce.number().int().min(1).max(2000).optional(),
});

export const createRequestSchema = z.object({
  clientId: uuid('клієнт').nullish(),
  counterpartyId: uuid('контрагент').nullish(),
  contactId: uuid('контакт').nullish(),
  ownCompanyId: uuid('юрособа').optional(),
  managerId: uuid('відповідальний').optional(),
  requestDate: isoDate.optional(),
  title: nullableText(300).optional(),
});

// ── документ ──────────────────────────────────────────────────────
const kpTermSchema = z.object({ label: text(80), value: text(300) });
const kpSettingsSchema = z.object({
  ownCompanyId: uuid('юрособа').optional(),
  vatMode: z.enum(KP_VAT_MODES),
  nameSource: z.enum(KP_NAME_SOURCES),
  showSku: z.literal(true),
  showImages: z.boolean(),
  validityDays: z.number().int().min(0).max(365),
  extraInfo: nullableText(2000),
  onlyApproved: z.boolean(),
  terms: z.array(kpTermSchema).max(12).nullish(),
});

const headerPatchSchema = z
  .object({
    requestDate: isoDate,
    title: nullableText(300),
    clientId: uuid('клієнт').nullable(),
    counterpartyId: uuid('контрагент').nullable(),
    contactId: uuid('контакт').nullable(),
    ownCompanyId: uuid('юрособа'),
    managerId: uuid('відповідальний'),
    notes: nullableText(5000),
    purchaseNote: nullableText(5000),
    rates: z.object({ USD: nullableNum, EUR: nullableNum, date: isoDate.nullable() }),
    vatRatePct: num.min(0).max(100),
    discountFormula: z.enum(DISCOUNT_FORMULAS),
    kpSettings: kpSettingsSchema,
    approvalKpId: uuid('КП').nullable(),
  })
  .partial();

const markupPatchSchema = z
  .object({
    method: z.enum(MARKUP_METHODS),
    value: num.min(-100).max(10_000),
    rounding: z.enum(PRICE_ROUNDINGS),
    excludeUnavailable: z.boolean(),
  })
  .partial();

const lineSchema = z.object({
  id,
  position: z.number().int().min(0).max(100_000),
  clientName: text(1000),
  clientUnit: nullableText(40),
  qty: num.min(0).max(1e9),
  clientNote: nullableText(2000),
  selection: z.object({ blockId: id.nullable() }),
  markup: z.object({
    method: z.enum(MARKUP_METHODS).nullable(),
    value: nullableNum,
    manualPriceNet: nullableNum,
    manualPriceGross: nullableNum.optional(),
  }),
  approval: z.object({ approved: z.boolean(), approvedQty: nullableNum }),
  kpName: nullableText(1000),
});

const blockSchema = z.object({
  id,
  position: z.number().int().min(0).max(1000),
  supplierId: id.nullable(),
  legalEntityId: id.nullable(),
  defaultCurrency: z.enum(CURRENCY_CODES),
  rates: z.object({ USD: nullableNum, EUR: nullableNum }),
  rateSource: z.enum(RATE_POLICIES),
  ratesDate: isoDate.nullable(),
  supplierMarkupPct: num.min(-100).max(1000),
  pricesIncludeVat: z.boolean(),
  note: nullableText(2000),
});

const priceChangeSchema = z.object({
  prevCurrency: z.enum(CURRENCY_CODES),
  prevPurchasePriceCur: nullableNum,
  prevRrpCur: nullableNum,
  prevRate: nullableNum,
  prevUnitNetUah: nullableNum,
  reason: z.enum(['copy_refresh', 'catalog_refresh', 'manual_edit']),
  changedAt: isoDateTime,
});

const offerSchema = z.object({
  id,
  lineId: id,
  blockId: id,
  productId: id.nullable(),
  sku: nullableText(200),
  nameWork: nullableText(1000),
  name1c: nullableText(1000),
  nameKind: z.enum(PRODUCT_NAME_KINDS),
  unitCode: nullableText(40),
  currency: z.enum(CURRENCY_CODES),
  purchasePriceCur: nullableNum,
  rrpCur: nullableNum,
  qty: nullableNum,
  multiplicity: nullableNum,
  noRounding: z.boolean().optional(),
  stockQty: nullableNum,
  availability: z.enum(AVAILABILITY_STATUSES),
  priceDate: isoDateTime.nullable(),
  excluded: z.boolean(),
  excludeReason: nullableText(500),
  note: nullableText(2000),
  priceChange: priceChangeSchema.nullable(),
  // поточний стан каталогу лише для показу — сервер його не зберігає
  catalog: z.unknown().optional(),
});

const MAX_ROWS = 5000;
export const documentPatchSchema = z.object({
  baseVersion: z.number().int().min(1),
  sessionId: id,
  release: z.boolean().optional(),
  header: headerPatchSchema.optional(),
  markup: markupPatchSchema.optional(),
  upsert: z
    .object({
      lines: z.array(lineSchema).max(MAX_ROWS).optional(),
      blocks: z.array(blockSchema).max(50).optional(),
      offers: z.array(offerSchema).max(MAX_ROWS * 6).optional(),
    })
    .optional(),
  delete: z
    .object({
      lineIds: z.array(id).max(MAX_ROWS).optional(),
      blockIds: z.array(id).max(50).optional(),
      offerIds: z.array(id).max(MAX_ROWS * 6).optional(),
    })
    .optional(),
});

export const statusChangeSchema = z.object({
  to: z.enum(REQUEST_STATUSES),
  reason: nullableText(1000).optional(),
  baseVersion: z.number().int().min(1),
  sessionId: id,
});

export const copyRequestSchema = z.object({
  include: z.enum(['lines', 'sourcing', 'full']),
  priceMode: z.enum(['keep', 'refresh']),
  clientId: uuid('клієнт').nullish(),
  counterpartyId: uuid('контрагент').nullish(),
  contactId: uuid('контакт').nullish(),
});

export const kpCreateSchema = z.object({ settings: kpSettingsSchema, final: z.boolean().optional(), sessionId: id });

export const requestIdSchema = z.object({ id: uuid('заявка') });
export const attachmentIdSchema = z.object({ id: uuid('заявка'), fileId: uuid('файл') });

export type RequestListQueryInput = z.infer<typeof requestListQuerySchema>;
export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type DocumentPatchInput = z.infer<typeof documentPatchSchema>;
export type KpCreateInput = z.infer<typeof kpCreateSchema>;
