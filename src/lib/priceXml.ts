// Прайс у XML → таблиця для діалогу «Завантажити прайс» (правки замовника 28.09): постачальники без постійного посилання
// дають вигрузку файлом (ТЕПЛОАРМАТУРА — формат Prom: shop/items/item, штрихкод = артикул товару в каталозі). Також YML/Rozetka
// (yml_catalog/shop/offers/offer) і вигрузка кабінету SEQUOIA (Catalog/Product, 16.10). Заголовки колонок такі, що їх впізнає
// автовизначення прайсу; далі — звичайний шлях: колонки, «Що оновити», перегляд.
import { parseCurrency } from '@shared/parse';

/** Заголовки колонок таблиці з XML. «Ціна з ПДВ»: у вигрузках кабінетів — ціна для вашого облікового запису з ПДВ. */
export const PRICE_XML_HEADER = ['Артикул (штрихкод)', 'Артикул виробника', 'Назва', 'Бренд', 'Ціна з ПДВ', 'Валюта', 'Наявність', 'Фото', 'ID у вигрузці'] as const;

/**
 * Catalog/Product: код — SKU (як «Код» у їхньому CSV), ціни в гривнях. Гурт у $ чи EURO перераховуємо за курсом із самого
 * файлу (атрибут Rate), як у їхньому CSV: РРЦ у них у гривнях, а валюта в товару одна (рішення власника 16.10).
 * ПДВ у заголовку ціни не вказуємо — береться з картки постачальника.
 */
export const CATALOG_XML_HEADER = ['Код', 'Артикул виробника', 'Назва', 'Бренд', 'Ціна гурт, грн', 'Валюта', 'РРЦ, грн', 'Наявність', 'Фото'] as const;

/** Текст схожий на XML: після BOM і пробілів іде «<». */
export function looksLikeXml(text: string): boolean {
  return /^﻿?\s*</u.test(text.slice(0, 500));
}

const childrenOf = (el: Element, tag: string): Element[] => [...el.children].filter((c) => c.tagName === tag);
const textOf = (el: Element, tag: string): string => (childrenOf(el, tag)[0]?.textContent ?? '').trim();

/** true/false (атрибут чи тег available) → «є» / «немає»; немає відомостей — порожньо. */
function availabilityText(value: string | null): string {
  const v = (value ?? '').trim().toLowerCase();
  if (v === 'true' || v === '1') return 'є';
  if (v === 'false' || v === '0') return 'немає';
  return '';
}

/** Артикул YML буває параметром «Артикул». */
function paramOf(el: Element, name: string): string {
  const param = childrenOf(el, 'param').find((p) => (p.getAttribute('name') ?? '').trim().toLowerCase() === name);
  return (param?.textContent ?? '').trim();
}

function promRow(item: Element): string[] {
  return [
    textOf(item, 'barcode'),
    textOf(item, 'vendorCode'),
    textOf(item, 'name_ua') || textOf(item, 'name'),
    textOf(item, 'vendor'),
    textOf(item, 'priceuah') || textOf(item, 'price'),
    textOf(item, 'currencyId'),
    availabilityText(textOf(item, 'available') || item.getAttribute('available')),
    childrenOf(item, 'image')
      .map((i) => (i.textContent ?? '').trim())
      .filter(Boolean)
      .join(' '),
    item.getAttribute('id') ?? '',
  ];
}

function ymlRow(offer: Element): string[] {
  return [
    textOf(offer, 'barcode'),
    textOf(offer, 'vendorCode') || paramOf(offer, 'артикул'),
    textOf(offer, 'name_ua') || textOf(offer, 'name'),
    textOf(offer, 'vendor'),
    textOf(offer, 'price'),
    textOf(offer, 'currencyId'),
    availabilityText(offer.getAttribute('available') ?? textOf(offer, 'available')),
    childrenOf(offer, 'picture')
      .map((i) => (i.textContent ?? '').trim())
      .filter(Boolean)
      .join(' '),
    offer.getAttribute('id') ?? '',
  ];
}

/** Ціна Product у гривнях: гривнева як є, валютна × Rate; курсу немає чи він не число — порожньо (рядок без ціни). */
function catalogPriceUah(price: Element | undefined): string {
  const raw = (price?.textContent ?? '').trim();
  const value = Number(raw);
  if (!price || !raw || !Number.isFinite(value)) return '';
  const currency = parseCurrency(price.getAttribute('Currency') ?? '');
  if (currency === 'UAH') return String(value);
  const rate = Number(price.getAttribute('Rate'));
  if (!currency || !Number.isFinite(rate) || rate <= 0) return '';
  return String(Math.round(value * rate * 10_000) / 10_000);
}

const priceOfType = (product: Element, type: RegExp): Element | undefined =>
  childrenOf(product, 'Price').find((p) => type.test(p.getAttribute('PriceType') ?? ''));

/** Залишок по всіх філіях; тегу Stock немає — товару немає (їхній CSV віддавав лише позиції з залишком). */
function catalogStock(product: Element): string {
  const values = childrenOf(product, 'Stock')
    .map((s) => (s.textContent ?? '').trim())
    .filter(Boolean);
  const numbers = values.filter((v) => Number.isFinite(Number(v)));
  if (numbers.length) return String(numbers.reduce((sum, v) => sum + Number(v), 0));
  // лише текст («є», «>10») — розбере діалог прайсу; склеювати не можна: «10 5» прочитається як 105
  return values[0] ?? '0';
}

function catalogRow(product: Element): string[] {
  const names = childrenOf(product, 'Name');
  const name = names.find((n) => n.getAttribute('lng') === 'uk') ?? names[0];
  return [
    textOf(product, 'SKU'),
    textOf(product, 'Article'),
    (name?.textContent ?? '').trim(),
    textOf(product, 'Brand'),
    catalogPriceUah(priceOfType(product, /wholesale|гурт|опт/iu)),
    'UAH',
    catalogPriceUah(priceOfType(product, /ррц|rrp|рекоменд/iu)),
    catalogStock(product),
    textOf(product, 'Thumbnail'),
  ];
}

/** XML → рядки таблиці (перший — заголовок); помилка — зрозумілим текстом. */
export function priceXmlRows(text: string): string[][] {
  const doc = new DOMParser().parseFromString(text.replace(/^﻿/u, ''), 'text/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Не вдалося прочитати XML: файл пошкоджено або це не XML');
  const items = [...doc.getElementsByTagName('item')];
  if (items.length) return [[...PRICE_XML_HEADER], ...items.map(promRow)];
  const offers = [...doc.getElementsByTagName('offer')];
  if (offers.length) return [[...PRICE_XML_HEADER], ...offers.map(ymlRow)];
  const products = [...doc.getElementsByTagName('Product')];
  if (products.length) return [[...CATALOG_XML_HEADER], ...products.map(catalogRow)];
  throw new Error('У XML немає товарів: очікуємо вигрузку у форматі Prom (item), YML (offer) або Catalog (Product)');
}
