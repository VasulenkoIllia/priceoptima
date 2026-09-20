// Каталог у базі → DTO фронта. Decimal перетворюємо на number,
// ціну в гривні й ознаку «ціна застаріла» рахують правила з shared/pricing — тут їх не дублюємо.
import type { PriceHistory, Prisma, Product, Supplier, User } from '@prisma/client';
import { toIsoDate } from '@shared/format';
import { isPriceStale, priceAgeDays, round2, supplierDefaultRates } from '@shared/pricing';
import type { PriceHistoryEntry, ProductDetail, ProductListItem, RatesPair, SupplierRef, UUID } from '@shared/types';

/** Спільні для всієї відповіді дані: читаємо їх один раз, а не на кожен рядок каталогу. */
export interface CatalogContext {
  now: Date;
  /** Глобальна норма застарілості ціни (дні) з налаштувань. */
  staleDays: number;
  /** Курси НБУ на сьогодні — запасний варіант для курсів постачальника (F33). */
  nbu: RatesPair;
  suppliers: ReadonlyMap<UUID, Supplier>;
}

/** Товар із приєднаним користувачем в історії цін. */
export type PriceHistoryRow = PriceHistory & { user: User | null };

const num = (v: Prisma.Decimal | null): number | null => (v === null ? null : v.toNumber());

/** Поля постачальника, з якими працюють правила курсів (shared/pricing). */
export function supplierRefOf(s: Supplier): SupplierRef {
  return {
    id: s.id,
    name: s.name,
    logoUrl: s.logoUrl,
    color: s.color,
    defaultCurrency: s.defaultCurrency,
    pricesIncludeVat: s.pricesIncludeVat,
    supplierMarkupPct: s.supplierMarkupPct.toNumber(),
    ratePolicy: s.ratePolicy,
    rateAdjustPct: s.rateAdjustPct.toNumber(),
    manualRateUsd: num(s.manualRateUsd),
    manualRateEur: num(s.manualRateEur),
    priceListRates: {
      USD: num(s.priceListRateUsd),
      EUR: num(s.priceListRateEur),
      date: s.priceListRateDate ? toIsoDate(s.priceListRateDate) : null,
    },
    minOrderAmount: num(s.minOrderAmount),
    priceStaleDays: s.priceStaleDays,
    searchUrlTemplate: s.searchUrlTemplate,
    website: s.website,
    b2bUrl: s.b2bUrl,
  };
}

export function toProductDetail(p: Product, ctx: CatalogContext): ProductDetail {
  const supplier = ctx.suppliers.get(p.supplierId);
  const priceUpdatedAt = p.priceUpdatedAt ? p.priceUpdatedAt.toISOString() : null;
  const purchasePrice = num(p.purchasePrice);
  // НОМ-3: у каталозі — за курсом постачальника; націнку постачальника й курс блоку застосовують лише в заявці
  let purchasePriceUah: number | null = null;
  if (purchasePrice != null) {
    const rates = supplier ? supplierDefaultRates(supplierRefOf(supplier), ctx.nbu) : ctx.nbu;
    const rate = p.currency === 'UAH' ? 1 : rates[p.currency];
    if (rate != null) purchasePriceUah = round2(purchasePrice * rate);
  }
  const staleDays = supplier?.priceStaleDays ?? ctx.staleDays;
  return {
    id: p.id,
    version: p.version,
    supplierId: p.supplierId,
    supplierName: supplier?.name ?? '—',
    sku: p.sku,
    nameWork: p.nameWork,
    name1c: p.name1c,
    brand: p.brand,
    unitCode: p.unitCode,
    currency: p.currency,
    purchasePrice,
    rrp: num(p.rrp),
    purchasePriceUah,
    multiplicity: p.multiplicity.toNumber(),
    stockQty: num(p.stockQty),
    availability: p.availability,
    priceUpdatedAt,
    isStale: isPriceStale(priceAgeDays(priceUpdatedAt, ctx.now), staleDays),
    missingSince: p.missingSince ? toIsoDate(p.missingSince) : null,
    imageUrl: p.imageUrl,
    productUrl: p.productUrl,
    isArchived: p.isArchived,
    minOrderQty: num(p.minOrderQty),
    notes: p.notes,
    priceSource: p.priceOrigin,
    // прив'язка до конкретного оновлення прайсу з'явиться разом із модулем імпорту
    lastImportId: null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** ProductListItem — та сама позиція без полів картки (для результатів пошуку). */
export function toProductListItem(detail: ProductDetail): ProductListItem {
  const {
    minOrderQty: _minOrderQty,
    notes: _notes,
    priceSource: _priceSource,
    lastImportId: _lastImportId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...item
  } = detail;
  return item;
}

export function toPriceHistoryEntry(row: PriceHistoryRow): PriceHistoryEntry {
  return {
    id: row.id,
    productId: row.productId,
    effectiveAt: row.effectiveAt.toISOString(),
    currency: row.currency,
    purchasePrice: num(row.purchasePrice),
    rrp: num(row.rrp),
    stockQty: num(row.stockQty),
    availability: row.availability,
    source: row.origin,
    importId: row.importRunId === null ? null : String(row.importRunId),
    // заявки з'являються в модулі 2 — поки ціну змінюють лише прайс і каталог
    requestId: null,
    requestNumber: null,
    user: row.user ? { id: row.user.id, shortName: row.user.shortName } : null,
    note: row.note,
  };
}
