import { describe, expect, it } from 'vitest';
import {
  amountInWordsUah,
  formatDate,
  formatDateLong,
  formatDateTime,
  formatKpNumber,
  formatMoney,
  formatMoneyUah,
  formatPct,
  formatQty,
  formatRate,
  formatRequestNumber,
  formatTime,
  formatWarning,
  integerInWordsUk,
  pluralUk,
  toIsoDate,
} from '..';

const NB = ' ';

describe('числа (uk-UA)', () => {
  it('formatMoney', () => {
    expect(formatMoney(1234.56)).toBe(`1${NB}234,56`);
    expect(formatMoney(-1234567.5)).toBe(`-1${NB}234${NB}567,50`);
    expect(formatMoney(1.005)).toBe('1,01');
    expect(formatMoney(0)).toBe('0,00');
    expect(formatMoney(-0.001)).toBe('0,00');
    expect(formatMoney(465, 0)).toBe('465');
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
    expect(formatMoney(Number.NaN)).toBe('—');
    expect(formatMoneyUah(21012)).toBe(`21${NB}012,00${NB}грн`);
  });

  it('formatQty — до 3 знаків без зайвих нулів', () => {
    expect(formatQty(120)).toBe('120');
    expect(formatQty(1.5)).toBe('1,5');
    expect(formatQty(0.125)).toBe('0,125');
    expect(formatQty(1234.5)).toBe(`1${NB}234,5`);
    expect(formatQty(null)).toBe('—');
  });

  it('formatPct і formatRate', () => {
    expect(formatPct(16.6667)).toBe(`16,67${NB}%`);
    expect(formatPct(0.8466)).toBe(`0,85${NB}%`);
    expect(formatPct(-0.6316, 1)).toBe(`-0,6${NB}%`);
    expect(formatPct(null)).toBe('—');
    expect(formatRate(44.5526)).toBe('44,5526');
    expect(formatRate(45)).toBe('45,00');
    expect(formatRate(44.998126)).toBe('44,9981');
  });
});

describe('нумерація', () => {
  it('заявки і КП', () => {
    expect(formatRequestNumber(1)).toBe('000001');
    expect(formatRequestNumber(123456)).toBe('123456');
    expect(formatKpNumber(2114, 1)).toBe('2114 / 000001');
  });
});

describe('дати (Київ)', () => {
  it('formatDate / formatDateLong для ISODate', () => {
    expect(formatDate('2026-08-18')).toBe('18.08.2026');
    expect(formatDateLong('2026-08-18')).toBe('18 серпня 2026 р.');
    expect(formatDateLong('2026-01-01')).toBe('1 січня 2026 р.');
    expect(formatDate(null)).toBe('—');
    expect(formatDate('не дата')).toBe('—');
  });

  it('ISODateTime переводиться в київський час', () => {
    expect(formatDate('2026-09-11T22:30:00Z')).toBe('12.09.2026');
    expect(formatTime('2026-09-11T09:03:15Z')).toBe('12:03:15');
    expect(formatTime('2026-09-11T09:03:15Z', false)).toBe('12:03');
    expect(formatDateTime('2026-09-11T09:03:15Z')).toBe('11.09.2026 12:03');
    expect(formatDateTime('2026-12-01T09:03:15Z')).toBe('01.12.2026 11:03');
    expect(toIsoDate(new Date('2026-09-11T22:30:00Z'))).toBe('2026-09-12');
  });
});

describe('сума прописом', () => {
  it.each([
    [21012, 'Двадцять одна тисяча дванадцять гривень 00 копійок'],
    [1001.5, 'Одна тисяча одна гривня 50 копійок'],
    [2, 'Дві гривні 00 копійок'],
    [1000000, 'Один мільйон гривень 00 копійок'],
    [1, 'Одна гривня 00 копійок'],
    [5, 'П’ять гривень 00 копійок'],
    [11, 'Одинадцять гривень 00 копійок'],
    [21, 'Двадцять одна гривня 00 копійок'],
    [22.02, 'Двадцять дві гривні 02 копійки'],
    [0.01, 'Нуль гривень 01 копійка'],
    [2000, 'Дві тисячі гривень 00 копійок'],
    [5000, 'П’ять тисяч гривень 00 копійок'],
    [11000, 'Одинадцять тисяч гривень 00 копійок'],
    [1234.99, 'Одна тисяча двісті тридцять чотири гривні 99 копійок'],
    [3500000.21, 'Три мільйони п’ятсот тисяч гривень 21 копійка'],
    [7000000, 'Сім мільйонів гривень 00 копійок'],
    [2001000000, 'Два мільярди один мільйон гривень 00 копійок'],
    [112.115, 'Сто дванадцять гривень 12 копійок'],
  ])('%s → %s', (amount, words) => {
    expect(amountInWordsUah(amount)).toBe(words);
  });

  it('pluralUk / integerInWordsUk', () => {
    expect(pluralUk(1, ['a', 'b', 'c'])).toBe('a');
    expect(pluralUk(3, ['a', 'b', 'c'])).toBe('b');
    expect(pluralUk(12, ['a', 'b', 'c'])).toBe('c');
    expect(pluralUk(111, ['a', 'b', 'c'])).toBe('c');
    expect(pluralUk(101, ['a', 'b', 'c'])).toBe('a');
    expect(integerInWordsUk(2, 'm')).toBe('два');
    expect(integerInWordsUk(0)).toBe('нуль');
  });

  it('від’ємна сума', () => {
    expect(amountInWordsUah(-5)).toBe('Мінус п’ять гривень 00 копійок');
  });
});

describe('тексти попереджень', () => {
  it('кратність, мін. замовлення', () => {
    expect(formatWarning({ code: 'QTY_ROUNDED', params: { from: 118, to: 120, multiplicity: 4 } })).toBe('Округлено з 118, кратно 4');
    expect(formatWarning({ code: 'BELOW_MIN_ORDER', params: { selectedGross: 464.51, minOrderAmount: 1000 } })).toBe(
      `Сума обраних з ПДВ 464,51 < мін. замовлення з ПДВ 1${NB}000,00 — нерентабельно`,
    );
    expect(formatWarning({ code: 'NO_CLIENT' })).toBe('Не обрано клієнта');
  });
});
