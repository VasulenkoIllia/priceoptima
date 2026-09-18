import { describe, expect, it } from 'vitest';
import { detectName1cColumns, name1cRowsOf, sumName1cResults } from '../name1cImport';

describe('назви 1С з Excel: колонки файлу', () => {
  it('заголовок з «Артикул» і «Найменування 1С»; назва 1С важливіша за просту назву', () => {
    const rows = [
      ['Вивантаження з 1С', '', ''],
      ['Код 1С', 'Артикул', 'Назва', 'Найменування 1С'],
      ['00-123', 'ЦР0000123', 'Змішувач', 'Змішувач д/раковини ЦЕРСАНІТ'],
    ];
    expect(detectName1cColumns(rows)).toEqual({ headerRow: 1, sku: 1, name1c: 3 });
    expect(name1cRowsOf(rows, detectName1cColumns(rows))).toEqual([{ sku: 'ЦР0000123', name1c: 'Змішувач д/раковини ЦЕРСАНІТ' }]);
  });

  it('«Код» + «Номенклатура»; без заголовка — дві перші колонки', () => {
    expect(detectName1cColumns([['Код', 'Номенклатура']])).toEqual({ headerRow: 0, sku: 0, name1c: 1 });
    expect(detectName1cColumns([['WI0001029', 'Кран 1/2']])).toEqual({ headerRow: null, sku: 0, name1c: 1 });
  });

  it('частини файлу підсумовуються', () => {
    const part = { matched: 2, updated: 1, unchanged: 1, notFound: ['A'], notFoundCount: 1, skipped: 0, duplicates: 0 };
    expect(sumName1cResults([part, { ...part, notFound: ['B'] }], 3, 1)).toEqual({
      matched: 4,
      updated: 2,
      unchanged: 2,
      notFound: ['A', 'B'],
      notFoundCount: 2,
      skipped: 3,
      duplicates: 1,
    });
  });
});
