import type {
  AvailabilityStatus,
  CurrencyCode,
  ForeignCurrency,
  PriceColumnRole,
  RatePolicy,
  RateSource,
} from '../enums';
import type { ISODate, ISODateTime, UUID, UserRef } from './common';

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

/** Підключення автооновлення (модуль постачальника), див. shared/catalog/connectors. */
export type { FeedConnector } from '../catalog/connectors';
import type { FeedConnector } from '../catalog/connectors';

/**
 * Звідки береться прайс: 'auto' — усе за посиланням; 'manual' — файлом від менеджера;
 * 'hybrid' — асортимент, наявність і фото за посиланням, а ціни — файлом.
 */
export type PriceSourceKind = 'auto' | 'manual' | 'hybrid';

export interface SupplierPriceSource {
  kind: PriceSourceKind;
  /** Чиєю вигрузкою оновлюється за посиланням. */
  connector: FeedConnector | null;
  /** Хост вигрузки — без ключів і токенів. */
  host: string | null;
  /** Година щоденного оновлення за посиланням (0–23) для 'auto' і 'hybrid'. */
  scheduleHour: number | null;
  /** У прайсі є закупівельні ціни (інакше — лише РРЦ). */
  hasPurchasePrice: boolean;
  note: string | null;
}

/** Доступ до вигрузки: bearer — токен у заголовку; basic — «логін:пароль»; query — токен параметром посилання. */
export type PriceFeedAuth = 'none' | 'bearer' | 'basic' | 'query';

/** Налаштування вигрузки для форми: саме посилання й токен назовні не віддаються — лише факт, що вони збережені. */
export interface SupplierPriceSourceSettings extends SupplierPriceSource {
  auth: PriceFeedAuth;
  hasUrl: boolean;
  hasSecret: boolean;
  /** Остання помилка автоматичного оновлення (скидається після вдалого). */
  lastError: string | null;
  lastErrorAt: ISODateTime | null;
  failCount: number;
}

export interface SupplierPriceSourceInput {
  kind: PriceSourceKind;
  connector: FeedConnector | null;
  /** Нове посилання; поле не передали — лишається збережене. */
  url?: string | null;
  auth: PriceFeedAuth;
  /** Новий токен або пароль; не передали — лишається збережений; '' — прибрати. */
  secret?: string | null;
  scheduleHour: number | null;
  hasPurchasePrice: boolean;
  note: string | null;
}

export interface SupplierListItem extends SupplierRef {
  productsCount: number;
  lastImportAt: ISODateTime | null;
  priceSource: SupplierPriceSource;
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
}

export type SupplierInput = Omit<
  SupplierDetail,
  'id' | 'productsCount' | 'lastImportAt' | 'priceSource' | 'priceListRates' | 'legalEntities' | 'contacts'
> & {
  /** Курси з прайсу веде завантаження прайсу; не передали — лишаються збережені. */
  priceListRates?: PriceListRates;
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

/** Оновлення прайсу постачальника в каталозі (за посиланням або з файлу). */
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
  /** Нові позиції, яких не було в каталозі. */
  added: number;
  /** Позначені «немає у прайсі». */
  missing: number;
  stockChanged: number;
  /** 'auto' — за розкладом чи кнопкою «Оновити зараз»; 'file' — завантажений прайс. */
  source: 'auto' | 'file';
  fileName: string | null;
  /** Курси з прайсу. */
  rates: RatesPair;
  /** null — автоматично за розкладом; інакше — хто запустив оновлення. */
  user: UserRef | null;
  // ── стан запуску й звіт звірки ──
  /** 'error' — оновлення не застосовано (див. error). */
  status?: 'ok' | 'error';
  error?: string | null;
  /** Попередження розбору: немає цін, пропущені рядки тощо. */
  warnings?: string[];
  /** Рядки, які не застосовано: без коду, повтори, неоднозначні, не знайдені. */
  skipped?: number;
  /** Знайдено за штрихкодом або артикулом (код у каталозі замінено кодом із прайсу). */
  relinked?: number;
  /** Повернуто з архіву. */
  restored?: number;
  /** Товарів, у яких опис у каталозі відрізняється від прайсу (опис не змінено). */
  detailsDiffer?: number;
  finishedAt?: ISODateTime | null;
  /** Звіт — у відповіді на запуск і в картці запису журналу; у списку журналу його немає. */
  report?: PriceUpdateReport | null;
}

/** Поля опису, які прайс лише доповнює (заповнене значення не перезаписується). */
export type PriceDetailField = 'nameWork' | 'brand' | 'unitCode' | 'multiplicity' | 'minOrderQty' | 'barcode' | 'categoryPath';

export interface PriceDetailDiff {
  code: string;
  field: PriceDetailField;
  catalog: string;
  price: string;
}

export interface PriceBigChange {
  code: string;
  field: 'purchasePrice' | 'rrp';
  old: number;
  new: number;
  /** Зміна у відсотках зі знаком, до десятих. */
  pct: number;
}

export interface PriceRelinkedItem {
  code: string;
  previousSku: string;
  by: 'barcode' | 'article';
}

export interface PriceNotFoundRow {
  /** Номер рядка у прайсі (з 1). */
  row: number;
  code: string;
  name: string | null;
}

export interface PriceSkippedRow {
  row: number;
  code: string;
  reason: string;
}

/** Скільки всього й перші приклади (до 50). */
export interface PriceReportSection<T> {
  total: number;
  sample: T[];
}

export interface PriceUpdateReport {
  /** Поля, у яких заповнене значення каталогу відрізняється від прайсу (по запису на поле). */
  detailsDiffer: PriceReportSection<PriceDetailDiff>;
  bigPriceChanges: PriceReportSection<PriceBigChange>;
  relinked: PriceReportSection<PriceRelinkedItem>;
  notFound: PriceReportSection<PriceNotFoundRow>;
  skippedRows: PriceReportSection<PriceSkippedRow>;
}

/** Останнє зіставлення колонок файлу прайсу постачальника — підставляється наступного разу. */
export interface PriceImportMapping {
  sheetName: string | null;
  headerRow: number | null;
  /** Індекс колонки + її заголовок — якщо колонки посунуться, знайдемо за заголовком. */
  columns: Partial<Record<PriceColumnRole, { index: number; header: string }>>;
  pricesIncludeVat: boolean;
  /** РРЦ у прайсі вже з ПДВ (інакше множимо на ставку). */
  rrpIncludesVat: boolean;
  currency: CurrencyCode;
  skipRowsWithoutPrice: boolean;
  markMissing: boolean;
}

/** Рядок прайсу для завантаження (ціни — у валюті прайсу, вхід без ПДВ, РРЦ з ПДВ). */
export interface PriceImportRow {
  /** Код постачальника — обов'язковий, за ним звіряємо каталог. */
  code: string;
  sku?: string | null;
  name?: string | null;
  brand?: string | null;
  unitCode?: string | null;
  purchasePrice?: number | null;
  currency?: CurrencyCode | null;
  rrp?: number | null;
  stockQty?: number | null;
  availability?: AvailabilityStatus | null;
  multiplicity?: number | null;
  minOrderQty?: number | null;
}

export interface PriceImportBody {
  rows: PriceImportRow[];
  fileName: string;
  /** Позиції каталогу, яких немає у файлі, позначити «немає у прайсі». */
  markMissing: boolean;
  /** Порахувати зміни, нічого не зберігаючи. */
  dryRun?: boolean;
}

/** Мапа статусів наявності з прайсу: 'є' → in_stock, 'під замовлення' → on_order. */
export type AvailabilityMap = Record<string, AvailabilityStatus>;
