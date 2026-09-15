// Демо-заявки: 000001..000006. Статуси — лише IN_PROGRESS / DONE / CANCELLED (як в Excel клієнта).

import type { Rng } from './prng';
import type { CanonicalSpec } from './taxonomy-core';
import { supplierRate } from './suppliers';
import type { DemoOffer, DemoProduct, DemoRequest, DemoRequestLine, DemoSupplier, SupplierKey } from './types';

export interface ShowcaseInput {
  rng: Rng;
  suppliers: DemoSupplier[];
  products: DemoProduct[];
  specs: CanonicalSpec[];
  clientNameVariants: Record<string, string[]>;
}

/** Рядки «Блоку Клієнта» з прикладу клієнта — дослівно; ключ — відповідний товар каталогу. */
const EXCEL_CLIENT_BLOCK: [string, string, number, string | ((ctx: Ctx) => string | null)][] = [
  ['Змішувач д/раковини', 'шт', 1, 'xl:mixer-basin-pr1'],
  ['Кран кульовий 1/2"', 'шт', 4, 'xl:ball-valve-1/2-ff-butterfly'],
  ['Мийка 500*500', 'шт', 1, 'xl:sink-500x500-pr2'],
  ['Кран кульовий 3/4"', 'шт', 2, 'xl:ball-valve-3/4-ff-butterfly'],
  ['Душовий піддон', 'шт', 1, 'xl:shower-tray-90x90-acryl'],
  ['Шланг 0,8м вв 1/2"', 'шт', 4, 'xl:hose-80-gg-1/2'],
  ['Американка 2"', 'шт', 2, 'xl:union-2-mf'],
  ['Фільтр косий 1/2"', 'шт', 1, (ctx) => ctx.bestKey((s) => s.category === 'filter' && s.attrs.type === 'y' && s.attrs.size === '1/2', ['s1', 's2', 's3'])],
  ['Клапан вв Ду15', 'шт', 1, 'xl:check-valve-pl071-15'],
  ['Муфта 20х1/2" З', 'шт', 8, 'xl:ppr-mrn-20x1/2'],
  ['Кріплення для труб 40', 'шт', 20, 'xl:ppr-support-40'],
  ['Труба ппр ду40', 'м', 118, 'xl:ppr-pipe-basalt-40x4.2'],
];

type CatWeights = Record<string, number>;

class Ctx {
  readonly byKey = new Map<string, DemoProduct[]>();
  readonly specByKey = new Map<string, CanonicalSpec>();
  readonly supplierMap: Map<SupplierKey, DemoSupplier>;
  /** Клієнтські назви, вже використані в поточній заявці (щоб рядки не дублювали один одного). */
  usedNames = new Set<string>();
  /** «Родові підписи» (категорія + атрибути без бренд-специфічних), уже використані в поточній заявці. */
  usedSignatures = new Set<string>();

  constructor(readonly input: ShowcaseInput) {
    for (const p of input.products) {
      const list = this.byKey.get(p.canonicalKey);
      if (list) list.push(p);
      else this.byKey.set(p.canonicalKey, [p]);
    }
    for (const s of input.specs) this.specByKey.set(s.key, s);
    this.supplierMap = new Map(input.suppliers.map((s) => [s.seedKey, s]));
  }

  covering(key: string, among: readonly SupplierKey[]): SupplierKey[] {
    const have = new Set((this.byKey.get(key) ?? []).map((p) => p.supplierKey));
    return among.filter((k) => have.has(k));
  }

  /** Ключ з найбільшим покриттям серед заданих постачальників (детерміновано — перший за порядком). */
  bestKey(pred: (s: CanonicalSpec) => boolean, among: readonly SupplierKey[]): string | null {
    let best: string | null = null;
    let bestCov = 0;
    for (const s of this.input.specs) {
      if (!pred(s)) continue;
      const cov = this.covering(s.key, among).length;
      if (cov > bestCov) { best = s.key; bestCov = cov; }
    }
    return best;
  }

  priceUah(key: string, sk: SupplierKey): number {
    const p = (this.byKey.get(key) ?? []).find((x) => x.supplierKey === sk);
    const s = this.supplierMap.get(sk);
    if (!p || !s) return Number.POSITIVE_INFINITY;
    return p.purchasePrice * supplierRate(s, p.currency) * (1 + s.supplierMarkupPercent / 100);
  }

  productFor(key: string, sk: SupplierKey): DemoProduct | undefined {
    return (this.byKey.get(key) ?? []).find((p) => p.supplierKey === sk);
  }

  /** «Родовий підпис» товару: категорія + атрибути без бренд-специфічних (серія/колір/модель) — для пошуку дублів у заявці. */
  genericSignature(key: string): string {
    const spec = this.specByKey.get(key);
    if (!spec) return key;
    const SKIP = new Set(['series', 'color', 'model']);
    const parts = Object.entries(spec.attrs)
      .filter(([k]) => !SKIP.has(k))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`);
    return `${spec.category}|${parts.join(',')}`;
  }

  /** Випадкові ключі з категорій (за вагами) з покриттям у [minCov, maxCov] серед постачальників заявки. */
  pickKeys(rng: Rng, n: number, cats: CatWeights, among: readonly SupplierKey[], minCov: number, maxCov: number, used: Set<string>): string[] {
    const buckets = new Map<string, string[]>();
    for (const s of this.input.specs) {
      if (!(s.category in cats) || used.has(s.key) || s.key.startsWith('xl:')) continue;
      if (this.usedSignatures.has(this.genericSignature(s.key))) continue; // не дублювати «родову» позицію в заявці
      const cov = among.length ? this.covering(s.key, among).length : (this.byKey.get(s.key)?.length ?? 0);
      if (cov < minCov || cov > maxCov) continue;
      const b = buckets.get(s.category);
      if (b) b.push(s.key);
      else buckets.set(s.category, [s.key]);
    }
    const out: string[] = [];
    for (let guard = 0; out.length < n && guard < n * 20; guard++) {
      const live = [...buckets.keys()].filter((c) => (buckets.get(c)?.length ?? 0) > 0);
      if (!live.length) break;
      const cat = rng.weighted(live, live.map((c) => cats[c]));
      const list = buckets.get(cat)!;
      const key = list.splice(rng.int(0, list.length - 1), 1)[0];
      if (used.has(key)) continue;
      const sig = this.genericSignature(key);
      if (this.usedSignatures.has(sig)) continue; // могло бути «спожито» в цьому ж виклику іншим ключем тієї ж категорії
      used.add(key);
      this.usedSignatures.add(sig);
      out.push(key);
    }
    return out;
  }

  /** Рядок заявки з «брудною» клієнтською назвою. */
  line(rng: Rng, key: string, offerSuppliers: SupplierKey[]): DemoRequestLine {
    const spec = this.specByKey.get(key)!;
    const variants = this.input.clientNameVariants[key] ?? [key];
    let unit = spec.unit;
    let qty = rng.int(spec.qty[0], spec.qty[1]);
    if (spec.unit === 'бухта') { unit = 'м'; qty = rng.pick([50, 80, 120, 150, 250]); }
    else if (spec.unit === 'шт' && rng.chance(0.12)) unit = 'шт.';
    else if (spec.unit === 'компл.' && rng.chance(0.4)) unit = rng.pick(['шт', 'компл', 'к-т']);
    else if (spec.unit === 'м' && rng.chance(0.3)) unit = rng.pick(['м.п.', 'пог.м', 'м']);
    else if (spec.unit === 'уп.' && rng.chance(0.5)) unit = 'уп';
    if (spec.multiplicity > 1 && spec.unit === 'м' && qty % spec.multiplicity === 0 && rng.chance(0.6)) qty += rng.pick([-2, 2, 1, 3]);
    const fresh = variants.filter((x) => !this.usedNames.has(x.toLowerCase()));
    let clientName = rng.pick(fresh.length ? fresh : variants);
    this.usedNames.add(clientName.toLowerCase());
    // «(терміново)» — це позначка для менеджера, а не частина назви товару: в КП вона б потрапила разом з назвою.
    let note: string | undefined;
    const URGENT = ' (терміново)';
    if (clientName.endsWith(URGENT)) {
      clientName = clientName.slice(0, -URGENT.length);
      note = 'терміново';
    }
    return { clientName, unit, qty, canonicalKey: key, offers: offerSuppliers.map((supplierKey) => ({ supplierKey })), ...(note ? { note } : {}) };
  }

  /** Чи вистачає залишку в постачальника на к-сть рядка (невідомий залишок вважаємо достатнім). */
  private hasStock(key: string, sk: SupplierKey, qty: number): boolean {
    const p = this.productFor(key, sk);
    return !p || p.stockQty === null || p.stockQty >= qty;
  }

  /** Затвердити мінімальну ціну серед невиключених пропозицій з достатнім залишком (інакше — абсолютний мінімум). Повертає постачальника. */
  approveMin(line: DemoRequestLine): SupplierKey | null {
    const live = line.offers.filter((o) => !o.excluded);
    if (!line.canonicalKey || !live.length) return null;
    const key = line.canonicalKey;
    const inStock = live.filter((o) => this.hasStock(key, o.supplierKey, line.qty));
    const pool = inStock.length ? inStock : live;
    let best: DemoOffer = pool[0];
    for (const o of pool) if (this.priceUah(key, o.supplierKey) < this.priceUah(key, best.supplierKey)) best = o;
    for (const o of line.offers) delete o.approved;
    best.approved = true;
    // Жодна з підібраних пропозицій не має достатнього залишку — чесна примітка замість мовчазного «помаранчевого» рядка.
    if (!inStock.length && !line.note) {
      const p = this.productFor(key, best.supplierKey);
      if (p && p.stockQty !== null && p.stockQty < line.qty) {
        line.note = `На складі в жодного з підібраних постачальників не вистачає (найбільше — ${p.stockQty} з ${line.qty}) — уточнити термін довозу`;
      }
    }
    return best.supplierKey;
  }

  /** Затвердити НЕ мінімальну пропозицію (ручний вибір менеджера) з довільним поясненням. */
  approveNonMin(line: DemoRequestLine, note: string): boolean {
    const live = line.offers.filter((o) => !o.excluded);
    if (!line.canonicalKey || live.length < 2) return false;
    const key = line.canonicalKey;
    const sorted = live.slice().sort((a, b) => this.priceUah(key, a.supplierKey) - this.priceUah(key, b.supplierKey));
    for (const o of line.offers) delete o.approved;
    sorted[1].approved = true;
    line.note = note;
    return true;
  }

  /**
   * Затвердити НЕ найдешевшу пропозицію саме через нестачу залишку в найдешевшого — з приміткою, що збігається з даними.
   * Повертає false, якщо в найдешевшого залишку вистачає (сценарій тут не застосовний).
   */
  approveNonMinForStock(line: DemoRequestLine): boolean {
    const live = line.offers.filter((o) => !o.excluded);
    if (!line.canonicalKey || live.length < 2) return false;
    const key = line.canonicalKey;
    const sorted = live.slice().sort((a, b) => this.priceUah(key, a.supplierKey) - this.priceUah(key, b.supplierKey));
    const cheapest = sorted[0];
    const cheapestProduct = this.productFor(key, cheapest.supplierKey);
    if (!cheapestProduct || cheapestProduct.stockQty === null || cheapestProduct.stockQty >= line.qty) return false;
    const alt = sorted.slice(1).find((o) => this.hasStock(key, o.supplierKey, line.qty));
    if (!alt) return false;
    for (const o of line.offers) delete o.approved;
    alt.approved = true;
    const cheapestName = this.supplierMap.get(cheapest.supplierKey)?.name ?? cheapest.supplierKey;
    const altName = this.supplierMap.get(alt.supplierKey)?.name ?? alt.supplierKey;
    line.note = `Найдешевше в ${cheapestName} — на складі лише ${cheapestProduct.stockQty} з ${line.qty}, беремо в ${altName}`;
    return true;
  }
}

function fullOffers(ctx: Ctx, key: string, among: readonly SupplierKey[]): SupplierKey[] {
  return ctx.covering(key, among);
}

function lines(ctx: Ctx, rng: Rng, keys: string[], among: readonly SupplierKey[], partial = 0): DemoRequestLine[] {
  return keys.map((k) => {
    let offers = fullOffers(ctx, k, among);
    if (partial > 0 && offers.length > 1 && rng.chance(partial)) offers = offers.slice(0, offers.length - 1);
    return ctx.line(rng, k, offers);
  });
}

function nullLine(clientName: string, unit: string, qty: number, note?: string): DemoRequestLine {
  return { clientName, unit, qty, canonicalKey: null, offers: [], ...(note ? { note } : {}) };
}

// ───────────────────────── заявки ─────────────────────────

function request1(ctx: Ctx, rng: Rng): DemoRequest {
  const among: SupplierKey[] = ['s1', 's2', 's3'];
  const used = new Set<string>();
  const out: DemoRequestLine[] = [];
  for (const [name, unit, qty, ref] of EXCEL_CLIENT_BLOCK) {
    const key = typeof ref === 'string' ? ref : ref(ctx);
    if (key) used.add(key);
    out.push({ clientName: name, unit, qty, canonicalKey: key, offers: key ? fullOffers(ctx, key, among).map((supplierKey) => ({ supplierKey })) : [] });
  }
  // Не добирати «родові» дублікати позицій з «Блоку Клієнта» (той самий типорозмір іншого бренду).
  for (const key of used) ctx.usedSignatures.add(ctx.genericSignature(key));
  const cats: CatWeights = {
    mixer: 3, 'ball-valve': 3, hose: 2, filter: 1, valve: 1, union: 1, 'ppr-fitting': 3, 'ppr-pipe': 1, fastener: 1, siphon: 1,
    sealant: 2, sink: 1, washbasin: 1, toilet: 1, 'shower-tray': 0.5, gauge: 1, reducer: 1, 'press-fitting': 1, manifold: 0.5, 'pex-pipe': 0.5,
  };
  const multi = ctx.pickKeys(rng, 21, cats, among, 2, 3, used);
  const single = ctx.pickKeys(rng, 3, cats, among, 1, 1, used);
  const pending = ctx.pickKeys(rng, 2, cats, among, 2, 3, used);
  const extra: DemoRequestLine[] = [
    ...lines(ctx, rng, multi, among, 0.15),
    ...lines(ctx, rng, single, among),
    ...pending.map((k) => ({ ...ctx.line(rng, k, []), note: 'Уточнити в клієнта модель' })),
    nullLine('Трап душовий 150х150 з сухим затвором', 'шт', 2, 'Немає в прайсах — запитати в постачальників'),
    nullLine('Бачок змивний до компакта (старого зразка) білий', 'шт', 1),
  ];
  // Перемішуємо «брудні» рядки, щоб підібрані й непідібрані чергувалися, як у реальній заявці.
  out.push(...rng.shuffle(extra));

  // Виключена пропозиція: найменша сума рядка у мінімального постачальника (нерентабельно везти одну дрібницю).
  const SMALL = new Set(['sealant', 'ppr-fitting', 'hose', 'fastener', 'gauge', 'press-fitting', 'union', 'valve', 'filter', 'siphon']);
  let exclIdx = -1;
  let exclSk: SupplierKey | null = null;
  for (const onlySmall of [true, false]) {
    let exclSum = Number.POSITIVE_INFINITY;
    out.forEach((l, i) => {
      if (!l.canonicalKey || l.offers.length < 2) return;
      if (onlySmall && (i < 12 || !SMALL.has(ctx.specByKey.get(l.canonicalKey)?.category ?? ''))) return;
      const sorted = l.offers.slice().sort((a, b) => ctx.priceUah(l.canonicalKey!, a.supplierKey) - ctx.priceUah(l.canonicalKey!, b.supplierKey));
      const cheapest = sorted[0].supplierKey;
      if (cheapest === 's3') return; // s3 — основний постачальник цієї заявки, у нього й так багато позицій
      const sum = ctx.priceUah(l.canonicalKey, cheapest) * l.qty;
      if (sum < exclSum) { exclSum = sum; exclIdx = i; exclSk = cheapest; }
    });
    if (exclIdx >= 0) break;
  }
  if (exclIdx >= 0 && exclSk) {
    const line = out[exclIdx];
    const key = line.canonicalKey!;
    line.offers.find((o) => o.supplierKey === exclSk)!.excluded = true;
    // Примітка — з реальних цифр рядка (а не вигадана причина, що суперечить даним).
    const sorted = line.offers.slice().sort((a, b) => ctx.priceUah(key, a.supplierKey) - ctx.priceUah(key, b.supplierKey));
    const alt = sorted.find((o) => o.supplierKey !== exclSk);
    if (alt) {
      const diffPerUnit = ctx.priceUah(key, alt.supplierKey) - ctx.priceUah(key, exclSk);
      const altName = ctx.supplierMap.get(alt.supplierKey)?.name ?? alt.supplierKey;
      line.note = `Дешевше лише на ${diffPerUnit.toFixed(2)} грн/шт — не варто окремої доставки, беремо разом з рештою в ${altName}`;
    } else {
      line.note = 'Виключено: нерентабельно везти окремо';
    }
  }

  // Затвердження: приблизно половина підібраних рядків (переважно мінімальна ціна з достатнім залишком,
  // один рядок — свідомий ручний вибір НЕ найдешевшого через нестачу на складі в мінімального).
  let manualDone = false;
  out.forEach((l, i) => {
    if (!l.canonicalKey || !l.offers.length) return;
    const approve = i === exclIdx || (i < 12 ? rng.chance(0.6) : rng.chance(0.4));
    if (!approve) return;
    if (!manualDone && i >= 12 && l.offers.length >= 2 && !l.offers.some((o) => o.excluded)) {
      manualDone = ctx.approveNonMinForStock(l);
      if (manualDone) return;
    }
    ctx.approveMin(l);
  });

  return {
    seedKey: 'req-000001', clientKey: 'c1', status: 'IN_PROGRESS', daysAgo: 10, title: 'Комплектація санвузлів і водопостачання, корпус Б',
    supplierKeys: among, lines: out, note: 'Труба ППР 40 — продається кратно 4 м (118 → 120)', markup: { method: 'RRP' },
  };
}

function request2(ctx: Ctx, rng: Rng): DemoRequest {
  const among: SupplierKey[] = ['s2', 's3', 's4'];
  const used = new Set<string>();
  const cats: CatWeights = {
    'ball-valve': 3, 'ppr-pipe': 2, 'ppr-fitting': 4, valve: 2, filter: 2, pump: 1, 'water-meter': 1, gauge: 1, fastener: 2,
    sewer: 2, reducer: 1, sealant: 1, boiler: 1, union: 1,
  };
  const keys = [...ctx.pickKeys(rng, 20, cats, among, 2, 3, used), ...ctx.pickKeys(rng, 5, cats, among, 1, 1, used)];
  const ls = lines(ctx, rng, rng.shuffle(keys), among);
  let manual = false;
  for (const l of ls) {
    if (!manual && l.offers.length >= 2 && rng.chance(0.2)) manual = ctx.approveNonMin(l, 'Постачальник з кращим терміном поставки');
    else ctx.approveMin(l);
  }
  const approvedLineIdx = ls.map((_, i) => i).filter(() => rng.chance(0.62));
  return {
    seedKey: 'req-000002', clientKey: 'c2', status: 'DONE', daysAgo: 8, title: 'Котельня та водопостачання цеху № 2',
    supplierKeys: among, lines: ls, hasKp: true, approvedLineIdx, markup: { method: 'MARKUP_PERCENT', value: 18 },
  };
}

function request3(ctx: Ctx, rng: Rng): DemoRequest {
  const among: SupplierKey[] = ['s1', 's4'];
  const used = new Set<string>();
  const keys = ctx.pickKeys(rng, 6, { mixer: 2, washbasin: 1, toilet: 1, siphon: 1 }, among, 1, 2, used);
  const ls = keys.map((k, i) => ctx.line(rng, k, i < 4 ? fullOffers(ctx, k, among) : []));
  return {
    seedKey: 'req-000003', clientKey: 'c3', status: 'CANCELLED', daysAgo: 6, title: 'Заміна сантехніки в номерах',
    supplierKeys: among, lines: ls, cancelReason: 'Клієнт закупив самостійно', markup: { method: 'RRP' },
  };
}

function request4(ctx: Ctx, rng: Rng): DemoRequest {
  const used = new Set<string>();
  const cats: CatWeights = { 'ball-valve': 2, mixer: 2, 'ppr-fitting': 3, 'ppr-pipe': 1, hose: 2, sewer: 2, siphon: 1, sealant: 1, fastener: 1, filter: 1 };
  const keys = ctx.pickKeys(rng, 13, cats, [], 2, 4, used);
  const ls = keys.map((k) => ctx.line(rng, k, []));
  ls.splice(5, 0, nullLine('Змішувач як минулого разу (сірий)', 'шт', 2));
  ls.push(nullLine('Хомути різні', 'уп', 1));
  return {
    seedKey: 'req-000004', clientKey: 'c4', status: 'IN_PROGRESS', daysAgo: 0, title: 'Імпортовано з Excel клієнта',
    supplierKeys: [], lines: ls, markup: { method: 'RRP' },
  };
}

function request5(ctx: Ctx, rng: Rng): DemoRequest {
  const among: SupplierKey[] = ['s1', 's2', 's4'];
  const used = new Set<string>();
  const cats: CatWeights = { mixer: 4, toilet: 2, washbasin: 2, installation: 2, 'shower-tray': 1, siphon: 2, hose: 2, sink: 1, boiler: 1 };
  const keys = [...ctx.pickKeys(rng, 16, cats, among, 2, 3, used), ...ctx.pickKeys(rng, 4, cats, among, 1, 1, used)];
  const ls = lines(ctx, rng, rng.shuffle(keys), among);
  for (const l of ls) ctx.approveMin(l);
  return {
    seedKey: 'req-000005', clientKey: 'c5', status: 'IN_PROGRESS', daysAgo: 2, title: 'Ремонт санвузлів готелю, 2 поверх',
    supplierKeys: among, lines: ls, hasKp: true, markup: { method: 'DISCOUNT_FROM_RRP', value: 5 },
  };
}

function request6(ctx: Ctx, rng: Rng): DemoRequest {
  const among: SupplierKey[] = ['s2', 's3', 's4'];
  const used = new Set<string>();
  const cats: CatWeights = { radiator: 4, 'ppr-pipe': 2, 'ppr-fitting': 3, manifold: 2, pump: 1, 'ball-valve': 2, fastener: 1, valve: 1, gauge: 1, 'pex-pipe': 1 };
  const keys = [...ctx.pickKeys(rng, 14, cats, among, 2, 3, used), ...ctx.pickKeys(rng, 4, cats, among, 1, 1, used)];
  const ls = lines(ctx, rng, rng.shuffle(keys), among);
  for (const l of ls) ctx.approveMin(l);
  const approvedLineIdx = ls.map((_, i) => i).filter(() => rng.chance(0.55));
  return {
    seedKey: 'req-000006', clientKey: 'c6', status: 'IN_PROGRESS', daysAgo: 4, title: 'Опалення складу: радіатори та розводка',
    supplierKeys: among, lines: ls, hasKp: true, approvedLineIdx, markup: { method: 'MARKUP_PERCENT', value: 22 },
  };
}

export function buildShowcaseRequests(input: ShowcaseInput): DemoRequest[] {
  const ctx = new Ctx(input);
  const r = input.rng;
  const builders: [string, (c: Ctx, g: Rng) => DemoRequest][] = [
    ['req1', request1], ['req2', request2], ['req3', request3], ['req4', request4], ['req5', request5], ['req6', request6],
  ];
  return builders.map(([label, build]) => {
    ctx.usedNames = new Set(EXCEL_CLIENT_BLOCK.map(([n]) => n.toLowerCase()));
    return build(ctx, r.fork(label));
  });
}
