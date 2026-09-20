// Оновлення прайсів: вигрузка за посиланням або рядки файлу → звірка з каталогом (plan.ts) → запис змін.
// Усі зміни одного оновлення пишемо однією транзакцією великими пакетами (без запиту на кожен рядок):
// або прайс застосовано повністю, або не застосовано нічого й у журналі — запис із помилкою.
import { Prisma, type PriceImportFile, type Supplier, type SupplierPriceFeed, type User } from '@prisma/client';
import { getSettings } from '../settings/settings.service';
import { FEED_CONNECTOR_INFO, isFeedConnector, type FeedConnector } from '@shared/catalog/connectors';
import type { RatesPair, UUID } from '@shared/types';
import { config } from '../../config';
import { prisma } from '../../db';
import { ApiError, notFound, validationError } from '../../http/errors';
import { dateOnly } from '../../lib/mapping';
import { createSecretBox } from '../../lib/secretBox';
import { logger } from '../../logger';
import { imageUrlOf } from '../images/images.mapper';
import { removeImageFile, safeFileName, saveImageFile } from '../images/images.storage';
import { today } from '../rates/rates.service';
import { listUnits } from '../units/units.service';
import { parseFeed, type AdapterResult, type PriceRow } from './connectors';
import { importRowsToPriceRows } from './importRows';
import {
  isRejected,
  planApply,
  type ApplyPlan,
  type ExistingProduct,
  type PlanCounters,
  type PlanReport,
  type ProductUpdate,
  type SourceRoles,
} from './plan';
import { downloadFeed } from './priceUpdates.fetch';
import {
  toDryRunDetail,
  toPriceUpdateDetail,
  toPriceUpdateDto,
  warningsText,
  type PriceUpdateRunDetail,
  type PriceUpdateRunDto,
} from './priceUpdates.mapper';
import {
  archiveCutoff,
  feedHourOf,
  priceFileStoredPath,
  rolesFor,
  vatNormalizedRows,
} from './priceUpdates.rules';
import type { ImportBody, PriceUpdatesQuery } from './priceUpdates.schemas';

// той самий ключ, що й у довіднику постачальників: секрет вигрузки шифрує suppliers.service
const secrets = createSecretBox(config.SESSION_SECRET);

/** Розміри пакетів: у межах ліміту параметрів PostgreSQL (65 535 на запит) із запасом. */
const CREATE_BATCH = 1000;
const UPDATE_BATCH = 1000;
const ID_BATCH = 5000;
const INSERT_BATCH = 2000;
/** Скільки може тривати запис одного оновлення (20 тис. позицій пишуться за секунди). */
const APPLY_TIMEOUT_MS = 5 * 60 * 1000;
const APPLY_MAX_WAIT_MS = 30 * 1000;

const RUN_INCLUDE = { user: true, file: true } satisfies Prisma.PriceImportRunInclude;

type SupplierWithFeed = Supplier & { feed: SupplierPriceFeed | null };

/** Одне оновлення постачальника за раз: паралельні запуски створювали б ті самі товари двічі. */
const running = new Set<UUID>();

async function withSupplierLock<T>(supplierId: UUID, task: () => Promise<T>): Promise<T> {
  if (running.has(supplierId)) {
    throw new ApiError('INVALID_STATE', 'Прайс цього постачальника вже оновлюється — дочекайтесь завершення');
  }
  running.add(supplierId);
  try {
    return await task();
  } finally {
    running.delete(supplierId);
  }
}

interface RunContext {
  supplier: SupplierWithFeed;
  source: 'auto' | 'file';
  user: User | null;
  dryRun: boolean;
  startedAt: Date;
  fileId: string | null;
  fileName: string | null;
}

interface ParsedPrice {
  rows: PriceRow[];
  rates: RatesPair | null;
  warnings: string[];
  roles: SourceRoles;
  markMissing: boolean;
}

// ── журнал ──────────────────────────────────────────────────────────

export async function listPriceUpdates(query: PriceUpdatesQuery): Promise<PriceUpdateRunDto[]> {
  const rows = await prisma.priceImportRun.findMany({
    where: query.supplierId ? { supplierId: query.supplierId } : {},
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    take: query.limit,
    include: RUN_INCLUDE,
  });
  return rows.map(toPriceUpdateDto);
}

export async function getPriceUpdate(id: number): Promise<PriceUpdateRunDetail> {
  const row = await prisma.priceImportRun.findUnique({ where: { id }, include: RUN_INCLUDE });
  if (!row) throw notFound('Запис журналу оновлень не знайдено');
  return toPriceUpdateDetail(row);
}

// ── оновлення за посиланням ─────────────────────────────────────────

/** «Оновити зараз» або щоденний розклад (user = null). */
export async function runFeedUpdate(
  supplierId: UUID,
  options: { user: User | null; dryRun?: boolean },
): Promise<PriceUpdateRunDetail> {
  const supplier = await supplierOrFail(supplierId);
  const feed = supplier.feed;
  if (!feed?.url) throw validationError('У постачальника не налаштоване посилання на вигрузку');
  if (feed.kind === 'manual') {
    throw validationError('Прайс цього постачальника завантажують файлом — оновлення за посиланням вимкнене');
  }
  const connector = feed.connector;
  if (!isFeedConnector(connector)) {
    throw validationError('Не вибрано, чия це вигрузка — оберіть підключення в налаштуваннях постачальника');
  }

  return withSupplierLock(supplierId, async () => {
    const ctx: RunContext = {
      supplier,
      source: 'auto',
      user: options.user,
      dryRun: options.dryRun ?? false,
      startedAt: new Date(),
      fileId: null,
      fileName: null,
    };
    const body = await step(ctx, () => downloadFeed(feed, secrets));
    const parsed = await step(ctx, async () => parseFeedBody(connector, body, supplier, feed));
    // без закупівельних цін у вигрузці ціну входу не чіпаємо, хоч би що віддав розбір
    const priced = feed.hasPurchasePrice ? parsed.rows : parsed.rows.map((r) => ({ ...r, purchasePrice: null }));
    const rows = vatNormalizedRows(priced, supplier, (await getSettings()).vatRatePct);
    return applyPrice(ctx, {
      rows,
      rates: parsed.rates ?? null,
      warnings: parsed.warnings,
      roles: rolesFor(feed.kind, 'link'),
      markMissing: true,
    });
  });
}

/** Крок до звірки (завантаження, розбір): невдача — запис у журнал і відповідь із поясненням. */
async function step<T>(ctx: RunContext, task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await recordFailure(ctx, message);
    throw new ApiError('UNPROCESSABLE', message);
  }
}

function parseFeedBody(connector: FeedConnector, body: string, supplier: Supplier, feed: SupplierPriceFeed): AdapterResult {
  try {
    return parseFeed(connector, body, { hasPurchasePrice: feed.hasPurchasePrice, defaultCurrency: supplier.defaultCurrency });
  } catch (e) {
    // повідомлення адаптерів українською; технічні (JSON.parse тощо) показувати користувачу нема сенсу
    const reason = e instanceof Error && /[а-яіїєґ]/iu.test(e.message) ? `: ${e.message}` : ' — вміст не відповідає формату';
    throw new Error(`Не вдалося розібрати вигрузку (${FEED_CONNECTOR_INFO[connector].label})${reason}`);
  }
}

// ── прайс файлом ────────────────────────────────────────────────────

export interface UploadedPriceFile {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
}

/** Рядки файлу, розібрані браузером; сам файл (якщо прийшов) зберігаємо поруч для перевірки. */
export async function importPriceRows(
  body: ImportBody,
  user: User,
  file: UploadedPriceFile | null,
): Promise<PriceUpdateRunDetail> {
  const supplier = await supplierOrFail(body.supplierId);
  if (file && file.buffer.length === 0) throw validationError('Файл прайсу порожній');

  return withSupplierLock(supplier.id, async () => {
    const stored = file && !body.dryRun ? await storePriceFile(supplier.id, file, user) : null;
    const roles = rolesFor(supplier.feed?.kind, 'file');
    const ctx: RunContext = {
      supplier,
      source: 'file',
      user,
      dryRun: body.dryRun,
      startedAt: new Date(),
      fileId: stored?.id ?? null,
      fileName: body.fileName,
    };
    return applyPrice(ctx, {
      rows: importRowsToPriceRows(body.rows),
      rates: null,
      warnings: [],
      roles,
      markMissing: roles.assortment && body.markMissing,
    });
  });
}

async function storePriceFile(supplierId: UUID, file: UploadedPriceFile, user: User): Promise<PriceImportFile> {
  const fileName = safeFileName(file.originalname) ?? 'прайс';
  const storedPath = priceFileStoredPath(supplierId, fileName);
  await saveImageFile(config.uploadsDir, storedPath, file.buffer);
  try {
    return await prisma.priceImportFile.create({
      data: {
        supplierId,
        fileName,
        mimeType: file.mimetype || null,
        sizeBytes: file.buffer.length,
        storedPath,
        uploadedBy: user.id,
      },
    });
  } catch (e) {
    await removeImageFile(config.uploadsDir, storedPath);
    throw e;
  }
}

// ── звірка й запис ──────────────────────────────────────────────────

async function applyPrice(ctx: RunContext, price: ParsedPrice): Promise<PriceUpdateRunDetail> {
  const supplierId = ctx.supplier.id;
  const [existing, units] = await Promise.all([loadExisting(supplierId), listUnits()]);
  const result = planApply({
    existing,
    rows: price.rows,
    markMissing: price.markMissing,
    today: today(ctx.startedAt),
    roles: price.roles,
    defaultCurrency: ctx.supplier.defaultCurrency,
    units: units.filter((u) => u.isActive),
  });

  if (isRejected(result)) {
    await recordFailure(ctx, result.rejected, { price, counters: result.counters, report: result.report });
    const details = result.report ? { counters: result.counters, report: result.report } : undefined;
    throw new ApiError('UNPROCESSABLE', result.rejected, details);
  }
  if (ctx.dryRun) {
    return toDryRunDetail({
      supplierId,
      source: ctx.source,
      startedAt: ctx.startedAt,
      fileName: ctx.fileName,
      user: ctx.user,
      rates: price.rates,
      warnings: price.warnings,
      counters: result.counters,
      report: result.report,
    });
  }

  const started = Date.now();
  let runId: number;
  try {
    runId = await prisma.$transaction((tx) => writePlan(tx, ctx, price, result), {
      timeout: APPLY_TIMEOUT_MS,
      maxWait: APPLY_MAX_WAIT_MS,
    });
  } catch (e) {
    logger.error({ err: e, supplierId }, 'Не вдалося записати оновлення прайсу');
    await recordFailure(ctx, 'Не вдалося записати оновлення прайсу в базу — зміни не застосовано', { price });
    throw e;
  }
  logger.info(
    { supplierId, runId, source: ctx.source, rows: price.rows.length, ms: Date.now() - started, ...result.counters },
    'Прайс застосовано',
  );
  return getPriceUpdate(runId);
}

/** Скільки товарів постачальника читаємо за раз: без цього великий прайс (100+ тис.) тримав би в пам'яті ще й сирий результат Prisma. */
const EXISTING_BATCH = 10_000;

type ExistingRow = Omit<ExistingProduct, 'hasImages'>;

/**
 * Товари постачальника для звірки — легким SQL порціями за кодом (унікальний індекс постачальник + код): числа одразу як double (не Decimal),
 * дата — текстом. На 140 тис. позицій це ~4 рази менше пам'яті й часу, ніж findMany.
 */
async function loadExisting(supplierId: UUID): Promise<ExistingProduct[]> {
  const withImages = await prisma.productImage.groupBy({ by: ['productId'], where: { product: { supplierId } } });
  const hasImages = new Set(withImages.map((g) => g.productId));
  const out: ExistingProduct[] = [];
  let after = '';
  for (;;) {
    const rows = await prisma.$queryRaw<ExistingRow[]>`
      SELECT id, "skuKey", sku, "nameWork", "name1c", brand, "unitCode", currency::text AS currency,
             "purchasePrice"::float8 AS "purchasePrice", rrp::float8 AS rrp, "stockQty"::float8 AS "stockQty",
             availability::text AS availability, multiplicity::float8 AS multiplicity, "minOrderQty"::float8 AS "minOrderQty",
             barcode, "categoryPath", "searchText", "priceOrigin"::text AS "priceOrigin",
             to_char("missingSince", 'YYYY-MM-DD') AS "missingSince", "isArchived",
             ("isArchived" AND "autoArchivedAt" IS NOT NULL) AS "autoArchived"
      FROM "Product"
      WHERE "supplierId" = ${supplierId} AND "skuKey" > ${after}
      ORDER BY "skuKey"
      LIMIT ${EXISTING_BATCH}`;
    for (const r of rows) out.push({ ...r, hasImages: hasImages.has(r.id) });
    if (rows.length < EXISTING_BATCH) return out;
    after = rows[rows.length - 1].skuKey;
  }
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Записує план у відкритій транзакції; повертає номер запису журналу. */
async function writePlan(tx: Prisma.TransactionClient, ctx: RunContext, price: ParsedPrice, plan: ApplyPlan): Promise<number> {
  const supplierId = ctx.supplier.id;
  const now = new Date();
  const run = await tx.priceImportRun.create({
    data: {
      ...runFields(ctx, price, 'ok'),
      ...plan.counters,
      details: plan.report as unknown as Prisma.InputJsonObject,
    },
  });

  for (const batch of chunks(plan.creates, CREATE_BATCH)) {
    await tx.product.createMany({
      data: batch.map((c) => ({
        id: c.id,
        supplierId,
        sku: c.sku,
        skuKey: c.skuKey,
        nameWork: c.nameWork,
        searchText: c.searchText,
        brand: c.brand,
        unitCode: c.unitCode,
        currency: c.currency,
        purchasePrice: c.purchasePrice,
        rrp: c.rrp,
        multiplicity: c.multiplicity,
        minOrderQty: c.minOrderQty,
        stockQty: c.stockQty,
        availability: c.availability,
        barcode: c.barcode,
        categoryPath: c.categoryPath,
        imageUrl: c.imageUrls.length ? feedImageUrl(c.imageUrls[0]) : null,
        priceOrigin: 'import' as const,
        priceUpdatedAt: now,
      })),
    });
  }

  for (const batch of chunks(plan.updates, UPDATE_BATCH)) await updateProducts(tx, batch, now);

  // фото з прайсу: новим товарам і тим, у кого фото ще немає зовсім; перше — головне
  const attachments = [...plan.creates.map((c) => ({ productId: c.id, urls: c.imageUrls })), ...plan.imageAttachments];
  const images = attachments.flatMap(({ productId, urls }) =>
    urls.map((url, i) => ({ productId, source: 'feed' as const, url, isMain: i === 0, sortOrder: i })),
  );
  for (const batch of chunks(images, INSERT_BATCH)) await tx.productImage.createMany({ data: batch });
  for (const batch of chunks(plan.imageAttachments, UPDATE_BATCH)) await setMainImageUrls(tx, batch);

  for (const ids of chunks(plan.priceConfirmedIds, ID_BATCH)) {
    await tx.product.updateMany({ where: { id: { in: ids } }, data: { priceUpdatedAt: now } });
  }
  for (const ids of chunks(plan.missingClears, ID_BATCH)) {
    await tx.product.updateMany({ where: { id: { in: ids } }, data: { missingSince: null } });
  }
  for (const ids of chunks(plan.missingMarks, ID_BATCH)) {
    // дата вже стоїть — лишаємо ранішу
    await tx.product.updateMany({
      where: { id: { in: ids }, missingSince: null },
      data: { missingSince: dateOnly(today(ctx.startedAt)) },
    });
  }

  const note = ctx.source === 'file' ? `Прайс ${ctx.fileName ?? 'файлом'}` : 'Оновлення прайсу за посиланням';
  for (const batch of chunks(plan.historyEntries, INSERT_BATCH)) {
    await tx.priceHistory.createMany({
      data: batch.map((h) => ({
        productId: h.productId,
        effectiveAt: now,
        currency: h.currency,
        purchasePrice: h.purchasePrice,
        rrp: h.rrp,
        stockQty: h.stockQty,
        availability: h.availability,
        origin: 'import' as const,
        importRunId: run.id,
        userId: ctx.user?.id ?? null,
        note,
      })),
    });
  }

  await tx.supplier.update({ where: { id: supplierId }, data: { lastImportAt: now, ...priceListRates(price.rates, ctx) } });
  if (ctx.source === 'auto') {
    await tx.supplierPriceFeed.updateMany({ where: { supplierId }, data: { lastError: null, lastErrorAt: null, failCount: 0 } });
  }
  await tx.priceImportRun.update({ where: { id: run.id }, data: { finishedAt: new Date() } });
  return run.id;
}

/** Посилання на фото з прайсу так, як його бачать списки й КП (те саме правило, що в модулі фото). */
const feedImageUrl = (url: string): string => imageUrlOf({ id: '', source: 'feed', url });

/**
 * Пакетне оновлення товарів одним запитом UPDATE … FROM (VALUES …).
 * Час пишемо як UTC без поясу — так само, як Prisma, незалежно від часового поясу сесії бази.
 */
async function updateProducts(tx: Prisma.TransactionClient, batch: readonly ProductUpdate[], now: Date): Promise<void> {
  const values = batch.map(
    (u) => Prisma.sql`(
      ${u.id}::text, ${u.sku}::text, ${u.skuKey}::text, ${u.nameWork}::text, ${u.brand}::text, ${u.unitCode}::text,
      ${u.currency}::text, ${u.purchasePrice}::numeric, ${u.rrp}::numeric, ${u.stockQty}::numeric, ${u.availability}::text,
      ${u.multiplicity}::numeric, ${u.minOrderQty}::numeric, ${u.barcode}::text, ${u.categoryPath}::text,
      ${u.searchText}::text, ${u.isArchived}::boolean
    )`,
  );
  await tx.$executeRaw`
    UPDATE "Product" AS p SET
      "sku" = v.sku,
      "skuKey" = v.sku_key,
      "nameWork" = v.name_work,
      "brand" = v.brand,
      "unitCode" = v.unit_code,
      "currency" = v.currency::"Currency",
      "purchasePrice" = v.purchase_price,
      "rrp" = v.rrp,
      "stockQty" = v.stock_qty,
      "availability" = v.availability::"Availability",
      "multiplicity" = v.multiplicity,
      "minOrderQty" = v.min_order_qty,
      "barcode" = v.barcode,
      "categoryPath" = v.category_path,
      "searchText" = v.search_text,
      "isArchived" = v.is_archived,
      "autoArchivedAt" = CASE WHEN v.is_archived THEN p."autoArchivedAt" ELSE NULL END,
      "updatedAt" = (${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')
    FROM (VALUES ${Prisma.join(values)}) AS v(
      id, sku, sku_key, name_work, brand, unit_code, currency, purchase_price, rrp, stock_qty, availability,
      multiplicity, min_order_qty, barcode, category_path, search_text, is_archived
    )
    WHERE p.id = v.id`;
}

/** Головне фото щойно доданих фото з прайсу — у картку товару (Product.imageUrl). */
async function setMainImageUrls(
  tx: Prisma.TransactionClient,
  batch: readonly { productId: UUID; urls: string[] }[],
): Promise<void> {
  const values = batch.map((a) => Prisma.sql`(${a.productId}::text, ${feedImageUrl(a.urls[0])}::text)`);
  await tx.$executeRaw`
    UPDATE "Product" AS p SET "imageUrl" = v.url
    FROM (VALUES ${Prisma.join(values)}) AS v(id, url)
    WHERE p.id = v.id`;
}

/** Курси з прайсу (YML): оновлюємо лише ті, що прийшли. */
function priceListRates(rates: RatesPair | null, ctx: RunContext): Prisma.SupplierUpdateInput {
  if (!rates || (rates.USD == null && rates.EUR == null)) return {};
  return {
    ...(rates.USD != null ? { priceListRateUsd: rates.USD } : {}),
    ...(rates.EUR != null ? { priceListRateEur: rates.EUR } : {}),
    priceListRateDate: dateOnly(today(ctx.startedAt)),
  };
}

function runFields(ctx: RunContext, price: ParsedPrice | null, status: 'ok' | 'error') {
  return {
    supplierId: ctx.supplier.id,
    startedAt: ctx.startedAt,
    source: ctx.source,
    status,
    fileId: ctx.fileId,
    fileName: ctx.fileName,
    rateUsd: price?.rates?.USD ?? null,
    rateEur: price?.rates?.EUR ?? null,
    warnings: warningsText(price?.warnings ?? []),
    userId: ctx.user?.id ?? null,
  };
}

/**
 * Невдале оновлення: запис у журнал зі статусом error; для вигрузки — ще й стан посилання
 * (остання помилка, кількість невдач поспіль). Попередній розрахунок нічого не пише.
 */
async function recordFailure(
  ctx: RunContext,
  message: string,
  extra: { price?: ParsedPrice; counters?: PlanCounters; report?: PlanReport } = {},
): Promise<void> {
  if (ctx.dryRun) return;
  try {
    await prisma.priceImportRun.create({
      data: {
        ...runFields(ctx, extra.price ?? null, 'error'),
        ...(extra.counters ?? {}),
        finishedAt: new Date(),
        errorText: message,
        ...(extra.report ? { details: extra.report as unknown as Prisma.InputJsonObject } : {}),
      },
    });
    if (ctx.source === 'auto') {
      await prisma.supplierPriceFeed.updateMany({
        where: { supplierId: ctx.supplier.id },
        data: { lastError: message, lastErrorAt: new Date(), failCount: { increment: 1 } },
      });
    }
  } catch (err) {
    logger.error({ err, supplierId: ctx.supplier.id, message }, 'Не вдалося записати невдале оновлення прайсу в журнал');
  }
}

async function supplierOrFail(id: UUID): Promise<SupplierWithFeed> {
  const supplier = await prisma.supplier.findUnique({ where: { id }, include: { feed: true } });
  if (!supplier) throw notFound('Постачальника не знайдено');
  return supplier;
}

// ── розклад і прибирання ────────────────────────────────────────────

export interface ScheduledFeed {
  supplierId: UUID;
  supplierName: string;
  /** Година запуску за київським часом. */
  hour: number;
}

/** Постачальники, чий прайс оновлюється за посиланням щодня. */
export async function scheduledFeeds(): Promise<ScheduledFeed[]> {
  const feeds = await prisma.supplierPriceFeed.findMany({
    where: { kind: { in: ['auto', 'hybrid'] }, url: { not: null }, supplier: { isActive: true } },
    include: { supplier: { select: { name: true, sortOrder: true } } },
  });
  return feeds
    .sort((a, b) => a.supplier.sortOrder - b.supplier.sortOrder)
    .map((f) => ({ supplierId: f.supplierId, supplierName: f.supplier.name, hour: feedHourOf(f.scheduleHour) }));
}

/** Час останнього оновлення за посиланням (вдалого чи ні) — щоб після перезапуску не пропустити ранковий. */
export async function lastLinkRunAt(supplierId: UUID): Promise<Date | null> {
  const run = await prisma.priceImportRun.findFirst({
    where: { supplierId, source: 'auto' },
    orderBy: { startedAt: 'desc' },
    select: { startedAt: true },
  });
  return run?.startedAt ?? null;
}

/**
 * Товари, яких немає у прайсі понад 30 днів, — в архів із позначкою «автоматично».
 * Позначку в товарів, які менеджер уже повернув з архіву вручну, прибираємо: інакше його наступний
 * архів «вручну» виглядав би автоматичним і прайс повертав би товар назад.
 */
export async function archiveLongMissing(now = new Date()): Promise<number> {
  await prisma.product.updateMany({
    where: { isArchived: false, autoArchivedAt: { not: null } },
    data: { autoArchivedAt: null },
  });
  const { count } = await prisma.product.updateMany({
    where: { isArchived: false, priceOrigin: 'import', missingSince: { lt: dateOnly(archiveCutoff(today(now))) } },
    data: { isArchived: true, autoArchivedAt: now },
  });
  return count;
}
