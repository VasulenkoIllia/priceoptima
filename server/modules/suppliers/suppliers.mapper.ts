// Постачальник із бази → типи фронта.
// Джерело прайсу віддаємо без посилання й без секрету: назовні йдуть хост, розклад і що оновлює посилання й файл;
// саме посилання — лише адміністратору в налаштуваннях вигрузки.
import type { Supplier, SupplierContact, SupplierLegalEntity, SupplierPriceFeed } from '@prisma/client';
import { isFeedConnector } from '@shared/catalog/connectors';
import { CURRENCY_CODES, RATE_POLICIES } from '@shared/enums';
import type {
  SupplierContactDto,
  SupplierDetail,
  SupplierLegalEntityDto,
  SupplierListItem,
  SupplierPriceSource,
  SupplierPriceSourceSettings,
  SupplierRef,
} from '@shared/types';
import { isoDate, isoDateTime, num, numOrNull, oneOf } from '../../lib/mapping';
import { linkRolesOf, rolesFor } from '../price-updates/priceUpdates.rules';

export type SupplierRow = Supplier & { feed: SupplierPriceFeed | null };
export type SupplierDetailRow = SupplierRow & {
  legalEntities: SupplierLegalEntity[];
  contacts: SupplierContact[];
};

/** Останні вдалі оновлення прайсу постачальника за посиланням і файлом (з журналу оновлень). */
export interface LastPriceRuns {
  link: Date | null;
  file: Date | null;
}

const NO_RUNS: LastPriceRuns = { link: null, file: null };

/** Постачальник без налаштованої вигрузки: прайс приносить менеджер файлом. */
const MANUAL_SOURCE: Omit<SupplierPriceSource, 'fileRoles' | 'lastLinkAt' | 'lastFileAt'> = {
  kind: 'manual',
  connector: null,
  host: null,
  scheduleHour: null,
  hasPurchasePrice: true,
  note: null,
  lastError: null,
  lastErrorAt: null,
  failCount: 0,
  linkRoles: null,
};

/** Хост вигрузки — без шляху, ключів і токенів; неправильне посилання показуємо як «немає». */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
}

export function toPriceSource(feed: SupplierPriceFeed | null, runs: LastPriceRuns = NO_RUNS): SupplierPriceSource {
  const lastRuns = { lastLinkAt: isoDateTime(runs.link), lastFileAt: isoDateTime(runs.file) };
  if (!feed) return { ...MANUAL_SOURCE, fileRoles: rolesFor('manual', 'file'), ...lastRuns };
  return {
    kind: feed.kind,
    connector: isFeedConnector(feed.connector) ? feed.connector : null,
    host: hostOf(feed.url),
    scheduleHour: feed.scheduleHour,
    hasPurchasePrice: feed.hasPurchasePrice,
    note: feed.note,
    lastError: feed.lastError,
    lastErrorAt: feed.lastErrorAt ? isoDateTime(feed.lastErrorAt) : null,
    failCount: feed.failCount,
    linkRoles: linkRolesOf(feed.kind, feed.connector, feed.hasPurchasePrice),
    fileRoles: rolesFor(feed.kind, 'file'),
    ...lastRuns,
  };
}

/**
 * Налаштування для форми: те саме, що бачить список, плюс стан доступу. Токен — лише «збережено»; посилання
 * (у ньому буває ключ доступу) — лише адміністратору (withUrl), решті хост.
 */
export function toPriceSourceSettings(feed: SupplierPriceFeed | null, options: { withUrl?: boolean } = {}): SupplierPriceSourceSettings {
  // дати запусків — на картці постачальника (список і «Детальніше»), у налаштуваннях їх немає
  const { lastLinkAt: _link, lastFileAt: _file, ...source } = toPriceSource(feed);
  return {
    ...source,
    auth: feed?.auth ?? 'none',
    hasUrl: !!feed?.url,
    hasSecret: feed?.secret != null,
    ...(options.withUrl && feed?.url ? { url: feed.url } : {}),
  };
}

export function toSupplierRef(row: Supplier): SupplierRef {
  return {
    id: row.id,
    name: row.name,
    logoUrl: row.logoUrl,
    color: row.color,
    defaultCurrency: oneOf(CURRENCY_CODES, row.defaultCurrency, 'UAH'),
    pricesIncludeVat: row.pricesIncludeVat,
    supplierMarkupPct: num(row.supplierMarkupPct),
    ratePolicy: oneOf(RATE_POLICIES, row.ratePolicy, 'price_list'),
    rateAdjustPct: num(row.rateAdjustPct),
    manualRateUsd: numOrNull(row.manualRateUsd),
    manualRateEur: numOrNull(row.manualRateEur),
    priceListRates: {
      USD: numOrNull(row.priceListRateUsd),
      EUR: numOrNull(row.priceListRateEur),
      date: isoDate(row.priceListRateDate),
    },
    minOrderAmount: numOrNull(row.minOrderAmount),
    priceStaleDays: row.priceStaleDays,
    website: row.website,
    b2bUrl: row.b2bUrl,
  };
}

export function toSupplierListItem(row: SupplierRow, productsCount: number, runs: LastPriceRuns = NO_RUNS): SupplierListItem {
  return {
    ...toSupplierRef(row),
    productsCount,
    lastImportAt: isoDateTime(row.lastImportAt),
    priceSource: toPriceSource(row.feed, runs),
    description: row.description,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

export function toLegalEntityDto(row: SupplierLegalEntity): SupplierLegalEntityDto {
  return {
    id: row.id,
    supplierId: row.supplierId,
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

export function toSupplierContactDto(row: SupplierContact): SupplierContactDto {
  return {
    id: row.id,
    supplierId: row.supplierId,
    fullName: row.fullName,
    position: row.position,
    phone: row.phone,
    email: row.email,
    note: row.note,
  };
}

export function toSupplierDetail(row: SupplierDetailRow, productsCount: number, runs: LastPriceRuns = NO_RUNS): SupplierDetail {
  return {
    ...toSupplierListItem(row, productsCount, runs),
    version: row.version,
    notes: row.notes,
    deliveryInfo: row.deliveryInfo,
    rrpIncludesVat: row.rrpIncludesVat,
    manualRatesDate: isoDate(row.manualRatesDate),
    legalEntities: row.legalEntities.map(toLegalEntityDto),
    contacts: row.contacts.map(toSupplierContactDto),
    // профілі завантаження прайсів з'являться разом із модулем імпорту
  };
}
