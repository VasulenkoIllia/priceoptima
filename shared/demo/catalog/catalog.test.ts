// Ключові інваріанти демо-каталогу (перенесено з docs/_work/seed-catalog/check.ts).
import { describe, expect, it } from 'vitest';
import { DEFAULT_SEED, generateCatalog, offerPriceUah } from './index';
import type { DemoCatalog, DemoProduct, SupplierKey } from './index';
import { EXCEL_ITEMS } from './excel-items';

const SUPPLIER_KEYS: readonly SupplierKey[] = ['s1', 's2', 's3', 's4'];

function byCanonicalKey(cat: DemoCatalog): Map<string, DemoProduct[]> {
  const map = new Map<string, DemoProduct[]>();
  for (const p of cat.products) {
    const list = map.get(p.canonicalKey);
    if (list) list.push(p);
    else map.set(p.canonicalKey, [p]);
  }
  return map;
}

describe('generateCatalog — детермінованість', () => {
  it('той самий seed дає побітово однаковий результат', () => {
    const a = generateCatalog(DEFAULT_SEED);
    const b = generateCatalog(DEFAULT_SEED);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('інший seed дає інший результат', () => {
    const a = generateCatalog(DEFAULT_SEED);
    const b = generateCatalog(12345);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('генерація каталогу — швидка (< 300 мс на розігрітому рушії)', () => {
    generateCatalog(DEFAULT_SEED); // холодний старт — не міряємо
    const t0 = performance.now();
    generateCatalog(DEFAULT_SEED);
    expect(performance.now() - t0).toBeLessThan(300);
  });

  it('оверрайд префіксів постачальника змінює лише артикул, не решту даних', () => {
    const base = generateCatalog(DEFAULT_SEED);
    const overridden = generateCatalog(DEFAULT_SEED, {
      supplierOverrides: { s1: { name: 'ПОСТАЧАЛЬНИК-1', skuPrefix: 'ЦР' } },
    });
    const strip = (c: DemoCatalog) => JSON.stringify(c.products.map((p) => ({ ...p, sku: p.sku.slice(-7) })));
    expect(strip(overridden)).toBe(strip(base));
    expect(overridden.products.some((p) => p.sku.startsWith('ЦР'))).toBe(true);
  });
});

describe('generateCatalog — артикули постачальників', () => {
  const cat = generateCatalog(DEFAULT_SEED);

  it('артикул унікальний у межах постачальника', () => {
    const seen = new Set<string>();
    for (const p of cat.products) {
      const k = `${p.supplierKey}|${p.sku}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });

  it('артикул починається з префікса свого постачальника', () => {
    const prefixByKey = new Map(cat.suppliers.map((s) => [s.seedKey, s.skuPrefix]));
    for (const p of cat.products) expect(p.sku.startsWith(prefixByKey.get(p.supplierKey)!)).toBe(true);
  });
});

describe('generateCatalog — перетини canonicalKey між постачальниками', () => {
  const cat = generateCatalog(DEFAULT_SEED);
  const byKey = byCanonicalKey(cat);
  const keys = [...byKey.keys()];
  const coverage = (n: number) => keys.filter((k) => new Set(byKey.get(k)!.map((p) => p.supplierKey)).size >= n).length;

  it('canonicalKey не повторюється в одного постачальника', () => {
    for (const list of byKey.values()) {
      const sks = list.map((p) => p.supplierKey);
      expect(new Set(sks).size).toBe(sks.length);
    }
  });

  it('щонайменше 40% товарів є у ≥2 постачальників', () => {
    expect(coverage(2) / keys.length).toBeGreaterThanOrEqual(0.4);
  });

  it('щонайменше 15% товарів є у ≥3 постачальників', () => {
    expect(coverage(3) / keys.length).toBeGreaterThanOrEqual(0.15);
  });

  it('розкид ціни (грн без ПДВ) одного товару між постачальниками не перевищує 20%', () => {
    const supplierMap = new Map(cat.suppliers.map((s) => [s.seedKey, s]));
    for (const list of byKey.values()) {
      if (list.length < 2) continue;
      const prices = list.map((p) => offerPriceUah(p, supplierMap.get(p.supplierKey)!));
      expect(Math.max(...prices) / Math.min(...prices) - 1).toBeLessThanOrEqual(0.2);
    }
  });
});

describe('generateCatalog — 12 позицій з аркуша «Номенклатура» (дослівно)', () => {
  const cat = generateCatalog(DEFAULT_SEED);

  it('усі 12 позицій присутні з точними даними клієнта', () => {
    expect(EXCEL_ITEMS.length).toBe(12);
    for (const x of EXCEL_ITEMS) {
      const supplier = cat.suppliers.find((s) => s.seedKey === x.supplierKey)!;
      const sku = `${supplier.skuPrefix}0000${x.num}`;
      const p = cat.products.find((y) => y.supplierKey === x.supplierKey && y.sku === sku);
      expect(p, `Excel-позиція ${sku} відсутня в каталозі`).toBeDefined();
      expect(p!.nameWork).toBe(x.nameWork);
      expect(p!.name1c).toBe(x.name1c);
      expect(p!.unit).toBe(x.unit);
      expect(p!.currency).toBe(x.currency);
      expect(p!.purchasePrice).toBe(x.purchase);
      expect(p!.rrp).toBe(x.rrp);
      expect(p!.multiplicity).toBe(x.multiplicity);
      expect(p!.excelRef).toBe(x.ref);
    }
  });

  it('кожна Excel-позиція має 1-3 аналоги в інших постачальників', () => {
    const byKey = byCanonicalKey(cat);
    for (const x of EXCEL_ITEMS) {
      const list = byKey.get(x.canonical.key) ?? [];
      const analogs = list.filter((p) => !p.excelRef);
      expect(analogs.length).toBeGreaterThanOrEqual(1);
      expect(analogs.length).toBeLessThanOrEqual(3);
    }
  });
});

describe('generateCatalog — ціни, кратність, наявність', () => {
  const cat = generateCatalog(DEFAULT_SEED);

  it('purchasePrice завжди > 0', () => {
    for (const p of cat.products) expect(p.purchasePrice).toBeGreaterThan(0);
  });

  it('rrp (коли є) не менша за purchasePrice×1,2', () => {
    for (const p of cat.products) if (p.rrp !== null) expect(p.rrp).toBeGreaterThanOrEqual(p.purchasePrice * 1.2 - 1e-9);
  });

  it('ППР-труба продається «м» з кратністю 4', () => {
    for (const p of cat.products) {
      if (p.category !== 'ppr-pipe') continue;
      expect(p.unit).toBe('м');
      expect(p.multiplicity).toBe(4);
    }
  });

  it('кратність у демо — лише в труб ППР (4 м) і позицій Excel; PEX/металопластик — «м» без кратності', () => {
    for (const p of cat.products) {
      if (p.category === 'pex-pipe') {
        expect(p.unit).toBe('м');
        expect(p.multiplicity).toBe(1);
      } else if (p.category !== 'ppr-pipe') {
        expect(p.multiplicity).toBe(1);
      }
    }
  });

  it('залишок (коли відомий) кратний одиниці продажу', () => {
    for (const p of cat.products) if (p.stockQty !== null) expect(p.stockQty % p.multiplicity).toBe(0);
  });

  it('одна валюта на пару (постачальник, бренд) — крім позицій без бренду (Excel)', () => {
    const byBrand = new Map<string, Set<string>>();
    for (const p of cat.products) {
      if (p.brand === 'Без бренду') continue;
      const k = `${p.supplierKey}|${p.brand}`;
      (byBrand.get(k) ?? byBrand.set(k, new Set()).get(k)!).add(p.currency);
    }
    for (const [key, currencies] of byBrand) expect(currencies.size, `${key}: ${[...currencies].join(',')}`).toBe(1);
  });
});

describe('generateCatalog — демо-заявки', () => {
  const cat = generateCatalog(DEFAULT_SEED);
  const allowedStatuses = new Set(['IN_PROGRESS', 'DONE', 'CANCELLED']);
  const canonicalKeys = new Set(cat.products.map((p) => p.canonicalKey));

  it('рівно 6 заявок із seedKey req-000001..req-000006', () => {
    expect(cat.requests.map((r) => r.seedKey)).toEqual([
      'req-000001', 'req-000002', 'req-000003', 'req-000004', 'req-000005', 'req-000006',
    ]);
  });

  it('лише 3 статуси — як в Excel клієнта', () => {
    for (const r of cat.requests) expect(allowedStatuses.has(r.status)).toBe(true);
  });

  it('усі три статуси трапляються хоча б раз', () => {
    expect(new Set(cat.requests.map((r) => r.status))).toEqual(allowedStatuses);
  });

  it('canonicalKey рядка або null, або посилається на існуючий товар', () => {
    for (const r of cat.requests) {
      for (const l of r.lines) {
        if (l.canonicalKey !== null) expect(canonicalKeys.has(l.canonicalKey)).toBe(true);
        expect(l.qty).toBeGreaterThan(0);
      }
    }
  });

  it('пропозиція рядка посилається на постачальника, доданого в заявку, і не дублюється', () => {
    for (const r of cat.requests) {
      for (const l of r.lines) {
        const seen = new Set<SupplierKey>();
        for (const o of l.offers) {
          expect(r.supplierKeys).toContain(o.supplierKey);
          expect(seen.has(o.supplierKey)).toBe(false);
          seen.add(o.supplierKey);
        }
        expect(l.offers.filter((o) => o.approved).length).toBeLessThanOrEqual(1);
      }
    }
  });

  it('req-000001 містить перших 12 рядків «Блоку Клієнта» дослівно', () => {
    const r1 = cat.requests[0];
    const block: [string, string, number][] = [
      ['Змішувач д/раковини', 'шт', 1], ['Кран кульовий 1/2"', 'шт', 4], ['Мийка 500*500', 'шт', 1], ['Кран кульовий 3/4"', 'шт', 2],
      ['Душовий піддон', 'шт', 1], ['Шланг 0,8м вв 1/2"', 'шт', 4], ['Американка 2"', 'шт', 2], ['Фільтр косий 1/2"', 'шт', 1],
      ['Клапан вв Ду15', 'шт', 1], ['Муфта 20х1/2" З', 'шт', 8], ['Кріплення для труб 40', 'шт', 20], ['Труба ппр ду40', 'м', 118],
    ];
    block.forEach(([name, unit, qty], i) => {
      expect(r1.lines[i].clientName).toBe(name);
      expect(r1.lines[i].unit).toBe(unit);
      expect(r1.lines[i].qty).toBe(qty);
    });
  });
});

describe('SUPPLIER_KEYS довідково', () => {
  it('генерує товари для всіх 4 постачальників', () => {
    const cat = generateCatalog(DEFAULT_SEED);
    for (const sk of SUPPLIER_KEYS) expect(cat.products.some((p) => p.supplierKey === sk)).toBe(true);
  });
});
