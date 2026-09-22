import { describe, expect, it } from 'vitest';
import { COL, parseColId } from '../colIds';
import { pasteSkusSummary, planPaste } from '../paste';

const LINES = ['l1', 'l2', 'l3'];
const SKU = COL.block('blk-1', 'sku');

describe('planPaste — колонка «Артикул»', () => {
  it('масова вставка вниз від фокусного рядка; порожні клітинки пропускаються', () => {
    const plan = planPaste({ text: 'СІ-100\r\n\r\n СІ-300 \r\n', colId: SKU, lineIds: LINES });
    expect(plan).toEqual({
      kind: 'skus',
      blockId: 'blk-1',
      targets: [
        { lineId: 'l1', sku: 'СІ-100' },
        { lineId: 'l3', sku: 'СІ-300' },
      ],
      overflow: 0,
    });
  });

  it('із кількох колонок Excel береться перша; зайві артикули — overflow', () => {
    const plan = planPaste({ text: 'A1\tназва 1\nA2\tназва 2\nA3\tx\nA4\ty\n', colId: SKU, lineIds: ['l1', 'l2'] });
    expect(plan.kind).toBe('skus');
    if (plan.kind !== 'skus') return;
    expect(plan.targets.map((t) => t.sku)).toEqual(['A1', 'A2']);
    expect(plan.overflow).toBe(2);
  });

  it('рядки — у порядку показу сітки (з фільтром), починаючи з фокусного', () => {
    const plan = planPaste({ text: 'X1\nX2', colId: SKU, lineIds: ['l7', 'l3'] });
    expect(plan).toEqual({ kind: 'skus', blockId: 'blk-1', targets: [{ lineId: 'l7', sku: 'X1' }, { lineId: 'l3', sku: 'X2' }], overflow: 0 });
  });

  it('вставка в останній рядок: артикули без рядків не губляться мовчки', () => {
    const plan = planPaste({ text: 'A\nB', colId: SKU, lineIds: [] });
    expect(plan).toMatchObject({ kind: 'skus', targets: [], overflow: 2 });
  });
});

describe('planPaste — колонки клієнта', () => {
  it('з «Найменування»: назва | од. | к-сть; наявні рядки оновлюються, решта — нові рядки', () => {
    const text = 'Змішувач д/раковини\tшт\t2\r\n"Кран ""Ду25""\tз ручкою"\tшт.\t1,5\r\nТруба ППР 20\tм\t118\r\n';
    const plan = planPaste({ text, colId: COL.line('clientName'), lineIds: ['l1', 'l2'] });
    expect(plan).toEqual({
      kind: 'lines',
      updates: [
        { id: 'l1', patch: { clientName: 'Змішувач д/раковини', clientUnit: 'шт', qty: 2 } },
        { id: 'l2', patch: { clientName: 'Кран "Ду25"\tз ручкою', clientUnit: 'шт.', qty: 1.5 } },
      ],
      newRows: [{ clientName: 'Труба ППР 20', clientUnit: 'м', qty: 118 }],
      invalid: 0,
    });
  });

  it('одна колонка з «Найменування» — лише назви; од. і к-сть наявних рядків не чіпаються', () => {
    const plan = planPaste({ text: 'А\nБ\n', colId: COL.line('clientName'), lineIds: ['l1'] });
    // одиницю не передаємо — новий рядок отримає типове «шт» у createRequestLine
    expect(plan).toEqual({ kind: 'lines', updates: [{ id: 'l1', patch: { clientName: 'А' } }], newRows: [{ clientName: 'Б' }], invalid: 0 });
  });

  it('з «К-сть»: лише кількість; некоректні числа пропускаються й рахуються', () => {
    const plan = planPaste({ text: '10\nабв\n1 200,5\n', colId: COL.line('qty'), lineIds: LINES });
    expect(plan).toEqual({
      kind: 'lines',
      updates: [
        { id: 'l1', patch: { qty: 10 } },
        { id: 'l3', patch: { qty: 1200.5 } },
      ],
      newRows: [],
      invalid: 1,
    });
  });

  it('з «Од.»: одиниця і кількість; порожня одиниця → null', () => {
    const plan = planPaste({ text: '\t3\nкомпл\t1', colId: COL.line('clientUnit'), lineIds: ['l1', 'l2'] });
    expect(plan).toMatchObject({
      kind: 'lines',
      updates: [
        { id: 'l1', patch: { clientUnit: null, qty: 3 } },
        { id: 'l2', patch: { clientUnit: 'компл', qty: 1 } },
      ],
    });
  });

  it('з «№» — як з «Найменування»; рядки без даних не створюються', () => {
    const plan = planPaste({ text: 'Новий 1\nНовий 2', colId: COL.pos, lineIds: [] });
    expect(plan).toEqual({ kind: 'lines', updates: [], newRows: [{ clientName: 'Новий 1' }, { clientName: 'Новий 2' }], invalid: 0 });
  });
});

describe('planPaste — інше', () => {
  it('порожній буфер', () => {
    expect(planPaste({ text: '', colId: SKU, lineIds: LINES }).kind).toBe('empty');
    expect(planPaste({ text: '\r\n\t\r\n', colId: SKU, lineIds: LINES }).kind).toBe('empty');
  });

  it('ціни, «Обрано», колонки порівняння — вставка не підтримується', () => {
    for (const colId of [COL.block('blk-1', 'net'), COL.block('blk-1', 'note'), COL.chosen, COL.compare('blk-1'), 'ag-Grid-SelectionColumn']) {
      expect(planPaste({ text: 'X', colId, lineIds: LINES }).kind).toBe('unsupported');
    }
  });

  it('підсумок «вставлено N, не знайдено M»', () => {
    expect(pasteSkusSummary({ applied: 12, notFound: ['A', 'B', 'C', 'D'], ambiguous: [], skipped: 0 })).toBe(
      'Вставлено артикулів: 12, не знайдено 4 (A, B, C …)',
    );
    expect(pasteSkusSummary({ applied: 3, notFound: [], ambiguous: ['X'], skipped: 2 })).toBe(
      'Вставлено артикулів: 3, кілька збігів 1 (X), не вистачило рядків: 2',
    );
    expect(pasteSkusSummary({ applied: 5, notFound: [], ambiguous: [], skipped: 0 })).toBe('Вставлено артикулів: 5');
  });
});

describe('colIds', () => {
  it('розбір ідентифікаторів колонок', () => {
    expect(parseColId(COL.block('bl-000001-s1', 'pick'))).toEqual({ kind: 'block', blockId: 'bl-000001-s1', field: 'pick' });
    expect(parseColId(COL.compare('b:2'))).toEqual({ kind: 'compare', blockId: 'b:2' });
    expect(parseColId(COL.line('qty'))).toEqual({ kind: 'line', field: 'qty' });
    expect(parseColId('line:kpName')).toEqual({ kind: 'other' });
    expect(parseColId('b:x:unknown')).toEqual({ kind: 'other' });
    expect(parseColId(undefined)).toEqual({ kind: 'other' });
  });
});
