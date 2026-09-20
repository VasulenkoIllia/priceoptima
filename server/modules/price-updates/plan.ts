// Звірка прайсу з каталогом постачальника — без бази: що створити, що оновити, що позначити «немає у прайсі».
// Оновлення кероване: кожне джерело робить лише свою частину роботи (ролі), описи не перезаписуються,
// а підозрілий прайс (обрізаний, масова зміна цін чи валюти) не застосовується зовсім.
//
// Ролі джерела:
// - prices     — вхідна ціна, РРЦ і валюта (товари з ручною ціною не чіпаємо ніколи);
// - stock      — залишок і наявність (коли рядок щось про них каже);
// - assortment — нові позиції, «немає у прайсі», повернення з архіву, заповнення описів і фото.
import { randomUUID } from 'node:crypto';
import type { AvailabilityStatus, CurrencyCode } from '@shared/enums';
import { DEFAULT_UNITS, normalizeSku, normalizeUnit, type UnitAliasSource } from '@shared/parse';
import { round3, round4 } from '@shared/pricing';
import type {
  ISODate,
  PriceBigChange,
  PriceDetailDiff,
  PriceDetailField,
  PriceNotFoundRow,
  PriceRelinkedItem,
  PriceReportSection,
  PriceSkippedRow,
  PriceUpdateReport,
  UUID,
} from '@shared/types';
import { searchTextOf } from '../products/products.rules';
import { availabilityForQty, imageList, type PriceRow } from './connectors/types';

/** Прайс, у якому позицій менше за цю частку від каталогу, не застосовуємо. */
export const MIN_ROWS_SHARE = 0.5;
/** Зміна ціни, більша за цю частку, — «велика» (іде у звіт). */
export const BIG_PRICE_CHANGE = 0.5;
/** Якщо великих змін цін або змін валюти більше за цю частку позицій — прайс не застосовуємо. */
export const MASS_CHANGE_SHARE = 0.3;
/** Масову зміну рахуємо від цієї кількості позицій: у крихітному прайсі одна-дві зміни — ще не «формат змінився». */
export const MASS_CHANGE_MIN_ITEMS = 10;
/** Скільки прикладів кожного виду кладемо у звіт. */
export const REPORT_SAMPLE = 50;
/** Коротші штрихкоди й артикули не використовуємо для запасної звірки — занадто легко збігтися випадково. */
const MIN_BARCODE_LENGTH = 8;
const MIN_ARTICLE_LENGTH = 3;

export interface SourceRoles {
  /** Вхідна ціна й валюта товару. */
  purchasePrice: boolean;
  /** РРЦ: 'set' — з прайсу, коли вона там є; 'fill' — лише якщо в каталозі порожньо; 'none' — не чіпати. */
  rrp: 'set' | 'fill' | 'none';
  stock: boolean;
  assortment: boolean;
}

/** Прайс, що веде все (вигрузка «auto» або файл для постачальника без вигрузки). */
export const FULL_ROLES: SourceRoles = { purchasePrice: true, rrp: 'set', stock: true, assortment: true };

/** Товар каталогу в тому вигляді, який потрібен звірці (гроші — числа, дата — ISO). */
export interface ExistingProduct {
  id: UUID;
  skuKey: string;
  sku: string;
  nameWork: string;
  name1c: string | null;
  brand: string | null;
  unitCode: string;
  currency: CurrencyCode;
  purchasePrice: number | null;
  rrp: number | null;
  stockQty: number | null;
  availability: AvailabilityStatus;
  multiplicity: number;
  minOrderQty: number | null;
  barcode: string | null;
  categoryPath: string | null;
  searchText: string;
  priceOrigin: 'import' | 'manual';
  missingSince: ISODate | null;
  isArchived: boolean;
  /** В архіві через тривалу відсутність у прайсі (не вручну). */
  autoArchived: boolean;
  hasImages: boolean;
}

/** Поля товару, які може вести прайс. */
export interface ImportedFields {
  nameWork: string;
  brand: string | null;
  unitCode: string;
  currency: CurrencyCode;
  purchasePrice: number | null;
  rrp: number | null;
  stockQty: number | null;
  availability: AvailabilityStatus;
  multiplicity: number;
  minOrderQty: number | null;
  barcode: string | null;
  categoryPath: string | null;
  searchText: string;
}

export interface ProductCreate extends ImportedFields {
  id: UUID;
  sku: string;
  skuKey: string;
  /** Фото з прайсу: перше стане головним. */
  imageUrls: string[];
}

/** Повний новий стан товару, у якого щось змінилось. */
export interface ProductUpdate extends ImportedFields {
  id: UUID;
  sku: string;
  skuKey: string;
  isArchived: boolean;
}

export interface HistoryEntry {
  productId: UUID;
  currency: CurrencyCode;
  purchasePrice: number | null;
  rrp: number | null;
  stockQty: number | null;
  availability: AvailabilityStatus;
}

/** Фото з прайсу для наявного товару, у якого фото ще немає зовсім. */
export interface ImageAttachment {
  productId: UUID;
  urls: string[];
}

export interface PlanCounters {
  /** Позицій прайсу, що потрапили в каталог (оновлені й нові; без товарів із ручною ціною). */
  productsTotal: number;
  added: number;
  /** Змінилась вхідна ціна, РРЦ або валюта. */
  changed: number;
  priceUp: number;
  priceDown: number;
  stockChanged: number;
  /** Товарів каталогу, яких немає у прайсі. */
  missing: number;
  /** Рядки, які не застосовано: без коду, повтори, неоднозначні, не знайдені в каталозі. */
  skipped: number;
  /** Знайдено за штрихкодом або артикулом — код товару замінено кодом із прайсу. */
  relinked: number;
  /** Повернуто з архіву (були в архіві через відсутність у прайсі). */
  restored: number;
  /** Товарів, у яких заповнений опис відрізняється від прайсу (опис не змінено). */
  detailsDiffer: number;
}

export type DetailField = PriceDetailField;
export type DetailDiff = PriceDetailDiff;
export type BigPriceChange = PriceBigChange;
export type RelinkedItem = PriceRelinkedItem;
export type NotFoundRow = PriceNotFoundRow;
export type SkippedRow = PriceSkippedRow;
export type ReportSection<T> = PriceReportSection<T>;
export type PlanReport = PriceUpdateReport;

export interface ApplyPlan {
  counters: PlanCounters;
  report: PlanReport;
  creates: ProductCreate[];
  /** Лише товари, у яких змінилось хоч одне поле. */
  updates: ProductUpdate[];
  /** Товари, ціну яких підтвердив прайс: їм оновлюємо дату ціни. */
  priceConfirmedIds: UUID[];
  historyEntries: HistoryEntry[];
  imageAttachments: ImageAttachment[];
  /** Позначити «немає у прайсі» сьогоднішньою датою (у кого дати ще немає). */
  missingMarks: UUID[];
  /** Знову є у прайсі — позначку прибрати. */
  missingClears: UUID[];
}

export interface PlanRejection {
  rejected: string;
  /** Для масових змін — лічильники й звіт, щоб було видно, що саме змінилось. */
  counters?: PlanCounters;
  report?: PlanReport;
}

export type PlanResult = ApplyPlan | PlanRejection;

export interface PlanInput {
  existing: readonly ExistingProduct[];
  rows: readonly PriceRow[];
  /** Позначати відсутні позиції (діє лише для джерела з роллю assortment). */
  markMissing: boolean;
  today: ISODate;
  roles?: SourceRoles;
  /** Валюта нової позиції, якщо рядок її не вказав. */
  defaultCurrency?: CurrencyCode;
  /** Довідник одиниць для розпізнавання «шт.», «м.п.» тощо. */
  units?: readonly UnitAliasSource[];
  /** Ідентифікатор нового товару (у тестах — передбачуваний). */
  newId?: () => UUID;
}

export function isRejected(result: PlanResult): result is PlanRejection {
  return 'rejected' in result;
}

export const SKIP_REASONS = {
  noCode: 'Немає коду товару',
  duplicate: 'Код повторюється у прайсі — застосовано останній рядок',
  ambiguous: 'Кілька товарів каталогу підходять за штрихкодом або артикулом — рядок пропущено',
} as const;

// ── нормалізація значень рядка ──────────────────────────────────────

const text = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** Ціни в базі — Decimal(14,4): округлюємо так само, інакше кожне оновлення «змінювало б» ціну. */
const price = (value: number | null | undefined): number | null =>
  value != null && Number.isFinite(value) && value > 0 ? round4(value) : null;

/** Кількості — Decimal(12,3). */
const quantity = (value: number | null | undefined): number | null =>
  value != null && Number.isFinite(value) ? round3(Math.max(value, 0)) : null;

const positiveQty = (value: number | null | undefined): number | null => {
  const q = quantity(value);
  return q != null && q > 0 ? q : null;
};

/** Одиниця з прайсу → код довідника; невідому лишаємо текстом як у прайсі. */
function unitOf(raw: string | null | undefined, units: readonly UnitAliasSource[]): string | null {
  const value = text(raw);
  if (!value) return null;
  return normalizeUnit(value, units) ?? value.slice(0, 20);
}

/** Штрихкод для звірки: лише літери й цифри. */
export function barcodeKey(value: string | null | undefined): string {
  const key = (value ?? '').replace(/[^\p{L}\p{N}]/gu, '').toUpperCase();
  return key.length >= MIN_BARCODE_LENGTH && !/^0+$/u.test(key) ? key : '';
}

function articleKey(value: string | null | undefined): string {
  const key = normalizeSku(value ?? '');
  return key.length >= MIN_ARTICLE_LENGTH ? key : '';
}

/** Текст для порівняння описів: без різниці в регістрі й пробілах. */
const comparable = (value: string): string => value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('uk');

/** Перша ціна, що змінилась (вхідна, потім РРЦ); у різних валютах ціни не порівнюємо. */
function priceShift(
  before: Pick<ImportedFields, 'currency' | 'purchasePrice' | 'rrp'>,
  after: Pick<ImportedFields, 'currency' | 'purchasePrice' | 'rrp'>,
): { field: 'purchasePrice' | 'rrp'; old: number; new: number } | null {
  if (before.currency !== after.currency) return null;
  for (const field of ['purchasePrice', 'rrp'] as const) {
    const old = before[field];
    const next = after[field];
    if (old != null && next != null && old !== next) return { field, old, new: next };
  }
  return null;
}

/** Чи є ціна, з якою можна порівняти нову (та сама валюта, обидва значення відомі). */
function hasComparablePrice(before: ImportedFields, after: ImportedFields): boolean {
  if (before.currency !== after.currency) return false;
  return (
    (before.purchasePrice != null && after.purchasePrice != null) || (before.rrp != null && after.rrp != null)
  );
}

function section<T>(): ReportSection<T> {
  return { total: 0, sample: [] };
}

function note<T>(target: ReportSection<T>, item: T): void {
  target.total++;
  if (target.sample.length < REPORT_SAMPLE) target.sample.push(item);
}

const UPDATE_FIELDS: readonly (keyof ProductUpdate & keyof ExistingProduct)[] = [
  'sku',
  'skuKey',
  'nameWork',
  'brand',
  'unitCode',
  'currency',
  'purchasePrice',
  'rrp',
  'stockQty',
  'availability',
  'multiplicity',
  'minOrderQty',
  'barcode',
  'categoryPath',
  'searchText',
  'isArchived',
];

// ── звірка ──────────────────────────────────────────────────────────

interface KeyedRow {
  row: PriceRow;
  /** Номер рядка у прайсі (з 1). */
  line: number;
}

interface Match {
  product: ExistingProduct;
  by: 'code' | 'barcode' | 'article';
}

export function planApply(input: PlanInput): PlanResult {
  const roles = input.roles ?? FULL_ROLES;
  const units = input.units ?? DEFAULT_UNITS;
  const defaultCurrency = input.defaultCurrency ?? 'UAH';
  const newId = input.newId ?? randomUUID;
  const report: PlanReport = {
    detailsDiffer: section(),
    bigPriceChanges: section(),
    relinked: section(),
    notFound: section(),
    skippedRows: section(),
  };
  const counters: PlanCounters = {
    productsTotal: 0,
    added: 0,
    changed: 0,
    priceUp: 0,
    priceDown: 0,
    stockChanged: 0,
    missing: 0,
    skipped: 0,
    relinked: 0,
    restored: 0,
    detailsDiffer: 0,
  };
  const skip = (line: number, code: string, reason: string) => {
    counters.skipped++;
    note(report.skippedRows, { row: line, code, reason });
  };

  // рядки за ключем коду; повтор коду — діє останній рядок
  const byKey = new Map<string, KeyedRow>();
  input.rows.forEach((row, index) => {
    const line = index + 1;
    const key = normalizeSku(row.code ?? '');
    if (!key) return skip(line, row.code ?? '', SKIP_REASONS.noCode);
    const previous = byKey.get(key);
    if (previous) skip(previous.line, previous.row.code, SKIP_REASONS.duplicate);
    byKey.set(key, { row, line });
  });

  const activeImported = input.existing.filter((p) => p.priceOrigin === 'import' && !p.isArchived).length;
  if (byKey.size === 0) {
    return { rejected: 'У прайсі немає жодної позиції з кодом товару — оновлення не застосовано' };
  }
  // короткий прайс небезпечний лише тоді, коли відсутні в ньому позиції позначаються зниклими;
  // файл лише з частиною цін (договірні ціни, гібрид) — звичайна ситуація
  if (roles.assortment && input.markMissing && byKey.size < activeImported * MIN_ROWS_SHARE) {
    return {
      rejected: `Прайс підозріло короткий: ${byKey.size} поз. проти ${activeImported} у каталозі — оновлення не застосовано, щоб не позначити решту товарів зниклими`,
    };
  }

  const { matches, ambiguous } = matchRows(byKey, input.existing);

  const plan: ApplyPlan = {
    counters,
    report,
    creates: [],
    updates: [],
    priceConfirmedIds: [],
    historyEntries: [],
    imageAttachments: [],
    missingMarks: [],
    missingClears: [],
  };
  const present = new Set<UUID>();
  let pricedItems = 0;
  let comparablePriced = 0;
  let currencyChanges = 0;

  for (const [key, { row, line }] of byKey) {
    if (ambiguous.has(key)) {
      skip(line, row.code, SKIP_REASONS.ambiguous);
      continue;
    }
    const match = matches.get(key);

    if (!match) {
      if (!roles.assortment) {
        counters.skipped++;
        note(report.notFound, { row: line, code: row.code.trim(), name: text(row.name) });
        continue;
      }
      const created = newProduct(key, row, units, defaultCurrency, newId());
      plan.creates.push(created);
      counters.added++;
      if (created.purchasePrice != null || created.rrp != null) plan.historyEntries.push(historyOf(created.id, created));
      continue;
    }

    const current = match.product;
    present.add(current.id);
    const next: ProductUpdate = stateOf(current);
    const code = row.code.trim();

    // код товару змінюємо лише джерелу, що веде асортимент: інакше вигрузка й файл із різними кодами
    // перечіплювали б товар туди-сюди при кожному оновленні
    if (match.by !== 'code' && roles.assortment) {
      next.sku = code;
      next.skuKey = key;
      counters.relinked++;
      note(report.relinked, { code, previousSku: current.sku, by: match.by });
    }

    // ціну веде прайс: навіть якщо її правили вручну, нове завантаження її замінює (ІМП-6)
    if (roles.purchasePrice || roles.rrp !== 'none') {
      if (roles.purchasePrice) {
        // валюту веде джерело вхідної ціни; «ціну перевірено» — теж лише воно
        next.purchasePrice = price(row.purchasePrice) ?? current.purchasePrice;
        next.currency = row.currency ?? current.currency;
        plan.priceConfirmedIds.push(current.id);
        pricedItems++;
        if (next.currency !== current.currency) currencyChanges++;
      }
      // РРЦ у чужій валюті джерело, що не веде валюту, не записує
      const rrpCurrencyFits = roles.purchasePrice || (row.currency ?? current.currency) === current.currency;
      if (rrpCurrencyFits && (roles.rrp === 'set' || (roles.rrp === 'fill' && current.rrp == null))) {
        next.rrp = price(row.rrp) ?? current.rrp;
      } else if (next.currency !== current.currency) {
        // валюта змінилась, а нової РРЦ немає — стара РРЦ у старій валюті вже не має сенсу
        next.rrp = price(row.rrp) ?? null;
      }
      if (hasComparablePrice(current, next)) comparablePriced++;
      if (next.currency !== current.currency || next.purchasePrice !== current.purchasePrice || next.rrp !== current.rrp) {
        counters.changed++;
        plan.historyEntries.push(historyOf(current.id, next));
        const shift = priceShift(current, next);
        if (shift && shift.new > shift.old) counters.priceUp++;
        if (shift && shift.new < shift.old) counters.priceDown++;
        if (shift && Math.abs(shift.new - shift.old) / shift.old > BIG_PRICE_CHANGE) {
          const pct = Math.round(((shift.new - shift.old) / shift.old) * 1000) / 10;
          note(report.bigPriceChanges, { code, field: shift.field, old: shift.old, new: shift.new, pct });
        }
      }
    }

    // залишок і наявність — пара: прайс сказав хоч щось про наявність — беремо обидва значення з нього
    if (roles.stock && (row.stockQty != null || row.availability != null)) {
      next.stockQty = quantity(row.stockQty);
      next.availability = row.availability ?? availabilityForQty(next.stockQty);
      if (next.stockQty !== current.stockQty || next.availability !== current.availability) counters.stockChanged++;
    }

    if (roles.assortment) {
      const diffs = fillDetails(next, current, row, units);
      if (diffs.length) {
        counters.detailsDiffer++;
        for (const diff of diffs) note(report.detailsDiffer, { code, ...diff });
      }
      const urls = imageList(row.imageUrls ?? []);
      if (!current.hasImages && urls.length) plan.imageAttachments.push({ productId: current.id, urls });
      if (current.missingSince) plan.missingClears.push(current.id);
      // в архіві через відсутність у прайсі й повернувся — назад у каталог; архів «вручну» не чіпаємо
      if (current.isArchived && current.autoArchived) {
        next.isArchived = false;
        counters.restored++;
      }
    }

    next.searchText = searchTextOf({ sku: next.sku, nameWork: next.nameWork, name1c: current.name1c, brand: next.brand });
    if (UPDATE_FIELDS.some((f) => next[f] !== current[f])) plan.updates.push(next);
  }

  counters.productsTotal =
    input.existing.filter((p) => present.has(p.id) && p.priceOrigin === 'import').length + counters.added;

  if (roles.assortment && input.markMissing) {
    for (const p of input.existing) {
      if (p.priceOrigin !== 'import' || p.isArchived || present.has(p.id)) continue;
      counters.missing++;
      if (!p.missingSince) plan.missingMarks.push(p.id);
    }
  }

  const rejected =
    massChangeRejection('currency', currencyChanges, pricedItems) ??
    massChangeRejection('price', report.bigPriceChanges.total, comparablePriced);
  return rejected ? { rejected, counters, report } : plan;
}

/** Масова зміна цін чи валюти — ознака, що змінився формат прайсу, а не самі ціни. */
function massChangeRejection(kind: 'currency' | 'price', changes: number, of: number): string | null {
  if (changes < MASS_CHANGE_MIN_ITEMS || changes <= of * MASS_CHANGE_SHARE) return null;
  const what = kind === 'currency' ? 'Валюта змінилась' : `Ціна змінилась більш ніж на ${BIG_PRICE_CHANGE * 100}%`;
  return (
    `${what} у ${changes} з ${of} позицій (${Math.round((changes / of) * 100)}%): ` +
    'схоже, змінився формат або валюта прайсу — оновлення не застосовано, перевірте прайс вручну'
  );
}

/**
 * Звірка рядків із товарами: спершу за кодом; не знайдено — за штрихкодом або артикулом серед товарів,
 * яким у цьому прайсі ще не знайшлося рядка. Лише однозначний збіг в обидва боки — інакше не вгадуємо.
 */
function matchRows(
  byKey: ReadonlyMap<string, KeyedRow>,
  existing: readonly ExistingProduct[],
): { matches: Map<string, Match>; ambiguous: Set<string> } {
  const existingByKey = new Map(existing.map((p) => [p.skuKey, p]));
  const matches = new Map<string, Match>();
  const claimed = new Set<UUID>();
  const unmatched: string[] = [];
  for (const key of byKey.keys()) {
    const product = existingByKey.get(key);
    if (product) {
      matches.set(key, { product, by: 'code' });
      claimed.add(product.id);
    } else {
      unmatched.push(key);
    }
  }

  const ambiguous = new Set<string>();
  if (!unmatched.length) return { matches, ambiguous };

  const pool = existing.filter((p) => !claimed.has(p.id));
  const poolByBarcode = new Map<string, ExistingProduct[]>();
  for (const p of pool) {
    const key = barcodeKey(p.barcode);
    if (key) poolByBarcode.set(key, [...(poolByBarcode.get(key) ?? []), p]);
  }
  const poolBySkuKey = new Map(pool.map((p) => [p.skuKey, p]));

  const tentative = new Map<string, Match>();
  const rowsPerProduct = new Map<UUID, string[]>();
  for (const key of unmatched) {
    const { row } = byKey.get(key)!;
    const byBarcode = poolByBarcode.get(barcodeKey(row.barcode)) ?? [];
    const article = articleKey(row.sku);
    const byArticle = article ? poolBySkuKey.get(article) : undefined;
    const candidates = new Map(byBarcode.map((p) => [p.id, p]));
    if (byArticle) candidates.set(byArticle.id, byArticle);
    if (candidates.size === 0) continue;
    if (candidates.size > 1) {
      ambiguous.add(key);
      continue;
    }
    const product = [...candidates.values()][0];
    tentative.set(key, { product, by: byBarcode.length ? 'barcode' : 'article' });
    rowsPerProduct.set(product.id, [...(rowsPerProduct.get(product.id) ?? []), key]);
  }
  for (const [key, match] of tentative) {
    // на один товар претендує кілька рядків — теж не вгадуємо
    if (rowsPerProduct.get(match.product.id)!.length > 1) ambiguous.add(key);
    else matches.set(key, match);
  }
  return { matches, ambiguous };
}

function stateOf(p: ExistingProduct): ProductUpdate {
  return {
    id: p.id,
    sku: p.sku,
    skuKey: p.skuKey,
    nameWork: p.nameWork,
    brand: p.brand,
    unitCode: p.unitCode,
    currency: p.currency,
    purchasePrice: p.purchasePrice,
    rrp: p.rrp,
    stockQty: p.stockQty,
    availability: p.availability,
    multiplicity: p.multiplicity,
    minOrderQty: p.minOrderQty,
    barcode: p.barcode,
    categoryPath: p.categoryPath,
    searchText: p.searchText,
    isArchived: p.isArchived,
  };
}

/**
 * Описи з прайсу лише заповнюють порожні поля; заповнене значення не перезаписуємо —
 * якщо воно відрізняється, повертаємо різницю для звіту.
 * Назва, що дорівнює коду, — це заглушка з попереднього завантаження без назви, її заповнюємо.
 */
function fillDetails(
  next: ProductUpdate,
  current: ExistingProduct,
  row: PriceRow,
  units: readonly UnitAliasSource[],
): Omit<DetailDiff, 'code'>[] {
  const diffs: Omit<DetailDiff, 'code'>[] = [];
  const differ = (field: DetailField, catalog: string | number, value: string | number) =>
    diffs.push({ field, catalog: String(catalog), price: String(value) });

  const name = text(row.name);
  if (name) {
    const placeholder = !current.nameWork.trim() || normalizeSku(current.nameWork) === current.skuKey;
    if (placeholder) next.nameWork = name;
    else if (comparable(current.nameWork) !== comparable(name)) differ('nameWork', current.nameWork, name);
  }

  const texts = [
    ['brand', text(row.brand)],
    ['categoryPath', text(row.categoryPath)],
  ] as const;
  for (const [field, value] of texts) {
    if (!value) continue;
    const stored = current[field];
    if (stored == null || !stored.trim()) next[field] = value;
    else if (comparable(stored) !== comparable(value)) differ(field, stored, value);
  }

  const barcode = text(row.barcode);
  if (barcode) {
    if (!current.barcode?.trim()) next.barcode = barcode;
    else if (barcodeKey(current.barcode) !== barcodeKey(barcode)) differ('barcode', current.barcode, barcode);
  }

  const unit = unitOf(row.unitCode, units);
  if (unit && comparable(unit) !== comparable(current.unitCode)) {
    if (!current.unitCode.trim()) next.unitCode = unit;
    else differ('unitCode', current.unitCode, unit);
  }

  const multiplicity = positiveQty(row.multiplicity);
  if (multiplicity != null && multiplicity !== current.multiplicity) differ('multiplicity', current.multiplicity, multiplicity);

  const minOrderQty = positiveQty(row.minOrderQty);
  if (minOrderQty != null) {
    if (current.minOrderQty == null) next.minOrderQty = minOrderQty;
    else if (minOrderQty !== current.minOrderQty) differ('minOrderQty', current.minOrderQty, minOrderQty);
  }
  return diffs;
}

function newProduct(
  skuKey: string,
  row: PriceRow,
  units: readonly UnitAliasSource[],
  defaultCurrency: CurrencyCode,
  id: UUID,
): ProductCreate {
  const sku = row.code.trim();
  const nameWork = text(row.name) ?? sku;
  const brand = text(row.brand);
  const stockQty = quantity(row.stockQty);
  return {
    id,
    sku,
    skuKey,
    nameWork,
    brand,
    unitCode: unitOf(row.unitCode, units) ?? 'шт',
    currency: row.currency ?? defaultCurrency,
    purchasePrice: price(row.purchasePrice),
    rrp: price(row.rrp),
    stockQty,
    availability: row.availability ?? availabilityForQty(stockQty),
    multiplicity: positiveQty(row.multiplicity) ?? 1,
    minOrderQty: positiveQty(row.minOrderQty),
    barcode: text(row.barcode),
    categoryPath: text(row.categoryPath),
    searchText: searchTextOf({ sku, nameWork, name1c: null, brand }),
    imageUrls: imageList(row.imageUrls ?? []),
  };
}

function historyOf(productId: UUID, state: ImportedFields): HistoryEntry {
  return {
    productId,
    currency: state.currency,
    purchasePrice: state.purchasePrice,
    rrp: state.rrp,
    stockQty: state.stockQty,
    availability: state.availability,
  };
}
