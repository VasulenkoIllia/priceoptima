// Каталог у mock: DTO товарів, пошук (артикул/назви) і пошук за артикулами.
import { searchTokens, normalizeSku } from '@shared/parse';
import { isPriceStale, priceAgeDays, round2, supplierDefaultRates } from '@shared/pricing';
import type { AvailabilityStatus } from '@shared/enums';
import type {
  ProductDetail,
  ProductMatchKind,
  ProductPickDto,
  ProductSearchQuery,
  RatesPair,
  SkuLookupBody,
  SkuLookupResult,
  UUID,
} from '@shared/types';
import { toSupplierRef } from '@/lib/supplierRef';
import type { StoredProduct, StoredSupplier } from './db';

export interface ProductDtoContext {
  now: Date;
  /** Глобальна норма застарілості (дні). */
  staleDays: number;
  /** Курси НБУ сьогодні — fallback для курсів постачальника (F33). */
  nbu: RatesPair;
  suppliers: ReadonlyMap<UUID, StoredSupplier>;
}

export function toProductDetail(p: StoredProduct, ctx: ProductDtoContext): ProductDetail {
  const supplier = ctx.suppliers.get(p.supplierId);
  const { skuKey: _skuKey, searchText: _searchText, ...rest } = p;
  // НОМ-3: у каталозі — за курсом постачальника; націнку постачальника й курс блоку застосовують лише в заявці
  let purchasePriceUah: number | null = null;
  if (p.purchasePrice != null) {
    const rates = supplier ? supplierDefaultRates(toSupplierRef(supplier), ctx.nbu) : ctx.nbu;
    const rate = p.currency === 'UAH' ? 1 : rates[p.currency];
    if (rate != null) purchasePriceUah = round2(p.purchasePrice * rate);
  }
  const staleDays = supplier?.priceStaleDays ?? ctx.staleDays;
  return {
    ...rest,
    supplierName: supplier?.name ?? '—',
    purchasePriceUah,
    isStale: isPriceStale(priceAgeDays(p.priceUpdatedAt, ctx.now), staleDays),
  };
}

const AVAILABILITY_BONUS: Record<AvailabilityStatus, number> = {
  in_stock: 3,
  low_stock: 2,
  on_order: 1,
  unknown: 1,
  out_of_stock: 0,
};

/** Токени пошуку; «д/раковини» → «раковини» (скорочення через «/» розбиваємо, розміри на кшталт 1/2 лишаємо). */
function queryTokens(q: string): string[] {
  const out: string[] = [];
  for (const t of searchTokens(q)) {
    if (/\p{L}\/\p{L}/u.test(t)) out.push(...t.split('/'));
    else out.push(t);
  }
  return out.filter((t) => t.length >= 2);
}

function inPool(p: StoredProduct, supplierId: UUID | null | undefined, includeArchived: boolean | undefined): boolean {
  return (!supplierId || p.supplierId === supplierId) && (includeArchived || !p.isArchived);
}

/**
 * Ранжування (§6.7): точний артикул > префікс артикулу > усі токени назви > частина токенів (≥ половини) > наявність > ціна.
 */
export function searchProductsIn(
  products: Iterable<StoredProduct>,
  query: ProductSearchQuery,
  ctx: ProductDtoContext,
): ProductPickDto[] {
  const limit = Math.min(50, Math.max(1, query.limit ?? 20));
  const raw = (query.q ?? '').trim();
  const pool = [...products].filter((p) => inPool(p, query.supplierId, query.includeArchived));
  if (!raw) {
    return pool
      .sort((a, b) => a.nameWork.localeCompare(b.nameWork, 'uk'))
      .slice(0, limit)
      .map((p) => ({ ...toProductDetailList(p, ctx), matchKind: 'text' as const, score: 0 }));
  }
  const skuKey = normalizeSku(raw);
  const tokens = queryTokens(raw);
  const minMatched = tokens.length ? Math.max(1, Math.ceil(tokens.length / 2)) : Number.POSITIVE_INFINITY;

  const hits: ProductPickDto[] = [];
  for (const p of pool) {
    let kind: ProductMatchKind | null = null;
    let score = 0;
    if (skuKey.length >= 2 && p.skuKey === skuKey) {
      kind = 'sku_exact';
      score = 1000;
    } else if (skuKey.length >= 3 && p.skuKey.startsWith(skuKey)) {
      kind = 'sku_prefix';
      score = 500;
    } else if (tokens.length) {
      let matched = 0;
      for (const t of tokens) if (p.searchText.includes(t)) matched++;
      if (matched === tokens.length) {
        kind = 'text';
        score = 100 + matched * 10;
      } else if (matched >= minMatched) {
        kind = 'fuzzy';
        score = matched * 10;
      }
    }
    if (!kind) continue;
    hits.push({ ...toProductDetailList(p, ctx), matchKind: kind, score: score + AVAILABILITY_BONUS[p.availability] });
  }
  hits.sort(
    (a, b) =>
      b.score - a.score ||
      (a.purchasePriceUah ?? Number.POSITIVE_INFINITY) - (b.purchasePriceUah ?? Number.POSITIVE_INFINITY) ||
      a.nameWork.localeCompare(b.nameWork, 'uk'),
  );
  return hits.slice(0, limit);
}

/** Пошук за списком артикулів: точні збіги; якщо немає — до 5 за префіксом. Ключ результату — вхідний артикул як є. */
export function lookupSkusIn(products: Iterable<StoredProduct>, body: SkuLookupBody, ctx: ProductDtoContext): SkuLookupResult {
  const pool = [...products].filter((p) => inPool(p, body.supplierId, false));
  const byKey = new Map<string, StoredProduct[]>();
  for (const p of pool) {
    const list = byKey.get(p.skuKey);
    if (list) list.push(p);
    else byKey.set(p.skuKey, [p]);
  }
  const results: SkuLookupResult['results'] = {};
  for (const raw of body.skus) {
    const key = normalizeSku(raw ?? '');
    if (!key) {
      results[raw] = [];
      continue;
    }
    const exact = byKey.get(key);
    if (exact?.length) {
      results[raw] = exact.map((p) => ({ ...toProductDetailList(p, ctx), matchKind: 'sku_exact' as const, score: 1000 }));
      continue;
    }
    results[raw] =
      key.length >= 3
        ? pool
            .filter((p) => p.skuKey.startsWith(key))
            .slice(0, 5)
            .map((p) => ({ ...toProductDetailList(p, ctx), matchKind: 'sku_prefix' as const, score: 500 }))
        : [];
  }
  return { results };
}

/** ProductListItem без полів картки (для результатів пошуку). */
function toProductDetailList(p: StoredProduct, ctx: ProductDtoContext) {
  const {
    minOrderQty: _minOrderQty,
    notes: _notes,
    priceSource: _priceSource,
    lastImportId: _lastImportId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...item
  } = toProductDetail(p, ctx);
  return item;
}
