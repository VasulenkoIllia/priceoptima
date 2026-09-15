import { round2 } from '../pricing/money';

type Gender = 'm' | 'f';

const UNITS_M = ['', 'один', 'два', 'три', 'чотири', 'п’ять', 'шість', 'сім', 'вісім', 'дев’ять'];
const UNITS_F = ['', 'одна', 'дві', 'три', 'чотири', 'п’ять', 'шість', 'сім', 'вісім', 'дев’ять'];
const TEENS = [
  'десять',
  'одинадцять',
  'дванадцять',
  'тринадцять',
  'чотирнадцять',
  'п’ятнадцять',
  'шістнадцять',
  'сімнадцять',
  'вісімнадцять',
  'дев’ятнадцять',
];
const TENS = ['', '', 'двадцять', 'тридцять', 'сорок', 'п’ятдесят', 'шістдесят', 'сімдесят', 'вісімдесят', 'дев’яносто'];
const HUNDREDS = ['', 'сто', 'двісті', 'триста', 'чотириста', 'п’ятсот', 'шістсот', 'сімсот', 'вісімсот', 'дев’ятсот'];

/** Форма іменника за числом: [1 гривня, 2–4 гривні, 5+ / 11–14 гривень]. */
export function pluralUk(n: number, forms: readonly [string, string, string]): string {
  const abs = Math.abs(Math.trunc(n));
  const mod100 = abs % 100;
  const mod10 = abs % 10;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

/** Число 1–999 словами. */
function tripletWords(n: number, gender: Gender): string[] {
  const words: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) words.push(HUNDREDS[h]!);
  if (rest >= 10 && rest < 20) {
    words.push(TEENS[rest - 10]!);
  } else {
    const t = Math.floor(rest / 10);
    const u = rest % 10;
    if (t) words.push(TENS[t]!);
    if (u) words.push((gender === 'f' ? UNITS_F : UNITS_M)[u]!);
  }
  return words;
}

// Розряди: [форми, рід]
const SCALES: { forms: [string, string, string]; gender: Gender }[] = [
  { forms: ['гривня', 'гривні', 'гривень'], gender: 'f' },
  { forms: ['тисяча', 'тисячі', 'тисяч'], gender: 'f' },
  { forms: ['мільйон', 'мільйони', 'мільйонів'], gender: 'm' },
  { forms: ['мільярд', 'мільярди', 'мільярдів'], gender: 'm' },
];

/** Ціле число словами (жіночий рід одиниць — «одна», «дві»). */
export function integerInWordsUk(n: number, gender: Gender = 'f'): string {
  const value = Math.trunc(Math.abs(n));
  if (value === 0) return 'нуль';
  const words: string[] = [];
  const groups: number[] = [];
  for (let rest = value; rest > 0; rest = Math.floor(rest / 1000)) groups.push(rest % 1000);
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]!;
    if (!g) continue;
    const scale = SCALES[i];
    words.push(...tripletWords(g, i === 0 ? gender : (scale?.gender ?? 'm')));
    if (i > 0 && scale) words.push(pluralUk(g, scale.forms));
  }
  return words.join(' ');
}

/**
 * Сума прописом для КП/рахунку:
 * 21012 → 'Двадцять одна тисяча дванадцять гривень 00 копійок'.
 */
export function amountInWordsUah(amount: number): string {
  const rounded = round2(amount);
  const abs = Math.abs(rounded);
  const hryvnias = Math.trunc(abs);
  const kopecks = Math.round((abs - hryvnias) * 100);
  const words = `${integerInWordsUk(hryvnias, 'f')} ${pluralUk(hryvnias, SCALES[0]!.forms)}`;
  const kop = `${String(kopecks).padStart(2, '0')} ${pluralUk(kopecks, ['копійка', 'копійки', 'копійок'])}`;
  const text = `${rounded < 0 ? 'мінус ' : ''}${words} ${kop}`;
  return text.charAt(0).toLocaleUpperCase('uk') + text.slice(1);
}
