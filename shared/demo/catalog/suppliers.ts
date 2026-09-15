// Демо-постачальники (вигадані). s1..s3 відповідають ролям постачальників з прикладу клієнта;
// реальні назви/префікси артикулів накладаються лише локальним файлом оверрайдів поза git.

import type { Currency, DemoSupplier, SupplierKey } from './types';

export const SUPPLIER_KEYS: readonly SupplierKey[] = ['s1', 's2', 's3', 's4'];

export const DEMO_SUPPLIERS: readonly DemoSupplier[] = [
  {
    seedKey: 's1',
    name: 'САНТЕХ-ІМПОРТ',
    skuPrefix: 'СІ',
    profile: 'Кераміка і сантехніка: унітази, інсталяції, раковини, мийки, піддони, змішувачі',
    defaultCurrency: 'USD',
    priceListIncludesVat: false,
    supplierMarkupPercent: 0,
    rates: { USD: 45, EUR: 52.1 },
    minOrderUah: 3000,
    deliveryNote: 'Доставка: вт, сб. Самовивіз зі складу — пн–пт до 17:00',
    websiteSearchUrlTemplate: 'https://santeh-import.example.com/search?q={query}',
    priceListAgeDays: 1,
  },
  {
    seedKey: 's2',
    name: 'АКВА-ТРЕЙД',
    skuPrefix: 'АТ',
    profile: 'Імпортер: змішувачі, шланги, фільтри, американки, крани, латунні фітинги',
    defaultCurrency: 'USD',
    priceListIncludesVat: false,
    supplierMarkupPercent: 0,
    rates: { USD: 44.9, EUR: 52.2 },
    minOrderUah: 6000,
    deliveryNote: 'Доставка щодня, окрім нд. Замовлення до 12:00 — відвантаження в той самий день',
    websiteSearchUrlTemplate: 'https://aqua-trade.example.com/catalog/search?text={query}',
    priceListAgeDays: 3,
  },
  {
    seedKey: 's3',
    name: 'ТЕРМО-ПЛАСТ',
    skuPrefix: 'ТП',
    profile: 'ППР, PEX і металопластикові труби та фітинги, клапани, кріплення',
    defaultCurrency: 'UAH',
    priceListIncludesVat: false,
    supplierMarkupPercent: 2,
    rates: { USD: 45, EUR: 52 },
    minOrderUah: 1500,
    deliveryNote: 'B2B-портал, доставка пн, ср, пт. Ціни прайсу + 2% націнки постачальника',
    websiteSearchUrlTemplate: 'https://b2b.termo-plast.example.com/search?q={query}',
    priceListAgeDays: 0,
  },
  {
    seedKey: 's4',
    name: 'ГІДРО-ОПТ',
    skuPrefix: 'ГО',
    profile: 'Широкий асортимент: запірна арматура, радіатори, насоси, бойлери, каналізація ПВХ, лічильники',
    defaultCurrency: 'UAH',
    priceListIncludesVat: true,
    supplierMarkupPercent: 0,
    rates: { USD: 45.1, EUR: 52.3 },
    minOrderUah: 5000,
    deliveryNote: 'Прайс з ПДВ. Доставка по місту безкоштовно від 5 000 грн',
    websiteSearchUrlTemplate: 'https://gidro-opt.example.com/?s={query}',
    priceListAgeDays: 5,
  },
];

/** Частки валют у прайсі постачальника (UAH, USD, EUR). */
export const CURRENCY_MIX: Record<SupplierKey, readonly [Currency, number][]> = {
  s1: [['USD', 0.6], ['EUR', 0.33], ['UAH', 0.07]],
  s2: [['USD', 0.55], ['EUR', 0.33], ['UAH', 0.12]],
  s3: [['UAH', 0.65], ['USD', 0.2], ['EUR', 0.15]],
  s4: [['UAH', 1]],
};

/** Індекс «стилю назв» постачальника: кожен пише назви трохи по-своєму. */
export const NAME_STYLE: Record<SupplierKey, 0 | 1 | 2 | 3> = { s1: 0, s2: 1, s3: 2, s4: 3 };

export function supplierByKey(key: SupplierKey): DemoSupplier {
  const s = DEMO_SUPPLIERS.find((x) => x.seedKey === key);
  if (!s) throw new Error(`Unknown supplier ${key}`);
  return s;
}

/** Курс постачальника для валюти (UAH → 1). */
export function supplierRate(s: DemoSupplier, currency: Currency): number {
  return currency === 'UAH' ? 1 : s.rates[currency];
}
