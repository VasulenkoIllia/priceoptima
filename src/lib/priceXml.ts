// Прайс у XML → таблиця для діалогу «Завантажити прайс» (правки замовника 28.09): постачальники без постійного посилання
// дають вигрузку файлом (ТЕПЛОАРМАТУРА — формат Prom: shop/items/item, штрихкод = наш код товару). Також YML/Rozetka
// (yml_catalog/shop/offers/offer). Заголовки колонок такі, що їх впізнає автовизначення прайсу; далі — звичайний шлях:
// колонки, «Що оновити», перегляд.

/** Заголовки колонок таблиці з XML. «Ціна з ПДВ»: у вигрузках кабінетів — ціна для вашого облікового запису з ПДВ. */
export const PRICE_XML_HEADER = ['Код (штрихкод)', 'Артикул', 'Назва', 'Бренд', 'Ціна з ПДВ', 'Валюта', 'Наявність', 'Фото', 'ID у вигрузці'] as const;

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

/** XML → рядки таблиці (перший — заголовок); помилка — зрозумілим текстом. */
export function priceXmlRows(text: string): string[][] {
  const doc = new DOMParser().parseFromString(text.replace(/^﻿/u, ''), 'text/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Не вдалося прочитати XML: файл пошкоджено або це не XML');
  const items = [...doc.getElementsByTagName('item')];
  const offers = items.length ? [] : [...doc.getElementsByTagName('offer')];
  if (!items.length && !offers.length) throw new Error('У XML немає товарів: очікуємо вигрузку у форматі Prom (item) або YML (offer)');
  return [[...PRICE_XML_HEADER], ...(items.length ? items.map(promRow) : offers.map(ymlRow))];
}
