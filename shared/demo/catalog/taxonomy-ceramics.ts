// Категорії: мийки, піддони, унітази/компакти, інсталяції, раковини, сифони.

import type { Rng } from './prng';
import { jitter, lcFirst, modelCode, type CanonicalSpec, type CategoryDef, type Style } from './taxonomy-core';

type Spec = CanonicalSpec;

function mk(o: Omit<Spec, 'multiplicity' | 'minOrderQty' | 'unit'> & Partial<Pick<Spec, 'multiplicity' | 'minOrderQty' | 'unit'>>): Spec {
  return { unit: 'шт', multiplicity: 1, minOrderQty: 1, ...o, basePriceUah: Math.round(o.basePriceUah * 100) / 100 };
}

const comma = (n: number): string => String(n).replace('.', ',');

// ───────────── Мийки кухонні ─────────────

const sinks: CategoryDef = {
  id: 'sink', title: 'Мийки кухонні', target: 33,
  affinity: { s1: 1, s2: 0, s3: 0, s4: 0.5 },
  build(rng: Rng) {
    const out: Spec[] = [];
    const steel: [string, number, string][] = [
      ['500×500', 937.5, 'врізна'], ['580×480', 1087.5, 'врізна'], ['780×430', 1200, 'врізна з крилом'],
      ['780×500', 1350, 'врізна з крилом'], ['Ø490', 900, 'кругла'], ['450×450', 825, 'врізна'],
    ];
    const finishes: [string, string, number][] = [['decor', 'декор', 1], ['satin', 'сатин', 1.02], ['polish', 'полірована', 1.05]];
    for (const [brand, bm] of [['Platinum', 1], ['Qtap', 1.15], ['Lidz', 1.2], ['Fabiano', 1.5]] as [string, number][]) {
      for (const [size, base, form] of steel) {
        for (const th of [0.6, 0.8]) {
          if (rng.chance(0.35)) continue;
          const [fid, fin, fm] = rng.pick(finishes);
          const code = modelCode(rng, brand);
          const cm = size.startsWith('Ø') ? size : size.split('×').map((x) => Number(x) / 10).join('х');
          out.push(mk({
            key: `sink:steel:${brand}:${size}:${th}:${fid}`, category: 'sink', brand, stock: 'piece', qty: [1, 4],
            basePriceUah: jitter(rng, base * bm * fm * (th === 0.8 ? 1.18 : 1), 0.06),
            attrs: { material: 'steel', size, thickness: th, finish: fid },
            render: (s: Style) => ({
              work: [
                `Мийка кухонна нерж. ${size} ${comma(th)} мм ${fin} ${brand}`,
                `Мийка з нерж. ${size.replace('×', 'х')} ${brand} (${comma(th)}) ${fin}`,
                `${brand} мийка ${cm} ${fin} ${th}`,
                `Мийка нержавіюча ${brand} ${size.replace('×', '*')} ${comma(th)}мм ${fin}`,
              ][s],
              full: [
                `Мийка кухонна з нержавіючої сталі ${brand} ${code} ${size} мм, ${form}, товщина ${comma(th)} мм, ${fin}, з сифоном`,
                `Мийка з нерж. сталі ${brand} ${code} ${size.replace('×', 'х')} ${form}, ${comma(th)} мм, поверхня ${fin}`,
                `Мийка кухонна ${brand} ${code} ${cm} см нерж. ${comma(th)} мм ${fin}`,
                `Мийка нержавіюча ${brand} ${size} ${comma(th)} мм ${fin}, арт. ${code}`,
              ][s],
            }),
            client: [`Мийка ${size.replace('×', '*')}`, `мийка нерж ${cm}`, `Мийка кухонна ${size.replace('×', 'х')}`, `мийка з неіржавійки ${size.replace('×', 'х')}`],
          }));
        }
      }
    }
    const COLOR_F: Record<string, string> = { чорний: 'чорна', бежевий: 'бежева', сірий: 'сіра' };
    for (const [brand, bm] of [['Fabiano', 1.1], ['Lidz', 1]] as [string, number][]) {
      for (const [size, base] of [['500×500', 3200], ['620×500', 3600], ['780×500', 3900]] as [string, number][]) {
        const colorM = rng.pick(['чорний', 'бежевий', 'сірий']); // для «колір X» (узгоджено з «колір», чол. рід)
        const color = COLOR_F[colorM]; // для прямого приєднання до «Мийка» (жін. рід)
        const code = modelCode(rng, brand);
        out.push(mk({
          key: `sink:granite:${brand}:${size}:${colorM}`, category: 'sink', brand, stock: 'piece', qty: [1, 3],
          basePriceUah: jitter(rng, base * bm, 0.06), attrs: { material: 'granite', size, color: colorM },
          render: (s: Style) => ({
            work: [`Мийка гранітна ${size} ${color} ${brand}`, `Мийка гран. ${size.replace('×', 'х')} ${color} ${brand}`, `${brand} мийка граніт ${size} ${color}`, `Мийка кухонна гранітна ${brand} ${size} ${color}`][s],
            full: [
              `Мийка кухонна гранітна ${brand} ${code} ${size} мм, колір ${colorM}, з сифоном`,
              `Мийка з штучного граніту ${brand} ${code} ${size.replace('×', 'х')}, ${color}`,
              `Мийка кухонна композитна ${brand} ${code} ${size} ${color}`,
              `Мийка гранітна ${brand} ${size} ${color}, арт. ${code}`,
            ][s],
          }),
          client: [`Мийка гранітна ${size.replace('×', '*')}`, `мийка граніт ${color}`, `Мийка кам'яна ${size.replace('×', 'х')}`],
        }));
      }
    }
    return out;
  },
};

// ───────────── Піддони ─────────────

const trays: CategoryDef = {
  id: 'shower-tray', title: 'Душові піддони', target: 33,
  affinity: { s1: 1, s2: 0.05, s3: 0, s4: 0.4 },
  build(rng: Rng) {
    const out: Spec[] = [];
    const sizes: [string, number, string][] = [
      ['80×80', 0.85, 'квадратний'], ['90×90', 1, 'квадратний'], ['100×80', 1.05, 'прямокутний'],
      ['100×100', 1.25, 'квадратний'], ['120×80', 1.3, 'прямокутний'], ['120×90', 1.4, 'прямокутний'],
      ['80×80 R550', 0.9, 'напівкруглий'], ['90×90 R550', 1.05, 'напівкруглий'],
    ];
    const brands: [string, number, string][] = [['Qtap', 1, 'Tern'], ['Cersanit', 1.1, 'Tako'], ['Kolo', 1.25, 'Pacyfik'], ['Radaway', 1.7, 'Doros']];
    for (const [brand, bm, ser] of brands) {
      for (const [size, sm, shape] of sizes) {
        for (const mat of ['acryl', 'marble'] as const) {
          if (rng.chance(0.4)) continue;
          const code = modelCode(rng, brand);
          const matW = mat === 'acryl' ? 'акриловий' : 'з литого мармуру';
          const matS = mat === 'acryl' ? 'акрил.' : 'литий мармур';
          out.push(mk({
            key: `tray:${brand}:${size.replace(/[ ×]/g, '')}:${mat}`, category: 'shower-tray', brand, stock: 'piece', qty: [1, 3],
            basePriceUah: jitter(rng, 2400 * bm * sm * (mat === 'marble' ? 1.6 : 1), 0.06), attrs: { size, shape, material: mat },
            render: (s: Style) => ({
              work: [
                `Піддон душовий ${matW} ${size} ${shape} ${brand} ${ser}`,
                `Душовий піддон ${size.replace('×', '*')} ${matS} ${brand}`,
                `${brand} ${ser} піддон ${size} ${matS}`,
                `Піддон ${brand} ${ser} ${size} ${shape}${mat === 'marble' ? ' литий мармур' : ''}`,
              ][s],
              full: [
                `Піддон душовий ${matW} ${brand} ${ser} ${code} ${size} см, ${shape}, з ніжками і сифоном`,
                `Душовий піддон ${matW} ${brand} ${ser} ${size.replace('×', 'х')} (${code}), ${shape}, в комплекті ніжки`,
                `Піддон для душової кабіни ${brand} ${ser} ${code} ${size} ${matS}`,
                `Піддон душовий ${brand} ${ser} ${size} ${matS} ${shape}, арт. ${code}`,
              ][s],
            }),
            client: ['Душовий піддон', `Піддон ${size.split(' ')[0].replace('×', '*')}`, `піддон душ ${size.split(' ')[0].replace('×', 'х')} ${mat === 'acryl' ? 'акрил' : 'мармур'}`, `Піддон ${shape} ${size.split(' ')[0]}`],
          }));
        }
      }
    }
    return out;
  },
};

// ───────────── Унітази ─────────────

const toilets: CategoryDef = {
  id: 'toilet', title: 'Унітази та компакти', target: 33,
  affinity: { s1: 1, s2: 0, s3: 0, s4: 0.5 },
  build(rng: Rng) {
    const out: Spec[] = [];
    const brands: [string, number, string[]][] = [
      ['Qtap', 0.85, ['Jay', 'Robin']], ['Cersanit', 1, ['Carina', 'Parva']], ['Kolo', 1.25, ['Idol', 'Rekord']],
      ['Roca', 1.6, ['Debba', 'Victoria']], ['Ideal Standard', 1.9, ['Tempo', 'Connect']],
    ];
    const types: [string, number, string, string, string][] = [
      ['compact', 1, 'Унітаз-компакт', 'Компакт', 'горизонтальний випуск, сидіння дюропласт soft-close'],
      ['compact-rimless', 1.2, 'Унітаз-компакт безобідковий', 'Компакт Rimless', 'безобідковий, сидіння дюропласт soft-close'],
      ['wall', 1.05, 'Унітаз підвісний безобідковий', 'Унітаз підвісний', 'безобідковий, сидіння soft-close slim'],
      ['compact-vert', 1.05, 'Унітаз-компакт з вертикальним випуском', 'Компакт верт. випуск', 'вертикальний випуск, сидіння поліпропілен'],
    ];
    for (const [brand, bm, series] of brands) {
      for (const ser of series) {
        for (const [tid, tm, tw, ts, spec] of types) {
          if (rng.chance(0.1)) continue;
          const code = modelCode(rng, brand);
          const compact = tid !== 'wall';
          out.push(mk({
            key: `toilet:${brand}:${ser}:${tid}`, category: 'toilet', brand, stock: 'piece', qty: [1, 6], unit: compact ? 'компл.' : 'шт',
            basePriceUah: jitter(rng, 5200 * bm * tm, 0.07), attrs: { type: tid, series: ser },
            render: (s: Style) => ({
              work: [`${tw} ${brand} ${ser}`, `${ts} ${brand} ${ser} з сид. SC`, `${brand} ${ser} ${tw.toLowerCase()}`, `${tw} ${brand} ${ser} ${code}`][s],
              full: [
                `${tw} ${brand} ${ser} ${code}, ${spec}, білий`,
                `${tw} ${brand} ${ser} (${code}) ${compact ? 'з бачком 3/6 л, ' : ''}${spec}`,
                `${tw} ${brand} ${ser} ${code} з сидінням повільного опускання`,
                `${tw} ${brand} ${ser}, арт. ${code}, ${spec}`,
              ][s],
            }),
            client: compact
              ? ['Унітаз компакт', `Унітаз-компакт ${brand}`, `унітаз з бачком ${tid === 'compact-rimless' ? 'безобідковий' : ''}`.trim(), `Компакт ${brand} ${ser}`]
              : ['Унітаз підвісний', `унітаз підвісний ${brand}`, 'Унітаз підвісний безобідковий з сидінням'],
          }));
        }
      }
    }
    return out;
  },
};

// ───────────── Інсталяції ─────────────

const installations: CategoryDef = {
  id: 'installation', title: 'Інсталяції та кнопки змиву', target: 24,
  affinity: { s1: 1, s2: 0, s3: 0.2, s4: 0.4 },
  build(rng: Rng) {
    const out: Spec[] = [];
    const frames: [string, string, number, number][] = [
      ['Geberit', 'Duofix', 3900, 1350], ['Tece', 'TECEbase', 3600, 1050], ['Grohe', 'Rapid SL', 4300, 1200],
      ['Cersanit', 'Aqua', 2900, 600], ['Koller', 'Pool', 2500, 450], ['Kolo', 'Slim', 3000, 675],
    ];
    for (const [brand, ser, base, btn] of frames) {
      const frameCode = modelCode(rng, brand);
      out.push(mk({
        key: `inst:${brand}:frame`, category: 'installation', brand, stock: 'piece', qty: [1, 6], unit: 'компл.',
        basePriceUah: jitter(rng, base, 0.05), attrs: { type: 'frame', series: ser },
        render: (s: Style) => ({
          work: [`Інсталяція для унітаза ${brand} ${ser}`, `Інсталяція д/підв. унітаза ${brand} ${ser}`, `${brand} ${ser} інсталяція 112 см`, `Інсталяція ${brand} ${ser} ${frameCode}`][s],
          full: [
            `Інсталяційна система для підвісного унітаза ${brand} ${ser} ${frameCode}, висота 112 см, з кріпленням`,
            `Інсталяція для підвісного унітаза ${brand} ${ser} (${frameCode}), бачок 3/6 л`,
            `Модуль для підвісного унітаза ${brand} ${ser} ${frameCode} H112`,
            `Інсталяція ${brand} ${ser} для унітаза, арт. ${frameCode}`,
          ][s],
        }),
        client: ['Інсталяція для унітаза', `інсталяція ${brand}`, 'Інсталяція підвісна'],
      }));
      if (brand === 'Cersanit' || brand === 'Koller' || brand === 'Kolo' || brand === 'Grohe') {
        const setCode = modelCode(rng, brand);
        out.push(mk({
          key: `inst:${brand}:set4in1`, category: 'installation', brand, stock: 'piece', qty: [1, 4], unit: 'компл.',
          basePriceUah: jitter(rng, base * 1.6, 0.05), attrs: { type: 'set', series: ser },
          render: (s: Style) => ({
            work: [`Комплект 4в1 ${brand} ${ser} (інсталяція + унітаз + кнопка)`, `Набір 4в1 ${brand} ${ser}`, `${brand} ${ser} комплект 4 в 1`, `Комплект інсталяції ${brand} ${ser} 4в1`][s],
            full: [
              `Комплект ${brand} ${ser} ${setCode}: інсталяція, унітаз підвісний безобідковий, сидіння soft-close, кнопка хром`,
              `Набір 4в1 ${brand} ${ser} (${setCode}) інсталяція + унітаз + сидіння + кнопка`,
              `Комплект інсталяційний ${brand} ${ser} ${setCode} 4 в 1`,
              `Комплект 4в1 ${brand} ${ser}, арт. ${setCode}`,
            ][s],
          }),
          client: ['Інсталяція з унітазом', 'комплект 4 в 1', `Інсталяція + унітаз ${brand}`],
        }));
      }
      if (brand === 'Geberit' || brand === 'Tece' || brand === 'Grohe' || brand === 'Cersanit') {
        const bCode = modelCode(rng, brand);
        out.push(mk({
          key: `inst:${brand}:basin-frame`, category: 'installation', brand, stock: 'piece', qty: [1, 4], unit: 'компл.',
          basePriceUah: jitter(rng, base * 0.42, 0.05), attrs: { type: 'basin-frame', series: ser },
          render: (s: Style) => ({
            work: [`Інсталяція для раковини ${brand} ${ser}`, `Інсталяція д/раковини ${brand} ${ser}`, `${brand} ${ser} модуль для раковини`, `Інсталяція ${brand} ${ser} під раковину`][s],
            full: [
              `Інсталяційна система для раковини ${brand} ${ser} ${bCode}, висота 112 см, з кріпленням і відводами`,
              `Інсталяція для раковини ${brand} ${ser} (${bCode}) з монтажним комплектом`,
              `Модуль для раковини ${brand} ${ser} ${bCode} H112`,
              `Інсталяція ${brand} ${ser} для раковини, арт. ${bCode}`,
            ][s],
          }),
          client: ['Інсталяція для раковини', `інсталяція під умивальник ${brand}`],
        }));
      }
      for (const [cid, color, cm] of [['chrome', 'хром', 1], ['white', 'біла', 0.9], ['black', 'чорна матова', 1.25]] as [string, string, number][]) {
        if (rng.chance(0.2)) continue;
        const code = modelCode(rng, brand);
        out.push(mk({
          key: `inst:${brand}:button:${cid}`, category: 'installation', brand, stock: 'mid', qty: [1, 6],
          basePriceUah: jitter(rng, btn * cm, 0.05), attrs: { type: 'button', series: ser, color: cid },
          render: (s: Style) => ({
            work: [`Кнопка змиву ${brand} ${color}`, `Кнопка змиву ${brand} ${ser} ${color}`, `${brand} кнопка ${color}`, `Кнопка для інсталяції ${brand} ${color}`][s],
            full: [`Клавіша змиву подвійна ${brand} ${code} для інсталяції ${ser}, ${color}`, `Кнопка змиву ${brand} (${code}) подвійний змив, ${color}`, `Панель змиву ${brand} ${code} ${color}`, `Кнопка змиву ${brand} ${color}, арт. ${code}`][s],
          }),
          client: ['Кнопка змиву', `кнопка для інсталяції ${color}`, `Клавіша змиву ${brand}`],
        }));
      }
    }
    return out;
  },
};

// ───────────── Раковини ─────────────

const basins: CategoryDef = {
  id: 'washbasin', title: 'Раковини', target: 30,
  affinity: { s1: 1, s2: 0, s3: 0, s4: 0.5 },
  build(rng: Rng) {
    const out: Spec[] = [];
    const brands: [string, number, string][] = [['Qtap', 0.9, 'Nando'], ['Cersanit', 1, 'Moduo'], ['Kolo', 1.3, 'Nova'], ['Roca', 1.7, 'Gap']];
    const kinds: [string, string, string, number][] = [['wall', 'підвісна', 'підв.', 1], ['furniture', 'меблева', 'мебл.', 1.05], ['top', 'накладна на стільницю', 'накл.', 1.6]];
    for (const [brand, bm, ser] of brands) {
      for (const w of [50, 55, 60, 65]) {
        for (const [kid, kw, ks, km] of kinds) {
          if (rng.chance(0.4)) continue;
          const code = modelCode(rng, brand);
          const wm = { 50: 0.9, 55: 1, 60: 1.15, 65: 1.3 }[w] ?? 1;
          out.push(mk({
            key: `basin:${brand}:${w}:${kid}`, category: 'washbasin', brand, stock: 'piece', qty: [1, 6],
            basePriceUah: jitter(rng, 1300 * bm * wm * km, 0.06), attrs: { width: w, kind: kid, series: ser },
            render: (s: Style) => ({
              work: [`Раковина ${w} см ${kw} ${brand} ${ser}`, `Умивальник ${w} ${ks} ${brand} ${ser}`, `${brand} ${ser} раковина ${w}`, `Раковина ${brand} ${ser} ${w} ${ks}`][s],
              full: [
                `Раковина керамічна ${brand} ${ser} ${code} ${w} см, ${kw}, з отвором під змішувач, біла`,
                `Умивальник ${brand} ${ser} ${w} см (${code}), ${kw}, з переливом`,
                `Раковина ${brand} ${ser} ${code} ${w}х${Math.round(w * 0.75)} см ${kw}`,
                `Раковина ${brand} ${ser} ${w} см ${kw}, арт. ${code}`,
              ][s],
            }),
            client: [`Раковина ${w}`, `умивальник ${w} см`, `Раковина ${kw} ${w}`, `рукомийник ${w}`],
          }));
        }
      }
      const code = modelCode(rng, brand);
      out.push(mk({
        key: `basin:${brand}:pedestal`, category: 'washbasin', brand, stock: 'piece', qty: [1, 6],
        basePriceUah: jitter(rng, 700 * bm, 0.06), attrs: { width: 0, kind: 'pedestal', series: ser },
        render: (s: Style) => ({
          work: [`П'єдестал для раковини ${brand} ${ser}`, `П'єдестал ${brand} ${ser}`, `${brand} ${ser} п'єдестал`, `П'єдестал ${brand} ${ser}`][s],
          full: [`П'єдестал для раковини ${brand} ${ser} ${code}, білий`, `П'єдестал ${brand} ${ser} (${code})`, `Ніжка для умивальника ${brand} ${ser} ${code}`, `П'єдестал ${brand} ${ser}, арт. ${code}`][s],
        }),
        client: ["П'єдестал для раковини", 'пєдестал', 'ніжка під раковину'],
      }));
    }
    return out;
  },
};

// ───────────── Сифони ─────────────

const siphons: CategoryDef = {
  id: 'siphon', title: 'Сифони та гофри', target: 28,
  affinity: { s1: 1, s2: 0.5, s3: 0, s4: 0.35 },
  build(rng: Rng) {
    const out: Spec[] = [];
    const items: [string, number, string, string, string[]][] = [
      ['basin', 180, 'Сифон для раковини пляшковий', 'випуск 1 1/4"×32 мм, з сіткою', ['Сифон для раковини', 'сифон д/умивальника', 'Сифон раковина']],
      ['sink1', 230, 'Сифон для мийки з переливом', '1 1/2"×40 мм, одна чаша, з переливом', ['Сифон для мийки', 'сифон на мийку', 'Сифон кухня']],
      ['sink2', 380, 'Сифон для подвійної мийки', '1 1/2"×40 мм, дві чаші, з переливом', ['Сифон для мийки на 2 чаші', 'сифон подвійний']],
      ['sink-wm', 320, 'Сифон для мийки з відводом', '1 1/2"×40 мм, відвід для пральної машини', ['Сифон з відводом під пральну', 'сифон для мийки з відводом']],
      ['bath-semi', 450, 'Сифон для ванни напівавтомат', 'обв\'язка з переливом, напівавтомат', ['Сифон для ванни', 'обвязка для ванни', 'Сифон ванна напівавтомат']],
      ['bath-auto', 900, 'Сифон для ванни автомат click-clack', 'обв\'язка з переливом, click-clack, хром', ['Сифон для ванни автомат', 'сифон ванни клік-клак']],
      ['tray52', 260, 'Сифон для піддону Ø52', 'низький, 1 1/2"×40 мм', ['Сифон для піддона', 'сифон піддон 52']],
      ['tray90', 380, 'Сифон для піддону Ø90', '1 1/2"×40/50 мм, з кришкою', ['Сифон для піддона 90', 'сифон на піддон 90мм']],
      ['wm', 350, 'Сифон для пральної машини вбудований', 'прихований монтаж, 40/50 мм', ['Сифон для пральної машини', 'сифон пральна машина']],
      ['corrugation', 160, 'Гофра для унітаза 110', 'гофрована манжета 110 мм, L 230–500 мм', ['Гофра для унітаза', 'гофра на унітаз 110']],
      ['cuff', 80, 'Манжета для унітаза ексцентрик', 'ексцентрична 110 мм', ['Манжета для унітаза', 'манжета ексцентрик 110']],
    ];
    for (const [brand, bm] of [['Orio', 0.8], ['McAlpine', 1.3], ['Viega', 1.8]] as [string, number][]) {
      for (const [id, base, name, spec, client] of items) {
        if (rng.chance(0.08)) continue;
        const code = modelCode(rng, brand);
        const short = name.replace('Сифон для ', 'Сифон д/').replace('пляшковий', 'пляшк.');
        out.push(mk({
          key: `siphon:${brand}:${id}`, category: 'siphon', brand, stock: 'mid', qty: [1, 8],
          basePriceUah: jitter(rng, base * bm, 0.06), attrs: { type: id },
          render: (s: Style) => ({
            work: [`${name} ${brand}`, `${short} ${brand}`, `${brand} ${lcFirst(name)}`, `${name} ${brand} ${code}`][s],
            full: [`${name} ${brand} ${code}, ${spec}`, `${name} ${brand} (${code}) ${spec}`, `${name} ${brand} ${code}`, `${name} ${brand}, ${spec}, арт. ${code}`][s],
          }),
          client,
        }));
      }
    }
    const code = modelCode(rng, 'Hansgrohe');
    out.push(mk({
      key: 'siphon:Hansgrohe:basin-chrome', category: 'siphon', brand: 'Hansgrohe', stock: 'mid', qty: [1, 4],
      basePriceUah: jitter(rng, 2100, 0.05), attrs: { type: 'basin-chrome' },
      render: (s: Style) => ({
        work: ['Сифон для раковини латунний хром Hansgrohe', 'Сифон д/раковини лат. хром Hansgrohe', 'Hansgrohe сифон пляшковий хром', 'Сифон Hansgrohe хром'][s],
        full: [`Сифон для раковини пляшковий латунний Hansgrohe ${code}, 1 1/4", хром`, `Сифон пляшк. лат. Hansgrohe (${code}) хром`, `Сифон для умивальника Hansgrohe ${code} хром`, `Сифон Hansgrohe хром 1 1/4", арт. ${code}`][s],
      }),
      client: ['Сифон хромований для раковини', 'сифон хром металевий', 'Сифон латунний'],
    }));
    return out;
  },
};

export const CERAMICS_CATEGORIES: readonly CategoryDef[] = [sinks, trays, toilets, installations, basins, siphons];
