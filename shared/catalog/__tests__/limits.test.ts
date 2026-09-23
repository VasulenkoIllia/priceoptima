import { describe, expect, it } from 'vitest';
import { catalogSortAllowed } from '../limits';

describe('сортування номенклатури', () => {
  it('артикул, назва й ціна входу — завжди; решта — лише з постачальником чи пошуком', () => {
    for (const f of ['sku', 'nameWork', 'purchasePrice']) expect(catalogSortAllowed(f, false)).toBe(true);
    for (const f of ['rrp', 'availability', 'supplier', 'priceUpdatedAt']) {
      expect(catalogSortAllowed(f, false)).toBe(false);
      expect(catalogSortAllowed(f, true)).toBe(true);
    }
    expect(catalogSortAllowed(undefined, false)).toBe(true);
  });
});
