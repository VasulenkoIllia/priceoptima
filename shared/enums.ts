// Доменні перелічення (джерело істини для типів і UI-підписів).

export const USER_ROLES = ['admin', 'user'] as const;
export const CURRENCY_CODES = ['UAH', 'USD', 'EUR'] as const;
export const FOREIGN_CURRENCIES = ['USD', 'EUR'] as const;
export const REQUEST_STATUSES = ['in_progress', 'done', 'cancelled'] as const;
export const EDITABLE_STATUSES = ['in_progress'] as const;
export const MARKUP_METHODS = ['rrp', 'markup_on_cost', 'discount_from_rrp', 'manual'] as const;
/** Політика курсу блоку постачальника (F33). Дефолт — курс з останнього прайсу. */
export const RATE_POLICIES = ['price_list', 'manual', 'nbu', 'nbu_adjusted'] as const;
/** Джерело запису в довіднику курсів. */
export const RATE_SOURCES = ['nbu', 'manual'] as const;
export const PRICE_SOURCES = ['import', 'manual', 'request', 'seed'] as const;
/** Колонки прайсу, які зіставляються при завантаженні файлом. */
export const PRICE_COLUMN_ROLES = ['code', 'sku', 'name', 'brand', 'unit', 'purchasePrice', 'currency', 'rrp', 'stock', 'multiplicity', 'minOrderQty'] as const;
export const AVAILABILITY_STATUSES = ['in_stock', 'low_stock', 'out_of_stock', 'on_order', 'unknown'] as const;
export const IMPORT_STATUSES = ['uploaded', 'parsing', 'previewed', 'applying', 'applied', 'failed', 'cancelled'] as const;
export const IMPORT_ROW_ACTIONS = ['create', 'update', 'unchanged', 'error', 'skip'] as const;
export const IMPORT_SOURCES = ['upload', 'url'] as const;
export const KP_VAT_MODES = ['without_vat', 'with_vat', 'no_vat'] as const;
export const PRODUCT_NAME_KINDS = ['work', 'accounting'] as const;
/** Назва в КП: з каталогу / як у клієнта / з каталогу + клієнтська дрібним. */
export const KP_NAME_SOURCES = ['work', 'name1c', 'client', 'work_with_client'] as const;
export const PRICE_ROUNDINGS = ['kopecks', 'integer'] as const;
export const DISCOUNT_FORMULAS = ['percent_off', 'excel_divisor'] as const;
export const FOP_PRICE_BASES = ['net', 'gross'] as const;
export const ATTACHMENT_KINDS = ['client_request', 'kp', 'export', 'other'] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type CurrencyCode = (typeof CURRENCY_CODES)[number];
export type PriceColumnRole = (typeof PRICE_COLUMN_ROLES)[number];
export type ForeignCurrency = (typeof FOREIGN_CURRENCIES)[number];
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export type MarkupMethod = (typeof MARKUP_METHODS)[number];
export type RatePolicy = (typeof RATE_POLICIES)[number];
export type RateSource = (typeof RATE_SOURCES)[number];
export type PriceSource = (typeof PRICE_SOURCES)[number];
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];
export type ImportStatus = (typeof IMPORT_STATUSES)[number];
export type ImportRowAction = (typeof IMPORT_ROW_ACTIONS)[number];
export type ImportSource = (typeof IMPORT_SOURCES)[number];
export type KpVatMode = (typeof KP_VAT_MODES)[number];
export type ProductNameKind = (typeof PRODUCT_NAME_KINDS)[number];
export type KpNameSource = (typeof KP_NAME_SOURCES)[number];
export type PriceRounding = (typeof PRICE_ROUNDINGS)[number];
export type DiscountFormula = (typeof DISCOUNT_FORMULAS)[number];
export type FopPriceBasis = (typeof FOP_PRICE_BASES)[number];
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const DEFAULT_RATE_POLICY: RatePolicy = 'price_list';

// ── Підписи для UI ────────────────────────────────────────────────
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Адміністратор',
  user: 'Менеджер',
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  in_progress: 'В роботі',
  done: 'Виконано',
  cancelled: 'Скасовано',
};

// назви способів — як у правках замовника 25.09 п.11
export const MARKUP_METHOD_LABELS: Record<MarkupMethod, string> = {
  rrp: 'Продаж по РРЦ',
  markup_on_cost: 'Націнка на вхід, %',
  discount_from_rrp: 'Знижка від РРЦ, %',
  manual: 'Вручну',
};

/** Те саме без «, %» — коли далі йде саме значення: «Націнка на вхід 25 %». */
export const MARKUP_METHOD_SHORT_LABELS: Record<MarkupMethod, string> = {
  rrp: 'Продаж по РРЦ',
  markup_on_cost: 'Націнка на вхід',
  discount_from_rrp: 'Знижка від РРЦ',
  manual: 'Вручну',
};

export const RATE_POLICY_LABELS: Record<RatePolicy, string> = {
  price_list: 'З прайсу постачальника',
  manual: 'Вручну',
  nbu: 'НБУ',
  nbu_adjusted: 'НБУ ± %',
};

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  in_stock: 'Є в наявності',
  low_stock: 'Мало',
  out_of_stock: 'Немає',
  on_order: 'Під замовлення',
  unknown: 'Невідомо',
};

export const KP_VAT_MODE_LABELS: Record<KpVatMode, string> = {
  without_vat: 'Ціни без ПДВ',
  with_vat: 'Ціни з ПДВ',
  no_vat: 'Без ПДВ (ФОП)',
};

export const FOP_PRICE_BASIS_LABELS: Record<FopPriceBasis, string> = {
  gross: 'На рівні цін з ПДВ, як у ТОВ',
  net: 'Без ПДВ (дешевше, ніж у ТОВ)',
};

export const KP_NAME_SOURCE_LABELS: Record<KpNameSource, string> = {
  work: 'Назва з каталогу',
  name1c: 'Назва 1С (якщо немає, робоча)',
  client: 'Як у заявці клієнта',
  work_with_client: 'З каталогу + клієнтська дрібним',
};

export const PRICE_ROUNDING_LABELS: Record<PriceRounding, string> = {
  kopecks: 'До копійок',
  integer: 'До цілих гривень',
};

export const DISCOUNT_FORMULA_LABELS: Record<DiscountFormula, string> = {
  percent_off: 'РРЦ × (1 − d%)',
  excel_divisor: 'РРЦ / (1 + d%)',
};

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  UAH: 'грн',
  USD: 'USD',
  EUR: 'EUR',
};
