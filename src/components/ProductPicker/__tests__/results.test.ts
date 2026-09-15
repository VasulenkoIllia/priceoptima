import { afterEach, describe, expect, it } from 'vitest';
import { makeBlock, makeCtx, makeDoc, makeLine, makeOffer, makeSupplier } from '@shared/pricing/__tests__/fixtures';
import type { ProductPickDto } from '@shared/types';
import { DEMO_USER_IDS, supplierIdOf } from '@/data/mock/seed';
import { createTestEnv, type TestEnv } from '@/test/mockEnv';
import { buildPickerRows, groupSameNames, looksLikeSku, siteSearchUrl, toggleSelection, type PickerRow } from '../results';

function product(id: string, supplierId: string, patch: Partial<ProductPickDto> = {}): ProductPickDto {
  return {
    id,
    supplierId,
    supplierName: supplierId,
    sku: `SKU-${id}`,
    nameWork: `Товар ${id}`,
    name1c: null,
    brand: null,
    unitCode: 'шт',
    currency: 'UAH',
    purchasePrice: 100,
    rrp: null,
    purchasePriceUah: null,
    multiplicity: 1,
    stockQty: null,
    availability: 'in_stock',
    priceUpdatedAt: '2026-09-10T09:00:00Z',
    isStale: false,
    imageUrl: null,
    productUrl: null,
    isArchived: false,
    matchKind: 'text',
    score: 0,
    ...patch,
  };
}

function row(key: string, nameWork: string, unitNetUah: number | null): PickerRow {
  return {
    key,
    product: product(key, 's', { nameWork }),
    supplier: null,
    blockId: null,
    unitNetUah,
    rrpGrossUah: null,
    rate: 1,
    supplierMarkupPct: 0,
    inLine: false,
    cheapestInGroup: false,
  };
}

describe('пошук у каталозі (DataSource.searchProducts) — ранжування §6.7', () => {
  let env: TestEnv | undefined;
  afterEach(() => {
    env?.dispose();
    env = undefined;
  });

  async function catalog() {
    env = createTestEnv();
    const tab = env.tab('a', DEMO_USER_IDS.koval);
    const s3 = supplierIdOf('s3');
    const s4 = supplierIdOf('s4');
    const mk = (supplierId: string, sku: string, nameWork: string, purchasePrice: number, out = false) =>
      tab.createProduct({ supplierId, sku, nameWork, unitCode: 'шт', currency: 'UAH', purchasePrice, stockQty: out ? 0 : null, availability: out ? 'out_of_stock' : 'in_stock' });
    const a = await mk(s3, 'КВ-7700', 'Квазітрон зюзьгастий Альфа', 120);
    const b = await mk(s4, 'КВ-77001', 'Квазітрон зюзьгастий Бета', 90, true);
    const c = await mk(s3, 'КВ-7800', 'Квазітрон зюзьгастий Гамма', 80);
    const d = await mk(s4, 'КВ-7900', 'Квазітрон простий', 10);
    return { tab, s4, a, b, c, d };
  }

  it('точний артикул (нормалізація: регістр, роздільники) > префікс артикулу', async () => {
    const { tab, a, b } = await catalog();
    const hits = await tab.searchProducts({ q: 'кв 7700', limit: 50 });
    expect(hits.slice(0, 2).map((h) => [h.id, h.matchKind])).toEqual([
      [a.id, 'sku_exact'],
      [b.id, 'sku_prefix'],
    ]);
  });

  it('назви: усі слова > частина слів; серед повних — наявність, далі дешевші', async () => {
    const { tab, a, b, c, d } = await catalog();
    const hits = await tab.searchProducts({ q: 'Квазітрон, зюзьгастий', limit: 50 });
    expect(hits.slice(0, 4).map((h) => [h.id, h.matchKind])).toEqual([
      [c.id, 'text'],
      [a.id, 'text'],
      [b.id, 'text'],
      [d.id, 'fuzzy'],
    ]);
  });

  it('фільтр постачальника', async () => {
    const { tab, s4, b, d } = await catalog();
    const hits = await tab.searchProducts({ q: 'квазітрон', supplierId: s4, limit: 50 });
    expect(hits.map((h) => h.id).sort()).toEqual([b.id, d.id].sort());
  });
});

describe('результати вікна вибору', () => {
  it('ціна без ПДВ і РРЦ у грн — за курсом і націнкою блоку; без блоку — за курсом постачальника', () => {
    const suppliers = [
      makeSupplier('b1', { defaultCurrency: 'USD', supplierMarkupPct: 2 }),
      makeSupplier('s2', { priceListRates: { USD: 45.5, EUR: null, date: '2026-09-01' } }),
    ];
    const ctx = makeCtx(suppliers);
    const doc = makeDoc({
      lines: [makeLine('l1', 118)],
      blocks: [makeBlock('b1', 1, { rates: { USD: 44, EUR: null }, supplierMarkupPct: 2 })],
      offers: [makeOffer('l1', 'b1', { productId: 'p1' })],
    });
    const rows = buildPickerRows(
      [
        product('p1', 'b1', { currency: 'USD', purchasePrice: 10, rrp: 20 }),
        product('p2', 's2', { currency: 'USD', purchasePrice: 10 }),
        product('p3', 's2', { currency: 'UAH', purchasePrice: 99.99, nameWork: 'Інший' }),
      ],
      { doc, ctx, line: doc.lines[0], supplierRef: (id) => ctx.suppliers[id] ?? null },
    );
    expect(rows.map((r) => [r.key, r.blockId, r.unitNetUah, r.rrpGrossUah, r.inLine])).toEqual([
      ['p1', 'b1', 448.8, 880, true],
      ['p2', null, 455, null, false],
      ['p3', null, 99.99, null, false],
    ]);
  });

  it('однакові назви (з точністю до порядку слів) — поруч, за ціною; найдешевша позначена', () => {
    const out = groupSameNames([
      row('a', 'Паста пакувальна 360 г Unipak', 166),
      row('b', 'Кран кульовий', 100),
      row('c', 'Unipak паста пакувальна 360 г', 150),
      row('d', 'Паста пакувальна, 360 г Unipak', 180),
    ]);
    expect(out.map((r) => r.key)).toEqual(['c', 'a', 'd', 'b']);
    expect(out.filter((r) => r.cheapestInGroup).map((r) => r.key)).toEqual(['c']);
  });

  it('вибір 1–3 товарів різних постачальників: той самий постачальник — заміна, понад 3 — ні', () => {
    const [a1, a2, b1, c1, d1] = [product('a1', 'A'), product('a2', 'A'), product('b1', 'B'), product('c1', 'C'), product('d1', 'D')];
    const ids = (list: ProductPickDto[]) => list.map((p) => p.id);
    let sel = toggleSelection([], a1).selected;
    sel = toggleSelection(sel, b1).selected;
    expect(ids(sel)).toEqual(['a1', 'b1']);
    sel = toggleSelection(sel, a2).selected;
    expect(ids(sel)).toEqual(['a2', 'b1']);
    sel = toggleSelection(sel, c1).selected;
    const over = toggleSelection(sel, d1);
    expect(over.limited).toBe(true);
    expect(ids(over.selected)).toEqual(['a2', 'b1', 'c1']);
    expect(ids(toggleSelection(sel, b1).selected)).toEqual(['a2', 'c1']);
  });

  it('пошук на сайті постачальника: {query} і {sku}', () => {
    expect(siteSearchUrl('https://x.example/?q={query}', { query: ' Кран 1/2" ' })).toBe(`https://x.example/?q=${encodeURIComponent('Кран 1/2"')}`);
    expect(siteSearchUrl('https://x.example/p/{sku}?q={query}', { query: 'Змішувач', sku: 'СІ-1' })).toBe(
      `https://x.example/p/${encodeURIComponent('СІ-1')}?q=${encodeURIComponent('Змішувач')}`,
    );
    expect(siteSearchUrl('https://x.example/p/{sku}', { query: 'Змішувач' })).toBe(`https://x.example/p/${encodeURIComponent('Змішувач')}`);
    expect(siteSearchUrl(null, { query: 'x' })).toBeNull();
    expect(siteSearchUrl('https://x.example/?q={query}', { query: ' ' })).toBeNull();
  });

  it('запит схожий на артикул', () => {
    expect([looksLikeSku('СІ0000123'), looksLikeSku('Кран кульовий'), looksLikeSku('12')]).toEqual([true, false, false]);
  });
});
