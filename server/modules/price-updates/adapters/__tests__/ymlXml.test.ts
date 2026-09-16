// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseYml, parseYmlRates, ymlStock } from '../ymlXml';
import { NO_PURCHASE_PRICES_WARNING } from '../collect';
import type { PriceRow } from '../types';

const FIXTURE = readFileSync(new URL('./fixtures/sandi.yml', import.meta.url), 'utf8');
const IMG = 'https://media.supplier-a.example/imagecache/full';
const RRP_ONLY = { hasPurchasePrice: false };

const byCode = (rows: PriceRow[], code: string) => rows.find((r) => r.code === code);

/** Мінімальна вигрузка в стилі Rozetka — для випадків, яких немає у вигрузці САНДІ. */
const yml = (offers: string, currencies = '<currency id="UAH" rate="1"/>') =>
  `<?xml version="1.0" encoding="UTF-8"?><yml_catalog date="2026-09-16 06:00"><shop>` +
  `<currencies>${currencies}</currencies>` +
  `<categories><category id="1">Труби</category><category id="2" parentId="1">Поліпропілен</category></categories>` +
  `<offers>${offers}</offers></shop></yml_catalog>`;

describe('вигрузка YML (САНДІ)', () => {
  it('усі пропозиції стають рядками, курси — з <currencies>', () => {
    const { rows, rates, warnings } = parseYml(FIXTURE);
    expect(rows.map((r) => r.code)).toEqual(['TS10045201', 'TS10045302', 'TS10045403', 'TS10045504', 'TS10045706']);
    expect(rates).toEqual({ USD: 41.1, EUR: 47.3 });
    expect(warnings).toEqual([]);
  });

  it('поля товару; ціна — РРЦ, коли в джерелі немає закупівельних цін', () => {
    const { rows, warnings } = parseYml(FIXTURE, RRP_ONLY);
    expect(byCode(rows, 'TS10045201')).toEqual({
      code: 'TS10045201',
      // vendorCode у САНДІ дублює код — артикул із param «Артикул»
      sku: 'TS74001',
      name: 'Шнур тефлоновий Prime 40 м для гермет. різьб. з’єднань TS74001 DemoBrand',
      brand: 'DemoBrand',
      unitCode: null,
      purchasePrice: null,
      currency: 'UAH',
      rrp: 78,
      stockQty: 99,
      availability: 'in_stock',
      multiplicity: null,
      minOrderQty: null,
      barcode: null,
      categoryPath: 'Ущільнювальні матеріали / Нитка пакувальна',
      imageUrls: [`${IMG}/2/0/20001.jpg`, `${IMG}/2/0/20001/20001_2.jpg`, `${IMG}/2/0/20001/20001_3.jpg`],
    });
    expect(warnings).toEqual([NO_PURCHASE_PRICES_WARNING]);
  });

  it('за замовчуванням ціна — закупівельна; oldprice не чіпаємо', () => {
    expect(byCode(parseYml(FIXTURE).rows, 'TS10045706')).toMatchObject({
      purchasePrice: 8734,
      rrp: null,
      sku: 'NEOCRM2054AP3',
      brand: 'DemoBrand3',
      categoryPath: 'Душові кабіни та бокси / Душова кабіна / Душова кабіна без піддона',
    });
  });

  it('порожній model, артикул із param; трирівнева категорія', () => {
    expect(byCode(parseYml(FIXTURE).rows, 'TS10045302')).toMatchObject({
      sku: 'TSK522',
      categoryPath: 'Труби і фітинги / Труби і фітинги PPR / PPR труби',
    });
  });

  it('instock до 5 — «мало»; фото не більше п’яти', () => {
    const row = byCode(parseYml(FIXTURE).rows, 'TS10045403');
    expect(row).toMatchObject({ stockQty: 3, availability: 'low_stock' });
    expect(row?.imageUrls).toHaveLength(5);
  });

  it('instock="0" — немає; заглушка no_img відкидається, пробіли в посиланнях кодуються', () => {
    const row = byCode(parseYml(FIXTURE).rows, 'TS10045504');
    expect(row).toMatchObject({ stockQty: 0, availability: 'out_of_stock', sku: '62915AD04' });
    expect(row?.imageUrls).toEqual([`${IMG}/2/0/20004%20/20004%20_2.jpg`, `${IMG}/2/0/20004%20/20004%20_3.jpg`]);
  });
});

describe('вигрузка YML (інші постачальники)', () => {
  it('валюта, кратність, наявність без кількості, одиночні вузли', () => {
    const body = yml(
      `<offer id="TA-1" available="true">
         <price>1,25</price><currencyId>USD</currencyId><categoryId>2</categoryId>
         <picture>https://example.com/ta-1.jpg</picture>
         <name>Труба PPR 20 (рос.)</name><name_ua>Труба PPR 20</name_ua>
         <vendor>Wavin</vendor><vendorCode>PPR-20</vendorCode><barcode>4820000000017</barcode>
         <param name="Кількість у заводській упаковці">100</param>
       </offer>`,
      '<currency id="UAH" rate="1"/><currency id="USD" rate="41.5"/>',
    );
    const { rows, rates, warnings } = parseYml(body);
    expect(rows).toEqual([
      {
        code: 'TA-1',
        sku: 'PPR-20',
        name: 'Труба PPR 20',
        brand: 'Wavin',
        unitCode: null,
        purchasePrice: 1.25,
        currency: 'USD',
        rrp: null,
        stockQty: null,
        availability: 'in_stock',
        multiplicity: 100,
        minOrderQty: null,
        barcode: '4820000000017',
        categoryPath: 'Труби / Поліпропілен',
        imageUrls: ['https://example.com/ta-1.jpg'],
      },
    ]);
    expect(rates).toEqual({ USD: 41.5, EUR: null });
    expect(warnings).toEqual([]);
  });

  it('без currencyId — валюта за замовчуванням; кратність не число — порожня; бренд із param', () => {
    const body = yml(
      `<offer id="A1" available="false"><price>10</price><name>Кран</name>
         <param name="Бренд">Icma</param><param name="Кратність">10 шт</param></offer>`,
    );
    expect(parseYml(body, { defaultCurrency: 'EUR' }).rows[0]).toMatchObject({
      currency: 'EUR',
      purchasePrice: 10,
      brand: 'Icma',
      multiplicity: null,
      availability: 'out_of_stock',
      stockQty: null,
    });
  });

  it('невідома валюта: ціни не беремо, попереджаємо', () => {
    const body = yml(
      '<offer id="A1"><price>10</price><currencyId>RUR</currencyId></offer><offer id="A2"><price>12</price><currencyId>UAH</currencyId></offer>',
    );
    const { rows, warnings } = parseYml(body);
    expect(rows.map((r) => [r.code, r.currency, r.purchasePrice])).toEqual([
      ['A1', null, null],
      ['A2', 'UAH', 12],
    ]);
    expect(warnings).toEqual([
      'Позицій без закупівельної ціни: 1',
      'Позицій без жодної ціни: 1',
      'Позицій з невідомою валютою (RUR): 1 — ціни не взято',
    ]);
  });

  it('пропозиції без id пропускаються, повтор id — перший рядок', () => {
    const body = yml(
      '<offer><price>1</price></offer><offer id=" "><price>1</price></offer>' +
        '<offer id="0045"><price>5</price></offer><offer id="0045"><price>6</price></offer><offer id="B"><price>7</price></offer>',
    );
    const { rows, warnings } = parseYml(body);
    expect(rows.map((r) => [r.code, r.purchasePrice])).toEqual([
      ['0045', 5],
      ['B', 7],
    ]);
    expect(warnings).toEqual(['Пропущено позицій без коду: 2', 'Повтори коду: 1 — узято перший рядок (0045)']);
  });

  it('не YML або обірваний файл — зрозуміла помилка', () => {
    expect(() => parseYml('<catalog><categories/></catalog>')).toThrow('немає розділу yml_catalog/shop');
    expect(() => parseYml(FIXTURE.slice(0, Math.floor(FIXTURE.length / 2)))).toThrow('не є коректним XML');
  });
});

describe('курси з <currencies>', () => {
  const currencies = (items: string) => {
    const body = yml('', items);
    return parseYml(body).rates;
  };

  it.each([
    ['гривня базова', '<currency id="UAH" rate="1"/><currency id="USD" rate="45.05"/><currency id="EUR" rate="52.1"/>', { USD: 45.05, EUR: 52.1 }],
    ['гривні в списку немає — курси вже в гривнях', '<currency id="USD" rate="41.2"/>', { USD: 41.2, EUR: null }],
    ['базовий долар, гривня в списку', '<currency id="USD" rate="1"/><currency id="UAH" rate="0.025"/>', { USD: 40, EUR: null }],
    ['базовий долар без гривні — перерахувати нема з чого', '<currency id="USD" rate="1"/><currency id="EUR" rate="1.1"/>', undefined],
    ['курс назвою банку', '<currency id="USD" rate="NBU"/><currency id="EUR" rate="50,5"/>', { USD: null, EUR: 50.5 }],
    ['лише гривня', '<currency id="UAH" rate="1"/>', undefined],
  ])('%s', (_, items, expected) => {
    expect(currencies(items)).toEqual(expected);
  });

  it('без розділу currencies — курсів немає', () => {
    expect(parseYmlRates(undefined)).toBeUndefined();
  });
});

describe('залишок пропозиції YML', () => {
  it.each([
    [{ '@_instock': '99', '@_available': 'true' }, 99, 'in_stock'],
    [{ '@_instock': '3' }, 3, 'low_stock'],
    [{ '@_instock': '0', '@_available': 'false' }, 0, 'out_of_stock'],
    [{ stock_quantity: '12' }, 12, 'in_stock'],
    [{ '@_available': 'true' }, null, 'in_stock'],
    [{ '@_available': 'false' }, null, 'out_of_stock'],
    [{}, null, 'unknown'],
  ])('%j → кількість %j, наявність %s', (offer, stockQty, availability) => {
    expect(ymlStock(offer)).toEqual({ stockQty, availability });
  });
});
