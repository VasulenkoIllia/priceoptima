// Прайс постачальника: автовизначення заголовка й колонок за назвами (укр./рос.) і побудова рядків для імпорту.
// Чисті функції (без DOM) — покриті тестами.
import type { PriceUpdateField } from '@shared/catalog/priceUpdateFields';
import { PRICE_COLUMN_ROLES, type CurrencyCode, type PriceColumnRole } from '@shared/enums';
import { normalizeUnit, parseCurrency, parseLocaleNumber } from '@shared/parse';
import { normalizeInputPrice, normalizeInputRrp } from '@shared/pricing';
import type { PriceImportRow, PriceSourceKind } from '@shared/types';
import { parseStockText } from './stock';

export { PRICE_COLUMN_ROLES, type PriceColumnRole };

// Назви як у всій програмі (правки замовника 06.10): «Артикул» — ідентифікатор товару постачальника в каталозі
// (внутрішня роль code), «Артикул виробника» — необов'язковий, лише для звірки (роль sku).
export const ROLE_LABELS: Record<PriceColumnRole, string> = {
  code: 'Артикул',
  sku: 'Артикул виробника',
  name: 'Назва',
  brand: 'Бренд',
  unit: 'Одиниця',
  purchasePrice: 'Ціна закупівлі',
  currency: 'Валюта',
  rrp: 'РРЦ з ПДВ',
  stock: 'Наявність',
  multiplicity: 'Кратність',
  minOrderQty: 'Мін. замовлення',
  image: 'Фото (посилання)',
};

export const ROLE_HINTS: Partial<Record<PriceColumnRole, string>> = {
  code: 'Артикул постачальника (код товару в його системі, 1С): за ним звіряємо каталог. Порожній у рядку — береться артикул виробника',
  sku: 'Необов\'язково: артикул виробника. Лише для звірки, якщо постачальник змінив свій артикул',
  purchasePrice: 'Ціна опт / закупівельна. З ПДВ вона чи без, вкажіть нижче',
  rrp: 'Рекомендована роздрібна ціна, завжди читається як ціна з ПДВ',
  stock: 'Наявність, залишок або кількість: «100+», «є», «під замовлення»',
  image: 'Посилання на фото товару (http…). Кілька посилань розділяйте пробілом, комою чи «;»; перше стане головним',
};

export type PriceColumnMap = { headerRow: number | null } & Record<PriceColumnRole, number | null>;

export const EMPTY_COLUMN_MAP: PriceColumnMap = {
  headerRow: null,
  code: null,
  sku: null,
  name: null,
  brand: null,
  unit: null,
  purchasePrice: null,
  currency: null,
  rrp: null,
  stock: null,
  multiplicity: null,
  minOrderQty: null,
  image: null,
};

/** Ключ заголовка: без регістру, пробілів і розділових знаків — «Ціна опт з ПДВ» → «цінаоптзпдв». */
export function headerKey(cell: string): string {
  return cell.toLocaleLowerCase('uk').replace(/[\s.,\-_/\\'’ʼ"()«»:;*]+/gu, '');
}

// Порядок важливий: перше правило, що збіглося, і виграє. rank — пріоритет у межах ролі (менше = краще).
const HEADER_RULES: { re: RegExp; role: PriceColumnRole; rank: number; plainArticle?: boolean }[] = [
  // РРЦ — до «ціни», бо «Ціна РРЦ» теж починається з «ціна»
  { re: /(ррц|rrp|msrp|роздрібн|розничн|рекомендован)/u, role: 'rrp', rank: 0 },
  // артикул виробника — до «Код…» і «Артикул»
  { re: /^(артикулвиробн|артикулпроизвод|кодвиробн|кодпроизвод|кодзаводс|модель|партномер|partnumber|каталожнийномер|mpn$)/u, role: 'sku', rank: 0 },
  { re: /^код1[сc]/u, role: 'code', rank: 0 },
  { re: /^код/u, role: 'code', rank: 1 },
  { re: /артикулпостачальн|артикулпост|^ідпостачальн/u, role: 'code', rank: 2 },
  // саме «Артикул» / SKU — артикул (або артикул виробника, якщо у файлі є «Код…»)
  { re: /^(артикул|артикултовару|артикулштрихкод|sku)$/u, role: 'code', rank: 3, plainArticle: true },
  // інші «Артикул …» («заміни», «2», «ТМ») — лише слабкий кандидат на артикул виробника
  { re: /^(артикул|sku)/u, role: 'sku', rank: 2 },
  { re: /(назва|найменуван|наименован|номенклатур|^товар|^опис|^описан|^name)/u, role: 'name', rank: 0 },
  { re: /(бренд|виробник|производител|торговамарк|^тм$|^brand|^марка)/u, role: 'brand', rank: 0 },
  { re: /(^одвим|^одиниц|^од$|^едизм|^единиц|^ед$|^unit|^uom)/u, role: 'unit', rank: 0 },
  { re: /(^валюта|^вал$|^currency|^cur$)/u, role: 'currency', rank: 0 },
  { re: /(ціна|цена|price|закупівель|закупочн|вхідн|^вхід|^опт|оптов|дилерськ|дилерск|собівартіст)/u, role: 'purchasePrice', rank: 0 },
  { re: /(наявн|налич|залишок|остаток|^склад|^stock|^qty$|запас)/u, role: 'stock', rank: 0 },
  { re: /(кількіст|кільк|колво|^ксть|количеств|^кво$)/u, role: 'stock', rank: 1 },
  { re: /(кратн|multipl)/u, role: 'multiplicity', rank: 0 },
  { re: /(мінзамовлен|мінімальнезамовлен|мінпарті|минзаказ|минимальныйзаказ|minorder|мінкть)/u, role: 'minOrderQty', rank: 0 },
  { re: /(^фото|^зображен|^изображен|^картинк|^image|^photo|^picture|^img)/u, role: 'image', rank: 0 },
];

export interface HeaderMatch {
  role: PriceColumnRole;
  rank: number;
  /** Просто «Артикул» (без уточнення): артикул, якщо у файлі немає колонки «Код…», інакше — артикул виробника. */
  plainArticle?: boolean;
}

/**
 * «Код…», що не є артикулом товару: митний (УКТ ЗЕД / ТН ВЭД), валюти, одиниці, країни, групи, складу тощо — такі колонки
 * не розпізнаємо зовсім (аудит 06.10).
 */
const NOT_PRODUCT_CODE =
  /^(код)?(укт?зед|уктвед|тнвэд|тнвед|hscode)|^код(валют|одиниц|едизм|одвим|країн|стран|груп|категор|склад|бренд|торговоїмарк|упаков|єдрпоу|едрпоу|клієнт|контрагент|покупц|замовн)/u;

/** Роль колонки за текстом заголовка; null — не впізнали. */
export function headerRole(cell: string): HeaderMatch | null {
  const key = headerKey(cell);
  if (!key || NOT_PRODUCT_CODE.test(key)) return null;
  const rule = HEADER_RULES.find((r) => r.re.test(key));
  return rule ? { role: rule.role, rank: rule.rank, ...(rule.plainArticle ? { plainArticle: true } : {}) } : null;
}

/** Колонки рядка заголовка → ролі (найкращий кандидат на роль; за однакового рангу — лівіший). */
export function mapHeaderRow(header: readonly string[]): Record<PriceColumnRole, number | null> {
  const matches = header.map((cell) => headerRole(cell ?? ''));
  // старий шаблон і прайси з «Код…» і «Артикул»: код — артикул, а «Артикул» — артикул виробника (каталог уже звірено так)
  const hasCodeColumn = matches.some((m) => m?.role === 'code' && !m.plainArticle);
  const best = new Map<PriceColumnRole, { index: number; rank: number }>();
  matches.forEach((match, index) => {
    if (!match) return;
    // ранг 1: явна колонка «Артикул виробника» (ранг 0) має перевагу
    const m = match.plainArticle && hasCodeColumn ? { role: 'sku' as const, rank: 1 } : match;
    const prev = best.get(m.role);
    if (!prev || m.rank < prev.rank) best.set(m.role, { index, rank: m.rank });
  });
  const out = {} as Record<PriceColumnRole, number | null>;
  for (const role of PRICE_COLUMN_ROLES) out[role] = best.get(role)?.index ?? null;
  return out;
}

const HEADER_SEARCH_ROWS = 20;

/** Скільки ролей упізнано в рядку (після розподілу «Код…» / «Артикул») — так шукаємо рядок заголовка під «шапкою». */
function headerScore(row: readonly string[]): number {
  return Object.values(mapHeaderRow(row)).filter((index) => index != null).length;
}

/** Рядок заголовка (з 0) серед перших 20 рядків; null — заголовка не знайдено. */
export function detectHeaderRow(rows: readonly string[][]): number | null {
  let bestRow: number | null = null;
  let bestScore = 1;
  for (let i = 0; i < Math.min(rows.length, HEADER_SEARCH_ROWS); i++) {
    const score = headerScore(rows[i] ?? []);
    if (score > bestScore) {
      bestScore = score;
      bestRow = i;
    }
  }
  return bestRow;
}

/** Автовизначення заголовка й колонок прайсу. */
export function detectColumns(rows: readonly string[][]): PriceColumnMap {
  const headerRow = detectHeaderRow(rows);
  if (headerRow == null) return { ...EMPTY_COLUMN_MAP };
  return { headerRow, ...mapHeaderRow(rows[headerRow] ?? []) };
}

const WITHOUT_VAT = /(безпдв|безндс|нетто|net(?!to)|ex\.?vat)/u;
const WITH_VAT = /(зпдв|зндс|сндс|зурахуваннямпдв|звключенимпдв|брутто|gross|inc\.?vat)/u;

/** «Ціна опт з ПДВ» → true, «Ціна без ПДВ» → false, без позначки → null. */
export function detectPriceIncludesVat(header: string | null | undefined): boolean | null {
  const key = headerKey(header ?? '');
  if (!key) return null;
  if (WITHOUT_VAT.test(key)) return false;
  if (WITH_VAT.test(key)) return true;
  return null;
}

/** Валюта із заголовка ціни: «Ціна, USD» → USD. */
export function detectHeaderCurrency(header: string | null | undefined): CurrencyCode | null {
  if (!header) return null;
  for (const token of header.split(/[\s,.()[\]/]+/u)) {
    const c = parseCurrency(token);
    if (c) return c;
  }
  return null;
}

// ── курс прайсу у файлі ────────────────────────────────────────────
export interface FileRates {
  USD: number | null;
  EUR: number | null;
  /** Де знайдено: «клітинка C2» / «колонка «Курс»»; null — не знайдено. */
  where: string | null;
}

const RATE_WORD = /курс|rate/iu;
/** Правдоподібний курс гривні до долара чи євро. */
const plausibleRate = (v: number | null): v is number => v != null && v >= 1 && v <= 1000;

function numberIn(text: string): number | null {
  const m = /\d+(?:[\s\u00a0]\d{3})*(?:[.,]\d+)?/u.exec(text.replace(RATE_WORD, ' '));
  const v = m ? parseLocaleNumber(m[0]).value : null;
  return plausibleRate(v) ? v : null;
}

function currencyIn(text: string): 'USD' | 'EUR' | null {
  if (/usd|\$|дол/iu.test(text)) return 'USD';
  if (/eur|€|євро/iu.test(text)) return 'EUR';
  return null;
}

const colName = (c: number) => (c < 26 ? String.fromCharCode(65 + c) : `${String.fromCharCode(64 + Math.floor(c / 26))}${String.fromCharCode(65 + (c % 26))}`);

/**
 * Курс прайсу у файлі: клітинка «Курс USD: 41,20» (число в ній, праворуч або під нею) у перших рядках
 * або колонка «Курс» (перше число під заголовком). Валюта — з тексту, інакше валюта прайсу.
 */
export function detectFileRates(rows: readonly string[][], priceCurrency: CurrencyCode): FileRates {
  const out: FileRates = { USD: null, EUR: null, where: null };
  const fallback: 'USD' | 'EUR' = priceCurrency === 'EUR' ? 'EUR' : 'USD';
  const scan = Math.min(rows.length, 30);
  for (let r = 0; r < scan; r++) {
    const row = rows[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const cell = (row[c] ?? '').trim();
      if (!cell || !RATE_WORD.test(cell)) continue;
      const rc = row.findIndex((x, i) => i > c && (x ?? '').trim() !== '');
      const right = rc >= 0 ? row[rc]! : '';
      const below = (rows[r + 1]?.[c] ?? '').trim();
      // де саме число: у самій клітинці, праворуч чи під нею (тоді це колонка «Курс»)
      const found =
        numberIn(cell) != null
          ? { value: numberIn(cell)!, where: `клітинка ${colName(c)}${r + 1}` }
          : numberIn(right) != null
            ? { value: numberIn(right)!, where: `клітинка ${colName(rc)}${r + 1}` }
            : numberIn(below) != null
              ? { value: numberIn(below)!, where: `колонка «${cell}»` }
              : null;
      if (!found) continue;
      const cur = currencyIn(cell) ?? currencyIn(right) ?? fallback;
      if (out[cur] != null) continue;
      out[cur] = found.value;
      out.where ??= found.where;
    }
  }
  return out;
}

// ── побудова рядків ────────────────────────────────────────────────
export interface BuildRowsOptions {
  /** Колонка ціни закупівлі — з ПДВ (ділимо на 1 + ПДВ). */
  pricesIncludeVat: boolean;
  /** Колонка РРЦ — з ПДВ (інакше множимо на 1 + ПДВ: у каталозі РРЦ зберігається з ПДВ). */
  rrpIncludesVat: boolean;
  vatRatePct: number;
  /** Валюта, якщо в прайсі немає колонки валюти. */
  currency: CurrencyCode;
  /** Рядки без ціни не імпортувати. */
  skipRowsWithoutPrice: boolean;
}

export const DEFAULT_BUILD_OPTIONS: BuildRowsOptions = {
  pricesIncludeVat: false,
  rrpIncludesVat: true,
  vatRatePct: 20,
  currency: 'UAH',
  skipRowsWithoutPrice: true,
};

export interface PreviewRow {
  /** Номер рядка у файлі, з 1 — як в Excel. */
  rowNumber: number;
  row: PriceImportRow;
  /** Ціна й РРЦ, як їх видно у файлі (для перегляду). */
  rawPrice: string;
  /** Рядок не піде в імпорт. */
  errors: string[];
  warnings: string[];
  skipped: boolean;
}

export interface BuildRowsResult {
  preview: PreviewRow[];
  /** Рядки, які підуть у джерело даних. */
  rows: PriceImportRow[];
  stats: {
    total: number;
    withPrice: number;
    noCode: number;
    /** Рядків, де артикул порожній і взято артикул виробника. */
    fromMakerArticle: number;
    duplicates: number;
    invalidPrice: number;
    withoutPrice: number;
  };
}

const TOTAL_ROW = /^(разом|всього|усього|итого|всего|total)\s*:?$/iu;

const text = (row: readonly string[], col: number | null): string => (col == null ? '' : (row[col] ?? '').trim());

/** Посилання на фото з клітинки: http(s), кілька — через пробіл, кому, «;» чи «|»; до 10. */
export function imageUrlsOf(raw: string): string[] {
  const urls = raw.split(/[\s,;|]+/u).filter((u) => /^https?:\/\/\S+$/iu.test(u));
  return [...new Set(urls)].slice(0, 10);
}

function positive(raw: string): number | null {
  const n = parseLocaleNumber(raw);
  return n.valid && n.value != null && n.value > 0 ? n.value : null;
}

/**
 * Таблиця + зіставлення колонок → рядки прайсу. Ціна зводиться до входу без ПДВ, РРЦ читається як ціна з ПДВ.
 * Порожні рядки й «Разом» пропускаються; за однакового артикула лишається перший рядок. Артикул порожній — береться
 * артикул виробника (правки замовника 06.10: файл лише з колонкою «Артикул»).
 */
export function buildPriceRows(
  rows: readonly string[][],
  mapping: PriceColumnMap,
  options: BuildRowsOptions = DEFAULT_BUILD_OPTIONS,
): BuildRowsResult {
  const preview: PreviewRow[] = [];
  const out: PriceImportRow[] = [];
  const seen = new Set<string>();
  const stats = { total: 0, withPrice: 0, noCode: 0, fromMakerArticle: 0, duplicates: 0, invalidPrice: 0, withoutPrice: 0 };
  const start = mapping.headerRow == null ? 0 : mapping.headerRow + 1;
  // власні артикули файлу: рядок, де артикул узято з артикула виробника, не відбирає його в рядка з таким власним артикулом
  const ownCodes = new Set<string>();
  for (let i = start; i < rows.length; i++) {
    const own = text(rows[i] ?? [], mapping.code);
    if (own) ownCodes.add(own);
  }

  for (let i = start; i < rows.length; i++) {
    const raw = rows[i] ?? [];
    if (raw.every((c) => (c ?? '').trim() === '')) continue;
    const name = text(raw, mapping.name);
    const ownCode = text(raw, mapping.code);
    const makerArticle = text(raw, mapping.sku);
    const code = ownCode || makerArticle;
    const fromMaker = !ownCode && !!makerArticle;
    if (!ownCode && TOTAL_ROW.test(name)) continue;

    stats.total++;
    const errors: string[] = [];
    const warnings: string[] = [];

    const rawPrice = text(raw, mapping.purchasePrice);
    const parsedPrice = parseLocaleNumber(rawPrice);
    let purchasePrice: number | null = null;
    if (rawPrice && (!parsedPrice.valid || parsedPrice.value == null)) {
      errors.push('Ціна не число');
      stats.invalidPrice++;
    } else if (parsedPrice.value != null) {
      if (parsedPrice.value < 0) errors.push('Від’ємна ціна');
      else purchasePrice = normalizeInputPrice(parsedPrice.value, options.pricesIncludeVat, options.vatRatePct);
    }

    const rawRrp = text(raw, mapping.rrp);
    const parsedRrp = parseLocaleNumber(rawRrp);
    const rrp =
      parsedRrp.valid && parsedRrp.value != null && parsedRrp.value > 0
        ? normalizeInputRrp(parsedRrp.value, options.rrpIncludesVat, options.vatRatePct)
        : null;
    if (rawRrp && rrp == null && !parsedRrp.valid) warnings.push('РРЦ не число');

    if (purchasePrice != null) stats.withPrice++;
    else {
      stats.withoutPrice++;
      if (!errors.length) {
        if (options.skipRowsWithoutPrice) errors.push('Немає ціни');
        else warnings.push('Немає ціни');
      }
    }

    if (!code) {
      errors.push('Порожній артикул');
      stats.noCode++;
    } else if (seen.has(code) || (fromMaker && ownCodes.has(code))) {
      errors.push('Артикул повторюється');
      stats.duplicates++;
    } else if (fromMaker) {
      warnings.push('Артикул взято з артикула виробника');
      stats.fromMakerArticle++;
    }

    // валюту з колонки не розпізнали — рядок не імпортуємо: інакше ціна потрапить у каталог не в тій валюті (ІМП-3)
    const rawCurrency = mapping.currency != null ? text(raw, mapping.currency) : '';
    const rowCurrency = rawCurrency ? parseCurrency(rawCurrency) : null;
    if (rawCurrency && !rowCurrency) errors.push('Невідома валюта');

    // колонку наявності не вибрано — наявність у каталозі не чіпаємо (null), а не скидаємо на «невідомо»
    const stock = mapping.stock != null ? parseStockText(text(raw, mapping.stock)) : { stockQty: null, availability: null };
    const unitRaw = text(raw, mapping.unit);
    const row: PriceImportRow = {
      code,
      sku: makerArticle || null,
      name: name || null,
      brand: text(raw, mapping.brand) || null,
      unitCode: unitRaw ? (normalizeUnit(unitRaw) ?? unitRaw) : null,
      purchasePrice,
      currency: rowCurrency ?? options.currency,
      rrp,
      stockQty: stock.stockQty,
      availability: stock.availability,
      multiplicity: positive(text(raw, mapping.multiplicity)),
      minOrderQty: positive(text(raw, mapping.minOrderQty)),
      imageUrls: mapping.image != null ? imageUrlsOf(text(raw, mapping.image)) : [],
    };

    const skipped = errors.length > 0;
    if (!skipped) {
      seen.add(code);
      out.push(row);
    }
    preview.push({ rowNumber: i + 1, row, rawPrice, errors, warnings, skipped });
  }

  return { preview, rows: out, stats };
}

/** Поле оновлення → колонка файлу, без якої його нема звідки взяти. */
const FIELD_COLUMNS: [PriceUpdateField, PriceColumnRole][] = [
  ['purchasePrice', 'purchasePrice'],
  ['rrp', 'rrp'],
  ['stock', 'stock'],
  ['nameWork', 'name'],
  ['brand', 'brand'],
  ['unitCode', 'unit'],
  ['multiplicity', 'multiplicity'],
  ['minOrderQty', 'minOrderQty'],
  ['images', 'image'],
];

/** Що з файлу оновити не можна (галочка вимкнена) і чому (правки замовника 28.09). */
export function unavailableFileFields(mapping: PriceColumnMap, sourceKind: PriceSourceKind): Partial<Record<PriceUpdateField, string>> {
  const out: Partial<Record<PriceUpdateField, string>> = {
    categoryPath: 'У файлі прайсу немає колонки категорії',
    barcode: 'У файлі прайсу немає колонки штрихкоду',
  };
  for (const [field, role] of FIELD_COLUMNS) if (mapping[role] == null) out[field] = 'У файлі не вибрано цю колонку (крок «Колонки»)';
  if (sourceKind === 'hybrid') {
    out.newProducts = 'Гібрид: нові позиції приходять лише за посиланням';
    out.markMissing = 'Гібрид: зниклі позначає лише вигрузка за посиланням';
  }
  return out;
}
