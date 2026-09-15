// Категорії: змішувачі, крани кульові, американки/згони, фільтри, клапани, редуктори, манометри, шланги, герметики.

import type { Rng } from './prng';
import {
  DN, INCH, INCH_PRICE, inch, jitter, lcFirst, modelCode, thread, threadLong, v,
  type CanonicalSpec, type CategoryDef, type Inch, type Style, type Thread,
} from './taxonomy-core';

type Spec = CanonicalSpec;

function mk(o: Omit<Spec, 'multiplicity' | 'minOrderQty' | 'unit'> & Partial<Pick<Spec, 'multiplicity' | 'minOrderQty' | 'unit'>>): Spec {
  return { unit: 'шт', multiplicity: 1, minOrderQty: 1, ...o, basePriceUah: Math.round(o.basePriceUah * 100) / 100 };
}

const comma = (n: number): string => String(n).replace('.', ',');

// ───────────── Змішувачі ─────────────

const MIX_BRANDS: [string, number, string[]][] = [
  ['Koer', 1.0, ['Sella', 'Tono']],
  ['Kaiser', 0.9, ['Merkur', 'Sonat']],
  ['Qtap', 1.0, ['Vlasta', 'Linea']],
  ['Imprese', 1.35, ['Lesna', 'Krasna']],
  ['Cersanit', 0.85, ['Mille', 'Vero']],
  ['Kludi', 1.45, ['Pure', 'Zenta']],
  ['Grohe', 1.3, ['Eurosmart', 'BauLoop']],
  ['Hansgrohe', 1.75, ['Logis', 'Focus']],
];

/** Преміум-бренди, які продають лише хром (кольорові/нерж. лінійки — у масовому сегменті). */
const MIX_COLOR_BRANDS = new Set(['Koer', 'Kaiser', 'Qtap', 'Imprese']);
/** Реальні окремі серії душових систем (не та сама лінійка, що умивальники/кухня). */
const SHOWER_SYS_SERIES: Record<string, string> = { Grohe: 'Tempesta', Hansgrohe: 'Crometta' };

interface MixType { id: string; mult: number; work: string[]; full: string[]; spec: string; client: string[]; qty: [number, number] }

const MIX_TYPES: MixType[] = [
  { id: 'basin', mult: 1, work: ['Змішувач для раковини', 'Змішувач д/раковини', 'Змішувач для умивальника', 'Змішувач раковина'],
    full: ['Змішувач для раковини одноважільний', 'Змішувач д/умивальника одноважільний', 'Змішувач для умивальника', 'Змішувач для раковини'],
    spec: 'низький вилив, з донним клапаном', client: ['Змішувач д/раковини', 'Змішувач для умивальника', 'змішувач на раковину'], qty: [1, 6] },
  { id: 'basin_high', mult: 1.55, work: ['Змішувач для раковини високий', 'Змішувач д/раковини високий вилив', 'Змішувач для умивальника високий', 'Змішувач раковина високий'],
    full: ['Змішувач для раковини одноважільний', 'Змішувач д/умивальника одноважільний', 'Змішувач для умивальника', 'Змішувач для раковини'],
    spec: 'високий вилив, для накладної раковини', client: ['Змішувач для раковини високий', 'змішувач високий на накладну раковину'], qty: [1, 4] },
  { id: 'kitchen', mult: 1.25, work: ['Змішувач для кухні', 'Змішувач д/кухні', 'Змішувач для мийки', 'Змішувач кухня'],
    full: ['Змішувач для кухні одноважільний', 'Змішувач д/кухні одноважільний', 'Змішувач для кухонної мийки', 'Змішувач для кухні'],
    spec: 'поворотний вилив', client: ['Змішувач для кухні', 'змішувач на мийку', 'Змішувач кух.'], qty: [1, 4] },
  { id: 'kitchen_flex', mult: 1.7, work: ['Змішувач для кухні з гнучким виливом', 'Змішувач д/кухні гнучкий вилив', 'Змішувач для мийки з гнучким виливом', 'Змішувач кухня гнучкий'],
    full: ['Змішувач для кухні одноважільний', 'Змішувач д/кухні одноважільний', 'Змішувач для кухонної мийки', 'Змішувач для кухні'],
    spec: 'гнучкий силіконовий вилив', client: ['Змішувач для кухні гнучкий', 'змішувач кухня з гнучким носиком'], qty: [1, 3] },
  { id: 'bath', mult: 1.45, work: ['Змішувач для ванни', 'Змішувач д/ванни', 'Змішувач для ванни', 'Змішувач ванна'],
    full: ['Змішувач для ванни одноважільний', 'Змішувач д/ванни одноважільний', 'Змішувач для ванни', 'Змішувач для ванни'],
    spec: 'короткий вилив, з душовим комплектом', client: ['Змішувач для ванни', 'змішувач ванна з лійкою'], qty: [1, 4] },
  { id: 'bath_long', mult: 1.6, work: ['Змішувач для ванни довгий вилив', 'Змішувач д/ванни довгий вилив', 'Змішувач для ванни з довгим виливом', 'Змішувач ванна довгий'],
    full: ['Змішувач для ванни одноважільний', 'Змішувач д/ванни одноважільний', 'Змішувач для ванни', 'Змішувач для ванни'],
    spec: 'довгий вилив 350 мм, з душовим комплектом', client: ['Змішувач для ванни довгий ніс', 'змішувач ванна довгий вилив'], qty: [1, 3] },
  { id: 'shower', mult: 1.15, work: ['Змішувач для душу', 'Змішувач д/душу', 'Змішувач для душової кабіни', 'Змішувач душ'],
    full: ['Змішувач для душу одноважільний', 'Змішувач д/душу одноважільний', 'Змішувач для душу', 'Змішувач для душу'],
    spec: 'без душового комплекту', client: ['Змішувач для душу', 'змішувач в душову'], qty: [1, 4] },
  { id: 'shower_sys', mult: 3.0, work: ['Душова система', 'Душова система з верхнім душем', 'Душова стійка зі змішувачем', 'Душова система'],
    full: ['Душова система зі змішувачем', 'Душова система з верхнім душем', 'Душова стійка зі змішувачем', 'Душова система'],
    spec: 'верхній душ 250 мм, ручний душ, шланг 1,5 м', client: ['Душова система', 'душова стійка з тропічним душем'], qty: [1, 2] },
  { id: 'hygienic', mult: 1.6, work: ['Змішувач з гігієнічним душем', 'Змішувач прих. монтажу з гіг. душем', 'Гігієнічний душ зі змішувачем', 'Змішувач гігієнічний'],
    full: ['Змішувач прихованого монтажу з гігієнічним душем', 'Змішувач прих. монтажу з гігієнічним душем', 'Гігієнічний душ зі змішувачем прихованого монтажу', 'Змішувач з гігієнічним душем'],
    spec: 'прихований монтаж, лійка, шланг 1,2 м, тримач', client: ['Гігієнічний душ зі змішувачем', 'гігієнічний душ'], qty: [1, 3] },
];

const MIX_COLORS: [string, string, string, number][] = [
  ['chrome', 'хром', 'хром', 1],
  ['black', 'чорний матовий', 'чорн. мат.', 1.15],
  ['white', 'білий матовий', 'біл. мат.', 1.15],
  ['steel', 'нержавіюча сталь', 'нерж.', 1.1],
];

const mixers: CategoryDef = {
  id: 'mixer', title: 'Змішувачі', target: 97,
  affinity: { s1: 1, s2: 0.85, s3: 0, s4: 0.1 },
  build(rng: Rng) {
    const out: Spec[] = [];
    for (const [brand, tier, series] of MIX_BRANDS) {
      for (const ser of series) {
        for (const t of MIX_TYPES) {
          // Душова система — окрема лінійка бренду, а не серія умивальника/кухні: не дублювати на кожну ser.
          if (t.id === 'shower_sys' && SHOWER_SYS_SERIES[brand] && ser !== series[0]) continue;
          const canColor = MIX_COLOR_BRANDS.has(brand);
          const colorPool = t.id === 'kitchen' || t.id === 'kitchen_flex' ? MIX_COLORS.slice(1) : MIX_COLORS.slice(1, 3);
          const [cid, color, colorShort, cm] = !canColor || rng.chance(0.75) ? MIX_COLORS[0] : rng.pick(colorPool);
          const seriesName = t.id === 'shower_sys' ? (SHOWER_SYS_SERIES[brand] ?? ser) : ser;
          const code = modelCode(rng, brand);
          const price = jitter(rng, 1550 * tier * t.mult * cm, 0.08);
          const colorTail = cid === 'chrome' ? '' : `, ${color}`;
          out.push(mk({
            key: `mix:${brand}:${ser}:${t.id}:${cid}`, category: 'mixer', brand, basePriceUah: price, stock: 'piece', qty: t.qty,
            attrs: { type: t.id, series: seriesName, color: cid },
            render: (s: Style) => ({
              work: [
                `${t.work[0]} ${brand} ${seriesName}${colorTail}`,
                `${t.work[1]} ${brand} ${seriesName} ${colorShort}`,
                `${t.work[2]} ${brand} ${seriesName} ${colorShort}`,
                `${t.work[3]} ${brand} ${seriesName} ${code}${colorTail}`,
              ][s],
              full: [
                `${t.full[0]} ${brand} ${seriesName} ${code}, ${t.spec}, ${color}`,
                `${t.full[1]} ${brand} ${seriesName} (${code}), ${t.spec}, колір: ${color}`,
                `${t.full[2]} ${brand} ${seriesName} ${code} ${color}`,
                `${t.full[3]} ${brand} ${seriesName}, арт. ${code}, ${color}, ${t.spec}`,
              ][s],
            }),
            client: [...t.client, `${t.client[0]} ${brand}`, `${t.client[0]} ${brand} ${seriesName} ${color}`],
          }));
        }
      }
    }
    return out;
  },
};

// ───────────── Крани кульові ─────────────

const BV_BRANDS: [string, number, string][] = [
  ['Koer', 110, 'PN25'], ['SD Plus', 150, 'PN25'], ['Valtec', 110, 'PN40'],
  ['Icma', 190, 'PN40'], ['Bugatti', 240, 'PN40'], ['Giacomini', 280, 'PN30'],
];

const ballValves: CategoryDef = {
  id: 'ball-valve', title: 'Крани кульові', target: 70,
  affinity: { s1: 0.2, s2: 1, s3: 0.45, s4: 0.22 },
  build(rng: Rng) {
    const out: Spec[] = [];
    for (const [brand, base, pn] of BV_BRANDS) {
      for (const size of INCH) {
        const small = size === '1/2' || size === '3/4' || size === '1';
        const combos: [Thread, 'butterfly' | 'lever'][] = small
          ? [['ВВ', 'butterfly'], ['ВВ', 'lever'], ['ВЗ', 'butterfly'], ['ВЗ', 'lever'], ['ЗЗ', 'butterfly'], ['ЗЗ', 'lever']]
          : [['ВВ', 'lever'], ['ВЗ', 'lever']];
        for (const [thr, handle] of combos) {
          const code = modelCode(rng, brand);
          const price = jitter(rng, base * INCH_PRICE[size] * (handle === 'butterfly' ? 0.95 : 1) * (thr === 'ЗЗ' ? 1.05 : thr === 'ВЗ' ? 1.02 : 1), 0.06);
          const q = inch(size);
          const dn = DN[size];
          const hW = (s: Style) => (handle === 'butterfly' ? v(s, 'метелик', 'ручка-метелик', 'ручка-метелик', 'метелик') : v(s, 'ручка', 'ручка-важіль', 'важіль', 'ручка'));
          const hF = handle === 'butterfly' ? 'ручка-метелик' : 'ручка-важіль';
          out.push(mk({
            key: `bv:${brand}:${size}:${thr}:${handle}`, category: 'ball-valve', brand, basePriceUah: price, stock: 'mid', qty: [1, 12],
            attrs: { size, dn, thread: thr, handle, pn },
            render: (s: Style) => ({
              work: [
                `Кран кульовий ${q} ${thread(0, thr)} ${hW(0)} ${brand}`,
                `Кран кул. лат. ${q} ${thread(1, thr)}, ${hW(1)} ${brand}`,
                `Кран кульовий Ду${dn} ${q} ${thread(2, thr)} ${hW(2)} ${brand}`,
                `Кран кульов. ${brand} ${q} ${thread(3, thr)} ${hW(3)}`,
              ][s],
              full: [
                `Кран кульовий латунний ${brand} ${code} ${q} ${threadLong(thr)}, ${hF}, ${pn}`,
                `Кран кульовий лат. нікельований ${brand} ${code} ${q} (${thread(1, thr)}), ${hF}, ${pn}`,
                `Кран кульовий латунний Ду${dn} ${q} ${thread(2, thr)} ${hF} ${brand} ${code} ${pn}`,
                `Кран кульовий ${brand} ${q} ${thread(3, thr)} ${hF} ${pn}, арт. ${code}`,
              ][s],
            }),
            client: [
              `Кран кульовий ${q}`, `Кран кульовий ${q} ${thread(1, thr)} ${handle === 'butterfly' ? 'метелик' : 'ручка'}`,
              `кран Ду${dn} ${thread(0, thr)}`, `Кран шаровий ${q} ${handle === 'butterfly' ? 'бабочка' : 'ручка'}`, `Кран ${q} ${brand}`,
            ],
          }));
        }
      }
    }
    return out;
  },
};

// ───────────── Американки / згони ─────────────

const UNION_BRANDS: [string, number][] = [['Koer', 90], ['SD Plus', 100], ['Valtec', 105], ['Icma', 170]];

const unions: CategoryDef = {
  id: 'union', title: 'Американки та згони', target: 31,
  affinity: { s1: 0.12, s2: 0.9, s3: 0.5, s4: 0.25 },
  build(rng: Rng) {
    const out: Spec[] = [];
    for (const [brand, base] of UNION_BRANDS) {
      for (const size of INCH) {
        for (const form of ['straight', 'angle'] as const) {
          if (form === 'angle' && (size === '1 1/2' || size === '2')) continue;
          const thr: Thread = rng.chance(0.8) ? 'ВЗ' : 'ВВ';
          const code = modelCode(rng, brand);
          const q = inch(size);
          const dn = DN[size];
          const f = form === 'straight' ? 'пряма' : 'кутова';
          const price = jitter(rng, base * INCH_PRICE[size] * 0.9 * (form === 'angle' ? 1.25 : 1), 0.07);
          out.push(mk({
            key: `union:${brand}:${size}:${form}:${thr}`, category: 'union', brand, basePriceUah: price, stock: 'mid', qty: [1, 10],
            attrs: { size, dn, thread: thr, form },
            render: (s: Style) => ({
              work: [
                `Американка ${q} ${thread(0, thr)} ${f} ${brand}`,
                `Згін-американка лат. ${q} ${thread(1, thr)} ${f} ${brand}`,
                `Американка ${f} Ду${dn} ${q} ${thread(2, thr)} ${brand}`,
                `Американка ${brand} ${q} ${thread(3, thr)} ${f}`,
              ][s],
              full: [
                `Згін-американка латунна нікельована ${brand} ${code} ${q} ${threadLong(thr)}, ${f}`,
                `Згін-американка лат. нік. ${brand} ${code} ${q} Ду${dn} ${thread(1, thr)} ${f}`,
                `З'єднання різьбове «американка» ${f} ${brand} ${code} Ду${dn} ${q} ${thread(2, thr)}`,
                `Американка ${f} ${brand} ${q} ${thread(3, thr)}, арт. ${code}`,
              ][s],
            }),
            client: [`Американка ${q}`, `Американка ${q} ${f}`, `американка ду${dn} ${thread(1, thr)}`, `згін американка ${q}`],
          }));
        }
      }
      if (brand === 'SD Plus' || brand === 'Koer') {
        for (const size of INCH) {
          const q = inch(size);
          const price = jitter(rng, (brand === 'Koer' ? 42 : 48) * INCH_PRICE[size] * 0.8, 0.08);
          out.push(mk({
            key: `union:${brand}:${size}:steel`, category: 'union', brand, basePriceUah: price, stock: 'small', qty: [2, 20], unit: 'компл.',
            attrs: { size, dn: DN[size], form: 'steel' },
            render: (s: Style) => ({
              work: [`Згін сталевий ${q} ${brand}`, `Згін стал. ${q} компл. ${brand}`, `Згін сталевий Ду${DN[size]} ${brand}`, `Згін ${q} сталь ${brand}`][s],
              full: [
                `Згін сталевий ${brand} ${q} (муфта, контргайка), комплект`,
                `Згін стал. ${brand} Ду${DN[size]} ${q} з муфтою і контргайкою`,
                `Згін сталевий оцинкований ${brand} Ду${DN[size]} комплект`,
                `Згін сталевий ${brand} ${q} комплект (згін, муфта, контргайка)`,
              ][s],
            }),
            client: [`Згін ${q}`, `згін сталевий ду${DN[size]}`, `Згін ${q} з муфтою і контргайкою`],
          }));
        }
      }
    }
    return out;
  },
};

// ───────────── Фільтри ─────────────

const filters: CategoryDef = {
  id: 'filter', title: 'Фільтри', target: 33,
  affinity: { s1: 0.08, s2: 0.9, s3: 0.45, s4: 0.28 },
  build(rng: Rng) {
    const out: Spec[] = [];
    const yBrands: [string, number][] = [['Koer', 100], ['SD Plus', 110], ['Valtec', 125], ['Icma', 190], ['Giacomini', 260]];
    for (const [brand, base] of yBrands) {
      for (const size of INCH) {
        const q = inch(size);
        const dn = DN[size];
        const code = modelCode(rng, brand);
        out.push(mk({
          key: `filter:y:${brand}:${size}`, category: 'filter', brand, basePriceUah: jitter(rng, base * INCH_PRICE[size], 0.06), stock: 'mid', qty: [1, 6],
          attrs: { type: 'y', size, dn, thread: 'ВВ' },
          render: (s: Style) => ({
            work: [`Фільтр косий ${q} ВВ ${brand}`, `Фільтр кос. лат. ${q} в/в ${brand}`, `Фільтр сітчастий косий Ду${dn} ${brand}`, `Фільтр косий ${brand} ${q}`][s],
            full: [
              `Фільтр грубої очистки косий латунний ${brand} ${code} ${q} внутрішня різьба, сітка 500 мкм`,
              `Фільтр косий лат. ${brand} ${code} ${q} в/в, сітка з нерж. сталі`,
              `Фільтр сітчастий косий латунний Ду${dn} ${q} ВР-ВР ${brand} ${code}`,
              `Фільтр косий ${brand} ${q} вн.-вн., арт. ${code}`,
            ][s],
          }),
          client: [`Фільтр косий ${q}`, `фільтр грубої очистки ${q}`, `Фільтр косий ду${dn}`, `фільтр косий ${q} ${brand}`],
        }));
      }
    }
    const fBrands: [string, number][] = [['Koer', 650], ['Valtec', 900], ['Icma', 1100], ['Watts', 1400]];
    for (const [brand, base] of fBrands) {
      for (const size of ['1/2', '3/4', '1'] as Inch[]) {
        const q = inch(size);
        const code = modelCode(rng, brand);
        const m = size === '1/2' ? 1 : size === '3/4' ? 1.15 : 1.4;
        out.push(mk({
          key: `filter:fine:${brand}:${size}`, category: 'filter', brand, basePriceUah: jitter(rng, base * m, 0.06), stock: 'mid', qty: [1, 3],
          attrs: { type: 'fine', size, dn: DN[size] },
          render: (s: Style) => ({
            work: [`Фільтр тонкої очистки ${q} з манометром ${brand}`, `Фільтр тонк. очист. ${q} промивний ${brand}`, `Фільтр промивний ${brand} ${q} 100 мкм`, `Фільтр тонкої очистки ${brand} ${q}`][s],
            full: [
              `Фільтр тонкої очистки самопромивний ${brand} ${code} ${q} з манометром, сітка 100 мкм`,
              `Фільтр тонкої очистки промивний ${brand} ${code} ${q} ЗР, з манометром 0-16 бар`,
              `Фільтр механічний промивний ${brand} ${code} Ду${DN[size]} ${q}, 100 мкм, манометр`,
              `Фільтр тонкої очистки ${brand} ${q}, арт. ${code}, з манометром`,
            ][s],
          }),
          client: [`Фільтр тонкої очистки ${q}`, `фільтр промивний ${q} з манометром`, `Фільтр т/о ${q}`],
        }));
      }
    }
    const hBrands: [string, number][] = [['Aquafilter', 380], ['Ecosoft', 450], ['Atlas Filtri', 620]];
    for (const [brand, base] of hBrands) {
      for (const size of ['1/2', '3/4', '1'] as Inch[]) {
        const q = inch(size);
        const code = modelCode(rng, brand);
        out.push(mk({
          key: `filter:housing:${brand}:${size}`, category: 'filter', brand, basePriceUah: jitter(rng, base * (size === '1' ? 1.25 : 1), 0.06), stock: 'mid', qty: [1, 4],
          attrs: { type: 'housing', size, dn: DN[size] },
          render: (s: Style) => ({
            work: [`Фільтр магістральний 10" ${q} ${brand}`, `Колба магістр. 10" ${q} ${brand}`, `Фільтр-колба 10" ${brand} ${q}`, `Фільтр магістральний ${brand} 10" ${q}`][s],
            full: [
              `Корпус магістрального фільтра ${brand} ${code} 10", підключення ${q}, прозора колба, з ключем і кронштейном`,
              `Колба магістральна ${brand} ${code} 10" ${q} прозора, кронштейн + ключ`,
              `Фільтр магістральний ${brand} ${code} Slim Line 10" ${q}`,
              `Фільтр магістральний 10" ${brand} ${q}, арт. ${code}`,
            ][s],
          }),
          client: [`Фільтр магістральний ${q}`, `колба 10 ${q}`, `Фільтр-колба для води ${q}`],
        }));
      }
      out.push(mk({
        key: `filter:cartridge:${brand}`, category: 'filter', brand, basePriceUah: jitter(rng, brand === 'Atlas Filtri' ? 70 : 45, 0.05), stock: 'small', qty: [2, 20],
        attrs: { type: 'cartridge' },
        render: (s: Style) => ({
          work: [`Картридж ПП 10" 5 мкм ${brand}`, `Картр. поліпроп. 10" 5мкм ${brand}`, `Картридж механічний 10" ${brand}`, `Картридж ${brand} 10" 5 мкм`][s],
          full: [`Картридж поліпропіленовий ${brand} 10" 5 мкм`, `Картридж ${brand} PP 10" 5 мкм спінений`, `Картридж механічної очистки ${brand} 10" 5 мкм`, `Картридж ПП ${brand} 10" 5 мкм`][s],
        }),
        client: ['Картридж 10 дюймів', 'картридж для фільтра 10"', 'Картридж пп 5 мкм'],
      }));
    }
    return out;
  },
};

// ───────────── Клапани ─────────────

const valves: CategoryDef = {
  id: 'valve', title: 'Клапани зворотні та запобіжні', target: 33,
  affinity: { s1: 0, s2: 0.8, s3: 0.8, s4: 0.3 },
  build(rng: Rng) {
    const out: Spec[] = [];
    const cBrands: [string, number][] = [['Koer', 80], ['SD Plus', 90], ['Valtec', 110], ['Icma', 170]];
    for (const [brand, base] of cBrands) {
      for (const size of INCH) {
        for (const stem of ['brass', 'plastic'] as const) {
          if (stem === 'plastic' && (brand === 'Icma' || DN[size] > 25)) continue;
          const q = inch(size);
          const dn = DN[size];
          const code = modelCode(rng, brand);
          const st = stem === 'brass' ? 'латунний шток' : 'пластиковий шток';
          const stS = stem === 'brass' ? 'лат. шток' : 'пласт. шток';
          out.push(mk({
            key: `valve:check:${brand}:${size}:${stem}`, category: 'valve', brand, stock: 'mid', qty: [1, 6],
            basePriceUah: jitter(rng, base * INCH_PRICE[size] * 0.9 * (stem === 'plastic' ? 0.72 : 1), 0.06),
            attrs: { type: 'check', size, dn, stem },
            render: (s: Style) => ({
              work: [`Клапан зворотній ${q} ВВ ${st} ${brand}`, `Клапан зворот. Ду${dn} ${stS} ${brand}`, `Клапан зворотний ${brand} ${q} в/в ${stS}`, `Клапан зворотний Ду${dn} ${q} ${brand}${stem === 'plastic' ? ' (пласт. шток)' : ''}`][s],
              full: [
                `Клапан зворотний пружинний латунний ${brand} ${code} ${q} внутрішня різьба, ${st}`,
                `Клапан зворотного ходу ${brand} ${code} Ду${dn} ${q} в/в, ${st}`,
                `Клапан зворотний пружинний ${brand} ${code} Ду${dn} ВР-ВР, ${st}`,
                `Клапан зворотний ${brand} ${q} вн.-вн. ${stS}, арт. ${code}`,
              ][s],
            }),
            client: [`Клапан зворотній ${q}`, `Клапан вв Ду${dn}`, `зворотній клапан ду${dn}`, `клапан обратний ${q}`],
          }));
        }
      }
    }
    const sBrands: [string, number][] = [['Koer', 120], ['Valtec', 175], ['Icma', 230], ['Caleffi', 430]];
    for (const [brand, base] of sBrands) {
      for (const bar of [6, 7, 8]) {
        const code = modelCode(rng, brand);
        out.push(mk({
          key: `valve:safety-boiler:${brand}:${bar}`, category: 'valve', brand, basePriceUah: jitter(rng, base, 0.05), stock: 'mid', qty: [1, 4],
          attrs: { type: 'safety-boiler', size: '1/2', dn: 15, bar },
          render: (s: Style) => ({
            work: [`Клапан запобіжний для бойлера 1/2" ${bar} бар ${brand}`, `Клапан запоб. д/бойлера ${bar} бар ${brand}`, `Клапан запобіжний ${brand} 1/2" ${bar} бар`, `Клапан для бойлера ${bar} бар ${brand}`][s],
            full: [
              `Клапан запобіжний для водонагрівача ${brand} ${code} 1/2" ${bar} бар, з ручкою скидання`,
              `Клапан запобіжний д/бойлера ${brand} ${code} Ду15 ${bar} бар`,
              `Клапан запобіжний ${brand} ${code} 1/2" ЗР-ВР ${bar} бар для бойлера`,
              `Клапан запобіжний ${brand} 1/2" ${bar} бар для бойлера, арт. ${code}`,
            ][s],
          }),
          client: [`Клапан для бойлера ${bar} бар`, 'запобіжний клапан на бойлер', `Клапан запобіжний 1/2 ${bar}атм`],
        }));
      }
    }
    const hBrands: [string, number][] = [['Valtec', 260], ['Icma', 350], ['Watts', 400], ['Caleffi', 480]];
    for (const [brand, base] of hBrands) {
      for (const bar of [1.5, 2.5, 3]) {
        const code = modelCode(rng, brand);
        out.push(mk({
          key: `valve:safety-heat:${brand}:${bar}`, category: 'valve', brand, basePriceUah: jitter(rng, base, 0.05), stock: 'mid', qty: [1, 3],
          attrs: { type: 'safety-heat', size: '1/2', dn: 15, bar },
          render: (s: Style) => ({
            work: [`Клапан запобіжний опалення 1/2" ${comma(bar)} бар ${brand}`, `Клапан запоб. д/котла ${comma(bar)} бар ${brand}`, `Клапан скидний ${brand} 1/2" ${comma(bar)} бар`, `Клапан запобіжний котловий ${comma(bar)} бар ${brand}`][s],
            full: [
              `Клапан запобіжний для систем опалення ${brand} ${code} 1/2" ВР-ВР ${comma(bar)} бар`,
              `Клапан запобіжний мембранний ${brand} ${code} 1/2" в/в ${comma(bar)} бар`,
              `Клапан скидний мембранний ${brand} ${code} Ду15 ${comma(bar)} бар`,
              `Клапан запобіжний ${brand} 1/2" ${comma(bar)} бар, арт. ${code}`,
            ][s],
          }),
          client: [`Клапан запобіжний ${comma(bar)} бар`, 'клапан скидний для котла', `запобіжний клапан ${comma(bar)}атм опалення`],
        }));
      }
      const code = modelCode(rng, brand);
      out.push(mk({
        key: `valve:safety-group:${brand}`, category: 'valve', brand, basePriceUah: jitter(rng, base * 4.2, 0.05), stock: 'piece', qty: [1, 2],
        attrs: { type: 'safety-group', size: '1', dn: 25, bar: 3 },
        render: (s: Style) => ({
          work: [`Група безпеки котла 1" 3 бар ${brand}`, `Група безп. котла 3 бар ${brand}`, `Група безпеки ${brand} 1" до 50 кВт`, `Група безпеки котла ${brand}`][s],
          full: [
            `Група безпеки котла ${brand} ${code} 1" (манометр, автоматичний повітровідвідник, клапан 3 бар), до 50 кВт`,
            `Група безпеки котла ${brand} ${code} 1" 3 бар, манометр + повітровідвідник`,
            `Група безпеки ${brand} ${code} Ду25 3 бар з ізоляцією`,
            `Група безпеки котла ${brand} 1" 3 бар, арт. ${code}`,
          ][s],
        }),
        client: ['Група безпеки котла', 'група безпеки 1"', 'група безпеки на котел 3 бар'],
      }));
    }
    return out;
  },
};

// ───────────── Редуктори тиску ─────────────

const reducers: CategoryDef = {
  id: 'reducer', title: 'Редуктори тиску', target: 15,
  affinity: { s1: 0, s2: 0.9, s3: 0.3, s4: 0.35 },
  build(rng: Rng) {
    const out: Spec[] = [];
    const brands: [string, number, string][] = [['Koer', 480, 'поршневий'], ['Valtec', 720, 'поршневий'], ['Icma', 1040, 'мембранний'], ['Giacomini', 1440, 'мембранний'], ['Caleffi', 1840, 'мембранний']];
    for (const [brand, base, kind] of brands) {
      for (const size of ['1/2', '3/4', '1'] as Inch[]) {
        for (const gauge of [false, true]) {
          if (gauge && rng.chance(0.5)) continue;
          const q = inch(size);
          const code = modelCode(rng, brand);
          const m = size === '1/2' ? 1 : size === '3/4' ? 1.2 : 1.6;
          const g = gauge ? ' з манометром' : '';
          out.push(mk({
            key: `reducer:${brand}:${size}:${gauge ? 'g' : 'n'}`, category: 'reducer', brand, basePriceUah: jitter(rng, base * m + (gauge ? 160 : 0), 0.06), stock: 'mid', qty: [1, 3],
            attrs: { size, dn: DN[size], kind, gauge: gauge ? 1 : 0 },
            render: (s: Style) => ({
              work: [`Редуктор тиску ${q}${g} ${brand}`, `Редуктор тиску ${kind.slice(0, 4)}. ${q}${g} ${brand}`, `Регулятор тиску ${brand} Ду${DN[size]}${g}`, `Редуктор тиску ${brand} ${q}${g}`][s],
              full: [
                `Редуктор тиску ${kind} ${brand} ${code} ${q} ВР-ВР, 1-6 бар${g}`,
                `Редуктор тиску ${kind} ${brand} ${code} ${q} в/в${g}, PN16`,
                `Регулятор тиску води ${brand} ${code} Ду${DN[size]} ${q}, ${kind}${g}`,
                `Редуктор тиску ${brand} ${q} ${kind}${g}, арт. ${code}`,
              ][s],
            }),
            client: [`Редуктор тиску ${q}`, `редуктор ${q} з манометром`, 'регулятор тиску води', `Редуктор давления ду${DN[size]}`],
          }));
        }
      }
    }
    return out;
  },
};

// ───────────── Манометри ─────────────

const gauges: CategoryDef = {
  id: 'gauge', title: 'Манометри', target: 16,
  affinity: { s1: 0, s2: 0.8, s3: 0.4, s4: 0.3 },
  build(rng: Rng) {
    const out: Spec[] = [];
    const brands: [string, number][] = [['SD Plus', 98], ['Valtec', 143], ['Icma', 208], ['Watts', 247]];
    const diams: [number, number, string][] = [[50, 0.85, '1/4'], [63, 1, '1/4'], [80, 1.3, '1/2'], [100, 1.7, '1/2']];
    for (const [brand, base] of brands) {
      for (const [d, dm, conn] of diams) {
        for (const range of [6, 10, 16]) {
          for (const mount of ['radial', 'axial'] as const) {
            if (rng.chance(0.55)) continue;
            const code = modelCode(rng, brand);
            const mt = mount === 'radial' ? 'радіальне' : 'аксіальне'; // узгоджено з «підключення/під'єднання» (сер. рід)
            const mtAdj = mount === 'radial' ? 'радіальний' : 'аксіальний'; // самостійний прикметник — узгоджено з «манометр» (чол. рід)
            out.push(mk({
              key: `gauge:${brand}:${d}:${range}:${mount}`, category: 'gauge', brand, basePriceUah: jitter(rng, base * dm, 0.06), stock: 'mid', qty: [1, 6],
              attrs: { diameter: d, range, mount },
              render: (s: Style) => ({
                work: [`Манометр Ø${d} 0-${range} бар ${mt} ${brand}`, `Манометр ${d} мм 0-${range} бар ${mount === 'radial' ? 'рад.' : 'акс.'} ${brand}`, `Манометр ${brand} D${d} ${range} бар ${mount === 'radial' ? 'рад.' : 'акс.'}`, `Манометр ${brand} ${d}мм 0-${range} ${mtAdj}`][s],
                full: [
                  `Манометр ${brand} ${code} Ø${d} мм, 0-${range} бар, ${mt} підключення ${conn}"`,
                  `Манометр ${brand} ${code} ${d} мм 0-${range} бар, ${mt} під'єднання ${conn}"`,
                  `Манометр технічний ${brand} ${code} D${d} 0-${range} бар ${conn}" ${mtAdj}`,
                  `Манометр ${brand} Ø${d} 0-${range} бар ${conn}", арт. ${code}`,
                ][s],
              }),
              client: [`Манометр ${range} бар`, `манометр ${d} мм`, `Манометр 0-${range} ${mt}`],
            }));
          }
        }
      }
      const code = modelCode(rng, brand);
      out.push(mk({
        key: `gauge:${brand}:thermo`, category: 'gauge', brand, basePriceUah: jitter(rng, base * 2, 0.06), stock: 'mid', qty: [1, 4],
        attrs: { diameter: 80, range: 6, mount: 'thermo' },
        render: (s: Style) => ({
          work: [`Термоманометр Ø80 0-120°C 0-6 бар ${brand}`, `Термоманометр 80 мм акс. ${brand}`, `Термоманометр ${brand} D80`, `Термоманометр ${brand} 80мм`][s],
          full: [`Термоманометр ${brand} ${code} Ø80 мм, 0-120°C, 0-6 бар, аксіальний 1/2"`, `Термоманометр ${brand} ${code} 80 мм 120°C 6 бар акс.`, `Термоманометр ${brand} ${code} D80 1/2" 0-6 бар`, `Термоманометр ${brand} Ø80, арт. ${code}`][s],
        }),
        client: ['Термоманометр', 'термоманометр 80 мм', 'Термоманометр 6 бар'],
      }));
    }
    return out;
  },
};

// ───────────── Шланги (гнучка підводка) ─────────────

const hoses: CategoryDef = {
  id: 'hose', title: 'Шланги та гнучка підводка', target: 40,
  affinity: { s1: 0.8, s2: 1, s3: 0.15, s4: 0.2 },
  build(rng: Rng) {
    const out: Spec[] = [];
    const brands: [string, number][] = [['Koer', 55], ['SD Plus', 60], ['Qtap', 70], ['Valtec', 85]];
    const lens = [30, 40, 50, 60, 80, 100, 120, 150];
    for (const [brand, base] of brands) {
      for (const len of lens) {
        for (const conn of ['gg', 'gsh', 'm10'] as const) {
          if (conn === 'm10' && len > 80) continue;
          const code = modelCode(rng, brand);
          const m = len / 100;
          const price = jitter(rng, base * (1 + ((len - 30) / 120) * 1.1) * (conn === 'm10' ? 1.6 : conn === 'gsh' ? 1.03 : 1), 0.06);
          const cW = conn === 'gg' ? 'гайка-гайка' : conn === 'gsh' ? 'гайка-штуцер' : 'гайка-штуцер M10';
          const cS = conn === 'gg' ? 'г/г' : conn === 'gsh' ? 'г/ш' : 'M10';
          const pair = conn === 'm10';
          out.push(mk({
            key: `hose:${brand}:${len}:${conn}`, category: 'hose', brand, basePriceUah: price, stock: 'small', qty: [2, 12], unit: pair ? 'компл.' : 'шт',
            attrs: { length: len, conn },
            render: (s: Style) => ({
              work: [
                `Шланг гнучкий ${len} см ${cW} 1/2" ${brand}${pair ? ' (пара)' : ''}`,
                `Шланг ${comma(m)} м ${cS} 1/2" ${brand}${pair ? ' 2 шт' : ''}`,
                `Гнучка підводка ${brand} ${len} см ${cS} 1/2"`,
                `Підводка для води ${len} см 1/2" ${cS} ${brand}`,
              ][s],
              full: [
                `Шланг гнучкий для води в металевому обплетенні ${brand} ${code} L=${len} см, ${cW} 1/2"${pair ? ', комплект 2 шт' : ''}`,
                `Шланг в метал. обпл. ${brand} ${code} L - ${len * 10} мм ${cW} 1/2"${pair ? ' (компл. 2 шт)' : ''}`,
                `Підводка гнучка для води ${brand} ${code} ${len} см ${cW} 1/2", нерж. обплетення`,
                `Шланг для води ${brand} ${len} см ${cW} 1/2", арт. ${code}`,
              ][s],
            }),
            client: [
              `Шланг ${comma(m)}м ${conn === 'gg' ? 'вв' : 'вз'} 1/2"`, `Підводка ${len} см`,
              pair ? `шланги для змішувача ${len} см` : `шланг для води ${len}см`, `Гнучка підводка ${len} ${cS}`,
            ],
          }));
        }
      }
    }
    return out;
  },
};

// ───────────── Герметики, ФУМ, льон ─────────────

const SEALANTS: [string, string, string, number, string][] = [
  ['Tangit', 'fum12', 'ФУМ-стрічка 12 мм × 10 м', 28, 'шт'],
  ['Koer', 'fum12', 'ФУМ-стрічка 12 мм × 10 м', 18, 'шт'],
  ['Unipak', 'fum19', 'ФУМ-стрічка 19 мм × 15 м', 45, 'шт'],
  ['SD Plus', 'fum12x10', 'ФУМ-стрічка 12 мм × 10 м (уп. 10 шт)', 150, 'уп.'],
  ['Unipak', 'flax100', 'Льон сантехнічний 100 г', 70, 'шт'],
  ['Unipak', 'flax200', 'Льон сантехнічний 200 г', 120, 'шт'],
  ['Koer', 'flax40', 'Льон сантехнічний 40 г', 30, 'шт'],
  ['Unipak', 'paste65', 'Паста пакувальна 65 г', 55, 'шт'],
  ['Unipak', 'paste360', 'Паста пакувальна 360 г', 165, 'шт'],
  ['Tangit', 'thread20', 'Нитка герметизуюча Uni-Lock 20 м', 95, 'шт'],
  ['Tangit', 'thread80', 'Нитка герметизуюча Uni-Lock 80 м', 260, 'шт'],
  ['Loctite', 'thread50', 'Нитка герметизуюча 55, 50 м', 330, 'шт'],
  ['Loctite', 'anaer50', 'Анаеробний герметик різьбових з\'єднань 50 мл', 380, 'шт'],
  ['Soudal', 'silw', 'Герметик силіконовий санітарний білий 280 мл', 140, 'шт'],
  ['Soudal', 'silt', 'Герметик силіконовий санітарний прозорий 280 мл', 140, 'шт'],
  ['Ceresit', 'silw', 'Герметик силіконовий санітарний CS 25 білий 280 мл', 170, 'шт'],
  ['Ceresit', 'silt', 'Герметик силіконовий санітарний CS 25 прозорий 280 мл', 170, 'шт'],
  ['Soudal', 'silg', 'Герметик силіконовий санітарний сірий 280 мл', 150, 'шт'],
];

const sealants: CategoryDef = {
  id: 'sealant', title: 'Герметики, ФУМ, льон', target: 16,
  affinity: { s1: 0.3, s2: 0.6, s3: 0.8, s4: 0.4 },
  build(rng: Rng) {
    return SEALANTS.map(([brand, id, name, price, unit]) => {
      const code = modelCode(rng, brand);
      const short = name.replace('сантехнічний ', 'сантех. ').replace('герметизуюча ', '').replace('Герметик силіконовий санітарний', 'Силікон санітарний');
      return mk({
        key: `sealant:${brand}:${id}`, category: 'sealant', brand, basePriceUah: jitter(rng, price, 0.06), stock: 'small', qty: [2, 20], unit,
        attrs: { type: id },
        render: (s: Style) => ({
          work: [`${name} ${brand}`, `${short} ${brand}`, `${brand} ${lcFirst(short)}`, `${name} ${brand}`][s],
          full: [`${name} ${brand}, арт. ${code}`, `${name} ${brand} (${code})`, `${brand} ${name} ${code}`, `${name} ${brand}`][s],
        }),
        client: id.startsWith('fum') ? ['ФУМ стрічка', 'фум', 'Фум-лента'] : id.startsWith('flax') ? ['Льон сантехнічний', 'льон', 'пакля'] : id.startsWith('paste') ? ['Паста для льону', 'паста уніпак'] : id.startsWith('sil') ? ['Силікон санітарний', 'герметик силіконовий білий', 'силікон прозорий'] : ['Нитка для герметизації різьби', 'нитка тангіт', 'герметик для різьби'],
      });
    });
  },
};

export const PLUMBING_CATEGORIES: readonly CategoryDef[] = [mixers, ballValves, unions, filters, valves, reducers, gauges, hoses, sealants];
