// Вигрузка САНДІ: один JSON із довідниками й товарами.
// { date, warehouses, brands: {id: {name}}, categories: {id: {parent_ref, name: {uk, ru}}}, attributes: {id: {uk, ru}},
//   products: { "<код>": { main, attributes: {attrId: {uk, ru}}, images: { main, additional } } } }
//
// Код — main.sku, артикул — main.vendorCode (у частини позицій порожній — тоді характеристика «Артикул»).
// Вхідна ціна — prices.purchase.cash.current, РРЦ — prices.retail.current, залишок — balance; усе в гривні.
// Фото: images.main (буває null) і images.additional — об'єкт {"2": url, …} або порожній масив; головне першим.
// Одиниці виміру у вигрузці немає; труби САНДІ продає метрами (ціна за м, «Вага нетто 1 м/п») відрізками — характеристика
// «Довжина труби, м»: тоді одиниця «м», кратність — довжина відрізка (4 / 3,9). Беруться лише для нових товарів: у наявних
// оновлення змінює тільки ціну й наявність, різницю показує у звіті (правки замовника 25.09 п.8).
import type { AdapterOptions, AdapterResult, Dict, PriceRow } from './types';
import { adapterOptions, availabilityForQty, emptyRow, imageList, isRecord, numberOrNull, positiveOrNull, textOf } from './types';
import { finishRows } from './collect';

/** Скільки рівнів категорій проходимо вгору (захист від зациклених посилань у вигрузці). */
const MAX_CATEGORY_DEPTH = 10;

const SKU_ATTRIBUTE = 'артикул';
const PIPE_LENGTH_ATTRIBUTE = 'довжина труби, м';
const METRE = 'м';

/** Довідники вигрузки, потрібні для рядка товару. */
interface SandiRefs {
  brands: Dict;
  categories: Dict;
  /** Id характеристики «Артикул» (у кожній вигрузці свій хеш). */
  skuAttributeId: string | null;
  /** Id характеристики «Довжина труби, м». */
  pipeLengthAttributeId: string | null;
}

/** Назва з двомовного поля: беремо українську, інакше російську. */
function localized(value: unknown): string | null {
  if (!isRecord(value)) return textOf(value);
  return textOf(value.uk) ?? textOf(value.ru);
}

/** Шлях категорії від кореня: 'Труби і фітинги / Латунний фітинг / Згін «Американка»'. */
function categoryPath(categories: Dict, ref: unknown): string | null {
  const parts: string[] = [];
  let current = textOf(ref);
  for (let depth = 0; current && depth < MAX_CATEGORY_DEPTH; depth++) {
    const node = categories[current];
    if (!isRecord(node)) break;
    const name = localized(node.name);
    if (name) parts.unshift(name);
    current = textOf(node.parent_ref);
  }
  return parts.length ? parts.join(' / ') : null;
}

function brandName(brands: Dict, ref: unknown): string | null {
  const key = textOf(ref);
  const node = key ? brands[key] : null;
  // id бренду без запису в довіднику нічого не каже менеджеру — краще порожньо
  return isRecord(node) ? textOf(node.name) : null;
}

/** Id характеристики за назвою (у кожній вигрузці свій хеш). */
function attributeId(attributes: Dict, wanted: string): string | null {
  for (const [id, names] of Object.entries(attributes)) {
    if (!isRecord(names)) continue;
    const name = localized(names)?.toLocaleLowerCase('uk');
    if (name === wanted) return id;
  }
  return null;
}

function images(node: unknown): string[] {
  if (!isRecord(node)) return [];
  const additional = isRecord(node.additional) || Array.isArray(node.additional) ? Object.values(node.additional) : [];
  return imageList([node.main, ...additional]);
}

function priceRow(item: unknown, refs: SandiRefs, options: AdapterOptions): PriceRow | null {
  const main = isRecord(item) && isRecord(item.main) ? item.main : null;
  const code = textOf(main?.sku);
  if (!isRecord(item) || !main || !code) return null;

  const prices = isRecord(main.prices) ? main.prices : {};
  const retail = isRecord(prices.retail) ? prices.retail : {};
  const purchase = isRecord(prices.purchase) ? prices.purchase : {};
  const cash = isRecord(purchase.cash) ? purchase.cash : {};
  const attributes = isRecord(item.attributes) ? item.attributes : {};
  const stockQty = numberOrNull(main.balance);
  const pipeLength = refs.pipeLengthAttributeId ? positiveOrNull(localized(attributes[refs.pipeLengthAttributeId])) : null;

  return {
    ...emptyRow(code),
    sku: textOf(main.vendorCode) ?? (refs.skuAttributeId ? localized(attributes[refs.skuAttributeId]) : null),
    name: localized(main.name),
    brand: brandName(refs.brands, main.brand),
    unitCode: pipeLength != null ? METRE : null,
    multiplicity: pipeLength,
    // «у прайсі немає закупівельних цін» у налаштуваннях джерела — беремо лише РРЦ
    purchasePrice: options.hasPurchasePrice ? positiveOrNull(cash.current) : null,
    // ціни у вигрузці САНДІ завжди в гривні
    currency: 'UAH',
    rrp: positiveOrNull(retail.current),
    stockQty,
    availability: availabilityForQty(stockQty),
    barcode: textOf(main.barcode),
    categoryPath: categoryPath(refs.categories, main.category),
    imageUrls: images(item.images),
  };
}

function* candidates(products: Dict, refs: SandiRefs, options: AdapterOptions): Generator<PriceRow | null> {
  for (const item of Object.values(products)) yield priceRow(item, refs, options);
}

/** JSON вигрузки САНДІ → рядки прайсу. */
export function parseSandiJson(body: string, options: Partial<AdapterOptions> = {}): AdapterResult {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch (e) {
    throw new Error('Вигрузка САНДІ не є коректним JSON', { cause: e });
  }
  if (!isRecord(data) || !isRecord(data.products)) throw new Error('У вигрузці САНДІ немає розділу products');

  const refs: SandiRefs = {
    brands: isRecord(data.brands) ? data.brands : {},
    categories: isRecord(data.categories) ? data.categories : {},
    skuAttributeId: isRecord(data.attributes) ? attributeId(data.attributes, SKU_ATTRIBUTE) : null,
    pipeLengthAttributeId: isRecord(data.attributes) ? attributeId(data.attributes, PIPE_LENGTH_ATTRIBUTE) : null,
  };
  return finishRows(candidates(data.products, refs, adapterOptions(options)));
}
