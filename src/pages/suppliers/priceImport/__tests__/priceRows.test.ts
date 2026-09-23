import { describe, expect, it } from 'vitest';
import {
  buildPriceRows,
  detectFileRates,
  detectColumns,
  detectHeaderCurrency,
  detectPriceIncludesVat,
  DEFAULT_BUILD_OPTIONS,
  headerRole,
  mapHeaderRow,
  type PriceColumnMap,
} from '../priceRows';

/** Заголовок типового прайсу з 1С: код, дві колонки наявності, ціна з ПДВ. */
const TA_HEADER = [
  'Код 1С',
  'Кількість',
  'Назва номенклатури',
  'Артикул',
  'Бренд',
  'Ціна опт з ПДВ',
  'Ціна РРЦ',
  'Наявність філія',
  'Наявність Україна',
];

const TA_ROWS = [
  TA_HEADER,
  ['ТА-100234', '4', 'Кран кульовий 1/2" в-в', 'VT.214.N.05', 'VALTEC', '219,00', '329,00', '100+', '30+'],
  ['ТА-100987', '', 'Труба ППР PN20 D20', 'PPR-20', 'Blue Ocean', '29,88', '45', '30+', ''],
];

describe('detectColumns — типовий прайс з 1С', () => {
  it('усі колонки за заголовком; «Ціна РРЦ» не плутається з ціною закупівлі', () => {
    expect(detectColumns(TA_ROWS)).toEqual({
      headerRow: 0,
      code: 0,
      sku: 3,
      name: 2,
      brand: 4,
      unit: null,
      purchasePrice: 5,
      currency: null,
      rrp: 6,
      stock: 7,
      multiplicity: null,
      minOrderQty: null,
    });
  });

  it('«Наявність» пріоритетніша за «Кількість», перша з двох колонок наявності', () => {
    const map = mapHeaderRow(TA_HEADER);
    expect(map.stock).toBe(7);
    expect(headerRole('Кількість')).toEqual({ role: 'stock', rank: 1 });
    expect(headerRole('Наявність філія')).toEqual({ role: 'stock', rank: 0 });
  });

  it('заголовок під «шапкою» файлу', () => {
    const rows = [['Прайс від 15.09.2026', '', ''], [''], ...TA_ROWS];
    expect(detectColumns(rows).headerRow).toBe(2);
  });

  it('заголовка немає — колонки не вгадуються', () => {
    expect(detectColumns([['ТА-1', 'Кран', '219']])).toEqual({
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
    });
  });

  it('синоніми: російські заголовки і наш шаблон', () => {
    expect(mapHeaderRow(['Код', 'Наименование', 'Ед. изм.', 'Цена закупочная', 'Валюта', 'Остаток'])).toMatchObject({
      code: 0,
      name: 1,
      unit: 2,
      purchasePrice: 3,
      currency: 4,
      stock: 5,
    });
    expect(
      mapHeaderRow([
        'Код постачальника*',
        'Артикул',
        'Назва*',
        'Бренд',
        'Одиниця',
        'Ціна закупівлі з ПДВ*',
        'Валюта',
        'РРЦ з ПДВ',
        'Наявність',
        'Кратність',
        'Мін. замовлення',
      ]),
    ).toEqual({
      code: 0,
      sku: 1,
      name: 2,
      brand: 3,
      unit: 4,
      purchasePrice: 5,
      currency: 6,
      rrp: 7,
      stock: 8,
      multiplicity: 9,
      minOrderQty: 10,
    });
  });

  it('«Артикул постачальника» — це код, «Код виробника» — артикул', () => {
    expect(mapHeaderRow(['Артикул постачальника', 'Код виробника'])).toMatchObject({ code: 0, sku: 1 });
  });

  it('ПДВ і валюта із заголовка ціни', () => {
    expect(detectPriceIncludesVat('Ціна опт з ПДВ')).toBe(true);
    expect(detectPriceIncludesVat('Ціна закупівлі без ПДВ')).toBe(false);
    // наш шаблон — ціни з ПДВ (п.7 правок): прапорець ставиться сам
    expect(detectPriceIncludesVat('Ціна закупівлі з ПДВ*')).toBe(true);
    expect(detectPriceIncludesVat('Ціна')).toBeNull();
    expect(detectHeaderCurrency('Ціна, USD')).toBe('USD');
    expect(detectHeaderCurrency('Ціна опт з ПДВ')).toBeNull();
  });
});

describe('buildPriceRows — рядки прайсу', () => {
  const mapping = detectColumns(TA_ROWS);

  it('ціни з ПДВ зводяться до входу без ПДВ, наявність — до статусу', () => {
    const res = buildPriceRows(TA_ROWS, mapping, { ...DEFAULT_BUILD_OPTIONS, pricesIncludeVat: true });
    expect(res.rows).toEqual([
      {
        code: 'ТА-100234',
        sku: 'VT.214.N.05',
        name: 'Кран кульовий 1/2" в-в',
        brand: 'VALTEC',
        unitCode: null,
        purchasePrice: 182.5,
        currency: 'UAH',
        rrp: 329,
        stockQty: 100,
        availability: 'in_stock',
        multiplicity: null,
        minOrderQty: null,
      },
      {
        code: 'ТА-100987',
        sku: 'PPR-20',
        name: 'Труба ППР PN20 D20',
        brand: 'Blue Ocean',
        unitCode: null,
        purchasePrice: 24.9,
        currency: 'UAH',
        rrp: 45,
        stockQty: 30,
        availability: 'in_stock',
        multiplicity: null,
        minOrderQty: null,
      },
    ]);
    expect(res.stats).toMatchObject({ total: 2, withPrice: 2, noCode: 0, duplicates: 0 });
  });

  it('без ПДВ ціна лишається як у файлі', () => {
    const res = buildPriceRows(TA_ROWS, mapping, { ...DEFAULT_BUILD_OPTIONS, pricesIncludeVat: false });
    expect(res.rows.map((r) => r.purchasePrice)).toEqual([219, 29.88]);
  });

  it('кома й крапка, валюта з колонки, одиниця з синоніма', () => {
    const rows = [
      ['Код', 'Назва', 'Од.', 'Ціна', 'Валюта', 'Кратність'],
      ['A-1', 'Кран', 'шт.', '1 234,56', 'USD', '6'],
      ['A-2', 'Труба', 'пог. м', '35.50', '$', ''],
    ];
    const res = buildPriceRows(rows, detectColumns(rows), DEFAULT_BUILD_OPTIONS);
    expect(res.rows).toMatchObject([
      { code: 'A-1', unitCode: 'шт', purchasePrice: 1234.56, currency: 'USD', multiplicity: 6 },
      { code: 'A-2', unitCode: 'м', purchasePrice: 35.5, currency: 'USD', multiplicity: null },
    ]);
  });

  it('РРЦ без ПДВ у прайсі зберігається з ПДВ, з ПДВ — як є', () => {
    const rows = [
      ['Код', 'Назва', 'Ціна', 'РРЦ'],
      ['A-1', 'Кран', '100', '150'],
    ];
    const mapping = detectColumns(rows);
    expect(buildPriceRows(rows, mapping, { ...DEFAULT_BUILD_OPTIONS, rrpIncludesVat: false }).rows[0].rrp).toBe(180);
    expect(buildPriceRows(rows, mapping, { ...DEFAULT_BUILD_OPTIONS, rrpIncludesVat: true }).rows[0].rrp).toBe(150);
  });

  it('невідома валюта в рядку — рядок не імпортуємо', () => {
    const rows = [
      ['Код', 'Назва', 'Ціна', 'Валюта'],
      ['A-1', 'Кран', '100', 'PLN'],
      ['A-2', 'Труба', '50', 'USD'],
      ['A-3', 'Фітинг', '20', ''],
    ];
    const res = buildPriceRows(rows, detectColumns(rows), DEFAULT_BUILD_OPTIONS);
    expect(res.rows.map((r) => [r.code, r.currency])).toEqual([
      ['A-2', 'USD'],
      ['A-3', 'UAH'],
    ]);
    expect(res.preview[0].errors).toEqual(['Невідома валюта']);
  });

  it('порожній код, дублікат коду, нечислова ціна і «Разом» — у підсумки, не в імпорт', () => {
    const rows = [
      ['Код', 'Назва', 'Ціна'],
      ['A-1', 'Кран', '100'],
      ['', 'Без коду', '50'],
      ['A-1', 'Кран (ще раз)', '120'],
      ['A-2', 'Труба', 'за домовленістю'],
      ['A-3', 'Фітинг', ''],
      ['', 'Разом', '270'],
    ];
    const res = buildPriceRows(rows, detectColumns(rows), DEFAULT_BUILD_OPTIONS);
    expect(res.rows.map((r) => r.code)).toEqual(['A-1']);
    expect(res.stats).toEqual({ total: 5, withPrice: 3, noCode: 1, duplicates: 1, invalidPrice: 1, withoutPrice: 2 });
    expect(res.preview.map((p) => p.errors)).toEqual([[], ['Порожній код'], ['Код повторюється'], ['Ціна не число'], ['Немає ціни']]);
  });

  it('рядки без ціни можна не пропускати', () => {
    const rows = [
      ['Код', 'Назва', 'Ціна'],
      ['A-3', 'Фітинг', ''],
    ];
    const res = buildPriceRows(rows, detectColumns(rows), { ...DEFAULT_BUILD_OPTIONS, skipRowsWithoutPrice: false });
    expect(res.rows).toHaveLength(1);
    expect(res.preview[0]).toMatchObject({ skipped: false, warnings: ['Немає ціни'] });
  });

  it('без рядка заголовка дані читаються з першого рядка', () => {
    const mapping: PriceColumnMap = { headerRow: null, code: 0, sku: null, name: 1, brand: null, unit: null, purchasePrice: 2, currency: null, rrp: null, stock: null, multiplicity: null, minOrderQty: null };
    const res = buildPriceRows([['A-1', 'Кран', '100']], mapping, DEFAULT_BUILD_OPTIONS);
    expect(res.rows).toHaveLength(1);
    expect(res.preview[0].rowNumber).toBe(1);
  });
});

describe('курс прайсу у файлі', () => {
  it('клітинка з курсом у шапці прайсу', () => {
    const rows = [['Прайс ТОВ «Постачальник»', '', 'Курс USD: 41,20'], ['Код', 'Назва', 'Ціна, $'], ['A1', 'Кран', '10']];
    expect(detectFileRates(rows, 'USD')).toEqual({ USD: 41.2, EUR: null, where: 'клітинка C1' });
  });

  it('курс праворуч від підпису і дві валюти', () => {
    const rows = [['Курс', '41.5'], ['Курс EUR', '48,10'], ['Код', 'Ціна']];
    expect(detectFileRates(rows, 'USD')).toEqual({ USD: 41.5, EUR: 48.1, where: 'клітинка B1' });
  });

  it('колонка «Курс»: перше число під заголовком; валюта — з валюти прайсу', () => {
    const rows = [['Код', 'Ціна', 'Курс'], ['A1', '10', '48,3']];
    expect(detectFileRates(rows, 'EUR')).toEqual({ USD: null, EUR: 48.3, where: 'колонка «Курс»' });
  });

  it('немає курсу або число неправдоподібне — нічого', () => {
    expect(detectFileRates([['Код', 'Ціна'], ['A1', '10']], 'USD')).toEqual({ USD: null, EUR: null, where: null });
    expect(detectFileRates([['Курс', '0,5']], 'USD').USD).toBeNull();
  });
});
