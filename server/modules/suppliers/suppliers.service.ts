// Постачальники: довідник із юрособами, контактами й джерелом прайсу.
// Посилання на вигрузку й токен доступу лишаються на сервері — в API йде лише хост і стан доступу.
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { SupplierDetail, SupplierListItem, SupplierPriceSourceSettings } from '@shared/types';
import { config } from '../../config';
import { prisma } from '../../db';
import { ApiError, notFound } from '../../http/errors';
import { withSingleDefault } from '../../lib/defaults';
import { dateOnly } from '../../lib/mapping';
import { createSecretBox } from '../../lib/secretBox';
import type { SupplierDetailRow } from './suppliers.mapper';
import { toPriceSourceSettings, toSupplierDetail, toSupplierListItem } from './suppliers.mapper';
import type { PriceSourceBody, SupplierInputBody } from './suppliers.schemas';

// ключ шифрування секретів виводимо з ключа підпису cookie — окремої змінної середовища не заводимо
const secrets = createSecretBox(config.SESSION_SECRET);

const INCLUDE = {
  feed: true,
  legalEntities: { orderBy: [{ isDefault: 'desc' as const }, { nameShort: 'asc' as const }] },
  contacts: { orderBy: [{ fullName: 'asc' as const }] },
} satisfies Prisma.SupplierInclude;

export async function listSuppliers(): Promise<SupplierListItem[]> {
  const [rows, counts] = await Promise.all([
    prisma.supplier.findMany({ include: { feed: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    productCounts(),
  ]);
  return rows.map((row) => toSupplierListItem(row, counts.get(row.id) ?? 0));
}

export async function getSupplier(id: string): Promise<SupplierDetail> {
  const row = await getSupplierOrFail(id);
  return toSupplierDetail(row, await productCount(id));
}

export async function createSupplier(input: SupplierInputBody): Promise<SupplierDetail> {
  const id = randomUUID();
  const nested = prepareNested(input);
  await prisma.$transaction(async (tx) => {
    await tx.supplier.create({ data: { id, ...toRow(input) } });
    await saveNested(tx, id, nested);
  });
  return getSupplier(id);
}

export async function updateSupplier(id: string, input: SupplierInputBody): Promise<SupplierDetail> {
  const current = await getSupplierOrFail(id);
  // списки, яких не передали, лишаються як були
  const nested = prepareNested({
    ...input,
    legalEntities: input.legalEntities ?? current.legalEntities.map(toLegalEntityInput),
    contacts: input.contacts ?? current.contacts.map(toContactInput),
  });
  await prisma.$transaction(async (tx) => {
    await tx.supplier.update({ where: { id }, data: toRow(input) });
    await saveNested(tx, id, nested);
  });
  return getSupplier(id);
}

export async function getPriceSource(id: string): Promise<SupplierPriceSourceSettings> {
  const supplier = await prisma.supplier.findUnique({ where: { id }, include: { feed: true } });
  if (!supplier) throw notFound('Постачальника не знайдено');
  return toPriceSourceSettings(supplier.feed);
}

/** Налаштування вигрузки прайсу. Секрет приходить відкритим текстом і лягає в базу зашифрованим. */
export async function updatePriceSource(id: string, input: PriceSourceBody): Promise<SupplierPriceSourceSettings> {
  const supplier = await prisma.supplier.findUnique({ where: { id }, select: { id: true } });
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
    !feed || feed.url !== url || feed.secret !== secret || feed.auth !== input.auth || feed.format !== input.format || feed.kind !== input.kind;
  const data = {
    kind: input.kind,
    format: input.format,
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
  return toPriceSourceSettings(row);
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

/** Товарів у каталозі по постачальниках (архівні не рахуємо). */
async function productCounts(): Promise<Map<string, number>> {
  const groups = await prisma.product.groupBy({
    by: ['supplierId'],
    where: { isArchived: false },
    _count: { _all: true },
  });
  return new Map(groups.map((g) => [g.supplierId, g._count._all]));
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
