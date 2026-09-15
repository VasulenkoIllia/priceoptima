// Типи демо-каталогу для сіду БД / UI-прототипу.
// Усі назви постачальників, артикули й ціни — вигадані (крім 12 позицій з прикладу клієнта).

export type Currency = 'UAH' | 'USD' | 'EUR';

export type SupplierKey = 's1' | 's2' | 's3' | 's4';

export interface DemoSupplier {
  seedKey: SupplierKey;
  name: string;
  skuPrefix: string;
  /** Спеціалізація постачальника. */
  profile: string;
  defaultCurrency: Currency;
  /** Чи ціни в прайсі постачальника вказані з ПДВ (лише для демонстрації імпорту; purchasePrice у каталозі завжди без ПДВ). */
  priceListIncludesVat: boolean;
  /** Націнка постачальника на ціни прайсу, % (додається до ВХІД). */
  supplierMarkupPercent: number;
  rates: { USD: number; EUR: number };
  minOrderUah: number;
  deliveryNote: string;
  /** Демо-шаблон пошуку на сайті постачальника, {query} — URL-кодований запит. */
  websiteSearchUrlTemplate: string;
  /** Скільки днів тому постачальник востаннє надсилав прайс (для демо застарілості). */
  priceListAgeDays: number;
}

export interface DemoPricePoint {
  daysAgo: number;
  purchasePrice: number;
  rrp: number | null;
  stockQty: number | null;
}

export interface DemoProduct {
  supplierKey: SupplierKey;
  sku: string;
  nameWork: string;
  name1c: string;
  unit: string;
  currency: Currency;
  /** Вхідна ціна у валюті, БЕЗ ПДВ (нормалізовано навіть для прайсів з ПДВ). */
  purchasePrice: number;
  /** РРЦ у валюті, З ПДВ. */
  rrp: number | null;
  stockQty: number | null;
  multiplicity: number;
  minOrderQty: number;
  /** Ідентифікатор категорії (див. DemoCatalog.categories). */
  category: string;
  brand: string;
  /** Однаковий для «того самого» товару в різних постачальників. */
  canonicalKey: string;
  /** Рядок аркуша «Номенклатура» у прикладі клієнта (напр. "Номенклатура!A4"). */
  excelRef?: string;
  /** Нормалізовані атрибути (розмір, тип, PN...) — для фільтрів і демо-підбору. */
  attrs: Record<string, string | number>;
  /**
   * Історія цін за 60 днів: перший запис — початкове завантаження (daysAgo = 60),
   * далі 0–5 змін; останній запис збігається з поточними значеннями.
   */
  priceHistory: DemoPricePoint[];
  /** Скільки днів тому ціну востаннє підтверджено імпортом/вручну (≤ daysAgo останньої зміни). */
  priceCheckedDaysAgo: number;
}

export interface DemoOffer {
  supplierKey: SupplierKey;
  /** Виключено з розрахунку (залишається видимою альтернативою). */
  excluded?: boolean;
  /** Затверджено менеджером («галочка»): у цього постачальника беремо. Не більше однієї на рядок. */
  approved?: boolean;
}

export interface DemoRequestLine {
  /** Як написав клієнт — зі скороченнями/помилками. */
  clientName: string;
  unit: string;
  qty: number;
  /** Який товар мається на увазі (null — у каталозі немає відповідника). */
  canonicalKey: string | null;
  /** Які постачальники вже підібрані. */
  offers: DemoOffer[];
  note?: string;
}

/** Лише 3 статуси — як в Excel клієнта: «В роботі», «Виконано», «Скасовано». */
export type DemoRequestStatus = 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

export type DemoMarkupMethod = 'RRP' | 'MARKUP_PERCENT' | 'DISCOUNT_FROM_RRP';

export interface DemoRequest {
  seedKey: string;
  clientKey: string;
  status: DemoRequestStatus;
  daysAgo: number;
  title?: string;
  supplierKeys: SupplierKey[];
  lines: DemoRequestLine[];
  /** Сформовано КП. */
  hasKp?: boolean;
  /** Індекси рядків, погоджених клієнтом після КП. */
  approvedLineIdx?: number[];
  note?: string;
  cancelReason?: string;
  markup?: { method: DemoMarkupMethod; value?: number };
}

export interface DemoCategory {
  id: string;
  title: string;
}

export interface DemoCatalog {
  suppliers: DemoSupplier[];
  categories: DemoCategory[];
  products: DemoProduct[];
  requests: DemoRequest[];
  /** «Брудні» варіанти клієнтських назв для кожного canonicalKey (демо пошуку/підказок). */
  clientNameVariants: Record<string, string[]>;
}
