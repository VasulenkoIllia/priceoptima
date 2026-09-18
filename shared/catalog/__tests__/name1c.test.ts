import { describe, expect, it } from 'vitest';
import { normalizeSku } from '../../parse/sku';
import { planName1cImport } from '../name1c';

const product = (id: string, sku: string, name1c: string | null = null) => ({ id, skuKey: normalizeSku(sku), name1c });

describe('назви 1С з Excel (п.9.2 правок)', () => {
  const products = [product('p1', 'ЦР-0000123'), product('p2', 'WI0001029', 'Кран 1/2 (1С)'), product('p3', '7708')];

  it('артикул нормалізується як у каталозі; змінюються лише інші назви', () => {
    const plan = planName1cImport(
      [
        { sku: 'цр 0000123', name1c: '  Змішувач   для раковини ' },
        { sku: 'WI0001029', name1c: 'Кран 1/2 (1С)' },
        { sku: 'XX-1', name1c: 'Немає в каталозі' },
      ],
      products,
    );
    expect(plan.updates).toEqual([{ id: 'p1', name1c: 'Змішувач для раковини' }]);
    expect(plan).toMatchObject({ matched: 2, unchanged: 1, notFound: ['XX-1'], skipped: 0, duplicates: 0 });
  });

  it('без артикула або назви — пропуск (наявну назву не стираємо); повтор артикула — останній', () => {
    const plan = planName1cImport(
      [
        { sku: '', name1c: 'Без артикула' },
        { sku: '7708', name1c: '' },
        { sku: '7708', name1c: 'Врізка 1' },
        { sku: '7708', name1c: 'Врізка 2' },
      ],
      products,
    );
    expect(plan.updates).toEqual([{ id: 'p3', name1c: 'Врізка 2' }]);
    expect(plan).toMatchObject({ skipped: 2, duplicates: 1, matched: 1 });
  });
});
