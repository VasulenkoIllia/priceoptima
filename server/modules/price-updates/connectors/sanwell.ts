// Вигрузка SANWELL: XML із деревом категорій, товари — листя цього дерева.
// <catalog><metadata>…<currency>UAH</currency></metadata><categories><category id name code>…
//   <product code name><recommended-retail-price currency><stock><measure-unit><properties><media>
//
// Закупівельних цін у вигрузці немає взагалі: рядки несуть purchasePrice = null (і попередження в результаті).
// Штрихкод, бренд і артикул — із властивостей «Штрих-код», «Бренд», «Модель».
// «Кількість штук в упаковці» кратністю не вважаємо: так позначено набір, що продається як одна позиція
// (стяжки «100 штук» за 23 грн).
//
// Залишок постачальник дає діапазоном, точної кількості ми не знаємо:
//   '0'         → 0 / немає
//   '<10'       → null / мало
//   '11-100'    → null / є
//   '101-1000'  → null / є
//   '>1000'     → null / є
// Кількість лишаємо порожньою (крім нуля) — інакше в заявці показувався б вигаданий залишок.
import { XMLParser } from 'fast-xml-parser';
import type { AvailabilityStatus } from '@shared/enums';
import { parseCurrency } from '@shared/parse';
import type { AdapterOptions, AdapterResult, Dict, PriceRow } from './types';
import {
  adapterOptions,
  asArray,
  availabilityForQty,
  emptyRow,
  imageList,
  isRecord,
  nodeText,
  numberOrNull,
  positiveOrNull,
  textOf,
} from './types';
import { finishRows, parseXml } from './collect';

/** Назви властивостей (у нижньому регістрі), які кладемо в окремі поля товару. */
const BRAND_PROPERTY = 'бренд';
const BARCODE_PROPERTY = 'штрих-код';
const SKU_PROPERTY = 'модель';

const MAIN_PHOTO_TYPE = 'фото головне';

/** Одиниці SANWELL → коди довідника; невідомі лишаємо як є. */
const UNITS: Record<string, string> = {
  штука: 'шт',
  метр: 'м',
  'метр погонний': 'м',
  кілограм: 'кг',
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // код товару буває суто числовий — лишаємо його текстом, інакше '0045' стане 45
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
});

/** Діапазон залишку SANWELL → кількість і статус наявності. */
export function parseSanwellStock(raw: unknown): { stockQty: number | null; availability: AvailabilityStatus } {
  const text = textOf(raw)?.replace(/\s+/gu, '');
  if (!text) return { stockQty: null, availability: 'unknown' };
  if (/^0+$/u.test(text)) return { stockQty: 0, availability: 'out_of_stock' };
  // '<10' — товар закінчується
  if (/^[<≤]\d+$/u.test(text)) return { stockQty: null, availability: 'low_stock' };
  // '11-100', '101-1000', '>1000' — товар є, скільки саме — постачальник не каже
  if (/^\d+-\d+$/u.test(text) || /^[>≥]\d+$/u.test(text)) return { stockQty: null, availability: 'in_stock' };
  // точне число, якщо колись з'явиться
  const qty = numberOrNull(text);
  return qty == null ? { stockQty: null, availability: 'unknown' } : { stockQty: qty, availability: availabilityForQty(qty) };
}

/** 'штука' → 'шт', 'метр погонний' → 'м'; інше — як у вигрузці. */
export function sanwellUnit(raw: unknown): string | null {
  const text = textOf(raw);
  return text ? (UNITS[text.toLocaleLowerCase('uk')] ?? text) : null;
}

/** <properties><property name value/> → мапа за назвою в нижньому регістрі (перше значення виграє). */
function properties(node: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (!isRecord(node)) return out;
  for (const item of asArray(node.property)) {
    if (!isRecord(item)) continue;
    const name = textOf(item['@_name'])?.toLocaleLowerCase('uk');
    const value = textOf(item['@_value']);
    if (name && value && !out.has(name)) out.set(name, value);
  }
  return out;
}

/** <media><media-item type url isPhoto/> — лише фото (без інструкцій і креслень), «Фото головне» першим. */
function images(node: unknown): string[] {
  if (!isRecord(node)) return [];
  const photos = asArray(node['media-item'])
    .filter(isRecord)
    .filter((item) => textOf(item['@_isPhoto'])?.toLowerCase() === 'true');
  const isMain = (item: Dict) => textOf(item['@_type'])?.toLocaleLowerCase('uk') === MAIN_PHOTO_TYPE;
  const ordered = [...photos.filter(isMain), ...photos.filter((item) => !isMain(item))];
  return imageList(ordered.map((item) => item['@_url']));
}

function priceRow(node: Dict, path: readonly string[], options: AdapterOptions): PriceRow | null {
  const code = textOf(node['@_code']);
  if (!code) return null;
  const props = properties(node.properties);
  const price = node['recommended-retail-price'];
  const priceCurrency = isRecord(price) ? parseCurrency(textOf(price['@_currency'])) : null;
  const stock = parseSanwellStock(node.stock);

  return {
    ...emptyRow(code),
    sku: props.get(SKU_PROPERTY) ?? null,
    name: textOf(node['@_name']),
    brand: props.get(BRAND_PROPERTY) ?? null,
    unitCode: sanwellUnit(node['measure-unit']),
    // закупівельних цін у вигрузці немає — лишаємо порожньою
    purchasePrice: null,
    currency: priceCurrency ?? options.defaultCurrency,
    rrp: positiveOrNull(nodeText(price)),
    stockQty: stock.stockQty,
    availability: stock.availability,
    barcode: props.get(BARCODE_PROPERTY) ?? null,
    categoryPath: path.length ? path.join(' / ') : null,
    imageUrls: images(node.media),
  };
}

/** Дерево категорій обходимо вглиб, назви складаємо у шлях. */
function* candidates(node: Dict, path: string[], options: AdapterOptions): Generator<PriceRow | null> {
  for (const product of asArray(node.product)) {
    yield isRecord(product) ? priceRow(product, path, options) : null;
  }
  for (const child of asArray(node.category)) {
    if (!isRecord(child)) continue;
    const name = textOf(child['@_name']);
    yield* candidates(child, name ? [...path, name] : path, options);
  }
}

/** XML вигрузки SANWELL → рядки прайсу (лише РРЦ). */
export function parseSanwellXml(body: string, options: Partial<AdapterOptions> = {}): AdapterResult {
  const data = parseXml(parser, body, 'SANWELL');
  const catalog = isRecord(data) && isRecord(data.catalog) ? data.catalog : null;
  if (!catalog || !isRecord(catalog.categories)) throw new Error('У вигрузці SANWELL немає розділу catalog/categories');

  // валюта з metadata — запасна для цін без атрибута currency
  const metadata = isRecord(catalog.metadata) ? catalog.metadata : {};
  const opts = adapterOptions(options);
  const currency = parseCurrency(textOf(metadata.currency)) ?? opts.defaultCurrency;
  return finishRows(candidates(catalog.categories, [], { ...opts, defaultCurrency: currency }));
}
