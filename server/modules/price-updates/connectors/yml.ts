// Вигрузка YML (формат Rozetka): <yml_catalog date><shop><currencies><categories><offers><offer id available instock?>
//   <price/><oldprice?/><currencyId/><categoryId/><picture/>…<name/><model?/><vendor/><vendorCode/><param name>…</param>
// Так вигружають САНДІ (sandi.yml) і кабінети багатьох постачальників.
//
// Код — атрибут offer id. Артикул — vendorCode; у САНДІ vendorCode дублює код, тоді беремо param «Артикул».
// Ціна у вигрузці одна: закупівельна, якщо так сказано в налаштуваннях джерела (hasPurchasePrice), інакше — РРЦ.
// Валюта — currencyId (без нього — валюта за замовчуванням); курси — з <currencies>, у гривнях за одиницю.
// Залишок — атрибут instock або тег stock_quantity; без кількості — лише available="true|false".
// Кратність — param «Кількість у заводській упаковці» чи «Кратність», якщо там число.
import { XMLParser } from 'fast-xml-parser';
import type { AvailabilityStatus, CurrencyCode } from '@shared/enums';
import { parseCurrency } from '@shared/parse';
import { round4 } from '@shared/pricing';
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

/** Назви param (у нижньому регістрі), які кладемо в окремі поля товару. */
const SKU_PARAM = 'артикул';
const BRAND_PARAM = 'бренд';
const BARCODE_PARAM = 'штрих-код';
const MULTIPLICITY_PARAMS = ['кількість у заводській упаковці', 'кратність'];

/** Скільки рівнів категорій проходимо вгору (захист від зациклених parentId). */
const MAX_CATEGORY_DEPTH = 10;

/** Заглушка «немає фото» (у САНДІ — …/img/no_img.jpg) замість справжнього зображення. */
const PLACEHOLDER_IMAGE = /\/no[-_]?im(?:g|age)\.[a-z]+$/iu;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // коди й артикули лишаємо текстом, інакше '0045' стане 45
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
});

interface Category {
  name: string | null;
  parentId: string | null;
}

/** Позиції з валютою, якої ми не знаємо (ціни не беремо). */
interface UnknownCurrencies {
  count: number;
  codes: Set<string>;
}

/**
 * <currencies><currency id rate/> → гривень за долар і євро.
 * Курс у YML — до базової валюти (rate="1"); зазвичай це гривня, але рахуємо й від іншої, якщо гривня в списку є.
 */
export function parseYmlRates(node: unknown): AdapterResult['rates'] {
  const rates = new Map<CurrencyCode, number>();
  for (const item of asArray(isRecord(node) ? node.currency : null)) {
    if (!isRecord(item)) continue;
    const code = parseCurrency(textOf(item['@_id']));
    // rate буває й назвою банку ('NBU', 'CB') — такий курс невідомий
    const rate = positiveOrNull(item['@_rate']);
    if (code && rate) rates.set(code, rate);
  }
  const usd = rates.get('USD');
  const eur = rates.get('EUR');
  if (usd == null && eur == null) return undefined;
  // гривні в списку немає, а базова — долар чи євро: перерахувати в гривні нема з чого
  const uah = rates.get('UAH') ?? (usd === 1 || eur === 1 ? null : 1);
  if (uah == null) return undefined;
  return { USD: usd == null ? null : round4(usd / uah), EUR: eur == null ? null : round4(eur / uah) };
}

/** Залишок пропозиції → кількість і статус наявності. */
export function ymlStock(offer: Dict): { stockQty: number | null; availability: AvailabilityStatus } {
  const qty = numberOrNull(offer['@_instock']) ?? numberOrNull(nodeText(offer.stock_quantity));
  if (qty != null) return { stockQty: Math.max(qty, 0), availability: availabilityForQty(qty) };
  const available = textOf(offer['@_available'])?.toLowerCase();
  if (available === 'true') return { stockQty: null, availability: 'in_stock' };
  if (available === 'false') return { stockQty: null, availability: 'out_of_stock' };
  return { stockQty: null, availability: 'unknown' };
}

function categories(node: unknown): Map<string, Category> {
  const out = new Map<string, Category>();
  for (const item of asArray(isRecord(node) ? node.category : null)) {
    if (!isRecord(item)) continue;
    const id = textOf(item['@_id']);
    if (id) out.set(id, { name: nodeText(item), parentId: textOf(item['@_parentId']) });
  }
  return out;
}

function categoryPath(tree: Map<string, Category>, ref: unknown): string | null {
  const parts: string[] = [];
  let current = textOf(ref);
  for (let depth = 0; current && depth < MAX_CATEGORY_DEPTH; depth++) {
    const category = tree.get(current);
    if (!category) break;
    if (category.name) parts.unshift(category.name);
    current = category.parentId;
  }
  return parts.length ? parts.join(' / ') : null;
}

/** <param name="…">значення</param> → мапа за назвою в нижньому регістрі (перше значення виграє). */
function params(offer: Dict): Map<string, string> {
  const out = new Map<string, string>();
  for (const item of asArray(offer.param)) {
    if (!isRecord(item)) continue;
    const name = textOf(item['@_name'])?.toLocaleLowerCase('uk');
    const value = nodeText(item);
    if (name && value && !out.has(name)) out.set(name, value);
  }
  return out;
}

function priceRow(
  offer: unknown,
  tree: Map<string, Category>,
  options: AdapterOptions,
  badCurrency: UnknownCurrencies,
): PriceRow | null {
  const code = isRecord(offer) ? textOf(offer['@_id']) : null;
  if (!isRecord(offer) || !code) return null;

  const props = params(offer);
  const vendorCode = nodeText(offer.vendorCode);
  const currencyText = nodeText(offer.currencyId);
  const currency = currencyText ? parseCurrency(currencyText) : options.defaultCurrency;
  if (currencyText && !currency) {
    badCurrency.count++;
    badCurrency.codes.add(currencyText);
  }
  // невідома валюта: краще без ціни, ніж долари, записані гривнями
  const price = currency ? positiveOrNull(nodeText(offer.price)) : null;
  const stock = ymlStock(offer);
  const pictures = asArray(offer.picture).filter((url) => typeof url === 'string' && !PLACEHOLDER_IMAGE.test(url.trim()));

  return {
    ...emptyRow(code),
    sku: vendorCode && vendorCode !== code ? vendorCode : (props.get(SKU_PARAM) ?? null),
    name: nodeText(offer.name_ua) ?? nodeText(offer.name) ?? nodeText(offer.model),
    brand: nodeText(offer.vendor) ?? props.get(BRAND_PARAM) ?? null,
    purchasePrice: options.hasPurchasePrice ? price : null,
    currency,
    rrp: options.hasPurchasePrice ? null : price,
    stockQty: stock.stockQty,
    availability: stock.availability,
    multiplicity: MULTIPLICITY_PARAMS.map((name) => positiveOrNull(props.get(name))).find((v) => v != null) ?? null,
    barcode: nodeText(offer.barcode) ?? props.get(BARCODE_PARAM) ?? null,
    categoryPath: categoryPath(tree, nodeText(offer.categoryId)),
    imageUrls: imageList(pictures),
  };
}

function* candidates(
  offers: unknown,
  tree: Map<string, Category>,
  options: AdapterOptions,
  badCurrency: UnknownCurrencies,
): Generator<PriceRow | null> {
  for (const offer of asArray(isRecord(offers) ? offers.offer : null)) yield priceRow(offer, tree, options, badCurrency);
}

/** YML-вигрузка → рядки прайсу й курси з неї. */
export function parseYml(body: string, options: Partial<AdapterOptions> = {}): AdapterResult {
  const data = parseXml(parser, body, 'YML');
  const root = isRecord(data) && isRecord(data.yml_catalog) ? data.yml_catalog : null;
  const shop = root && isRecord(root.shop) ? root.shop : null;
  if (!shop) throw new Error('У вигрузці YML немає розділу yml_catalog/shop');

  const badCurrency: UnknownCurrencies = { count: 0, codes: new Set() };
  const { rows, warnings } = finishRows(candidates(shop.offers, categories(shop.categories), adapterOptions(options), badCurrency));
  if (badCurrency.count) {
    warnings.push(`Позицій з невідомою валютою (${[...badCurrency.codes].join(', ')}): ${badCurrency.count}, ціни не взято`);
  }
  const rates = parseYmlRates(shop.currencies);
  return rates ? { rows, rates, warnings } : { rows, warnings };
}
