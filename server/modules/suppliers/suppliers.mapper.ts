// Постачальник із бази → типи фронта.
// Джерело прайсу віддаємо без посилання й без секрету: назовні йдуть лише хост і налаштування розкладу.
import type { Supplier, SupplierContact, SupplierLegalEntity, SupplierPriceFeed } from '@prisma/client';
import { CURRENCY_CODES, RATE_POLICIES } from '@shared/enums';
import type {
  SupplierContactDto,
  SupplierDetail,
  SupplierLegalEntityDto,
  SupplierListItem,
  SupplierPriceSource,
  SupplierRef,
} from '@shared/types';
import { isoDate, isoDateTime, num, numOrNull, oneOf } from '../../lib/mapping';

export type SupplierRow = Supplier & { feed: SupplierPriceFeed | null };
export type SupplierDetailRow = SupplierRow & {
  legalEntities: SupplierLegalEntity[];
  contacts: SupplierContact[];
};

/** Налаштування джерела прайсу для відповіді на PUT: те саме, що бачить список, плюс стан доступу. */
export interface SupplierPriceSourceSettings extends SupplierPriceSource {
  auth: SupplierPriceFeed['auth'];
  /** Токен або пароль збережено (саме значення назовні не віддаємо ніколи). */
  hasSecret: boolean;
}

/** Постачальник без налаштованої вигрузки: прайс приносить менеджер файлом. */
const MANUAL_SOURCE: SupplierPriceSource = {
  kind: 'manual',
  format: null,
  host: null,
  scheduleHour: null,
  hasPurchasePrice: true,
  note: null,
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

export function toPriceSource(feed: SupplierPriceFeed | null): SupplierPriceSource {
  if (!feed) return { ...MANUAL_SOURCE };
  return {
    kind: feed.kind,
    format: feed.format,
    host: hostOf(feed.url),
    scheduleHour: feed.scheduleHour,
    hasPurchasePrice: feed.hasPurchasePrice,
    note: feed.note,
  };
}

export function toPriceSourceSettings(feed: SupplierPriceFeed): SupplierPriceSourceSettings {
  return { ...toPriceSource(feed), auth: feed.auth, hasSecret: feed.secret != null };
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
    searchUrlTemplate: row.searchUrlTemplate,
    website: row.website,
    b2bUrl: row.b2bUrl,
  };
}

export function toSupplierListItem(row: SupplierRow, productsCount: number): SupplierListItem {
  return {
    ...toSupplierRef(row),
    productsCount,
    lastImportAt: isoDateTime(row.lastImportAt),
    priceSource: toPriceSource(row.feed),
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

export function toSupplierDetail(row: SupplierDetailRow, productsCount: number): SupplierDetail {
  return {
    ...toSupplierListItem(row, productsCount),
    notes: row.notes,
    deliveryInfo: row.deliveryInfo,
    rrpIncludesVat: row.rrpIncludesVat,
    manualRatesDate: isoDate(row.manualRatesDate),
    legalEntities: row.legalEntities.map(toLegalEntityDto),
    contacts: row.contacts.map(toSupplierContactDto),
    // профілі завантаження прайсів з'являться разом із модулем імпорту
    importProfiles: [],
  };
}
