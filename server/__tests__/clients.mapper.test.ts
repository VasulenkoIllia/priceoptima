import { describe, expect, it } from 'vitest';
import { toClientListItem, toLookupItems, type ClientRow } from '../modules/clients/clients.mapper';

const cp = (id: string, nameShort: string, isActive: boolean) => ({ id, nameShort, edrpou: null, isActive }) as unknown as ClientRow['counterparties'][number];
const ct = (id: string, isActive: boolean) => ({ id, isActive }) as unknown as ClientRow['contacts'][number];

const row = {
  id: 'c1',
  name: 'Клієнт',
  isActive: true,
  responsibleUser: null,
  counterparties: [cp('a', 'ТОВ А', true), cp('b', 'ТОВ Б (старий)', false)],
  contacts: [ct('x', true), ct('y', false)],
} as unknown as ClientRow;

describe('архівні контрагенти й контакти клієнта (4.11)', () => {
  it('у списку клієнтів — лише чинні', () => {
    const item = toClientListItem(row);
    expect(item.counterparties.map((c) => c.id)).toEqual(['a']);
    expect(item.contactsCount).toBe(1);
  });

  it('у підказці клієнта — лише чинні контрагенти', () => {
    expect(toLookupItems(row, []).map((i) => i.counterpartyId)).toEqual(['a']);
    const onlyArchived = { ...row, counterparties: [cp('b', 'ТОВ Б', false)] } as ClientRow;
    expect(toLookupItems(onlyArchived, []).map((i) => i.counterpartyId)).toEqual([null]);
  });
});
