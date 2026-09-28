// Підказка артикулів (правки замовника 28.09 п.1): усі збіги до межі, часткові лише коли повних немає.
import { describe, expect, it } from 'vitest';
import type { ProductMatchKind, ProductPickDto } from '@shared/types';
import { skuSuggestions } from '../SkuEditor';

const hit = (sku: string, matchKind: ProductMatchKind) => ({ sku, matchKind }) as ProductPickDto;

describe('підказка артикулів', () => {
  it('є товари з усіма словами — часткові збіги не показуємо; межу не досягнуто — підказки «уточніть» немає', () => {
    const r = skuSuggestions([hit('A', 'sku_exact'), hit('B', 'text'), hit('C', 'fuzzy')], 3);
    expect(r.items.map((h) => h.sku)).toEqual(['A', 'B']);
    expect(r.more).toBe(false);
  });

  it('повних збігів немає (напр. одрук) — показуємо часткові', () => {
    expect(skuSuggestions([hit('C', 'fuzzy'), hit('D', 'fuzzy')], 3).items.map((h) => h.sku)).toEqual(['C', 'D']);
  });

  it('видача дійшла до межі повними збігами — можуть бути ще: підказка «уточніть»', () => {
    expect(skuSuggestions([hit('A', 'text'), hit('B', 'text'), hit('C', 'text')], 3).more).toBe(true);
    expect(skuSuggestions([hit('A', 'fuzzy'), hit('B', 'fuzzy'), hit('C', 'fuzzy')], 3).more).toBe(true);
  });
});
