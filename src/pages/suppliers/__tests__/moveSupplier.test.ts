// Порядок постачальників перетягуванням карток (правки замовника 25.09 п.3).
import { describe, expect, it } from 'vitest';
import { moveSupplier } from '../supplierView';

describe('moveSupplier', () => {
  const ids = ['sanwell', 'sequoia', 'iup', 'sandi', 'teplo'];

  it('перед чи після картки, над якою відпустили', () => {
    expect(moveSupplier(ids, 'sandi', 'sanwell', false)).toEqual(['sandi', 'sanwell', 'sequoia', 'iup', 'teplo']);
    expect(moveSupplier(ids, 'sanwell', 'iup', true)).toEqual(['sequoia', 'iup', 'sanwell', 'sandi', 'teplo']);
    expect(moveSupplier(ids, 'sequoia', 'teplo', true)).toEqual(['sanwell', 'iup', 'sandi', 'teplo', 'sequoia']);
  });

  it('на себе чи невідомий id — без змін', () => {
    expect(moveSupplier(ids, 'iup', 'iup', true)).toEqual(ids);
    expect(moveSupplier(ids, 'x', 'iup', false)).toEqual(ids);
  });
});
