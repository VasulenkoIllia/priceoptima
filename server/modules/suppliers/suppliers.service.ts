// Постачальники: довідник із юрособами, контактами й джерелом прайсу.
// Посилання на вигрузку й токен доступу лишаються на сервері — в API йде лише хост і стан доступу.
import { randomUUID } from 'node:crypto';
import type { Prisma, User } from '@prisma/client';
import type { PriceImportMapping, SupplierDetail, SupplierListItem, SupplierPriceSourceSettings } from '@shared/types';
import { config } from '../../config';
import { prisma } from '../../db';
import { ApiError, notFound } from '../../http/errors';
import { withSingleDefault } from '../../lib/defaults';
import { dateOnly } from '../../lib/mapping';
import { createSecretBox } from '../../lib/secretBox';
import { expectedVersion, staleCardError } from '../../lib/cardVersion';
import { audit, lastChangeOf } from '../audit/audit.service';
import type { SupplierDetailRow } from './suppliers.mapper';
import { toPriceSourceSettings, toSupplierDetail, toSupplierListItem } from './suppliers.mapper';
import { priceMappingSchema, type PriceMappingBody, type PriceSourceBody, type SupplierInputBody } from './suppliers.schemas';

// ключ шифрування секретів виводимо з ключа підпису cookie — окремої змінної середовища не заводимо
const secrets = createSecretBox(config.SESSION_SECRET);

const INCLUDE = {
  feed: true,
  legalEntities: { orderBy: [{ isDefault: 'desc' as const }, { nameShort: 'asc' as const }] },
  contacts: { orderBy: [{ fullName: 'asc' as const }] },
} satisfies Prisma.SupplierInclude;

export async function listSuppliers(): Promise<SupplierListItem[]> {
  const [rows, counts] = await Promise.all([supplierRows(), productCounts()]);
  return rows.map((row) => toSupplierListItem(row, counts.get(row.id) ?? 0));
}

/**
 * Постачальники для розрахунку заявки — без кількості товарів: підрахунок по мільйону позицій
 * на кожне відкриття й збереження заявки був головним навантаженням на базу.
 */
export async function listSuppliersForPricing(): Promise<SupplierListItem[]> {
  return (await supplierRows()).map((row) => toSupplierListItem(row, 0));
}

function supplierRows() {
  return prisma.supplier.findMany({ include: { feed: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
}

export async function getSupplier(id: string): Promise<SupplierDetail> {
  const [row, count, lastChange] = await Promise.all([getSupplierOrFail(id), productCount(id), lastChangeOf('supplier', id)]);
  return { ...toSupplierDetail(row, count), lastChange };
}

export async function createSupplier(input: SupplierInputBody, actor: User): Promise<SupplierDetail> {
  const id = randomUUID();
  const nested = prepareNested(input);
  await prisma.$transaction(async (tx) => {
    await tx.supplier.create({ data: { id, ...toRow(input), createdById: actor.id, updatedById: actor.id } });
    await saveNested(tx, id, nested);
  });
  await audit({ userId: actor.id, action: 'supplier.create', entityType: 'supplier', entityId: id, summary: `Додано постачальника ${input.name}` });
  return getSupplier(id);
}

export async function updateSupplier(id: string, input: SupplierInputBody, actor: User): Promise<SupplierDetail> {
  const current = await getSupplierOrFail(id);
  // списки, яких не передали, лишаються як були
  const nested = prepareNested({
    ...input,
    legalEntities: input.legalEntities ?? current.legalEntities.map(toLegalEntityInput),
    contacts: input.contacts ?? current.contacts.map(toContactInput),
  });
  await prisma.$transaction(async (tx) => {
    const saved = await tx.supplier.updateMany({
      where: { id, ...(expectedVersion(input) != null ? { version: expectedVersion(input)! } : {}) },
      data: { ...toRow(input), updatedById: actor.id, version: { increment: 1 } },
    });
    if (saved.count !== 1) throw await staleCardError('Постачальника', await tx.supplier.findUnique({ where: { id } }));
    await saveNested(tx, id, nested);
  });
  await audit({ userId: actor.id, action: 'supplier.update', entityType: 'supplier', entityId: id, summary: `Змінено картку постачальника ${input.name}` });
  return getSupplier(id);
}

export async function getPriceSource(id: string): Promise<SupplierPriceSourceSettings> {
  const supplier = await prisma.supplier.findUnique({ where: { id }, include: { feed: true } });
  if (!supplier) throw notFound('Постачальника не знайдено');
  return toPriceSourceSettings(supplier.feed);
}

/** Налаштування вигрузки прайсу. Секрет приходить відкритим текстом і лягає в базу зашифрованим. */
export async function updatePriceSource(id: string, input: PriceSourceBody, actor: User): Promise<SupplierPriceSourceSettings> {
  const supplier = await prisma.supplier.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!supplier) throw notFound('Постачальника не знайдено');
  const feed = await prisma.supplierPriceFeed.findUnique({ where: { supplierId: id } });
  const url = input.url === undefined ? (feed?.url ?? null) : input.url || null;
  const secret = nextSecret(input.secret, feed?.secret ?? null);
  const viaLink = input.kind !== 'manual';
  if (viaLink && !url) {
    throw new ApiError('VALIDATION_ERROR', 'Вкажіть посилання на вигрузку');
  }
  if (viaLink && input.auth !== 'none' && !secret) {
    throw new ApiError('VALIDATION_ERROR', 'Для цього способу доступу потрібен токен або пароль');
  }
  // змінили доступ — попередні помилки завантаження вже нічого не кажуть
  const accessChanged =
    !feed || feed.url !== url || feed.secret !== secret || feed.auth !== input.auth || feed.connector !== input.connector || feed.kind !== input.kind;
  const data = {
    kind: input.kind,
    connector: input.connector,
    url,
    auth: input.auth,
    secret,
    scheduleHour: input.scheduleHour,
    hasPurchasePrice: input.hasPurchasePrice,
    note: input.note,
    ...(accessChanged ? { lastError: null, lastErrorAt: null, failCount: 0 } : {}),
  };
  const row = await prisma.supplierPriceFeed.upsert({
    where: { supplierId: id },
    create: { supplierId: id, ...data },
    update: data,
  });
  // сам секрет і посилання в журнал не пишемо — лише факт зміни
  await audit({
    userId: actor.id,
    action: 'supplier.price_source',
    entityType: 'supplier',
    entityId: id,
    summary: `Джерело прайсу ${supplier.name}: ${input.kind === 'manual' ? 'файлом' : input.kind === 'hybrid' ? 'змішано' : 'за посиланням'}${accessChanged ? ', змінено доступ' : ''}`,
  });
  return toPriceSourceSettings(row);
}

/** Зіставлення колонок файлу прайсу; збережене в старому форматі чи пошкоджене — немає. */
export async function getPriceMapping(id: string): Promise<PriceImportMapping | null> {
  const supplier = await prisma.supplier.findUnique({ where: { id }, include: { feed: { select: { columnMapping: true } } } });
  if (!supplier) throw notFound('Постачальника не знайдено');
  const parsed = priceMappingSchema.safeParse(supplier.feed?.columnMapping ?? undefined);
  return supplier.feed?.columnMapping != null && parsed.success ? parsed.data : null;
}

/** Запис у рядок джерела прайсу; якщо його ще немає — створюється з налаштуваннями за замовчуванням (прайс файлом). */
export async function savePriceMapping(id: string, input: PriceMappingBody): Promise<PriceImportMapping> {
  const supplier = await prisma.supplier.findUnique({ where: { id }, select: { id: true } });
  if (!supplier) throw notFound('Постачальника не знайдено');
  const columnMapping = input as Prisma.InputJsonObject;
  await prisma.supplierPriceFeed.upsert({
    where: { supplierId: id },
    create: { supplierId: id, columnMapping },
    update: { columnMapping },
  });
  return input;
}

/** Поля секрету немає — лишаємо збережений; порожнє значення — прибираємо; інакше шифруємо нове. */
function nextSecret(input: string | null | undefined, stored: string | null): string | null {
  if (input === undefined) return stored;
  const value = input?.trim() ?? '';
  return value === '' ? null : secrets.seal(value);
}

async function getSupplierOrFail(id: string): Promise<SupplierDetailRow> {
  const row = await prisma.supplier.findUnique({ where: { id }, include: INCLUDE });
  if (!row) throw notFound('Постачальника не знайдено');
  return row;
}

/** Кількість товарів змінюється лише імпортом прайсу й ручними правками — хвилинна давність для списку не помітна. */
const PRODUCT_COUNTS_TTL_MS = 60_000;
let countsCache: { at: number; counts: Promise<Map<string, number>> } | null = null;

/** Скинути кешовану кількість товарів (після імпорту прайсу, створення чи архівації товару). */
export function invalidateProductCounts(): void {
  countsCache = null;
}

/** Товарів у каталозі по постачальниках (архівні не рахуємо); кеш на хвилину, одночасні запити чекають один підрахунок. */
function productCounts(): Promise<Map<string, number>> {
  if (countsCache && Date.now() - countsCache.at < PRODUCT_COUNTS_TTL_MS) return countsCache.counts;
  const counts = prisma.product
    .groupBy({ by: ['supplierId'], where: { isArchived: false }, _count: { _all: true } })
    .then((groups) => new Map(groups.map((g) => [g.supplierId, g._count._all])));
  countsCache = { at: Date.now(), counts };
  counts.catch(() => {
    if (countsCache?.counts === counts) countsCache = null;
  });
  return counts;
}

function productCount(supplierId: string): Promise<number> {
  return prisma.product.count({ where: { supplierId, isArchived: false } });
}

function toRow(input: SupplierInputBody) {
  return {
    name: input.name,
    logoUrl: input.logoUrl,
    color: input.color,
    defaultCurrency: input.defaultCurrency,
    pricesIncludeVat: input.pricesIncludeVat,
    rrpIncludesVat: input.rrpIncludesVat,
    supplierMarkupPct: input.supplierMarkupPct,
    ratePolicy: input.ratePolicy,
    rateAdjustPct: input.rateAdjustPct,
    manualRateUsd: input.manualRateUsd,
    manualRateEur: input.manualRateEur,
    manualRatesDate: input.manualRatesDate ? dateOnly(input.manualRatesDate) : null,
    // курси з прайсу веде завантаження прайсу — без явного значення не чіпаємо
    ...(input.priceListRates
      ? {
          priceListRateUsd: input.priceListRates.USD,
          priceListRateEur: input.priceListRates.EUR,
          priceListRateDate: input.priceListRates.date ? dateOnly(input.priceListRates.date) : null,
        }
      : {}),
    minOrderAmount: input.minOrderAmount,
    priceStaleDays: input.priceStaleDays,
    searchUrlTemplate: input.searchUrlTemplate,
    website: input.website,
    b2bUrl: input.b2bUrl,
    notes: input.notes,
    deliveryInfo: input.deliveryInfo,
    isActive: input.isActive,
    sortOrder: input.sortOrder,
  };
}

interface NestedRows {
  legalEntities: Omit<Prisma.SupplierLegalEntityCreateManyInput, 'supplierId'>[];
  contacts: Omit<Prisma.SupplierContactCreateManyInput, 'supplierId'>[];
}

function prepareNested(input: SupplierInputBody): NestedRows {
  const legalEntities = (input.legalEntities ?? []).map((le) => ({ ...le, id: le.id ?? randomUUID() }));
  return {
    legalEntities: withSingleDefault(legalEntities).map((le) => ({
      id: le.id,
      nameShort: le.nameShort,
      nameFull: le.nameFull,
      edrpou: le.edrpou,
      ipn: le.ipn,
      isVatPayer: le.isVatPayer,
      iban: le.iban,
      bankName: le.bankName,
      address: le.address,
      note: le.note,
      isDefault: le.isDefault,
      isActive: le.isActive,
    })),
    contacts: (input.contacts ?? []).map((ct) => ({
      id: ct.id ?? randomUUID(),
      fullName: ct.fullName,
      position: ct.position,
      phone: ct.phone,
      email: ct.email,
      note: ct.note,
    })),
  };
}

async function saveNested(tx: Prisma.TransactionClient, supplierId: string, nested: NestedRows): Promise<void> {
  await tx.supplierLegalEntity.deleteMany({ where: { supplierId } });
  await tx.supplierContact.deleteMany({ where: { supplierId } });
  if (nested.legalEntities.length) {
    await tx.supplierLegalEntity.createMany({ data: nested.legalEntities.map((le) => ({ ...le, supplierId })) });
  }
  if (nested.contacts.length) {
    await tx.supplierContact.createMany({ data: nested.contacts.map((ct) => ({ ...ct, supplierId })) });
  }
}

function toLegalEntityInput(row: SupplierDetailRow['legalEntities'][number]) {
  return {
    id: row.id,
    nameShort: row.nameShort,
    nameFull: row.nameFull,
    edrpou: row.edrpou,
    ipn: row.ipn,
    isVatPayer: row.isVatPayer,
    iban: row.iban,
    bankName: row.bankName,
    address: row.address,
    note: row.note,
    isDefault: row.isDefault,
    isActive: row.isActive,
  };
}

function toContactInput(row: SupplierDetailRow['contacts'][number]) {
  return {
    id: row.id,
    fullName: row.fullName,
    position: row.position,
    phone: row.phone,
    email: row.email,
    note: row.note,
  };
}
