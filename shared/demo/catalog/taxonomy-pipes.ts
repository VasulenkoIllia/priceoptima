// Категорії: ППР труби й фітинги, PEX/металопластик, прес-фітинги, кріплення, каналізація ПВХ/ПП.

import type { Rng } from './prng';
import { jitter, lcFirst, modelCode, type CanonicalSpec, type CategoryDef, type Style } from './taxonomy-core';

type Spec = CanonicalSpec;

function mk(o: Omit<Spec, 'multiplicity' | 'minOrderQty' | 'unit'> & Partial<Pick<Spec, 'multiplicity' | 'minOrderQty' | 'unit'>>): Spec {
  return { unit: 'шт', multiplicity: 1, minOrderQty: 1, ...o, basePriceUah: Math.round(o.basePriceUah * 100) / 100 };
}

const comma = (n: number): string => String(n).replace('.', ',');

// ───────────── ППР труби ─────────────

const PPR_BRANDS: [string, number, string][] = [
  ['Ekoplastik', 1.25, 'сіра'], ['Kalde', 1.0, 'біла'], ['Wavin', 1.15, 'зелена'], ['Fado', 0.9, 'біла'], ['Koer', 0.85, 'біла'],
];
const PPR_D = [20, 25, 32, 40, 50, 63] as const;
type PprD = (typeof PPR_D)[number];
const PPR_D_PRICE: Record<PprD, number> = { 20: 1, 25: 1.55, 32: 2.5, 40: 3.9, 50: 6, 63: 9.5 };

interface PipeType { id: string; mult: number; pn: string; walls: Record<PprD, number>; label: string; short: string; client: string }
const PIPE_TYPES: PipeType[] = [
  { id: 'pn10', mult: 0.75, pn: 'PN10', walls: { 20: 1.9, 25: 2.3, 32: 2.9, 40: 3.7, 50: 4.6, 63: 5.8 }, label: 'для холодної води', short: 'хол.', client: 'холодна' },
  { id: 'pn20', mult: 1, pn: 'PN20', walls: { 20: 3.4, 25: 4.2, 32: 5.4, 40: 6.7, 50: 8.3, 63: 10.5 }, label: 'для гарячої води', short: 'гар.', client: 'гаряча' },
  { id: 'glass', mult: 1.25, pn: 'PN20', walls: { 20: 2.8, 25: 3.5, 32: 4.4, 40: 5.5, 50: 6.9, 63: 8.6 }, label: 'армована скловолокном', short: 'скловол.', client: 'армована скловолокном' },
  { id: 'stabi', mult: 1.6, pn: 'PN25', walls: { 20: 3.4, 25: 4.2, 32: 5.4, 40: 6.7, 50: 8.3, 63: 10.5 }, label: 'Stabi, армована алюмінієм', short: 'Stabi', client: 'армована алюмінієм' },
  { id: 'basalt', mult: 1.3, pn: 'PN20', walls: { 20: 2.8, 25: 3.5, 32: 4.4, 40: 5.5, 50: 6.9, 63: 8.6 }, label: 'Basalt, армована базальтовим волокном', short: 'Basalt', client: 'Basalt' },
];

/** «Stabi» і «Basalt» — торгові марки Wavin Ekoplastik; в інших брендів — родова назва армування. */
const PIPE_TRADEMARK_OWNER: Record<string, string> = { stabi: 'Wavin', basalt: 'Wavin' };
const PIPE_GENERIC_LABEL: Record<string, { short: string; label: string }> = {
  stabi: { short: 'Al', label: 'з алюмінієвим армуванням' },
  basalt: { short: 'Fiber', label: 'армована базальтовим волокном' },
};
function pipeTypeLabels(t: PipeType, brand: string): Pick<PipeType, 'short' | 'label'> {
  const owner = PIPE_TRADEMARK_OWNER[t.id];
  if (!owner || brand === owner) return { short: t.short, label: t.label };
  return PIPE_GENERIC_LABEL[t.id] ?? { short: t.short, label: t.label };
}

const pprPipes: CategoryDef = {
  id: 'ppr-pipe', title: 'Труби ППР', target: 35,
  affinity: { s1: 0, s2: 0.08, s3: 1, s4: 0.22 },
  build(rng: Rng) {
    const out: Spec[] = [];
    for (const [brand, bm] of PPR_BRANDS) {
      for (const t of PIPE_TYPES) {
        const { short, label } = pipeTypeLabels(t, brand);
        for (const d of PPR_D) {
          const w = comma(t.walls[d]);
          const code = modelCode(rng, brand);
          out.push(mk({
            key: `ppr-pipe:${brand}:${t.id}:${d}`, category: 'ppr-pipe', brand, unit: 'м', multiplicity: 4, minOrderQty: 4,
            basePriceUah: jitter(rng, 32 * bm * t.mult * PPR_D_PRICE[d], 0.06), stock: 'meter', qty: [8, 160],
            attrs: { type: t.id, d, wall: t.walls[d], pn: t.pn },
            render: (s: Style) => ({
              work: [
                `Труба ППР ${d}х${w} ${t.pn} ${t.id === 'stabi' || t.id === 'basalt' ? short + ' ' : ''}${brand}`,
                `Труба п/п ${d} ${t.pn} ${short} ${brand} (4 м)`,
                `Труба поліпропіленова ${brand} ${d}х${w} ${t.pn}${t.id === 'pn20' || t.id === 'pn10' ? '' : ' ' + short}`,
                `Труба ППР ${brand} ${d} ${t.pn} ${short}`,
              ][s],
              full: [
                `Труба поліпропіленова ${brand} ${code} ${d}х${w} мм ${t.pn}, ${label}, відрізок 4 м`,
                `Труба поліпроп. ${brand} ${short} ${d}х${w} ${t.pn} (штанга 4 м), ${code}`,
                `Труба ППР ${brand} ${code} Ø${d}х${w} ${t.pn} ${label}, 4 м`,
                `Труба ППР ${brand} ${d}х${w} ${t.pn} ${label}, арт. ${code}`,
              ][s],
            }),
            client: [`Труба ппр ду${d}`, `Труба ппр ${d} ${t.client}`, `труба пп ${d} ${t.pn}`, `Труба поліпропілен ${d}`],
          }));
        }
      }
    }
    return out;
  },
};

// ───────────── ППР фітинги ─────────────

interface FitTpl { id: string; p: string; base: number; work: [string, string, string, string]; full: string; client: string[]; qty?: [number, number] }

function pprFittingTemplates(): FitTpl[] {
  const t: FitTpl[] = [];
  const add = (id: string, p: string, base: number, work: [string, string, string, string], full: string, client: string[]) => t.push({ id, p, base, work, full, client });
  const cp: Record<number, number> = { 20: 6, 25: 8, 32: 13, 40: 22, 50: 38, 63: 65 };
  for (const d of PPR_D) add('coupling', `${d}`, cp[d], ['Муфта ППР', 'Муфта п/п', "Муфта з'єднувальна", 'Муфта ППР Ø'], "Муфта поліпропіленова з'єднувальна", [`Муфта ${d}`, `муфта ппр ${d}`, `Муфта пп д${d}`]);
  const el: Record<number, number> = { 20: 7, 25: 10, 32: 16, 40: 28, 50: 48, 63: 85 };
  for (const d of PPR_D) add('elbow90', `${d}`, el[d], ['Кутник ППР 90°', 'Кут п/п 90°', 'Коліно 90°', 'Кутник ППР 90° Ø'], 'Кутник поліпропіленовий 90°', [`Кутник ${d}`, `коліно ппр ${d} 90`, `Кут ${d} 90гр`]);
  for (const d of [20, 25, 32, 40]) add('elbow45', `${d}`, el[d] * 1.1, ['Кутник ППР 45°', 'Кут п/п 45°', 'Коліно 45°', 'Кутник ППР 45° Ø'], 'Кутник поліпропіленовий 45°', [`Кутник ${d} 45`, `коліно ппр ${d} 45 гр`]);
  const te: Record<number, number> = { 20: 8, 25: 12, 32: 19, 40: 34, 50: 60, 63: 105 };
  for (const d of PPR_D) add('tee', `${d}`, te[d], ['Трійник ППР', 'Трійник п/п', 'Трійник рівнопрохідний', 'Трійник ППР Ø'], 'Трійник поліпропіленовий рівнопрохідний', [`Трійник ${d}`, `трійник ппр ${d}`, `Тройник ${d}`]);
  for (const [p, b] of [['25х20', 8], ['32х20', 12], ['32х25', 13], ['40х32', 22], ['50х40', 38], ['63х50', 60]] as [string, number][]) {
    add('red-coupling', p, b, ['Муфта ППР перехідна', 'Муфта п/п перех.', 'Муфта редукційна', 'Муфта перехідна ППР'], 'Муфта поліпропіленова перехідна', [`Муфта перехідна ${p}`, `перехід ппр ${p}`]);
  }
  for (const [p, b] of [['25х20х25', 13], ['32х20х32', 20], ['32х25х32', 21], ['40х32х40', 36]] as [string, number][]) {
    add('red-tee', p, b, ['Трійник ППР перехідний', 'Трійник п/п перех.', 'Трійник редукційний', 'Трійник перехідний ППР'], 'Трійник поліпропіленовий перехідний', [`Трійник ${p}`, `трійник перехідний ${p}`]);
  }
  // Ціни ППР-фітингів з різьбою (МРВ/МРН/кутники) вдвічі нижчі за безрізьбові аналогічного типорозміру — реалістичний рівень ринку.
  for (const [p, b] of [['20х1/2"', 22.5], ['20х3/4"', 30], ['25х1/2"', 27.5], ['25х3/4"', 32.5], ['32х1"', 60], ['40х1 1/4"', 130]] as [string, number][]) {
    add('mrv', p, b, ['МРВ ППР', 'Муфта комб. п/п ВР', 'Муфта з внутр. різьбою', 'МРВ'], 'Муфта поліпропіленова комбінована з внутрішньою різьбою (МРВ)', [`МРВ ${p}`, `Муфта ${p} В`, `муфта ппр ${p} вн різьба`]);
  }
  for (const [p, b] of [['20х1/2"', 27.5], ['20х3/4"', 35], ['25х3/4"', 37.5], ['32х1"', 70], ['40х1 1/4"', 150]] as [string, number][]) {
    add('mrn', p, b, ['МРН ППР', 'Муфта комб. п/п ЗР', 'Муфта з зовн. різьбою', 'МРН'], 'Муфта поліпропіленова комбінована з зовнішньою різьбою (МРН)', [`МРН ${p}`, `Муфта ${p} З`, `муфта ппр ${p} зовн різьба`]);
  }
  for (const [p, b] of [['20х1/2"', 27.5], ['25х1/2"', 32.5], ['25х3/4"', 37.5]] as [string, number][]) {
    add('elbow-mrv', p, b, ['Кутник ППР МРВ', 'Кут п/п комб. ВР', 'Коліно з внутр. різьбою', 'Кутник МРВ'], 'Кутник поліпропіленовий комбінований з внутрішньою різьбою', [`Кутник ${p} В`, `коліно ппр ${p} вн`]);
    add('elbow-mrn', p, b * 1.15, ['Кутник ППР МРН', 'Кут п/п комб. ЗР', 'Коліно з зовн. різьбою', 'Кутник МРН'], 'Кутник поліпропіленовий комбінований з зовнішньою різьбою', [`Кутник ${p} З`, `коліно ппр ${p} зовн`]);
  }
  for (const [d, b] of [[20, 4], [25, 5], [32, 8], [40, 14]] as [number, number][]) {
    add('cap', `${d}`, b, ['Заглушка ППР', 'Заглушка п/п', 'Заглушка', 'Заглушка ППР Ø'], 'Заглушка поліпропіленова', [`Заглушка ${d}`, `заглушка ппр ${d}`]);
  }
  for (const [d, b] of [[20, 170], [25, 230], [32, 380]] as [number, number][]) {
    add('valve', `${d}`, b, ['Кран кульовий ППР', 'Кран кул. п/п', 'Кран кульовий поліпропіленовий', 'Кран ППР Ø'], 'Кран кульовий поліпропіленовий', [`Кран ппр ${d}`, `кран кульовий ппр ${d}`, `Кран пп д${d}`]);
  }
  for (const [d, b] of [[20, 18], [25, 26]] as [number, number][]) {
    add('bypass', `${d}`, b, ['Обвід ППР', 'Обвідна п/п', 'Обвідне коліно', 'Обвід ППР Ø'], 'Обвід поліпропіленовий', [`Обвід ${d}`, `обвідна ппр ${d}`]);
  }
  add('wall-mrv', '20х1/2"', 37.5, ['Водорозетка ППР', 'Водорозетка п/п ВР', 'Водорозетка з кріпленням', 'Водорозетка ППР'], 'Водорозетка поліпропіленова з внутрішньою різьбою', ['Водорозетка 20х1/2', 'водорозетка ппр']);
  return t;
}

const pprFittings: CategoryDef = {
  id: 'ppr-fitting', title: 'Фітинги ППР', target: 61,
  affinity: { s1: 0, s2: 0.15, s3: 1, s4: 0.15 },
  build(rng: Rng) {
    const out: Spec[] = [];
    const tpls = pprFittingTemplates();
    for (const [brand, bm, color] of PPR_BRANDS) {
      if (brand === 'Koer') continue;
      for (const t of tpls) {
        const code = modelCode(rng, brand);
        const p = t.p;
        const sp = t.work[3].endsWith('Ø') ? '' : ' ';
        const colorM = color.replace(/а$/, 'ий');
        out.push(mk({
          key: `ppr-fit:${brand}:${t.id}:${p}`, category: 'ppr-fitting', brand, basePriceUah: jitter(rng, t.base * bm, 0.07), stock: 'small', qty: [2, 40],
          attrs: { type: t.id, size: p },
          render: (s: Style) => ({
            work: [`${t.work[0]} ${p} ${brand}`, `${t.work[1]} ${p} ${brand}`, `${t.work[2]} ${brand} ${p}`, `${t.work[3]}${sp}${p} ${brand}`][s],
            full: [
              `${t.full} ${brand} ${code} ${p}, ${colorM}`,
              `${t.full} ${brand} ${p} (${code})`,
              `${t.full} ${brand} ${code} Ø${p}`,
              `${t.full} ${brand} ${p}, арт. ${code}`,
            ][s],
          }),
          client: t.client,
        }));
      }
    }
    return out;
  },
};

// ───────────── PEX / металопластик ─────────────

const pexPipes: CategoryDef = {
  id: 'pex-pipe', title: 'Труби PEX та металопластик', target: 21,
  affinity: { s1: 0, s2: 0.3, s3: 1, s4: 0.25 },
  build(rng: Rng) {
    const out: Spec[] = [];
    const add = (kind: 'pex' | 'pert' | 'mp', brand: string, d: number, w: number, perM: number, coils: number[]) => {
      for (const coil of coils) {
        const code = modelCode(rng, brand);
        const kindW = kind === 'pex' ? 'PEX-a' : kind === 'pert' ? 'PE-RT' : 'металопластикова';
        const kindF = kind === 'pex' ? 'зі зшитого поліетилену PEX-a з антидифузійним шаром EVOH'
          : kind === 'pert' ? 'PE-RT з антидифузійним шаром EVOH для теплої підлоги' : 'металопластикова PE-X/AL/PE-X';
        const dim = `${d}х${comma(w)}`;
        const price = perM * (coil >= 200 ? 0.97 : 1);
        // Продається за м без кратності (довжина бухти — лише в назві й для залишку); кратність у демо — лише в труб ППР (4 м).
        out.push(mk({
          key: `pex:${kind}:${brand}:${d}x${w}:${coil}`, category: 'pex-pipe', brand, stock: 'coil', qty: [50, 400],
          unit: 'м', multiplicity: 1, minOrderQty: 1, stockPack: coil,
          basePriceUah: jitter(rng, price, 0.06),
          attrs: { kind, d, wall: w, coil },
          render: (s: Style) => ({
            work: [
              `Труба ${kindW} ${dim} ${brand} (бухта ${coil} м)`,
              `Труба ${kind === 'mp' ? 'м/п' : kindW} ${dim} ${brand} ${coil}м`,
              `${brand} труба ${kindW} ${dim}, бухта ${coil} м`,
              `Труба ${kindW} ${brand} ${dim} ${coil} м`,
            ][s],
            full: [
              `Труба ${kindF} ${brand} ${code} ${dim} мм, бухта ${coil} м`,
              `Труба ${kindF} ${brand} ${dim} (${code}), в бухті ${coil} м`,
              `Труба ${kindW} ${brand} ${code} Ø${dim}, бухта ${coil} м`,
              `Труба ${kindW} ${brand} ${dim} мм, бухта ${coil} м, арт. ${code}`,
            ][s],
          }),
          client: kind === 'mp'
            ? [`Труба металопластикова ${d}`, `металопласт ${d}х${comma(w)}`, `Труба м/п ${d}`]
            : kind === 'pex' ? [`Труба пекс ${d}`, `Труба PEX ${d}х${comma(w)}`, `труба зшитий поліетилен ${d}`]
              : [`Труба для теплої підлоги ${d}`, `труба тепла підлога ${d}х2`, `PE-RT ${d}`],
        }));
      }
    };
    for (const [brand, pm, wall16] of [['Rehau', 38, 2.2], ['Uponor', 42, 2.0], ['KAN-therm', 30, 2.0]] as [string, number, number][]) {
      add('pex', brand, 16, wall16, pm, [100, 200]);
      add('pex', brand, 20, 2.8, pm * 1.5, [100]);
    }
    for (const [brand, pm] of [['Kalde', 14], ['Koer', 12.5], ['Valtec', 17]] as [string, number][]) add('pert', brand, 16, 2, pm, [200, 600]);
    for (const [brand, pm] of [['Koer', 18], ['Kalde', 20], ['Valtec', 26], ['KAN-therm', 30]] as [string, number][]) {
      add('mp', brand, 16, 2, pm, [100, 200]);
      add('mp', brand, 20, 2, pm * 1.45, [100]);
      add('mp', brand, 26, 3, pm * 2.4, [50]);
      add('mp', brand, 32, 3, pm * 3.6, [50]);
    }
    return out;
  },
};

// ───────────── Прес-фітинги ─────────────

const pressFittings: CategoryDef = {
  id: 'press-fitting', title: 'Прес-фітинги для металопластику', target: 26,
  affinity: { s1: 0, s2: 0.4, s3: 1, s4: 0.15 },
  build(rng: Rng) {
    const out: Spec[] = [];
    const tpls: [string, string, number, string, string][] = [];
    for (const [d, b] of [[16, 95], [20, 120], [26, 190], [32, 290]] as [number, number][]) {
      tpls.push(['coupling', `${d}`, b, 'Муфта прес', "Прес-муфта з'єднувальна"]);
      tpls.push(['elbow', `${d}`, b * 1.1, 'Кутник прес', 'Прес-кутник 90°']);
      if (d < 32) tpls.push(['tee', `${d}`, b * 1.4, 'Трійник прес', 'Прес-трійник рівнопрохідний']);
    }
    for (const [p, b] of [['20х16', 115], ['26х20', 170]] as [string, number][]) tpls.push(['red', p, b, 'Муфта прес перехідна', 'Прес-муфта перехідна']);
    tpls.push(['red-tee', '20х16х20', 160, 'Трійник прес перехідний', 'Прес-трійник перехідний']);
    for (const [p, b] of [['16х1/2"', 85], ['20х1/2"', 105], ['20х3/4"', 115], ['26х3/4"', 160], ['26х1"', 190], ['32х1"', 260]] as [string, number][]) tpls.push(['m-ext', p, b, 'Перехідник прес ЗР', 'Прес-перехідник із зовнішньою різьбою']);
    for (const [p, b] of [['16х1/2"', 90], ['20х1/2"', 110], ['20х3/4"', 120], ['26х1"', 200]] as [string, number][]) tpls.push(['m-int', p, b, 'Перехідник прес ВР', 'Прес-перехідник із внутрішньою різьбою']);
    tpls.push(['el-ext', '16х1/2"', 110, 'Кутник прес ЗР', 'Прес-кутник із зовнішньою різьбою']);
    tpls.push(['el-int', '16х1/2"', 115, 'Кутник прес ВР', 'Прес-кутник із внутрішньою різьбою']);
    tpls.push(['wall', '16х1/2"', 150, 'Водорозетка прес', 'Прес-водорозетка з внутрішньою різьбою']);
    // Прес-фітинг підбирають під стінку труби (не лише діаметр) — показуємо її для прямих типорозмірів.
    const PRESS_WALL: Record<string, number> = { '16': 2.0, '20': 2.0, '26': 3.0, '32': 3.0 };
    const pDisplay = (p: string): string => (PRESS_WALL[p] !== undefined ? `${p}×${PRESS_WALL[p].toFixed(1).replace('.', ',')}` : p);
    for (const [brand, bm] of [['Koer', 0.7], ['Valtec', 1], ['KAN-therm', 1.2], ['Icma', 1.15]] as [string, number][]) {
      for (const [id, p, b, w, f] of tpls) {
        const code = modelCode(rng, brand);
        const pd = pDisplay(p);
        out.push(mk({
          key: `press:${brand}:${id}:${p}`, category: 'press-fitting', brand, basePriceUah: jitter(rng, b * bm, 0.06), stock: 'small', qty: [2, 30],
          attrs: { type: id, size: p },
          render: (s: Style) => ({
            work: [`${w} ${pd} ${brand}`, `${w.replace('прес', 'пресов.')} ${pd} ${brand}`, `${brand} ${lcFirst(w)} ${pd}`, `${w} ${brand} ${pd}`][s],
            full: [
              `${f} ${brand} ${code} ${pd} для металопластикової труби, латунь`,
              `${f} ${brand} ${pd} (${code}), лат. нікельов.`,
              `${f} ${brand} ${code} ${pd}`,
              `${f} ${brand} ${pd}, арт. ${code}`,
            ][s],
          }),
          client: [`${w.replace(' прес', '')} ${p} прес`, `прес фітинг ${p}`, `${w.split(' ')[0]} металопласт ${p}`],
        }));
      }
    }
    return out;
  },
};

// ───────────── Кріплення ─────────────

const fasteners: CategoryDef = {
  id: 'fastener', title: 'Кріплення для труб', target: 30,
  affinity: { s1: 0, s2: 0.05, s3: 1, s4: 0.2 },
  build(rng: Rng) {
    const out: Spec[] = [];
    const clip: Record<number, number> = { 20: 2.2, 25: 2.6, 32: 3.5, 40: 5, 50: 7, 63: 10 };
    const support: Record<number, number> = { 20: 3, 25: 3.5, 32: 5, 40: 7.5, 50: 10, 63: 14 };
    for (const [brand, bm] of [['Kalde', 1], ['Ekoplastik', 1.3], ['Fado', 0.9], ['Koer', 0.85]] as [string, number][]) {
      for (const d of PPR_D) {
        const code = modelCode(rng, brand);
        out.push(mk({
          key: `fast:clip:${brand}:${d}`, category: 'fastener', brand, basePriceUah: jitter(rng, clip[d] * bm, 0.06), stock: 'small', qty: [10, 100],
          stockPack: 10, attrs: { type: 'clip', d },
          render: (s: Style) => ({
            work: [`Кліпса ППР Ø${d} ${brand}`, `Кліпса п/п ${d} ${brand}`, `Кліпса одинарна ${brand} ${d}`, `Кліпса ${brand} ${d}`][s],
            full: [`Кліпса для ППР труби одинарна ${brand} ${code} Ø${d} мм`, `Кліпса п/п одинарна ${brand} ${d} (${code})`, `Кліпса одинарна ${brand} ${code} Ø${d}`, `Кліпса ППР ${brand} ${d}, арт. ${code}`][s],
          }),
          client: [`Кліпса ${d}`, `кліпса ппр ${d}`, `Кріплення для труб ${d}`],
        }));
        out.push(mk({
          key: `fast:support:${brand}:${d}`, category: 'fastener', brand, basePriceUah: jitter(rng, support[d] * bm, 0.06), stock: 'small', qty: [10, 100],
          attrs: { type: 'support', d },
          render: (s: Style) => ({
            work: [`Кріплення ППР Ø${d} ${brand}`, `Кріплення п/п ${d} ${brand}`, `Опора для труби ${brand} ${d}`, `Кріплення ${brand} ППР ${d}`][s],
            full: [`Кріплення для ППР труби ${brand} ${code} Ø${d} мм, під дюбель`, `Кріплення поліпроп. ${brand} Ду${d} (${code})`, `Опора пластикова для труби ${brand} ${code} Ø${d}`, `Кріплення ППР ${brand} ${d}, арт. ${code}`][s],
          }),
          client: [`Кріплення для труб ${d}`, `кріплення ппр ${d}`, `Опора ${d}`],
        }));
      }
      for (const d of [20, 25]) {
        const code = modelCode(rng, brand);
        out.push(mk({
          key: `fast:clip2:${brand}:${d}`, category: 'fastener', brand, basePriceUah: jitter(rng, clip[d] * 1.8 * bm, 0.06), stock: 'small', qty: [10, 60],
          stockPack: 10, attrs: { type: 'clip2', d },
          render: (s: Style) => ({
            work: [`Кліпса ППР подвійна Ø${d} ${brand}`, `Кліпса п/п подв. ${d} ${brand}`, `Кліпса подвійна ${brand} ${d}`, `Кліпса ${brand} ${d} подвійна`][s],
            full: [`Кліпса для ППР труби подвійна ${brand} ${code} Ø${d} мм`, `Кліпса п/п подвійна ${brand} ${d} (${code})`, `Кліпса подвійна ${brand} ${code} Ø${d}`, `Кліпса подвійна ППР ${brand} ${d}, арт. ${code}`][s],
          }),
          client: [`Кліпса подвійна ${d}`, `кліпса двійна ${d}`],
        }));
      }
    }
    // Діапазони — під зовн. Ø сталевих труб (21,3/26,9/33,7/42,4/48,3/60,3/76,1/88,9/114,3 мм).
    const clamps: [string, string, number][] = [
      ['20-23', '1/2"', 12], ['25-28', '3/4"', 13], ['32-35', '1"', 14], ['40-43', '1 1/4"', 16], ['47-51', '1 1/2"', 18],
      ['59-63', '2"', 21], ['75-80', '2 1/2"', 26], ['87-92', '3"', 32], ['108-116', '4"/110 мм', 45],
    ];
    for (const [brand, bm] of [['SD Plus', 1], ['Koer', 0.9], ['Walraven', 1.8]] as [string, number][]) {
      for (const [range, nominal, b] of clamps) {
        const code = modelCode(rng, brand);
        out.push(mk({
          key: `fast:clamp:${brand}:${range}`, category: 'fastener', brand, basePriceUah: jitter(rng, b * bm, 0.06), stock: 'small', qty: [5, 50],
          attrs: { type: 'clamp', range, nominal },
          render: (s: Style) => ({
            work: [`Хомут з гумою ${range} мм (${nominal}) ${brand}`, `Хомут з гум. ${nominal} М8 ${brand}`, `Хомут трубний ${brand} ${range}`, `Хомут ${brand} ${nominal} з гумою`][s],
            full: [
              `Хомут сталевий оцинкований з гумовою прокладкою ${brand} ${code} ${range} мм (${nominal}), гайка М8`,
              `Хомут з гумою ${brand} ${range} мм ${nominal} М8 (${code})`,
              `Хомут трубний з EPDM-вкладкою ${brand} ${code} ${range} мм, М8/М10`,
              `Хомут з гумою ${brand} ${range} (${nominal}), арт. ${code}`,
            ][s],
          }),
          client: [`Хомут ${nominal}`, `хомут з гумою ${range}`, `Хомут для труби ${nominal.replace('"', '')}`],
        }));
      }
    }
    return out;
  },
};

// ───────────── Каналізація ─────────────

const sewer: CategoryDef = {
  id: 'sewer', title: 'Каналізація ПВХ/ПП', target: 28,
  affinity: { s1: 0.2, s2: 0, s3: 0.4, s4: 1 },
  build(rng: Rng) {
    const out: Spec[] = [];
    const brands: [string, number, string][] = [['Інсталпласт', 1, 'ПП'], ['Magnaplast', 1.2, 'ПП'], ['Pipelife', 1.15, 'ПП'], ['Wavin', 1.35, 'ПВХ']];
    const perM: Record<number, number> = { 32: 38, 40: 45, 50: 55, 110: 130 };
    const walls: Record<number, string> = { 32: '1,8', 40: '1,8', 50: '1,8', 110: '2,7' };
    const lenF: Record<number, number> = { 0.25: 0.35, 0.5: 0.6, 1: 1, 2: 1.9, 3: 2.8 };
    for (const [brand, bm, mat] of brands) {
      const pipes: [number, number[]][] = [[32, [0.5, 1]], [40, [0.5, 1, 2]], [50, [0.25, 0.5, 1, 2, 3]], [110, [0.5, 1, 2, 3]]];
      for (const [d, lens] of pipes) {
        for (const L of lens) {
          const code = modelCode(rng, brand);
          const mm = L * 1000;
          out.push(mk({
            key: `sewer:${brand}:pipe:${d}:${L}`, category: 'sewer', brand, basePriceUah: jitter(rng, perM[d] * lenF[L] * bm, 0.06), stock: 'small', qty: [2, 20],
            attrs: { type: 'pipe', d, length: L, material: mat },
            render: (s: Style) => ({
              work: [`Труба каналізаційна ${d}х${walls[d]} L=${mm} мм ${brand}`, `Труба канал. ${d} ${comma(L)}м ${brand}`, `${brand} труба ${d}х${comma(L)} м`, `Труба каналізаційна ${brand} ${d}/${mm}`][s],
              full: [
                `Труба каналізаційна внутрішня ${mat} ${brand} ${code} ${d}х${walls[d]} мм, L=${mm} мм, сіра`,
                `Труба канал. ${mat} ${brand} ${d}х${walls[d]} довж. ${comma(L)} м (${code})`,
                `Труба ${mat} для внутрішньої каналізації ${brand} ${code} Ø${d} L${mm}`,
                `Труба каналізаційна ${brand} ${d}х${walls[d]} ${mm} мм, арт. ${code}`,
              ][s],
            }),
            client: [`Труба канал ${d} ${comma(L)}м`, `Каналізація ${d} ${mm}`, `труба каналізаційна ${d}х${comma(L)}`],
          }));
        }
      }
      const parts: [string, string, number, string, string][] = [
        ['elbow', '50 45°', 15.4, 'Коліно', 'Коліно каналізаційне'], ['elbow', '50 87°', 16.8, 'Коліно', 'Коліно каналізаційне'],
        ['elbow', '110 45°', 38.5, 'Коліно', 'Коліно каналізаційне'], ['elbow', '110 87°', 42, 'Коліно', 'Коліно каналізаційне'],
        ['elbow', '40 87°', 14, 'Коліно', 'Коліно каналізаційне'], ['elbow', '32 87°', 11.9, 'Коліно', 'Коліно каналізаційне'],
        ['tee', '50/50 45°', 24.5, 'Трійник', 'Трійник каналізаційний'], ['tee', '50/50 87°', 25.2, 'Трійник', 'Трійник каналізаційний'],
        ['tee', '110/110 45°', 66.5, 'Трійник', 'Трійник каналізаційний'], ['tee', '110/110 87°', 68.6, 'Трійник', 'Трійник каналізаційний'],
        ['tee', '110/50 45°', 56, 'Трійник', 'Трійник каналізаційний'], ['tee', '110/50 87°', 57.4, 'Трійник', 'Трійник каналізаційний'],
        ['rev', '50', 42, 'Ревізія', 'Ревізія каналізаційна з кришкою'], ['rev', '110', 98, 'Ревізія', 'Ревізія каналізаційна з кришкою'],
        ['red', '110/50', 28, 'Перехід', 'Перехід каналізаційний ексцентричний'], ['red', '50/40', 12.6, 'Перехід', 'Перехід каналізаційний'],
        ['red', '40/32', 10.5, 'Перехід', 'Перехід каналізаційний'],
        ['cap', '50', 8.4, 'Заглушка', 'Заглушка каналізаційна'], ['cap', '110', 21, 'Заглушка', 'Заглушка каналізаційна'],
      ];
      for (const [id, p, b, w, f] of parts) {
        const code = modelCode(rng, brand);
        const pk = p.replace(/[ °/]/g, '');
        out.push(mk({
          key: `sewer:${brand}:${id}:${pk}`, category: 'sewer', brand, basePriceUah: jitter(rng, b * bm, 0.06), stock: 'small', qty: [1, 20],
          attrs: { type: id, size: p, material: mat },
          render: (s: Style) => ({
            work: [`${f.split(' ').slice(0, 2).join(' ')} ${p} ${brand}`, `${w} канал. ${p} ${brand}`, `${brand} ${lcFirst(w)} ${p}`, `${w} ${brand} ${p}`][s],
            full: [`${f} ${brand} ${code} ${p}, ${mat}, колір сірий`, `${f} ${brand} ${p} (${code})`, `${f} ${mat} ${brand} ${code} Ø${p}`, `${f} ${brand} ${p}, арт. ${code}`][s],
          }),
          client: [`${w} ${p}`, `${w.toLowerCase()} канал ${p.replace('°', '')}`, `${w} каналізація ${p.split(' ')[0]}`],
        }));
      }
    }
    return out;
  },
};

export const PIPE_CATEGORIES: readonly CategoryDef[] = [pprPipes, pprFittings, pexPipes, pressFittings, fasteners, sewer];
