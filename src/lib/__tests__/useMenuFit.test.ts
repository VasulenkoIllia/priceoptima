import { describe, expect, it } from 'vitest';
import { menuMaxHeight } from '../useMenuFit';

describe('висота меню постачальників (правки замовника 09.10)', () => {
  it('до низу вікна від кнопки', () => {
    expect(menuMaxHeight(270, 302, 720)).toBe(402);
    expect(menuMaxHeight(370, 402, 650)).toBe(232);
  });

  it('кнопка внизу вікна — місце над нею; не менше 160', () => {
    expect(menuMaxHeight(600, 632, 700)).toBe(584);
    expect(menuMaxHeight(60, 92, 200)).toBe(160);
  });
});
