// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSanwellStock, parseSanwellXml, sanwellUnit } from '../sanwell';
import { NO_PURCHASE_PRICES_WARNING } from '../collect';
import type { PriceRow } from '../types';

const FIXTURE = readFileSync(new URL('./fixtures/sanwell.xml', import.meta.url), 'utf8');
const MEDIA = 'http://media.supplier-b.example/assets/2';

const byCode = (rows: PriceRow[], code: string) => rows.find((r) => r.code === code);

/** Мінімальна вигрузка з однією категорією — для випадків, яких немає у справжньому файлі. */
const catalog = (products: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><catalog><metadata><currency>UAH</currency></metadata><categories>` +
  `<category id="1" name="Змішувачі" code="1">${products}</category></categories></catalog>`;

describe('вигрузка SANWELL (XML)', () => {
  it('товари з усіх гілок дерева категорій', () => {
    const { rows } = parseSanwellXml(FIXTURE);
    expect(rows.map((r) => r.code)).toEqual(['67042', '67183', '205419', '205826', '67934']);
  });

  it('закупівельних цін немає — попередження; позиція без РРЦ рахується окремо', () => {
    const { rows, warnings, rates } = parseSanwellXml(FIXTURE);
    expect(rows.every((r) => r.purchasePrice === null)).toBe(true);
    expect(warnings).toEqual([NO_PURCHASE_PRICES_WARNING, 'Позицій без жодної ціни: 1']);
    expect(rates).toBeUndefined();
  });

  it('поля товару: властивості, шлях категорії, фото з «Фото головне» першим', () => {
    const row = byCode(parseSanwellXml(FIXTURE).rows, '67042');
    expect(row).toEqual({
      code: '67042',
      sku: 'CMX510',
      name: 'Комплект картриджів DemoBrand4 для потрійного фільтра',
      brand: 'DemoBrand4',
      unitCode: 'шт',
      purchasePrice: null,
      currency: 'UAH',
      rrp: 812,
      stockQty: null,
      availability: 'in_stock',
      multiplicity: null,
      minOrderQty: null,
      barcode: '4820002000011',
      categoryPath: 'Системи очищення води / Картриджі',
      imageUrls: [
        `${MEDIA}/84BF1C9166CDBF58DC1E290DE5276B20/img/CD4ADD839E1AF26A317646E6C3F88EC7/1.jpg`,
        `${MEDIA}/84BF1C9166CDBF58DC1E290DE5276B20/img/303610091FD0D40E92450F5E9953464D/2.jpg`,
        `${MEDIA}/84BF1C9166CDBF58DC1E290DE5276B20/img/E01226B41073593B43DF1FED92010F3E/3.jpg`,
        `${MEDIA}/84BF1C9166CDBF58DC1E290DE5276B20/img/D6E5774FDC131A8486D9D75CA625D168/4.jpg`,
      ],
    });
  });

  it('залишок «&lt;10» з файлу — «мало», без кількості', () => {
    expect(byCode(parseSanwellXml(FIXTURE).rows, '67183')).toMatchObject({
      stockQty: null,
      availability: 'low_stock',
      rrp: 89.9,
    });
  });

  it('метр погонний → м; нуль на складі → 0 / немає; немає властивостей Модель і Штрих-код', () => {
    expect(byCode(parseSanwellXml(FIXTURE).rows, '205826')).toMatchObject({
      unitCode: 'м',
      stockQty: 0,
      availability: 'out_of_stock',
      rrp: 38.9,
      sku: null,
      barcode: null,
      brand: 'DemoBrand5',
      // подвійний пробіл у назві з вигрузки зведено
      name: 'Провід ПВС 3х1,0 DemoBrand5 (Демоград)100 м',
      categoryPath: 'Електрика / Кабель/провід',
    });
  });

  it('документи (isPhoto="false") у фото не потрапляють; «&gt;1000» — є в наявності', () => {
    const row = byCode(parseSanwellXml(FIXTURE).rows, '67934');
    expect(row).toMatchObject({ stockQty: null, availability: 'in_stock', unitCode: 'шт' });
    expect(row?.imageUrls).toHaveLength(3);
    expect(row?.imageUrls.some((url) => url.includes('index.cfm'))).toBe(false);
  });

  it('товар без ціни, одиниці, властивостей і фото', () => {
    expect(byCode(parseSanwellXml(FIXTURE).rows, '205419')).toMatchObject({
      rrp: null,
      unitCode: null,
      brand: null,
      imageUrls: [],
      stockQty: 0,
      availability: 'out_of_stock',
    });
  });

  it.each([
    ['0', 0, 'out_of_stock'],
    ['<10', null, 'low_stock'],
    ['11-100', null, 'in_stock'],
    ['101-1000', null, 'in_stock'],
    ['>1000', null, 'in_stock'],
    ['', null, 'unknown'],
    [undefined, null, 'unknown'],
    ['багато', null, 'unknown'],
    ['3', 3, 'low_stock'],
  ])('залишок %j → кількість %j, наявність %s', (raw, stockQty, availability) => {
    expect(parseSanwellStock(raw)).toEqual({ stockQty, availability });
  });

  it.each([
    ['штука', 'шт'],
    ['метр', 'м'],
    ['метр погонний', 'м'],
    ['кілограм', 'кг'],
    ['секція', 'секція'],
    [undefined, null],
  ])('одиниця %j → %j', (raw, unit) => {
    expect(sanwellUnit(raw)).toBe(unit);
  });

  it('товари без коду пропускаються, повтор коду — перший рядок', () => {
    const body = catalog(
      '<product code="" name="Без коду"><stock>0</stock></product>' +
        '<product name="Теж без коду"><stock>0</stock></product>' +
        '<product code="0045" name="Перший"><recommended-retail-price currency="UAH">10.00</recommended-retail-price><stock>0</stock></product>' +
        '<product code="0045" name="Другий"><recommended-retail-price currency="UAH">20.00</recommended-retail-price><stock>0</stock></product>',
    );
    const { rows, warnings } = parseSanwellXml(body);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ code: '0045', name: 'Перший', rrp: 10, categoryPath: 'Змішувачі' });
    expect(warnings).toEqual([
      'Пропущено позицій без коду: 2',
      'Повтори коду: 1, узято перший рядок (0045)',
      NO_PURCHASE_PRICES_WARNING,
    ]);
  });

  it('не той файл — зрозуміла помилка', () => {
    expect(() => parseSanwellXml('<yml_catalog><shop/></yml_catalog>')).toThrow('немає розділу catalog/categories');
    expect(() => parseSanwellXml('<catalog><categories><category></catalog>')).toThrow('не є коректним XML');
  });
});
