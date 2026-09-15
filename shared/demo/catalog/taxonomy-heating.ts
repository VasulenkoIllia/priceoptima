// Категорії: радіатори, насоси циркуляційні, бойлери, лічильники води, колектори.

import type { Rng } from './prng';
import { jitter, modelCode, plural, type CanonicalSpec, type CategoryDef, type Style } from './taxonomy-core';

type Spec = CanonicalSpec;

function mk(o: Omit<Spec, 'multiplicity' | 'minOrderQty' | 'unit'> & Partial<Pick<Spec, 'multiplicity' | 'minOrderQty' | 'unit'>>): Spec {
  return { unit: 'шт', multiplicity: 1, minOrderQty: 1, ...o, basePriceUah: Math.round(o.basePriceUah * 100) / 100 };
}

// ───────────── Радіатори ─────────────

const radiators: CategoryDef = {
  id: 'radiator', title: 'Радіатори', target: 30,
  affinity: { s1: 0, s2: 0, s3: 0.2, s4: 1 },
  build(rng: Rng) {
    const out: Spec[] = [];
    const brands: [string, number][] = [['Karro', 0.9], ['Emmy', 0.95], ['Korado', 1.15], ['Purmo', 1.25], ['Kermi', 1.35]];
    const typeF: Record<number, [number, number]> = { 11: [0.55, 0.52], 22: [1, 1], 33: [1.45, 1.4] };
    const hF: Record<number, [number, number]> = { 300: [0.68, 0.66], 500: [1, 1], 600: [1.15, 1.17] };
    const grid: [number, number, number[]][] = [
      [22, 500, [400, 600, 800, 1000, 1200, 1400, 1600]], [22, 300, [600, 800, 1000, 1200, 1400]],
      [22, 600, [600, 800, 1000, 1200, 1400]], [11, 500, [600, 800, 1000, 1200]], [33, 500, [800, 1000, 1200, 1400]],
    ];
    for (const [brand, bm] of brands) {
      for (const [type, h, lens] of grid) {
        for (const L of lens) {
          for (const conn of ['side', 'bottom'] as const) {
            if (rng.chance(conn === 'side' ? 0.3 : 0.6)) continue;
            const code = modelCode(rng, brand);
            const [tp, tw] = typeF[type];
            const [hp, hw] = hF[h];
            const lf = Math.pow(L / 800, 0.9);
            const watts = Math.round((1380 * tw * hw * L) / 800 / 10) * 10;
            const cW = conn === 'side' ? 'бічне' : 'нижнє';
            const cS = conn === 'side' ? 'K' : 'VK';
            out.push(mk({
              key: `rad:${brand}:${type}:${h}:${L}:${conn}`, category: 'radiator', brand, stock: 'piece', qty: [1, 12],
              basePriceUah: jitter(rng, 3100 * bm * tp * hp * lf * (conn === 'bottom' ? 1.12 : 1), 0.05),
              attrs: { kind: 'panel', type, height: h, length: L, conn, watts },
              render: (s: Style) => ({
                work: [
                  `Радіатор сталевий ${type} тип ${h}×${L} ${cW} ${brand}`,
                  `Радіатор стал. панельний ${type}х${h}х${L} ${conn === 'side' ? 'бок.' : 'низ.'} ${brand}`,
                  `${brand} радіатор ${type}${cS} ${h}x${L}`,
                  `Радіатор ${brand} ${type} ${h}*${L} ${conn === 'side' ? 'бічн.' : 'нижн.'}`,
                ][s],
                full: [
                  `Радіатор сталевий панельний ${brand} ${code} тип ${type}, ${h}×${L} мм, ${cW} підключення 1/2", ${watts} Вт`,
                  `Радіатор сталевий ${brand} ${type}${cS} ${h}х${L} (${code}), ${cW} підкл., ${watts} Вт при 75/65/20°C`,
                  `Радіатор панельний ${brand} ${code} ${type}${cS} ${h}/${L}, ${watts} Вт`,
                  `Радіатор сталевий ${brand} тип ${type} ${h}х${L} ${cW} підключення, арт. ${code}`,
                ][s],
              }),
              client: [
                `Радіатор ${type} ${h}х${L}`, `батарея ${h}*${L} ${type} тип`, `Радіатор сталевий ${type}х${h}х${L}`,
                `рад. ${type}/${h}/${L} ${conn === 'side' ? 'бокове' : 'нижнє'}`,
              ],
            }));
          }
        }
      }
    }
    for (const [brand, base] of [['Karro', 203], ['Fondital', 336], ['Global', 364]] as [string, number][]) {
      for (const [c, depth, m] of [[500, 80, 1], [500, 100, 1.12], [350, 80, 0.9]] as [number, number, number][]) {
        const code = modelCode(rng, brand);
        const watts = Math.round((c === 500 ? 185 : 140) * (depth === 100 ? 1.08 : 1));
        out.push(mk({
          key: `rad:${brand}:bimetal:${c}:${depth}`, category: 'radiator', brand, stock: 'small', qty: [6, 60], unit: 'секц.',
          basePriceUah: jitter(rng, base * m, 0.05), attrs: { kind: 'bimetal', center: c, depth, watts },
          render: (s: Style) => ({
            work: [`Радіатор біметалевий ${c}/${depth} ${brand} (секція)`, `Секція біметал. ${c}/${depth} ${brand}`, `${brand} біметал ${c}/${depth} 1 секц.`, `Радіатор біметал ${brand} ${c}х${depth} секція`][s],
            full: [
              `Радіатор біметалевий секційний ${brand} ${code} ${c}/${depth}, 1 секція, ${watts} Вт`,
              `Секція радіатора біметалевого ${brand} ${c}/${depth} (${code}), ${watts} Вт`,
              `Радіатор біметалевий ${brand} ${code} міжосьова ${c} мм, глибина ${depth} мм, секція`,
              `Радіатор біметалевий ${brand} ${c}/${depth} (секція), арт. ${code}`,
            ][s],
          }),
          client: [`Радіатор біметал ${c}`, `біметалеві секції ${c}/${depth}`, `Батарея біметалева ${c} мм секція`],
        }));
      }
    }
    return out;
  },
};

// ───────────── Насоси ─────────────

const PUMPS: [string, string, number, number][] = [
  ['Grundfos', 'UPS 25-40 180', 4200, 180], ['Grundfos', 'UPS 25-60 180', 4800, 180], ['Grundfos', 'UPS 32-60 180', 5600, 180],
  ['Grundfos', 'Alpha1 L 25-40 180', 4960, 180], ['Grundfos', 'Alpha1 L 25-60 180', 5520, 180], ['Grundfos', 'Alpha2 25-60 180', 11500, 180],
  ['Wilo', 'Star-RS 25/4', 3600, 180], ['Wilo', 'Star-RS 25/6', 4100, 180], ['Wilo', 'Yonos Pico 25/1-6', 6500, 180], ['Wilo', 'Para 25/6', 5200, 180],
  ['IMP', 'GHN 25/40-180', 2900, 180], ['IMP', 'GHN 25/60-180', 3300, 180], ['IMP', 'NMT Mini 25/60', 5200, 180],
  ['Koer', 'KP.GRS 25/4-180', 1470, 180], ['Koer', 'KP.GRS 25/6-180', 1680, 180], ['Koer', 'KP.GRS 32/8-180', 2940, 180],
  ['Grundfos', 'UPS 25-40 130', 4300, 130], ['Wilo', 'Star-RS 25/4-130', 3700, 130],
];

const pumps: CategoryDef = {
  id: 'pump', title: 'Насоси циркуляційні', target: 16,
  affinity: { s1: 0, s2: 0.15, s3: 0.3, s4: 1 },
  build(rng: Rng) {
    return PUMPS.map(([brand, model, price, len]) => {
      const code = modelCode(rng, brand);
      const energy = /Alpha|Yonos|Para|NMT/.test(model) ? 'енергоефективний, ' : '';
      return mk({
        key: `pump:${brand}:${model.replace(/[ /.]/g, '')}`, category: 'pump', brand, stock: 'piece', qty: [1, 3],
        basePriceUah: jitter(rng, price, 0.04), attrs: { model, length: len },
        render: (s: Style) => ({
          work: [`Насос циркуляційний ${brand} ${model}`, `Насос циркул. ${brand} ${model} з гайками`, `${brand} ${model} циркуляційний насос`, `Насос ${brand} ${model}`][s],
          full: [
            `Насос циркуляційний ${brand} ${model}, ${energy}монтажна довжина ${len} мм, 230 В, з гайками`,
            `Насос циркуляційний ${brand} ${model} (${code}) ${len} мм, 1~230 В`,
            `Насос для систем опалення ${brand} ${model}, ${len} мм`,
            `Насос циркуляційний ${brand} ${model}, арт. ${code}`,
          ][s],
        }),
        client: [`Насос циркуляційний ${brand}`, `насос ${model}`, `Циркуляційний насос ${model.match(/\d\d[-/]\d+/)?.[0] ?? ''}`.trim(), 'насос на опалення'],
      });
    });
  },
};

// ───────────── Бойлери ─────────────

const boilers: CategoryDef = {
  id: 'boiler', title: 'Бойлери (водонагрівачі)', target: 16,
  affinity: { s1: 0.3, s2: 0, s3: 0, s4: 1 },
  build(rng: Rng) {
    const out: Spec[] = [];
    const lines: [string, string, number, string][] = [
      ['Atlantic', 'Opro Profi', 6500, 'мокрий ТЕН'], ['Ariston', 'Pro1 R', 5184, 'мокрий ТЕН'], ['Gorenje', 'TGR', 7800, 'мокрий ТЕН'],
      ['Atlantic', 'Steatite', 9000, 'сухий ТЕН'], ['Ariston', 'Velis', 8280, 'плоский, 2 баки'], ['Kospel', 'Termo Hit', 6900, 'мокрий ТЕН'],
    ];
    for (const [brand, ser, base80, heater] of lines) {
      for (const vol of [50, 80, 100]) {
        const code = modelCode(rng, brand);
        const m = vol === 50 ? 0.85 : vol === 80 ? 1 : 1.15;
        out.push(mk({
          key: `boiler:${brand}:${ser.replace(/ /g, '')}:${vol}`, category: 'boiler', brand, stock: 'piece', qty: [1, 3],
          basePriceUah: jitter(rng, base80 * m, 0.04), attrs: { series: ser, volume: vol },
          render: (s: Style) => ({
            work: [`Бойлер ${brand} ${ser} ${vol} л`, `Водонагрівач ${brand} ${ser} ${vol}л`, `${brand} ${ser} ${vol} V бойлер`, `Бойлер електричний ${brand} ${ser} ${vol}`][s],
            full: [
              `Водонагрівач електричний накопичувальний ${brand} ${ser} ${vol} л, вертикальний, ${heater}, 1,5 кВт`,
              `Водонагрівач ${brand} ${ser} ${vol} V (${code}), ${heater}`,
              `Бойлер ${brand} ${ser} ${vol} л ${code}, настінний, вертикальний`,
              `Бойлер ${brand} ${ser} ${vol} л, ${heater}, арт. ${code}`,
            ][s],
          }),
          client: [`Бойлер ${vol} л`, `бойлер ${vol}л ${brand}`, `Водонагрівач ${vol} літрів`, `Бойлер електр. на ${vol}`],
        }));
      }
    }
    return out;
  },
};

// ───────────── Лічильники води ─────────────

const meters: CategoryDef = {
  id: 'water-meter', title: 'Лічильники води', target: 16,
  affinity: { s1: 0, s2: 0.6, s3: 0.3, s4: 1 },
  build(rng: Rng) {
    const out: Spec[] = [];
    const items: [string, string, string, number, boolean][] = [
      ['15c', '1/2"', 'холодна', 380, false], ['15h', '1/2"', 'гаряча', 400, false], ['20c', '3/4"', 'холодна', 520, false],
      ['20h', '3/4"', 'гаряча', 540, false], ['15c-imp', '1/2"', 'холодна', 380 * 1.6, true], ['15h-imp', '1/2"', 'гаряча', 400 * 1.6, true],
    ];
    for (const [brand, bm] of [['Novator', 1], ['Apator', 1.25], ['Gross', 1.2], ['Sensus', 1.5]] as [string, number][]) {
      for (const [id, size, water, base, imp] of items) {
        if (rng.chance(0.2)) continue;
        const code = modelCode(rng, brand);
        const dn = size === '1/2"' ? 15 : 20;
        const w = water === 'холодна' ? 'ХВ' : 'ГВ';
        const i = imp ? ' з імпульсним виходом' : '';
        out.push(mk({
          key: `meter:${brand}:${id}`, category: 'water-meter', brand, stock: 'mid', qty: [1, 10],
          basePriceUah: jitter(rng, base * bm, 0.05), attrs: { size, dn, water, impulse: imp ? 1 : 0 },
          render: (s: Style) => ({
            work: [`Лічильник води ${brand} ${size} ${water} вода${i}`, `Водолічильник ${brand} Ду${dn} ${w}${imp ? ' імп.' : ''}`, `${brand} лічильник ${dn} мм ${w}${i}`, `Лічильник ${brand} ${code} ${size} ${w}`][s],
            full: [
              `Лічильник води крильчастий ${brand} ${code} Ду${dn} ${size}, ${water} вода, Qn ${dn === 15 ? '1,5' : '2,5'} м³/год, L=${dn === 15 ? 110 : 130} мм, з комплектом штуцерів${i}`,
              `Лічильник ${water === 'холодна' ? 'холодної' : 'гарячої'} води ${brand} ${code} Ду${dn}${i}, з штуцерами`,
              `Водолічильник ${brand} ${code} ${size} ${w} ${dn === 15 ? 110 : 130} мм${i}`,
              `Лічильник води ${brand} ${size} ${water}${i}, арт. ${code}`,
            ][s],
          }),
          client: [`Лічильник води ${size}`, `лічильник ${water === 'холодна' ? 'хол' : 'гар'} води ду${dn}`, `Водомір ${dn}`, `счетчик воды ${size}`],
        }));
      }
    }
    return out;
  },
};

// ───────────── Колектори ─────────────

const manifolds: CategoryDef = {
  id: 'manifold', title: 'Колектори', target: 23,
  affinity: { s1: 0, s2: 0.6, s3: 0.8, s4: 0.25 },
  build(rng: Rng) {
    const out: Spec[] = [];
    for (const [brand, base] of [['Koer', 380], ['SD Plus', 400], ['Valtec', 520], ['Icma', 700], ['Giacomini', 850]] as [string, number][]) {
      for (const n of [2, 3, 4]) {
        for (const valves of [false, true]) {
          const code = modelCode(rng, brand);
          const vW = valves ? ' з кранами' : '';
          out.push(mk({
            key: `manifold:${brand}:${n}:${valves ? 'v' : 'n'}`, category: 'manifold', brand, stock: 'mid', qty: [1, 6],
            basePriceUah: jitter(rng, base * (1 + (n - 2) * 0.45) * (valves ? 2 : 1), 0.05), attrs: { type: 'brass', outlets: n, valves: valves ? 1 : 0 },
            render: (s: Style) => ({
              work: [`Колектор 1"×1/2" на ${n} виходи${vW} ${brand}`, `Колектор лат. 1" ${n} вих.${valves ? ' з кран.' : ''} ${brand}`, `${brand} колектор 1" ${n}x1/2"${vW}`, `Колектор ${brand} 1" на ${n}${vW}`][s],
              full: [
                `Колектор латунний ${brand} ${code} 1" ВЗ × ${n} виходи 1/2" ЗР${vW}`,
                `Колектор латунний нікельований ${brand} ${code} 1" на ${n} виходи 1/2"${vW}`,
                `Колектор розподільчий ${brand} ${code} 1"×1/2" ${n} відводи${vW}`,
                `Колектор ${brand} 1" ${n} виходи 1/2"${vW}, арт. ${code}`,
              ][s],
            }),
            client: [`Колектор на ${n} виходи`, `колектор 1" ${n} вих`, `Гребінка на ${n}`, `Колектор ${n} виходи ${valves ? 'з кранами' : ''}`.trim()],
          }));
        }
      }
    }
    for (const [brand, base] of [['Koer', 3200], ['Valtec', 4800], ['Icma', 5800], ['Giacomini', 7200]] as [string, number][]) {
      for (const n of [3, 4, 5, 6, 8]) {
        if (rng.chance(0.25)) continue;
        const code = modelCode(rng, brand);
        const contourW = plural(n, 'контур', 'контури', 'контурів');
        const outletW = plural(n, 'вихід', 'виходи', 'виходів');
        out.push(mk({
          key: `manifold:${brand}:floor:${n}`, category: 'manifold', brand, stock: 'piece', qty: [1, 3],
          basePriceUah: jitter(rng, base * (1 + (n - 3) * 0.2), 0.05), attrs: { type: 'floor', outlets: n, valves: 1 },
          render: (s: Style) => ({
            work: [`Колектор для теплої підлоги на ${n} ${contourW} ${brand}`, `Колект. група т/п ${n} конт. з витратом. ${brand}`, `${brand} колектор тепла підлога ${n} ${outletW}`, `Колектор ${brand} тепла підлога ${n}`][s],
            full: [
              `Колекторна група для теплої підлоги ${brand} ${code} 1" на ${n} ${contourW}, з витратомірами і термостатичними клапанами`,
              `Колектор з витратомірами ${brand} ${code} 1" ${n} ${outletW} 3/4" євроконус`,
              `Колекторний блок ${brand} ${code} для теплої підлоги ${n} ${contourW}`,
              `Колектор для теплої підлоги ${brand} ${n} ${contourW}, арт. ${code}`,
            ][s],
          }),
          client: [`Колектор тепла підлога ${n} ${outletW}`, `колектор з витратомірами на ${n}`, `Гребінка для теплої підлоги ${n}`],
        }));
      }
    }
    return out;
  },
};

export const HEATING_CATEGORIES: readonly CategoryDef[] = [radiators, pumps, boilers, meters, manifolds];
