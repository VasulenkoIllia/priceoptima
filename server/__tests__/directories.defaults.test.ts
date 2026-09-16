// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { withSingleDefault } from '../lib/defaults';
import { withSingleDefaultPerCounterparty } from '../modules/clients/clients.rules';

describe('позначка «основний» у списку', () => {
  it('без жодної позначки основним стає перший', () => {
    const out = withSingleDefault([{ isDefault: false }, { isDefault: false }]);
    expect(out.map((x) => x.isDefault)).toEqual([true, false]);
  });

  it('позначок кілька — лишається перша', () => {
    const out = withSingleDefault([{ isDefault: false }, { isDefault: true }, { isDefault: true }]);
    expect(out.map((x) => x.isDefault)).toEqual([false, true, false]);
  });

  it('порожній список лишається порожнім', () => {
    expect(withSingleDefault([])).toEqual([]);
  });

  it('вхідні дані не змінюються', () => {
    const input = [{ isDefault: true }, { isDefault: true }];
    withSingleDefault(input);
    expect(input[1].isDefault).toBe(true);
  });
});

describe('головний контакт контрагента', () => {
  const contacts = [
    { id: 'a', counterpartyId: 'cp1', isDefault: false },
    { id: 'b', counterpartyId: 'cp1', isDefault: true },
    { id: 'c', counterpartyId: 'cp2', isDefault: false },
    { id: 'd', counterpartyId: 'cp2', isDefault: false },
  ];

  it('по одному головному на кожного контрагента', () => {
    const out = withSingleDefaultPerCounterparty(contacts);
    expect(out.filter((c) => c.isDefault).map((c) => c.id)).toEqual(['b', 'c']);
  });

  it('контакти без контрагента — окрема група зі своїм головним', () => {
    const out = withSingleDefaultPerCounterparty([
      { id: 'x', counterpartyId: null, isDefault: false },
      { id: 'y', counterpartyId: null, isDefault: true },
      { id: 'z', counterpartyId: 'cp1', isDefault: false },
    ]);
    expect(out.filter((c) => c.isDefault).map((c) => c.id)).toEqual(['y', 'z']);
  });

  it('зайві позначки в одного контрагента знімаються', () => {
    const out = withSingleDefaultPerCounterparty([
      { id: 'a', counterpartyId: 'cp1', isDefault: true },
      { id: 'b', counterpartyId: 'cp1', isDefault: true },
    ]);
    expect(out.map((c) => c.isDefault)).toEqual([true, false]);
  });
});
