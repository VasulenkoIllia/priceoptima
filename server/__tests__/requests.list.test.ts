import { describe, expect, it } from 'vitest';
import { requestListOrderBy, requestListWhere } from '../modules/requests/requests.service';

const actor = { id: 'u-me' };

describe('реєстр: умова пошуку й фільтрів', () => {
  it('номер КП «2114 / 005001» — пошук за номером заявки', () => {
    expect(requestListWhere({ search: '2114 / 005001' }, actor)).toMatchObject({ number: 5001 });
    expect(requestListWhere({ search: '2114/77' }, actor)).toMatchObject({ number: 77 });
  });

  it('слова: у шапці заявки, або всі в назві однієї позиції, або запит в артикулі', () => {
    const where = requestListWhere({ search: 'Кран 1/2' }, actor);
    expect(where.OR).toEqual([
      { AND: [{ searchText: { contains: 'кран' } }, { searchText: { contains: '1/2' } }] },
      { lines: { some: { AND: [{ clientName: { contains: 'кран', mode: 'insensitive' } }, { clientName: { contains: '1/2', mode: 'insensitive' } }] } } },
      { offers: { some: { sku: { contains: 'Кран 1/2', mode: 'insensitive' } } } },
    ]);
  });

  it('«Мої» важливіше за вибраного відповідального', () => {
    expect(requestListWhere({ mine: true, managerId: 'u-other' }, actor)).toMatchObject({ managerId: 'u-me' });
    expect(requestListWhere({ managerId: 'u-other' }, actor)).toMatchObject({ managerId: 'u-other' });
  });
});

describe('реєстр: сортування', () => {
  it('за замовчуванням — новіші зверху; сума й дата — без nulls (поля обов\'язкові), погоджена — порожні в кінці', () => {
    expect(requestListOrderBy(undefined)).toEqual([{ number: 'desc' }]);
    expect(requestListOrderBy('-totalSaleGross')).toEqual([{ totalSaleGross: 'desc' }, { number: 'desc' }]);
    expect(requestListOrderBy('requestDate')).toEqual([{ requestDate: 'asc' }, { number: 'desc' }]);
    expect(requestListOrderBy('-approvedSaleGross')).toEqual([{ approvedSaleGross: { sort: 'desc', nulls: 'last' } }, { number: 'desc' }]);
  });
});
