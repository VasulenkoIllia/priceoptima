import { describe, expect, it } from 'vitest';
import { parseStockText } from '../stock';

describe('parseStockText — наявність з прайсу', () => {
  it.each([
    ['100+', { stockQty: 100, availability: 'in_stock' }],
    ['30+', { stockQty: 30, availability: 'in_stock' }],
    ['2', { stockQty: 2, availability: 'low_stock' }],
    ['0', { stockQty: 0, availability: 'out_of_stock' }],
    ['12 шт', { stockQty: 12, availability: 'in_stock' }],
    ['> 100', { stockQty: 100, availability: 'in_stock' }],
    ['від 50', { stockQty: 50, availability: 'in_stock' }],
    ['1 250', { stockQty: 1250, availability: 'in_stock' }],
    ['1,5', { stockQty: 1.5, availability: 'low_stock' }],
  ])('%s', (text, expected) => {
    expect(parseStockText(text)).toEqual(expected);
  });

  it.each([
    ['є', 'in_stock'],
    ['Є', 'in_stock'],
    ['в наявності', 'in_stock'],
    ['есть', 'in_stock'],
    ['багато', 'in_stock'],
    ['на складі', 'in_stock'],
    ['мало', 'low_stock'],
    ['обмежено', 'low_stock'],
    ['немає', 'out_of_stock'],
    ['не має', 'out_of_stock'],
    ['нет в наличии', 'out_of_stock'],
    ['відсутній', 'out_of_stock'],
    ['під замовлення', 'on_order'],
    ['Під замовлення', 'on_order'],
    ['под заказ', 'on_order'],
    ['очікується', 'on_order'],
  ])('%s → %s', (text, availability) => {
    expect(parseStockText(text).availability).toBe(availability);
  });

  it('порожнє, прочерк і невідоме слово — невідомо', () => {
    for (const v of ['', '   ', '-', '—', '?', null, undefined, 'хз']) {
      expect(parseStockText(v)).toEqual({ stockQty: null, availability: 'unknown' });
    }
  });

  it('число зі словами — і кількість, і статус', () => {
    expect(parseStockText('100+ на складі')).toEqual({ stockQty: 100, availability: 'in_stock' });
    expect(parseStockText('3 шт, під замовлення')).toEqual({ stockQty: 3, availability: 'on_order' });
  });

  it('число з клітинки Excel (не текст)', () => {
    expect(parseStockText(7)).toEqual({ stockQty: 7, availability: 'in_stock' });
    expect(parseStockText(0)).toEqual({ stockQty: 0, availability: 'out_of_stock' });
  });
});
