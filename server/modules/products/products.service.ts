// Каталог: читання зі списками й пошуком, ручне ведення позицій та історія цін.
// Важкий відбір робить база (індекси Product_skuKey_prefix_idx і Product_searchText_idx),
// остаточний порядок і ваги — products.search.
import { Prisma, type Product, type User } from '@prisma/client';
import { planName1cImport } from '@shared/catalog/name1c';
import { normalizeSku } from '@shared/parse';
import { normalizeInputPrice } from '@shared/pricing';
import type {
  Name1cImportResult,
  PriceHistoryEntry,
  ProductDetail,
  ProductPage,
  ProductPickDto,
  ProductPriceUpdateResult,
  RatesPair,
  SkuLookupResult,
  UUID,
} from '@shared/types';
import { prisma } from '../../db';
import { duplicate, notFound } from '../../http/errors';
import { getSettings } from '../settings/settings.service';
import { toPriceHistoryEntry, toProductDetail, toProductListItem, type CatalogContext } from './products.mapper';
import { assertManualPrice, availabilityOf, priceChanged, productOrderBy, searchTextOf, staleBefore, likePattern } from './products.rules';
import {
  compareHits,
  isEmptyPlan,
  lookupKeys,
  lookupSkuMatches,
  rankProduct,
  searchPlan,
  MIN_SKU_PREFIX,
  SEARCH_SCORE,
  type SearchPlan,
} from './products.search';
import type {
  Name1cImportInput,
  ProductInputBody,
  ProductListQueryInput,
  ProductPatchBody,
  ProductPriceUpdateBody,
  ProductSearchQueryInput,
  SkuLookupInput,
} from './products.schemas';

/** Скільки позицій база віддає на ранжування: далі за вагою вони вже не потраплять у видачу. */
const CANDIDATE_CAP = 300;
/** Скільки артикулів за раз шукаємо за префіксом (точні збіги — без обмежень). */
const LOOKUP_PREFIX_KEYS = 100;
const LOOKUP_PREFIX_ROWS = 500;

// ── спільний контекст відповіді ─────────────────────────────────────

/** Постачальники, налаштування й курси НБУ читаємо один раз на запит, а не на кожен рядок. */
async function catalogContext(): Promise<CatalogContext> {
  const now = new Date();
  const [settings, suppliers, rates] = await Promise.all([
    getSettings(),
    prisma.supplier.findMany(),
    prisma.currencyRate.findMany({
      where: { source: 'nbu', rateDate: { lte: now } },
      orderBy: { rateDate: 'desc' },
      distinct: ['currency'],
    }),
  ]);
  const nbu: RatesPair = { USD: null, EUR: null };
  for (const r of rates) if (r.currency !== 'UAH') nbu[r.currency] = r.rate.toNumber();
  return {
    now,
    staleDays: settings.priceStaleDays,
    nbu,
    suppliers: new Map(suppliers.map((s) => [s.id, s])),
  };
}

// ── списки ──────────────────────────────────────────────────────────

/** «Ціна застаріла» для кожного постачальника окремо: у нього може бути власна норма. */
function staleConditions(ctx: CatalogContext): Prisma.ProductWhereInput[] {
  const byDays = new Map<number, UUID[]>();
  for (const s of ctx.suppliers.values()) {
    const days = s.priceStaleDays ?? ctx.staleDays;
    const ids = byDays.get(days);
    if (ids) ids.push(s.id);
    else byDays.set(days, [s.id]);
  }
  return [...byDays].map(([days, ids]) => ({
    supplierId: { in: ids },
    priceUpdatedAt: { lte: staleBefore(ctx.now, days) },
  }));
}

function listWhere(query: ProductListQueryInput, ctx: CatalogContext): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];
  if (query.supplierId) and.push({ supplierId: query.supplierId });
  if (!query.archived) and.push({ isArchived: false });
  if (query.currency) and.push({ currency: query.currency });
  if (query.availability?.length) and.push({ availability: { in: query.availability } });
  if (query.manual) and.push({ priceOrigin: 'manual' });
  if (query.missing) and.push({ missingSince: { not: null } });

  const plan = searchPlan(query.q);
  if (plan.tokens.length) {
    const or: Prisma.ProductWhereInput[] = [{ AND: plan.tokens.map((t) => ({ searchText: { contains: t } })) }];
    if (plan.matchExact) or.unshift({ skuKey: { contains: plan.skuKey } });
    and.push({ OR: or });
  }
  if (query.stale) and.push({ OR: staleConditions(ctx) });
  return and.length ? { AND: and } : {};
}

export async function listProducts(query: ProductListQueryInput): Promise<ProductDetail[]> {
  const ctx = await catalogContext();
  const rows = await prisma.product.findMany({
    where: listWhere(query, ctx),
    orderBy: [{ supplier: { sortOrder: 'asc' } }, { nameWork: 'asc' }],
    skip: query.offset,
    take: query.limit,
  });
  return rows.map((p) => toProductDetail(p, ctx));
}

/** Сторінка номенклатури разом із загальною кількістю — для гортання великого каталогу. */
export async function listProductsPage(query: ProductListQueryInput): Promise<ProductPage> {
  const ctx = await catalogContext();
  const where = listWhere(query, ctx);
  const [total, rows] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: productOrderBy(query.sortField, query.sortDir),
      skip: query.offset,
      take: query.limit,
    }),
  ]);
  return { items: rows.map((p) => toProductDetail(p, ctx)), total };
}

export async function getProduct(id: UUID): Promise<ProductDetail> {
  const ctx = await catalogContext();
  return toProductDetail(await productOrFail(id), ctx);
}

// ── пошук ───────────────────────────────────────────────────────────

/**
 * Кандидати з бази: ті самі умови, що й у rankProduct, але мовою SQL —
 * щоб на 20–50 тис. позицій у пам'ять потрапила лише верхівка списку.
 */
async function searchCandidateIds(plan: SearchPlan, query: ProductSearchQueryInput, cap: number): Promise<UUID[]> {
  const exact = plan.matchExact ? Prisma.sql`(p."skuKey" = ${plan.skuKey})` : Prisma.sql`false`;
  const prefix = plan.matchPrefix
    ? Prisma.sql`(p."skuKey" LIKE ${`${likePattern(plan.skuKey)}%`} ESCAPE '\\')`
    : Prisma.sql`false`;
  const tokenTests = plan.tokens.map(
    (t) => Prisma.sql`(p."searchText" LIKE ${`%${likePattern(t)}%`} ESCAPE '\\')`,
  );
  const matched = tokenTests.length
    ? Prisma.join(
        tokenTests.map((t) => Prisma.sql`(CASE WHEN ${t} THEN 1 ELSE 0 END)`),
        ' + ',
      )
    : Prisma.sql`0`;
  const enough = tokenTests.length ? Prisma.sql`c.matched >= ${plan.minMatched}` : Prisma.sql`false`;

  const filters: Prisma.Sql[] = [Prisma.sql`(${Prisma.join([exact, prefix, ...tokenTests], ' OR ')})`];
  if (query.supplierId) filters.push(Prisma.sql`p."supplierId" = ${query.supplierId}`);
  if (!query.includeArchived) filters.push(Prisma.sql`p."isArchived" = false`);

  // ваги ті самі, що в SEARCH_SCORE: тут вони лише відсікають зайве, точний бал рахує rankProduct
  const rank = Prisma.raw(
    `(c.sku_exact * ${SEARCH_SCORE.skuExact} + c.sku_prefix * ${SEARCH_SCORE.skuPrefix} + c.matched * ${SEARCH_SCORE.perToken})`,
  );

  const rows = await prisma.$queryRaw<{ id: UUID }[]>(Prisma.sql`
    SELECT c.id FROM (
      SELECT p.id,
             (CASE WHEN ${exact} THEN 1 ELSE 0 END) AS sku_exact,
             (CASE WHEN ${prefix} THEN 1 ELSE 0 END) AS sku_prefix,
             (${matched}) AS matched
      FROM "Product" p
      WHERE ${Prisma.join(filters, ' AND ')}
    ) c
    WHERE c.sku_exact = 1 OR c.sku_prefix = 1 OR ${enough}
    ORDER BY ${rank} DESC, c.id
    LIMIT ${cap}
  `);
  return rows.map((r) => r.id);
}

export async function searchProducts(query: ProductSearchQueryInput): Promise<ProductPickDto[]> {
  const ctx = await catalogContext();
  const plan = searchPlan(query.q);

  // порожній запит — просто початок каталогу за назвою (як у пікері до першого символу)
  if (!query.q) {
    const rows = await prisma.product.findMany({
      where: {
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        ...(query.includeArchived ? {} : { isArchived: false }),
      },
      orderBy: { nameWork: 'asc' },
      take: query.limit,
    });
    return rows.map((p) => ({ ...toProductListItem(toProductDetail(p, ctx)), matchKind: 'text' as const, score: 0 }));
  }
  if (isEmptyPlan(plan)) return [];

  const ids = await searchCandidateIds(plan, query, Math.max(query.limit * 5, CANDIDATE_CAP));
  if (!ids.length) return [];
  const rows = await prisma.product.findMany({ where: { id: { in: ids } } });

  const hits: ProductPickDto[] = [];
  for (const p of rows) {
    const rank = rankProduct({ skuKey: p.skuKey, searchText: p.searchText, availability: p.availability }, plan);
    if (!rank) continue;
    hits.push({ ...toProductListItem(toProductDetail(p, ctx)), matchKind: rank.kind, score: rank.score });
  }
  hits.sort(compareHits);
  return hits.slice(0, query.limit);
}

export async function lookupSkus(body: SkuLookupInput): Promise<SkuLookupResult> {
  const ctx = await catalogContext();
  const keys = lookupKeys(body.skus);
  const pool: Prisma.ProductWhereInput = {
    isArchived: false,
    ...(body.supplierId ? { supplierId: body.supplierId } : {}),
  };

  const exactRows = keys.length ? await prisma.product.findMany({ where: { ...pool, skuKey: { in: keys } } }) : [];
  const found = new Set(exactRows.map((p) => p.skuKey));
  // за префіксом добираємо лише ті артикули, яких немає в каталозі точно
  const missing = keys.filter((k) => k.length >= MIN_SKU_PREFIX && !found.has(k)).slice(0, LOOKUP_PREFIX_KEYS);
  const prefixRows = missing.length
    ? await prisma.product.findMany({
        where: { ...pool, OR: missing.map((k) => ({ skuKey: { startsWith: k } })) },
        orderBy: { skuKey: 'asc' },
        take: LOOKUP_PREFIX_ROWS,
      })
    : [];

  // точні й префіксні вибірки перетинаються — у список ранжування позиція має потрапити один раз
  const unique = [...new Map([...exactRows, ...prefixRows].map((p) => [p.id, p])).values()];
  const matches = lookupSkuMatches(unique, body.skus);
  const results: SkuLookupResult['results'] = {};
  for (const [raw, list] of Object.entries(matches)) {
    results[raw] = list.map((m) => ({
      ...toProductListItem(toProductDetail(m.row, ctx)),
      matchKind: m.kind,
      score: m.score,
    }));
  }
  return { results };
}

// ── ручне ведення каталогу ──────────────────────────────────────────

export async function createProduct(input: ProductInputBody, actor: User): Promise<ProductDetail> {
  const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true } });
  if (!supplier) throw notFound('Постачальника не знайдено');

  const skuKey = normalizeSku(input.sku);
  const taken = await prisma.product.findUnique({
    where: { supplierId_skuKey: { supplierId: input.supplierId, skuKey } },
    select: { id: true },
  });
  if (taken) throw duplicate(`Артикул ${input.sku} вже є в каталозі цього постачальника`);

  const settings = await getSettings();
  const purchasePrice =
    input.purchasePrice != null
      ? normalizeInputPrice(input.purchasePrice, !!input.priceIncludesVat, settings.vatRatePct)
      : null;
  const stockQty = input.stockQty;
  const availability = input.availability ?? availabilityOf(stockQty);
  const now = new Date();

  const created = await prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        supplierId: input.supplierId,
        sku: input.sku,
        skuKey,
        nameWork: input.nameWork,
        name1c: input.name1c,
        searchText: searchTextOf({ sku: input.sku, nameWork: input.nameWork, name1c: input.name1c, brand: input.brand }),
        brand: input.brand,
        unitCode: input.unitCode,
        currency: input.currency,
        purchasePrice,
        rrp: input.rrp,
        multiplicity: input.multiplicity,
        minOrderQty: input.minOrderQty,
        stockQty,
        availability,
        productUrl: input.productUrl,
        notes: input.notes,
        priceOrigin: 'manual',
        priceUpdatedAt: now,
      },
    });
    await tx.priceHistory.create({
      data: {
        productId: product.id,
        effectiveAt: now,
        currency: product.currency,
        purchasePrice,
        rrp: input.rrp,
        stockQty,
        availability,
        origin: 'manual',
        userId: actor.id,
        note: 'Товар створено вручну',
      },
    });
    return product;
  });

  const ctx = await catalogContext();
  return toProductDetail(created, ctx);
}

export async function updateProduct(id: UUID, patch: ProductPatchBody): Promise<ProductDetail> {
  const current = await productOrFail(id);
  const next = {
    nameWork: patch.nameWork ?? current.nameWork,
    name1c: patch.name1c !== undefined ? patch.name1c : current.name1c,
    brand: patch.brand !== undefined ? patch.brand : current.brand,
  };
  const updated = await prisma.product.update({
    where: { id },
    data: {
      ...next,
      searchText: searchTextOf({ sku: current.sku, ...next }),
      ...(patch.unitCode !== undefined ? { unitCode: patch.unitCode } : {}),
      ...(patch.multiplicity !== undefined ? { multiplicity: patch.multiplicity } : {}),
      ...(patch.minOrderQty !== undefined ? { minOrderQty: patch.minOrderQty } : {}),
      ...(patch.productUrl !== undefined ? { productUrl: patch.productUrl } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.isArchived !== undefined ? { isArchived: patch.isArchived } : {}),
    },
  });
  const ctx = await catalogContext();
  return toProductDetail(updated, ctx);
}

export async function updateProductPrice(
  id: UUID,
  input: ProductPriceUpdateBody,
  actor: User,
): Promise<ProductPriceUpdateResult> {
  const current = await productOrFail(id);
  assertManualPrice(current.priceOrigin);
  // вхід, введений з ПДВ, зберігається без ПДВ (Ф1)
  const purchasePrice =
    input.priceIncludesVat && input.purchasePrice != null
      ? normalizeInputPrice(input.purchasePrice, true, (await getSettings()).vatRatePct)
      : input.purchasePrice;

  const stockQty = input.stockQty !== undefined ? input.stockQty : decimalOrNull(current.stockQty);
  const availability =
    input.availability ?? (input.stockQty !== undefined ? availabilityOf(input.stockQty) : current.availability);
  const before = {
    currency: current.currency,
    purchasePrice: decimalOrNull(current.purchasePrice),
    rrp: decimalOrNull(current.rrp),
    stockQty: decimalOrNull(current.stockQty),
    availability: current.availability,
  };
  const after = { currency: input.currency, purchasePrice, rrp: input.rrp, stockQty, availability };
  const changed = priceChanged(before, after);
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.update({
      where: { id },
      data: { ...after, priceUpdatedAt: now, priceOrigin: 'manual' },
    });
    if (!changed) return { product, entry: null };
    const entry = await tx.priceHistory.create({
      data: {
        productId: id,
        effectiveAt: now,
        currency: input.currency,
        purchasePrice,
        rrp: input.rrp,
        stockQty,
        availability,
        origin: 'manual',
        userId: actor.id,
        note: input.note,
      },
      include: { user: true },
    });
    return { product, entry };
  });

  const ctx = await catalogContext();
  return {
    product: toProductDetail(result.product, ctx),
    historyEntry: result.entry ? toPriceHistoryEntry(result.entry) : null,
  };
}

export async function getPriceHistory(id: UUID): Promise<PriceHistoryEntry[]> {
  await productOrFail(id);
  const rows = await prisma.priceHistory.findMany({
    where: { productId: id },
    orderBy: [{ effectiveAt: 'desc' }, { id: 'desc' }],
    include: { user: true },
  });
  return rows.map(toPriceHistoryEntry);
}

// ── дрібниці ────────────────────────────────────────────────────────

export async function productOrFail(id: UUID): Promise<Product> {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw notFound('Товар не знайдено');
  return product;
}

const decimalOrNull = (v: Prisma.Decimal | null): number | null => (v === null ? null : v.toNumber());

const NAME1C_BATCH = 1000;
const NOT_FOUND_LIMIT = 500;

/**
 * Назви 1С з Excel (п.9.2 правок): «артикул → назва 1С» у товари постачальника.
 * Оновлення прайсів цю назву не чіпають; пошук каталогу враховує її (searchText).
 */
export async function importName1c(input: Name1cImportInput): Promise<Name1cImportResult> {
  const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true } });
  if (!supplier) throw notFound('Постачальника не знайдено');
  // каталог постачальника — до ~20 тис. позицій: беремо весь, а не IN на тисячі артикулів
  const products = await prisma.product.findMany({
    where: { supplierId: input.supplierId },
    select: { id: true, sku: true, skuKey: true, nameWork: true, name1c: true, brand: true },
  });
  const plan = planName1cImport(input.rows, products);
  if (!input.dryRun && plan.updates.length) {
    const byId = new Map(products.map((p) => [p.id, p]));
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < plan.updates.length; i += NAME1C_BATCH) {
        const values = plan.updates.slice(i, i + NAME1C_BATCH).map((u) => {
          const p = byId.get(u.id)!;
          const searchText = searchTextOf({ sku: p.sku, nameWork: p.nameWork, name1c: u.name1c, brand: p.brand });
          return Prisma.sql`(${u.id}::text, ${u.name1c}::text, ${searchText}::text)`;
        });
        await tx.$executeRaw`
          UPDATE "Product" AS p SET
            "name1c" = v.name1c,
            "searchText" = v.search_text,
            "updatedAt" = (${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')
          FROM (VALUES ${Prisma.join(values)}) AS v(id, name1c, search_text)
          WHERE p.id = v.id`;
      }
    });
  }
  return {
    matched: plan.matched,
    updated: plan.updates.length,
    unchanged: plan.unchanged,
    notFound: plan.notFound.slice(0, NOT_FOUND_LIMIT),
    notFoundCount: plan.notFound.length,
    skipped: plan.skipped,
    duplicates: plan.duplicates,
  };
}
