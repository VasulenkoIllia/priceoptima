// Детермінований генератор демо-каталогу: постачальники, товари з історією цін, демо-заявки.
// Чистий TypeScript без Node API — можна запускати в браузері при першому старті прототипу.

import { Rng } from './prng';
import { CATEGORIES, type CanonicalSpec, type StockProfile } from './taxonomy';
import { EXCEL_ITEMS } from './excel-items';
import { CURRENCY_MIX, DEMO_SUPPLIERS, NAME_STYLE, SUPPLIER_KEYS, supplierRate } from './suppliers';
import { buildShowcaseRequests } from './showcase';
import { clientVariants, resetModelCodeRegistry } from './taxonomy-core';
import type { Currency, DemoCatalog, DemoPricePoint, DemoProduct, DemoSupplier, SupplierKey } from './types';

export const DEFAULT_SEED = 20260911;
const HISTORY_DAYS = 60;

/** Скільки постачальників має «той самий» товар: частки для 1, 2, 3, 4. */
const COVERAGE_WEIGHTS = [0.47, 0.31, 0.16, 0.06];
/** Орієнтовний обсяг прайсу постачальника (м'яке вирівнювання) і жорстка стеля. */
const SOFT_CAP: Record<SupplierKey, number> = { s1: 380, s2: 410, s3: 400, s4: 410 };
const HARD_CAP = 440;

const round2 = (x: number): number => Math.round(x * 100) / 100;
const round3 = (x: number): number => Math.round(x * 1000) / 1000;
const ceil2 = (x: number): number => Math.ceil(x * 100 - 1e-9) / 100;

/** Округлення ціни у валюті так, як це виглядає в прайсах. */
function roundPrice(value: number, currency: Currency): number {
  if (currency !== 'UAH' && value < 1) return Math.max(0.001, round3(value));
  return Math.max(0.01, round2(value));
}

/**
 * Груповий діапазон РРЦ/(вхід×1,2): у житті маржа різна для категорій (обладнання — нижча, дрібна фурнітура — вища),
 * а не однакова для всього каталогу. Значення — очікуваний ринковий діапазон (перевіряється в check.ts).
 */
export const RRP_RATIO_RANGE: Record<string, [number, number]> = {
  pump: [1.15, 1.4], boiler: [1.15, 1.4], radiator: [1.15, 1.4], installation: [1.15, 1.4],
  sink: [1.3, 1.65], 'shower-tray': [1.3, 1.65], toilet: [1.3, 1.65], washbasin: [1.3, 1.65], mixer: [1.3, 1.65],
  'ball-valve': [1.4, 1.85], union: [1.4, 1.85], filter: [1.4, 1.85], valve: [1.4, 1.85], reducer: [1.4, 1.85],
  gauge: [1.4, 1.85], hose: [1.4, 1.85], manifold: [1.4, 1.85], 'water-meter': [1.4, 1.85],
  'ppr-pipe': [1.5, 2], 'ppr-fitting': [1.5, 2], 'pex-pipe': [1.5, 2], 'press-fitting': [1.5, 2],
  fastener: [1.5, 2], sewer: [1.5, 2], sealant: [1.5, 2], siphon: [1.5, 2],
};
const DEFAULT_RATIO_RANGE: [number, number] = [1.3, 1.75];

/** Звужений діапазон для сампла (лишає запас, щоб індивідуальний розкид цін постачальника не виштовхнув ratio за групові межі). */
function sampleRatio(rng: Rng, category: string): number {
  const [lo, hi] = RRP_RATIO_RANGE[category] ?? DEFAULT_RATIO_RANGE;
  const pad = (hi - lo) * 0.2;
  return rng.float(lo + pad, hi - pad);
}

/** Профільний постачальник категорії (для «хто найдешевший» — не рівномірний шум, а профіль). */
const CATEGORY_PROFILE: Record<string, SupplierKey> = {
  'ppr-pipe': 's3', 'ppr-fitting': 's3', 'pex-pipe': 's3', 'press-fitting': 's3', fastener: 's3', sewer: 's3',
  sink: 's1', 'shower-tray': 's1', toilet: 's1', installation: 's1', washbasin: 's1', siphon: 's1', mixer: 's1',
  'ball-valve': 's2', union: 's2', filter: 's2', valve: 's2', reducer: 's2', gauge: 's2', hose: 's2', sealant: 's2', manifold: 's2',
  radiator: 's4', pump: 's4', boiler: 's4', 'water-meter': 's4',
};
/** Профільний постачальник трохи дешевший у «своїх» категоріях; непрофільний широкий постачальник — трохи дорожчий. */
function categoryBias(sk: SupplierKey, category: string): number {
  const owner = CATEGORY_PROFILE[category];
  if (!owner) return 1;
  if (sk === owner) return 0.97;
  if (sk === 's4') return 1.03;
  return 1;
}

/** Ціна товару в грн без ПДВ з урахуванням курсу й націнки постачальника (для порівняння). */
export function offerPriceUah(p: Pick<DemoProduct, 'purchasePrice' | 'currency'>, s: DemoSupplier): number {
  return p.purchasePrice * supplierRate(s, p.currency) * (1 + s.supplierMarkupPercent / 100);
}

interface Placement {
  spec: CanonicalSpec;
  suppliers: SupplierKey[];
  excel?: (typeof EXCEL_ITEMS)[number];
}

/**
 * Вибір постачальників для канонічного товару: кількість — за COVERAGE_WEIGHTS, хто саме — за схильністю категорії,
 * зваженою на «вільне місце» в прайсі (м'яке вирівнювання обсягів) і з жорсткою стелею HARD_CAP.
 */
function pickCoverage(rng: Rng, affinity: Record<SupplierKey, number>, load: Record<SupplierKey, number>): SupplierKey[] {
  const eligible = SUPPLIER_KEYS.filter((k) => affinity[k] > 0 && load[k] < HARD_CAP);
  if (!eligible.length) return [];
  const k = Math.min(eligible.length, rng.weighted([1, 2, 3, 4], COVERAGE_WEIGHTS));
  const weight = (x: SupplierKey): number => affinity[x] * Math.max(0.05, 1 - load[x] / SOFT_CAP[x]);
  const chosen: SupplierKey[] = [];
  const pool = eligible.slice();
  while (chosen.length < k) {
    const s = rng.weighted(pool, pool.map(weight));
    chosen.push(s);
    pool.splice(pool.indexOf(s), 1);
  }
  for (const s of chosen) load[s]++;
  return chosen;
}

/**
 * Цінові коефіцієнти постачальників одного товару: попарна різниця ≥ 3%, загальний розкид ≤ ~19%
 * (для позицій Excel перший — власник, коефіцієнт 1); зважені на профіль постачальника в категорії
 * (categoryBias) — тому «хто найдешевший» не рівномірний шум, а профіль постачальника.
 */
function priceFactors(rng: Rng, suppliers: readonly SupplierKey[], fixedFirst: boolean, category: string): number[] {
  const n = suppliers.length;
  const bias = suppliers.map((sk) => categoryBias(sk, category));
  if (n === 1) return [fixedFirst ? 1 : rng.float(0.95, 1.05) * bias[0]];
  let f: number[] = [];
  for (let attempt = 0; attempt < 60; attempt++) {
    f = Array.from({ length: n }, (_, i) => (fixedFirst && i === 0 ? 1 : rng.float(0.95, 1.05) * bias[i]));
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      for (let j = i + 1; j < n && ok; j++) {
        const ratio = Math.max(f[i], f[j]) / Math.min(f[i], f[j]);
        ok = ratio >= 1.03 && ratio <= 1.19;
      }
    }
    if (ok) break;
  }
  return f;
}

function stockFor(rng: Rng, profile: StockProfile, multiplicity: number, unit: string, qty: readonly [number, number], basePriceUah: number): number | null {
  const r = rng.next();
  if (r < 0.05) return null; // невідомо
  if (r < 0.12) return 0; // немає, ~7%
  const mult = multiplicity > 1 ? multiplicity : 1;
  if (r < 0.27) return rng.int(1, Math.max(1, qty[0])) * mult; // мало — відносно типової к-сті в заявці, а не завжди 1-5
  if (basePriceUah > 5000) return rng.int(0, 12) * mult; // дорогі позиції — дилер не тримає десятки штук
  switch (profile) {
    case 'piece': return rng.int(6, 40);
    case 'mid': return rng.int(6, 250);
    case 'small': return rng.int(20, 250) * mult;
    case 'meter': return rng.int(10, 750) * mult;
    case 'coil': return unit === 'бухта' ? rng.int(6, 25) : rng.int(6, 25) * mult;
  }
}

function buildHistory(
  rng: Rng, purchase: number, rrp: number | null, stock: number | null, currency: Currency, checkedDaysAgo: number,
): DemoPricePoint[] {
  // Валютні позиції змінюють ціну рідко (курс/прайс виробника міняється не щотижня); гривневі — частіше, слідом за курсом.
  const changes = currency === 'UAH' ? (rng.chance(0.45) ? rng.int(1, 4) : 0) : (rng.chance(0.15) ? 1 : 0);
  if (changes === 0) return [{ daysAgo: HISTORY_DAYS, purchasePrice: purchase, rrp, stockQty: stock }];
  const minDay = Math.min(checkedDaysAgo + 1, HISTORY_DAYS - changes);
  const days = new Set<number>();
  while (days.size < changes) days.add(rng.int(minDay, HISTORY_DAYS - 1));
  const sorted = [...days].sort((a, b) => a - b); // від найсвіжішої
  const points: DemoPricePoint[] = [];
  let p = purchase;
  let r = rrp;
  let st = stock;
  for (const d of sorted) {
    points.push({ daysAgo: d, purchasePrice: p, rrp: r, stockQty: st });
    const factor = rng.chance(0.8) ? rng.float(1.01, 1.07) : rng.float(0.95, 0.99);
    p = roundPrice(p / factor, currency);
    r = r === null ? null : ceil2(r / factor);
    if (r !== null && r < p * 1.2) r = ceil2(p * 1.2 * 1.25);
    st = st === null ? null : Math.max(0, Math.round(st * rng.float(0.6, 1.5)));
  }
  points.push({ daysAgo: HISTORY_DAYS, purchasePrice: p, rrp: r, stockQty: st });
  return points.reverse();
}

export interface GenerateOptions {
  /**
   * Локальні оверрайди постачальників (напр. реальні назви та префікси «ЦР»/«WI»/«PL» з файлу поза git).
   * Застосовуються ДО присвоєння артикулів, тому Excel-позиції отримують «ЦР0000123» тощо; решта даних не змінюється.
   */
  supplierOverrides?: Partial<Record<SupplierKey, Partial<Omit<DemoSupplier, 'seedKey'>>>>;
}

export function generateCatalog(seed: number = DEFAULT_SEED, options: GenerateOptions = {}): DemoCatalog {
  resetModelCodeRegistry();
  const rng = new Rng(seed);
  const suppliers: DemoSupplier[] = DEMO_SUPPLIERS.map((s) => {
    const o = options.supplierOverrides?.[s.seedKey] ?? {};
    return { ...s, ...o, seedKey: s.seedKey, rates: { ...s.rates, ...(o.rates ?? {}) } };
  });
  const supplierMap = new Map(suppliers.map((s) => [s.seedKey, s]));

  // 1. Канонічні товари по категоріях + розподіл між постачальниками.
  const placements: Placement[] = [];
  const load: Record<SupplierKey, number> = { s1: 0, s2: 0, s3: 0, s4: 0 };
  for (const x of EXCEL_ITEMS) {
    placements.push({ spec: x.canonical, suppliers: [x.supplierKey, ...x.analogs], excel: x });
    for (const k of [x.supplierKey, ...x.analogs]) load[k]++;
  }
  const pool: { spec: CanonicalSpec; affinity: Record<SupplierKey, number> }[] = [];
  for (const cat of CATEGORIES) {
    const all = cat.build(rng.fork(`cat:${cat.id}`));
    for (const spec of rng.fork(`pick:${cat.id}`).sample(all, cat.target)) pool.push({ spec, affinity: cat.affinity });
  }
  // Глобальне перемішування: вирівнювання обсягів тисне рівномірно на всі категорії.
  const assignRng = rng.fork('assign');
  for (const { spec, affinity } of assignRng.shuffle(pool)) {
    const suppliers = pickCoverage(assignRng, affinity, load);
    if (suppliers.length) placements.push({ spec, suppliers });
  }

  // 2. Товари постачальників.
  const perSupplier = new Map<SupplierKey, DemoProduct[]>(SUPPLIER_KEYS.map((k) => [k, []]));
  const prodRng = rng.fork('products');
  // Валюта — детермінована функція (постачальник, бренд): у реальному прайсі бренд закуповують в одній валюті.
  const currencyRng = rng.fork('currency');
  const currencyCache = new Map<string, Currency>();
  function brandCurrency(sk: SupplierKey, brand: string): Currency {
    const cacheKey = `${sk}|${brand}`;
    let c = currencyCache.get(cacheKey);
    if (!c) {
      const r = currencyRng.fork(cacheKey);
      c = r.weighted(CURRENCY_MIX[sk].map((x) => x[0]), CURRENCY_MIX[sk].map((x) => x[1]));
      currencyCache.set(cacheKey, c);
    }
    return c;
  }
  for (const pl of placements) {
    const { spec } = pl;
    const factors = priceFactors(prodRng, pl.suppliers, pl.excel !== undefined, spec.category);
    const rrpUah = spec.basePriceUah * 1.2 * sampleRatio(prodRng, spec.category);
    pl.suppliers.forEach((sk, idx) => {
      const s = supplierMap.get(sk)!;
      const style = NAME_STYLE[sk];
      const names = spec.render(style);
      const isOwnerExcel = pl.excel !== undefined && pl.excel.supplierKey === sk;
      let product: DemoProduct;
      if (isOwnerExcel) {
        const x = pl.excel!;
        product = {
          supplierKey: sk, sku: `${s.skuPrefix}0000${x.num}`, nameWork: x.nameWork, name1c: x.name1c, unit: x.unit, currency: x.currency,
          purchasePrice: x.purchase, rrp: x.rrp, stockQty: 0, multiplicity: x.multiplicity, minOrderQty: x.multiplicity,
          category: spec.category, brand: spec.brand, canonicalKey: spec.key, excelRef: x.ref, attrs: spec.attrs,
          priceHistory: [], priceCheckedDaysAgo: 0,
        };
        product.stockQty = stockFor(prodRng, spec.stock, x.multiplicity, x.unit, spec.qty, spec.basePriceUah) ?? 40;
      } else {
        const priceUah = spec.basePriceUah * factors[idx];
        const currency = brandCurrency(sk, spec.brand);
        const rate = supplierRate(s, currency);
        const purchasePrice = roundPrice(priceUah / rate, currency);
        let rrp: number | null = null;
        if (!prodRng.chance(0.12)) {
          rrp = ceil2(rrpUah / rate);
          const floor = ceil2(purchasePrice * 1.2 * 1.08); // нижня межа маржі конкретного постачальника
          if (rrp < floor) rrp = floor;
          if (currency === 'UAH' && rrp > 50) rrp = Math.ceil(rrp);
        }
        let name1c = names.full;
        if (sk === 's1' && prodRng.chance(0.15)) name1c = names.work; // як у прикладі клієнта: 1С-назва = робоча
        product = {
          supplierKey: sk, sku: '', nameWork: names.work, name1c, unit: spec.unit, currency, purchasePrice, rrp,
          stockQty: stockFor(prodRng, spec.stock, spec.stockPack ?? spec.multiplicity, spec.unit, spec.qty, spec.basePriceUah), multiplicity: spec.multiplicity, minOrderQty: spec.minOrderQty,
          category: spec.category, brand: spec.brand, canonicalKey: spec.key, attrs: spec.attrs, priceHistory: [], priceCheckedDaysAgo: 0,
        };
      }
      product.priceCheckedDaysAgo = prodRng.chance(0.07) ? prodRng.int(14, 45) : s.priceListAgeDays;
      product.priceHistory = buildHistory(prodRng, product.purchasePrice, product.rrp, product.stockQty, product.currency, product.priceCheckedDaysAgo);
      perSupplier.get(sk)!.push(product);
    });
  }

  // 3. Артикули: у межах постачальника — зростаючі номери від 1000, згруповані за категоріями (як у справжніх прайсах).
  const catOrder = new Map<string, number>(CATEGORIES.map((c, i) => [c.id, i]));
  const products: DemoProduct[] = [];
  for (const sk of SUPPLIER_KEYS) {
    const s = supplierMap.get(sk)!;
    const skuRng = rng.fork(`sku:${sk}`);
    const list = perSupplier.get(sk)!;
    const ordered = skuRng.shuffle(list).sort((a, b) => (catOrder.get(a.category) ?? 0) - (catOrder.get(b.category) ?? 0));
    let n = 1000;
    for (const p of ordered) {
      if (p.sku) continue;
      p.sku = `${s.skuPrefix}${String(n).padStart(7, '0')}`;
      n += skuRng.chance(0.7) ? 1 : skuRng.int(2, 9);
    }
    products.push(...ordered.sort((a, b) => (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0)));
  }

  // 4. «Брудні» клієнтські назви для кожного canonicalKey.
  const clientNameVariants: Record<string, string[]> = {};
  for (const pl of placements) {
    const variants = clientVariants(rng.fork(`cv:${pl.spec.key}`), pl.spec.client);
    // Для позицій з прикладу клієнта перший варіант — дослівна назва з «Блоку Клієнта».
    clientNameVariants[pl.spec.key] = pl.excel ? [pl.spec.client[0], ...variants.filter((x) => x !== pl.spec.client[0])] : variants;
  }

  // 5. Демо-заявки.
  const requests = buildShowcaseRequests({
    rng: rng.fork('showcase'), suppliers, products, specs: placements.map((p) => p.spec), clientNameVariants,
  });

  return {
    suppliers,
    categories: CATEGORIES.map((c) => ({ id: c.id, title: c.title })),
    products,
    requests,
    clientNameVariants,
  };
}
