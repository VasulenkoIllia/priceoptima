import type {
  AvailabilityStatus,
  CurrencyCode,
  ForeignCurrency,
  RatePolicy,
  RateSource,
} from '../enums';
import type { ISODate, ISODateTime, UUID, UserRef } from './common';
import type { ImportProfileDto } from './imports';

export interface RatesPair {
  USD: number | null;
  EUR: number | null;
}

/** Курси з останнього прайсу постачальника (null-поля → ручний курс постачальника → НБУ з шапки заявки). */
export interface PriceListRates extends RatesPair {
  date: ISODate | null;
}

/** Постачальник у документі заявки й пікерах. */
export interface SupplierRef {
  id: UUID;
  name: string;
  logoUrl: string | null;
  color: string | null;
  defaultCurrency: CurrencyCode;
  pricesIncludeVat: boolean;
  supplierMarkupPct: number;
  /** Дефолт 'price_list'. */
  ratePolicy: RatePolicy;
  rateAdjustPct: number;
  manualRateUsd: number | null;
  manualRateEur: number | null;
  priceListRates: PriceListRates;
  minOrderAmount: number | null;
  priceStaleDays: number | null;
  /** Шаблон пошуку на сайті, '{query}' — назва клієнта або артикул. */
  searchUrlTemplate: string | null;
  website: string | null;
  b2bUrl: string | null;
}

export interface SupplierListItem extends SupplierRef {
  productsCount: number;
  lastImportAt: ISODateTime | null;
  isActive: boolean;
  sortOrder: number;
}

export interface SupplierLegalEntityDto {
  id: UUID;
  supplierId: UUID;
  nameShort: string;
  nameFull: string | null;
  edrpou: string | null;
  ipn: string | null;
  isVatPayer: boolean;
  iban: string | null;
  bankName: string | null;
  address: string | null;
  note: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface SupplierContactDto {
  id: UUID;
  supplierId: UUID;
  fullName: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
}

export interface SupplierDetail extends SupplierListItem {
  notes: string | null;
  deliveryInfo: string | null;
  rrpIncludesVat: boolean;
  manualRatesDate: ISODate | null;
  legalEntities: SupplierLegalEntityDto[];
  contacts: SupplierContactDto[];
  importProfiles: ImportProfileDto[];
}

export type SupplierInput = Omit<
  SupplierDetail,
  'id' | 'productsCount' | 'lastImportAt' | 'legalEntities' | 'contacts' | 'importProfiles'
> & {
  legalEntities?: (Omit<SupplierLegalEntityDto, 'id' | 'supplierId'> & { id?: UUID })[];
  contacts?: (Omit<SupplierContactDto, 'id' | 'supplierId'> & { id?: UUID })[];
};

// ── Курси ─────────────────────────────────────────────────────────
export interface CurrencyRateDto {
  id: number;
  currency: ForeignCurrency;
  rateDate: ISODate;
  rate: number;
  source: RateSource;
  fetchedAt: ISODateTime;
  note: string | null;
}

export interface EffectiveRate {
  rate: number;
  rateDate: ISODate;
  source: RateSource;
}

export interface EffectiveRates {
  date: ISODate;
  USD: EffectiveRate | null;
  EUR: EffectiveRate | null;
  stale: boolean;
}

export interface ManualRateInput {
  currency: ForeignCurrency;
  rateDate: ISODate;
  rate: number;
  note?: string | null;
}

/** Оновлення прайсу постачальника в каталозі (прайси приходять автоматично; у прототипі — імітація). */
export interface PriceUpdateDto {
  id: number;
  supplierId: UUID;
  at: ISODateTime;
  /** Товарів постачальника в каталозі (без доданих вручну). */
  productsTotal: number;
  /** Змінилась вхідна ціна або РРЦ. */
  changed: number;
  priceUp: number;
  priceDown: number;
  /** Курси з прайсу. */
  rates: RatesPair;
  /** null — автоматично за розкладом; інакше — хто запустив оновлення. */
  user: UserRef | null;
}

/** Мапа статусів наявності з прайсу: 'є' → in_stock, 'під замовлення' → on_order. */
export type AvailabilityMap = Record<string, AvailabilityStatus>;
