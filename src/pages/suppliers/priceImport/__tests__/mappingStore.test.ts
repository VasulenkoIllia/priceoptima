import { describe, expect, it } from 'vitest';
import { detectColumns, EMPTY_COLUMN_MAP, type PriceColumnMap } from '../priceRows';
import { applySavedMapping, toSavedMapping, type SavedPriceMapping } from '../mappingStore';

const HEADER = ['Код 1С', 'Назва номенклатури', 'Ціна опт з ПДВ', 'Наявність філія'];
const ROWS = [HEADER, ['ТА-1', 'Кран', '219,00', '100+']];

const OPTIONS = { pricesIncludeVat: true, currency: 'UAH' as const, skipRowsWithoutPrice: true, markMissing: false };

describe('збереження зіставлень прайсу', () => {
  it('toSavedMapping запам’ятовує і заголовки колонок, і налаштування', () => {
    const saved = toSavedMapping(detectColumns(ROWS), HEADER, OPTIONS, 'Прайс');
    expect(saved).toMatchObject({
      sheetName: 'Прайс',
      headerRow: 0,
      pricesIncludeVat: true,
      currency: 'UAH',
      markMissing: false,
    });
    expect(saved.columns.code).toEqual({ index: 0, header: 'Код 1С' });
    expect(saved.columns.stock).toEqual({ index: 3, header: 'Наявність філія' });
    expect(saved.columns.sku).toBeUndefined();
  });
});

describe('applySavedMapping — підставляння минулого зіставлення', () => {
  const saved = (columns: SavedPriceMapping['columns'], headerRow: number | null = 0): SavedPriceMapping => ({
    sheetName: 'Прайс',
    headerRow,
    columns,
    ...OPTIONS,
  });

  it('без збереженого — лишається автовизначення', () => {
    const detected = detectColumns(ROWS);
    expect(applySavedMapping(detected, null, ROWS)).toEqual(detected);
  });

  it('колонка знаходиться за заголовком, навіть якщо посунулась', () => {
    const rows = [['№', ...HEADER], ['1', 'ТА-1', 'Кран', '219,00', '100+']];
    const result = applySavedMapping(detectColumns(rows), saved({ code: { index: 0, header: 'Код 1С' } }), rows);
    expect(result.code).toBe(1);
  });

  it('заголовок зник — береться автовизначення', () => {
    const detected = detectColumns(ROWS);
    const result = applySavedMapping(detected, saved({ code: { index: 2, header: 'Артикул постачальника' } }), ROWS);
    expect(result.code).toBe(detected.code);
  });

  it('ручний вибір колонки перебиває автовизначення', () => {
    // минулого разу ціною вручну позначили колонку «Наявність філія»
    const result = applySavedMapping(detectColumns(ROWS), saved({ purchasePrice: { index: 3, header: 'Наявність філія' } }), ROWS);
    expect(result.purchasePrice).toBe(3);
  });

  it('файл без заголовка — колонки беруться за номерами', () => {
    const rows = [['ТА-1', 'Кран', '219,00']];
    const columns = { code: { index: 0, header: '' }, name: { index: 1, header: '' }, purchasePrice: { index: 2, header: '' } };
    const result = applySavedMapping({ ...EMPTY_COLUMN_MAP }, saved(columns, null), rows);
    expect(result).toMatchObject<Partial<PriceColumnMap>>({ headerRow: null, code: 0, name: 1, purchasePrice: 2 });
  });
});
