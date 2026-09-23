// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ProductPickDto } from '@shared/types';
import {
  compareHits,
  isEmptyPlan,
  lookupKeys,
  lookupSkuMatches,
  queryTokens,
  rankProduct,
  searchPlan,
  SEARCH_SCORE,
} from '../modules/products/products.search';

function candidate(
  skuKey: string,
  searchText: string,
  availability: 'in_stock' | 'out_of_stock' | 'unknown' = 'unknown',
) {
  return { skuKey, searchText, availability };
}

function hit(part: Partial<ProductPickDto>): ProductPickDto {
  return { score: 0, purchasePriceUah: null, nameWork: '', ...part } as ProductPickDto;
}

describe('токени запиту', () => {
  it('скорочення через «/» розбиваються, розміри лишаються', () => {
    expect(queryTokens('сифон д/раковини')).toEqual(['сифон', 'раковини']);
    expect(queryTokens('кран 1/2')).toEqual(['кран', '1/2']);
    // шаблони LIKE не потрапляють у пошук: інакше «100%» знаходило б «100 будь-що»
    expect(queryTokens('100% мідь_труба')).toEqual(['100', 'мідь', 'труба']);
  });

  it('односимвольні шматки відкидаються, розміри нормалізуються', () => {
    expect(queryTokens('плитка 500 х 500')).toEqual(['плитка', '500x500']);
    expect(queryTokens('a б')).toEqual([]);
  });
});

describe('план пошуку', () => {
  it('артикул визнається від двох символів, префікс — від трьох', () => {
    expect(searchPlan('AB-100')).toMatchObject({ skuKey: 'AB100', matchExact: true, matchPrefix: true });
    expect(searchPlan('ab')).toMatchObject({ skuKey: 'AB', matchExact: true, matchPrefix: false });
    expect(isEmptyPlan(searchPlan('5'))).toBe(true);
    expect(isEmptyPlan(searchPlan('кран'))).toBe(false);
  });

  it('кириличні двійники в артикулі стають латиницею', () => {
    // 'СР' — кирилиця, 'CP' — латиниця; менеджер може набрати будь-яку
    expect(searchPlan('СР-100').skuKey).toBe('CP100');
    expect(searchPlan('cp 100').skuKey).toBe('CP100');
  });

  it('половини токенів досить для приблизного збігу', () => {
    expect(searchPlan('кран кульовий 1/2 латунь').minMatched).toBe(2);
    expect(searchPlan('кран').minMatched).toBe(1);
  });
});

describe('ранжування каталогу', () => {
  const plan = searchPlan('кран кульовий 1/2');
  const sku = searchPlan('AB100');

  it('точний артикул > префікс > усі токени > частина токенів', () => {
    expect(rankProduct(candidate('AB100', 'ab100 кран'), sku)).toMatchObject({ kind: 'sku_exact' });
    expect(rankProduct(candidate('AB1001', 'ab1001 кран'), sku)).toMatchObject({ kind: 'sku_prefix' });

    const exact = rankProduct(candidate('AB100', 'ab100'), sku)!;
    const prefix = rankProduct(candidate('AB1001', 'ab1001'), sku)!;
    const all = rankProduct(candidate('X1', 'кран кульовий 1/2 латунь'), plan)!;
    const half = rankProduct(candidate('X2', 'кран кульовий кутовий'), plan)!;

    expect(all.kind).toBe('text');
    expect(half.kind).toBe('fuzzy');
    expect(exact.score).toBeGreaterThan(prefix.score);
    expect(prefix.score).toBeGreaterThan(all.score);
    expect(all.score).toBeGreaterThan(half.score);
  });

  it('менше половини токенів — не збіг', () => {
    expect(rankProduct(candidate('X3', 'вентиль латунний'), searchPlan('кран кульовий 1/2 латунь'))).toBeNull();
    expect(rankProduct(candidate('X4', 'сифон'), plan)).toBeNull();
  });

  it('наявність додає ваги при однаковому збігу', () => {
    const inStock = rankProduct(candidate('X5', 'кран кульовий 1/2', 'in_stock'), plan)!;
    const out = rankProduct(candidate('X6', 'кран кульовий 1/2', 'out_of_stock'), plan)!;
    expect(inStock.score - out.score).toBe(3);
    expect(out.score).toBe(SEARCH_SCORE.allTokens + 3 * SEARCH_SCORE.perToken);
  });

  it('порядок видачі: вага → дешевша позиція → назва', () => {
    const list = [
      hit({ score: 100, purchasePriceUah: 50, nameWork: 'Б' }),
      hit({ score: 500, purchasePriceUah: 900, nameWork: 'А' }),
      hit({ score: 100, purchasePriceUah: null, nameWork: 'А' }),
      hit({ score: 100, purchasePriceUah: 10, nameWork: 'В' }),
    ];
    expect([...list].sort(compareHits).map((h) => h.nameWork)).toEqual(['А', 'В', 'Б', 'А']);
  });
});

describe('звірка списку артикулів', () => {
  const rows = [
    { skuKey: 'AB100', supplier: 'a' },
    { skuKey: 'AB100', supplier: 'b' },
    { skuKey: 'AB1001', supplier: 'a' },
    { skuKey: 'AB1002', supplier: 'a' },
    { skuKey: 'XX55', supplier: 'a' },
  ];

  it('ключ результату — артикул як його передали', () => {
    const result = lookupSkuMatches(rows, [' ab-100 ']);
    expect(Object.keys(result)).toEqual([' ab-100 ']);
    expect(result[' ab-100 ']).toHaveLength(2);
    expect(result[' ab-100 '][0]).toMatchObject({ kind: 'sku_exact', score: SEARCH_SCORE.skuExact });
  });

  it('точний збіг має пріоритет над префіксом', () => {
    const result = lookupSkuMatches(rows, ['AB 100'])['AB 100'];
    expect(result).toHaveLength(2);
    expect(result.every((m) => m.kind === 'sku_exact')).toBe(true);
  });

  it('точного збігу немає — до пʼяти за префіксом', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ skuKey: `ABC${i}` }));
    const byPrefix = lookupSkuMatches(many, ['ABC'])['ABC'];
    expect(byPrefix).toHaveLength(5);
    expect(byPrefix.every((m) => m.kind === 'sku_prefix')).toBe(true);
  });

  it('короткий артикул за префіксом не шукаємо', () => {
    expect(lookupSkuMatches(rows, ['AB'])).toEqual({ AB: [] });
  });

  it('порожній артикул — порожній результат', () => {
    expect(lookupSkuMatches(rows, ['', '   '])).toEqual({ '': [], '   ': [] });
    expect(lookupKeys(['ab-100', 'AB100', '', ' '])).toEqual(['AB100']);
  });
});
