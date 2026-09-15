// Таксономія демо-каталогу: спільні типи, словники й допоміжні функції (без реєстру — щоб уникнути циклічних імпортів).
// Бренди використовуються лише як частина назви товару; моделі/коди/ціни — вигадані.

import type { Rng } from './prng';
import type { SupplierKey } from './types';

/** Стиль назв постачальника (0..3 = s1..s4). */
export type Style = 0 | 1 | 2 | 3;

export interface NameSet {
  /** Коротка робоча назва (як пишуть менеджери). */
  work: string;
  /** Повна бухгалтерська назва (як в 1С). */
  full: string;
}

export type StockProfile = 'piece' | 'mid' | 'small' | 'meter' | 'coil';

/** «Той самий» товар незалежно від постачальника. */
export interface CanonicalSpec {
  key: string;
  category: string;
  brand: string;
  unit: string;
  multiplicity: number;
  minOrderQty: number;
  /** Складська упаковка (бухта, пачка) — лише для правдоподібного залишку; продається поштучно/за метр. */
  stockPack?: number;
  /** Орієнтовна ринкова закупівельна ціна, грн без ПДВ. */
  basePriceUah: number;
  attrs: Record<string, string | number>;
  stock: StockProfile;
  /** Типова к-сть у заявці клієнта. */
  qty: [number, number];
  /** Назви у стилі конкретного постачальника. */
  render: (style: Style) => NameSet;
  /** Базові клієнтські формулювання (далі «забруднюються» скороченнями й помилками). */
  client: string[];
}

export interface CategoryDef {
  id: string;
  title: string;
  /** Схильність постачальників мати цю категорію (0 — не торгує). */
  affinity: Record<SupplierKey, number>;
  /** Скільки канонічних товарів узяти з повного переліку комбінацій. */
  target: number;
  build: (rng: Rng) => CanonicalSpec[];
}

// ───────────────────────── словники ─────────────────────────

/** Варіант терміна для стилю постачальника (якщо варіантів менше — перший). */
export function v(style: Style, ...variants: string[]): string {
  return variants[style] ?? variants[0];
}

export const INCH = ['1/2', '3/4', '1', '1 1/4', '1 1/2', '2'] as const;
export type Inch = (typeof INCH)[number];
export const DN: Record<Inch, number> = { '1/2': 15, '3/4': 20, '1': 25, '1 1/4': 32, '1 1/2': 40, '2': 50 };
/** Множник ціни латунної арматури від розміру. */
export const INCH_PRICE: Record<Inch, number> = { '1/2': 1, '3/4': 1.45, '1': 2.3, '1 1/4': 3.8, '1 1/2': 5.2, '2': 8 };

export function inch(s: Inch): string {
  return `${s}"`;
}

export type Thread = 'ВВ' | 'ВЗ' | 'ЗЗ';

export function thread(style: Style, t: Thread): string {
  const map: Record<Thread, string[]> = {
    ВВ: ['ВВ', 'в/в', 'ВР-ВР', 'вн.-вн.'],
    ВЗ: ['ВЗ', 'в/з', 'ВР-ЗР', 'вн.-зовн.'],
    ЗЗ: ['ЗЗ', 'з/з', 'ЗР-ЗР', 'зовн.-зовн.'],
  };
  return map[t][style];
}

export function threadLong(t: Thread): string {
  return { ВВ: 'внутрішня-внутрішня різьба', ВЗ: 'внутрішня-зовнішня різьба', ЗЗ: 'зовнішня-зовнішня різьба' }[t];
}

/** Префікси вигаданих кодів моделей за брендом (унікальні — щоб коди різних брендів не перетиналися). */
const MODEL_PREFIX: Record<string, string> = {
  Valtec: 'VT', Icma: 'N', Koer: 'KR', Qtap: 'QT', Imprese: 'IM', Kludi: 'KL', Grohe: 'GR', Hansgrohe: 'HG',
  Kolo: 'KO', Cersanit: 'CS', Roca: 'RC', Wavin: 'WV', Ekoplastik: 'EK', Kalde: 'KD', Fado: 'FD', Bugatti: 'BG',
  Giacomini: 'GC', Caleffi: 'CL', Grundfos: 'GF', Wilo: 'WL', Ariston: 'AR', Atlantic: 'AT', Kospel: 'KS',
  Kaiser: 'KA', Koller: 'KP', 'SD Plus': 'SD', Rehau: 'RH', 'KAN-therm': 'KT', Uponor: 'UP', Tece: 'TC',
  Geberit: 'GB', Karro: 'KRO', Emmy: 'EM', Kermi: 'KM', Purmo: 'PR', Korado: 'KRD', Fondital: 'FT', Global: 'GL',
  Aquafilter: 'AF', Ecosoft: 'EC', 'Atlas Filtri': 'ATF', Watts: 'WT', Apator: 'AP', Novator: 'NV', Sensus: 'SN',
  Gross: 'GS', McAlpine: 'MA', Viega: 'VG', Orio: 'OR', Magnaplast: 'MP', Pipelife: 'PL', 'Інсталпласт': 'IP',
  Unipak: 'UN', Tangit: 'TG', Loctite: 'LT', Soudal: 'SO', Ceresit: 'CE', Lidz: 'LZ', Fabiano: 'FB', Platinum: 'PT',
  Radaway: 'RW', 'Ideal Standard': 'IS', IMP: 'IMP', Thermex: 'TX', Gorenje: 'GJ',
};

/** Реєстр уже виданих кодів моделей на бренд — для унікальності в межах одного generateCatalog(). */
let usedModelCodes: Map<string, Set<string>> | null = null;

/** Скидає реєстр кодів моделей: викликати на початку кожного generateCatalog(), щоб виклики не «протікали» один в одного. */
export function resetModelCodeRegistry(): void {
  usedModelCodes = new Map();
}

/** Вигаданий код моделі: стабільний для канонічного товару (однаковий у всіх постачальників), унікальний у межах бренду. */
export function modelCode(rng: Rng, brand: string): string {
  const p = MODEL_PREFIX[brand] ?? brand.slice(0, 2).toUpperCase();
  if (!usedModelCodes) usedModelCodes = new Map();
  const used = usedModelCodes.get(brand) ?? usedModelCodes.set(brand, new Set()).get(brand)!;
  let code = '';
  for (let attempt = 0; attempt < 30; attempt++) {
    const n = rng.int(100, 989);
    const tail = rng.chance(0.5) ? `.${String(rng.int(1, 99)).padStart(2, '0')}` : '';
    code = `${p}${rng.chance(0.4) ? '-' : '.'}${n}${tail}`;
    if (!used.has(code)) break;
  }
  used.add(code);
  return code;
}

/** Ринковий шум ціни канонічного товару. */
export function jitter(rng: Rng, price: number, spread = 0.1): number {
  return price * rng.float(1 - spread, 1 + spread);
}

/** Українське узгодження числівника з іменником (1/2-4/5+, з винятком 11-14). */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few;
  return many;
}

/** Абревіатури, які не можна «зіпсувати» пониженням регістру першої літери. */
const KEEP_CASE_WORDS = new Set(['ФУМ', 'ЗР', 'ВР', 'ЗЗ', 'ВВ', 'ППР', 'МРН', 'МРВ']);

/** Понижує регістр лише першої літери фрази (не всієї фрази — інакше «Ø» і абревіатури псуються). */
export function lcFirst(s: string): string {
  const m = /^[А-ЯІЇЄҐ]+/.exec(s);
  if (m && m[0].length > 1 && KEEP_CASE_WORDS.has(m[0])) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// ─────────────── «брудні» клієнтські назви ───────────────

const ABBR: [RegExp, string[]][] = [
  [/\bдля\b/gi, ['д/', 'для', 'д/']],
  [/кульовий/gi, ['кул.', 'кульов.', 'кульовий', 'шаровий']],
  [/латунн(ий|а|е)/gi, ['лат.', 'латун.', 'лат']],
  [/зворотн(ій|ий)/gi, ['зворот.', 'зв.', 'обратний']],
  [/поліпропілен(ова|овий)/gi, ['ппр', 'ПП', 'п/п']],
  [/нержавіюч(а|ий|і)/gi, ['нерж.', 'нерж', 'н/ж']],
  [/змішувач/gi, ['змішувач', 'зміш.', 'змішувач', 'смеситель']],
  [/з'єднання/gi, ["з'єдн.", 'зєднання']],
  [/радіатор/gi, ['радіатор', 'рад.', 'батарея']],
  [/каналізаційн(а|ий|е)/gi, ['канал.', 'кан.', 'каналіз.']],
];

function typo(rng: Rng, word: string): string {
  if (word.length < 6 || /\d/.test(word)) return word;
  const i = rng.int(1, word.length - 3);
  const kind = rng.int(0, 2);
  if (kind === 0) return word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2); // перестановка
  if (kind === 1) return word.slice(0, i) + word.slice(i + 1); // пропуск літери
  return word.slice(0, i) + word[i] + word.slice(i); // подвоєння
}

/** Один «забруднений» варіант фрази. */
export function dirty(rng: Rng, phrase: string): string {
  let s = phrase;
  for (const [re, alts] of ABBR) {
    if (re.test(s) && rng.chance(0.45)) s = s.replace(re, rng.pick(alts));
    re.lastIndex = 0;
  }
  const q = rng.next();
  if (q < 0.3) s = s.replace(/"/g, '');
  else if (q < 0.4) s = s.replace(/"/g, "''");
  else if (q < 0.45) s = s.replace(/"/g, ' дюйм');
  if (rng.chance(0.35)) s = s.replace(/(\d)\s*[хx×]\s*(\d)/g, (_, a: string, b: string) => `${a}${rng.pick(['*', 'x', 'х', 'Х'])}${b}`);
  if (rng.chance(0.35)) s = s.toLowerCase();
  else if (rng.chance(0.1)) s = s.charAt(0).toUpperCase() + s.slice(1);
  if (rng.chance(0.2)) {
    const words = s.split(' ');
    const idx = rng.int(0, words.length - 1);
    words[idx] = typo(rng, words[idx]);
    s = words.join(' ');
  }
  if (rng.chance(0.15)) s = s.replace(/\./g, '');
  if (rng.chance(0.08)) s = s.replace(' ', '  ');
  if (rng.chance(0.1)) s = s.trimEnd() + rng.pick([' (терміново)', ' або аналог', ' - аналог']);
  return s.trim();
}

/** 3–5 унікальних клієнтських варіантів назви. */
export function clientVariants(rng: Rng, phrases: string[]): string[] {
  const out: string[] = [];
  const want = rng.int(3, 5);
  for (let attempt = 0; attempt < want * 4 && out.length < want; attempt++) {
    const base = phrases[attempt % phrases.length];
    const d = attempt < phrases.length && rng.chance(0.3) ? base : dirty(rng, base);
    if (!out.includes(d)) out.push(d);
  }
  return out;
}
