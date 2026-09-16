// @vitest-environment node
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  reportOf,
  toPriceUpdateDetail,
  toPriceUpdateDto,
  warningsOf,
  warningsText,
  type PriceImportRunRow,
} from '../modules/price-updates/priceUpdates.mapper';

const REPORT = {
  detailsDiffer: { total: 1, sample: [{ code: 'A-1', field: 'brand', catalog: 'Valtec', price: 'Grohe' }] },
  bigPriceChanges: { total: 0, sample: [] },
  relinked: { total: 0, sample: [] },
  notFound: { total: 0, sample: [] },
  skippedRows: { total: 0, sample: [] },
};

function run(part: Partial<PriceImportRunRow> = {}): PriceImportRunRow {
  return {
    id: 7,
    supplierId: 'sup-1',
    startedAt: new Date('2026-09-16T03:00:05.000Z'),
    finishedAt: new Date('2026-09-16T03:00:09.000Z'),
    source: 'auto',
    status: 'ok',
    fileId: null,
    fileName: null,
    productsTotal: 6867,
    added: 12,
    changed: 340,
    priceUp: 300,
    priceDown: 40,
    stockChanged: 910,
    missing: 3,
    skipped: 1,
    relinked: 2,
    restored: 1,
    detailsDiffer: 5,
    rateUsd: new Prisma.Decimal('41.25'),
    rateEur: null,
    errorText: null,
    warnings: 'Позицій без закупівельної ціни: 4\n\n',
    details: REPORT,
    userId: null,
    user: null,
    file: null,
    ...part,
  };
}

describe('запис журналу оновлень', () => {
  it('поля PriceUpdateDto, стан і нові лічильники', () => {
    expect(toPriceUpdateDto(run())).toEqual({
      id: 7,
      supplierId: 'sup-1',
      at: '2026-09-16T03:00:05.000Z',
      productsTotal: 6867,
      changed: 340,
      priceUp: 300,
      priceDown: 40,
      added: 12,
      missing: 3,
      stockChanged: 910,
      source: 'auto',
      fileName: null,
      rates: { USD: 41.25, EUR: null },
      user: null,
      status: 'ok',
      error: null,
      warnings: ['Позицій без закупівельної ціни: 4'],
      skipped: 1,
      relinked: 2,
      restored: 1,
      detailsDiffer: 5,
      finishedAt: '2026-09-16T03:00:09.000Z',
    });
  });

  it('у списку звіту немає, у картці — є', () => {
    expect('report' in toPriceUpdateDto(run())).toBe(false);
    expect(toPriceUpdateDetail(run()).report).toEqual(REPORT);
  });

  it('хто запустив і назва файлу: з поля запуску або із самого файлу', () => {
    const user = { id: 'u-1', shortName: 'Петренко О.' } as PriceImportRunRow['user'];
    const file = { id: 'f-1', fileName: 'прайс.xlsx' } as PriceImportRunRow['file'];
    expect(toPriceUpdateDto(run({ source: 'file', user, file })).fileName).toBe('прайс.xlsx');
    expect(toPriceUpdateDto(run({ source: 'file', user, file, fileName: 'інша назва.xlsx' })).fileName).toBe('інша назва.xlsx');
    expect(toPriceUpdateDto(run({ user })).user).toEqual({ id: 'u-1', shortName: 'Петренко О.' });
  });

  it('невдалий запуск несе текст помилки', () => {
    expect(toPriceUpdateDto(run({ status: 'error', errorText: 'Постачальник відмовив у доступі (HTTP 401)' }))).toMatchObject({
      status: 'error',
      error: 'Постачальник відмовив у доступі (HTTP 401)',
    });
  });
});

describe('попередження й звіт у базі', () => {
  it('попередження — по рядку, порожні рядки відкидаються', () => {
    expect(warningsText(['Перше', '  ', 'Друге\nз переносом'])).toBe('Перше\nДруге з переносом');
    expect(warningsText([])).toBeNull();
    expect(warningsOf('Перше\nДруге з переносом')).toEqual(['Перше', 'Друге з переносом']);
    expect(warningsOf(null)).toEqual([]);
  });

  it('звіт чужого формату не віддаємо', () => {
    expect(reportOf(null)).toBeNull();
    expect(reportOf([1, 2])).toBeNull();
    expect(reportOf({ detailsDiffer: {} })).toBeNull();
    expect(reportOf(REPORT)).toEqual(REPORT);
  });
});
