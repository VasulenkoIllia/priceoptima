// Прайс постачальника: автовизначення заголовка й колонок за назвами (укр./рос.) і побудова рядків для імпорту.
// Чисті функції (без DOM) — покриті тестами.
import type { CurrencyCode } from '@shared/enums';
import { normalizeUnit, parseCurrency, parseLocaleNumber } from '@shared/parse';
import { normalizeInputPrice, round4 } from '@shared/pricing';
import type { PriceImportRow } from '@shared/types';
import { parseStockText } from './stock';

export type PriceColumnRole =
  | 'code'
  | 'sku'
  | 'name'
  | 'brand'
  | 'unit'
  | 'purchasePrice'
  | 'currency'
  | 'rrp'
  | 'stock'
  | 'multiplicity'
  | 'minOrderQty';

export const PRICE_COLUMN_ROLES: readonly PriceColumnRole[] = [
  'code',
  'sku',
  'name',
  'brand',
  'unit',
  'purchasePrice',
  'currency',
  'rrp',
  'stock',
  'multiplicity',
  'minOrderQty',
];

export const ROLE_LABELS: Record<PriceColumnRole, string> = {
  code: 'Код постачальника',
  sku: 'Артикул',
  name: 'Назва',
  brand: 'Бренд',
  unit: 'Одиниця',
  purchasePrice: 'Ціна закупівлі',
  currency: 'Валюта',
  rrp: 'РРЦ з ПДВ',
  stock: 'Наявність',
  multiplicity: 'Кратність',
  minOrderQty: 'Мін. замовлення',
};

export const ROLE_HINTS: Partial<Record<PriceColumnRole, string>> = {
  code: 'Код 1С, код товару або артикул постачальника — за ним звіряємо каталог',
  sku: 'Артикул виробника',
  purchasePrice: 'Ціна опт / закупівельна. З ПДВ вона чи без — нижче',
  rrp: 'Рекомендована роздрібна ціна, завжди читається як ціна з ПДВ',
  stock: 'Наявність, залишок або кількість: «100+», «є», «під замовлення»',
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
};

/** Ключ заголовка: без регістру, пробілів і розділових знаків — «Ціна опт з ПДВ» → «цінаоптзпдв». */
export function headerKey(cell: string): string {
  return cell.toLocaleLowerCase('uk').replace(/[\s.,\-_/\\'’ʼ"()«»:;]+/gu, '');
}

// Порядок важливий: перше правило, що збіглося, і виграє. rank — пріоритет у межах ролі (менше = краще).
const HEADER_RULES: { re: RegExp; role: PriceColumnRole; rank: number }[] = [
  // РРЦ — до «ціни», бо «Ціна РРЦ» теж починається з «ціна»
  { re: /(ррц|rrp|msrp|роздрібн|розничн|рекомендован)/u, role: 'rrp', rank: 0 },
  { re: /^код1[сc]/u, role: 'code', rank: 0 },
  { re: /^код(виробн|вироб|заводс)/u, role: 'sku', rank: 1 },
  { re: /^код/u, role: 'code', rank: 1 },
  { re: /артикулпостачальн|артикулпост|^ідпостачальн/u, role: 'code', rank: 2 },
  { re: /^(артикул|sku|модель|партномер|partnumber|каталожнийномер)/u, role: 'sku', rank: 0 },
  { re: /(назва|найменуван|наименован|номенклатур|^товар|^опис|^описан|^name)/u, role: 'name', rank: 0 },
  { re: /(бренд|виробник|производител|торговамарк|^тм$|^brand|^марка)/u, role: 'brand', rank: 0 },
  { re: /(^одвим|^одиниц|^од$|^едизм|^единиц|^ед$|^unit|^uom)/u, role: 'unit', rank: 0 },
  { re: /(^валюта|^вал$|^currency|^cur$)/u, role: 'currency', rank: 0 },
  { re: /(ціна|цена|price|закупівель|закупочн|вхідн|^вхід|^опт|оптов|дилерськ|дилерск|собівартіст)/u, role: 'purchasePrice', rank: 0 },
  { re: /(наявн|налич|залишок|остаток|^склад|^stock|^qty$|запас)/u, role: 'stock', rank: 0 },
  { re: /(кількіст|кільк|колво|^ксть|количеств|^кво$)/u, role: 'stock', rank: 1 },
  { re: /(кратн|multipl)/u, role: 'multiplicity', rank: 0 },
  { re: /(мінзамовлен|мінімальнезамовлен|мінпарті|минзаказ|минимальныйзаказ|minorder|мінкть)/u, role: 'minOrderQty', rank: 0 },
];

export interface HeaderMatch {
  role: PriceColumnRole;
  rank: number;
}

/** Роль колонки за текстом заголовка; null — не впізнали. */
export function headerRole(cell: string): HeaderMatch | null {
  const key = headerKey(cell);
  if (!key) return null;
  const rule = HEADER_RULES.find((r) => r.re.test(key));
  return rule ? { role: rule.role, rank: rule.rank } : null;
}

/** Колонки рядка заголовка → ролі (найкращий кандидат на роль; за однакового рангу — лівіший). */
export function mapHeaderRow(header: readonly string[]): Record<PriceColumnRole, number | null> {
  const best = new Map<PriceColumnRole, { index: number; rank: number }>();
  header.forEach((cell, index) => {
    const m = headerRole(cell ?? '');
    if (!m) return;
    const prev = best.get(m.role);
    if (!prev || m.rank < prev.rank) best.set(m.role, { index, rank: m.rank });
  });
  const out = {} as Record<PriceColumnRole, number | null>;
  for (const role of PRICE_COLUMN_ROLES) out[role] = best.get(role)?.index ?? null;
  return out;
}

const HEADER_SEARCH_ROWS = 20;

/** Скільки ролей упізнано в рядку — так шукаємо рядок заголовка під «шапкою» файлу. */
function headerScore(row: readonly string[]): number {
  return new Set(row.map((c) => headerRole(c ?? '')?.role).filter(Boolean)).size;
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

// ── побудова рядків ────────────────────────────────────────────────
export interface BuildRowsOptions {
  /** Колонка ціни закупівлі — з ПДВ (ділимо на 1 + ПДВ). */
  pricesIncludeVat: boolean;
  vatRatePct: number;
  /** Валюта, якщо в прайсі немає колонки валюти. */
  currency: CurrencyCode;
  /** Рядки без ціни не імпортувати. */
  skipRowsWithoutPrice: boolean;
}

export const DEFAULT_BUILD_OPTIONS: BuildRowsOptions = {
  pricesIncludeVat: false,
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
    duplicates: number;
    invalidPrice: number;
    withoutPrice: number;
  };
}

const TOTAL_ROW = /^(разом|всього|усього|итого|всего|total)\s*:?$/iu;

const text = (row: readonly string[], col: number | null): string => (col == null ? '' : (row[col] ?? '').trim());

function positive(raw: string): number | null {
  const n = parseLocaleNumber(raw);
  return n.valid && n.value != null && n.value > 0 ? n.value : null;
}

/**
 * Таблиця + зіставлення колонок → рядки прайсу. Ціна зводиться до входу без ПДВ, РРЦ читається як ціна з ПДВ.
 * Порожні рядки й «Разом» пропускаються; за однакового коду лишається перший рядок.
 */
export function buildPriceRows(
  rows: readonly string[][],
  mapping: PriceColumnMap,
  options: BuildRowsOptions = DEFAULT_BUILD_OPTIONS,
): BuildRowsResult {
  const preview: PreviewRow[] = [];
  const out: PriceImportRow[] = [];
  const seen = new Set<string>();
  const stats = { total: 0, withPrice: 0, noCode: 0, duplicates: 0, invalidPrice: 0, withoutPrice: 0 };
  const start = mapping.headerRow == null ? 0 : mapping.headerRow + 1;

  for (let i = start; i < rows.length; i++) {
    const raw = rows[i] ?? [];
    if (raw.every((c) => (c ?? '').trim() === '')) continue;
    const name = text(raw, mapping.name);
    const code = text(raw, mapping.code);
    if (!code && TOTAL_ROW.test(name)) continue;

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
    const rrp = parsedRrp.valid && parsedRrp.value != null && parsedRrp.value > 0 ? round4(parsedRrp.value) : null;
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
      errors.push('Порожній код');
      stats.noCode++;
    } else if (seen.has(code)) {
      errors.push('Код повторюється');
      stats.duplicates++;
    }

    const stock = parseStockText(text(raw, mapping.stock));
    const unitRaw = text(raw, mapping.unit);
    const row: PriceImportRow = {
      code,
      sku: text(raw, mapping.sku) || null,
      name: name || null,
      brand: text(raw, mapping.brand) || null,
      unitCode: unitRaw ? (normalizeUnit(unitRaw) ?? unitRaw) : null,
      purchasePrice,
      currency: parseCurrency(text(raw, mapping.currency)) ?? options.currency,
      rrp,
      stockQty: stock.stockQty,
      availability: stock.availability,
      multiplicity: positive(text(raw, mapping.multiplicity)),
      minOrderQty: positive(text(raw, mapping.minOrderQty)),
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
