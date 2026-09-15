import { describe, expect, it } from 'vitest';
import { buildSearchText, matchesAllTokens, normalizeSku, normalizeUnit, parseCurrency, parseLocaleNumber, parseTsv, searchTokens } from '..';

describe('parseLocaleNumber (T18)', () => {
  it.each([
    ['1 234,56', 1234.56],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['0,148', 0.148],
    ['12 345', 12345],
    ['1.234.567', 1234567],
    ['45,05 грн', 45.05],
    ['1 234,5', 1234.5],
    ['$ 12.5', 12.5],
    ['−3,5', -3.5],
    ['1,234,567', 1234567],
  ])('%s → %s', (input, expected) => {
    expect(parseLocaleNumber(input)).toEqual({ value: expected, valid: true });
  });

  it('порожні позначки → null (valid), сміття → null (invalid)', () => {
    expect(parseLocaleNumber('-')).toEqual({ value: null, valid: true });
    expect(parseLocaleNumber('—')).toEqual({ value: null, valid: true });
    expect(parseLocaleNumber('  ')).toEqual({ value: null, valid: true });
    expect(parseLocaleNumber(null)).toEqual({ value: null, valid: true });
    expect(parseLocaleNumber('abc')).toEqual({ value: null, valid: false });
    expect(parseLocaleNumber('1,2,3.4.5')).toEqual({ value: null, valid: false });
    expect(parseLocaleNumber(Number.NaN)).toEqual({ value: null, valid: false });
    expect(parseLocaleNumber({})).toEqual({ value: null, valid: false });
  });

  it('число як є; явний десятковий роздільник', () => {
    expect(parseLocaleNumber(12.5)).toEqual({ value: 12.5, valid: true });
    expect(parseLocaleNumber('1.234', { decimal: ',' })).toEqual({ value: 1234, valid: true });
    expect(parseLocaleNumber('1,234', { decimal: '.' })).toEqual({ value: 1234, valid: true });
    expect(parseLocaleNumber('1,234', { decimal: ',' })).toEqual({ value: 1.234, valid: true });
  });
});

describe('normalizeSku і buildSearchText (T19)', () => {
  it('артикули: кирилична «Р» → латинська, «Ц» лишається', () => {
    expect(normalizeSku(' цр-0000 123 ')).toBe('ЦP0000123');
    expect(normalizeSku('ЦP0000123')).toBe('ЦP0000123');
    expect(normalizeSku(' wi-0000 127 ')).toBe('WI0000127');
    expect(normalizeSku('pl_0000.131/a\\b')).toBe('PL0000131AB');
    expect(normalizeSku('АВЕКМНОРСТХІУ')).toBe('ABEKMHOPCTXIY');
  });

  it('пошуковий текст товару і запиту', () => {
    const product = buildSearchText('Мийка з нерж. 500х500 ПР2');
    expect(product).toBe('мийка з нерж. 500x500 пр2');
    const query = buildSearchText('Мийка 500*500');
    expect(query).toBe('мийка 500x500');
    expect(matchesAllTokens(product, searchTokens('Мийка 500*500'))).toBe(true);
  });

  it('нормалізація розмірів, дробів, лапок, апострофів', () => {
    expect(buildSearchText('Муфта 20 х 1/2"')).toBe('муфта 20x1/2');
    expect(buildSearchText('Труба 0,5 м × 3')).toBe('труба 0.5 м 3');
    expect(buildSearchText('Кран «Grohe» п’ятиходовий', null, 'ЦР-0001')).toBe('кран grohe пятиходовий цр-0001');
    expect(buildSearchText('Ёмкость; 100×200×30!')).toBe('емкость 100x200x30');
    expect(searchTokens('   ')).toEqual([]);
  });
});

describe('parseTsv', () => {
  it('рядки й клітинки з Excel', () => {
    expect(parseTsv('Змішувач\tшт\t2\r\nМийка\tшт\t1\r\n')).toEqual([
      ['Змішувач', 'шт', '2'],
      ['Мийка', 'шт', '1'],
    ]);
  });

  it('клітинки в лапках з табами, переносами й подвоєними лапками', () => {
    expect(parseTsv('"Муфта 20х1/2""\nлатунь"\tшт\t8\n"a\tb"\t2')).toEqual([
      ['Муфта 20х1/2"\nлатунь', 'шт', '8'],
      ['a\tb', '2'],
    ]);
  });

  it('лапки всередині звичайної клітинки — як є; порожні клітинки й рядки', () => {
    expect(parseTsv('Кран 1/2" кутовий\t\t3')).toEqual([['Кран 1/2" кутовий', '', '3']]);
    expect(parseTsv('a\n\nb')).toEqual([['a'], [''], ['b']]);
    expect(parseTsv('a\t')).toEqual([['a', '']]);
    expect(parseTsv('')).toEqual([]);
  });
});

describe('normalizeUnit і parseCurrency', () => {
  it('одиниці', () => {
    expect(normalizeUnit('шт.')).toBe('шт');
    expect(normalizeUnit(' Штук ')).toBe('шт');
    expect(normalizeUnit('м.п.')).toBe('м');
    expect(normalizeUnit('м²')).toBe('м2');
    expect(normalizeUnit('к-т')).toBe('компл');
    expect(normalizeUnit('ящик')).toBeNull();
    expect(normalizeUnit('')).toBeNull();
    expect(normalizeUnit(null)).toBeNull();
    expect(normalizeUnit('бух', [{ code: 'бухта', aliases: ['бух'] }])).toBe('бухта');
  });

  it('валюти', () => {
    expect(parseCurrency('грн')).toBe('UAH');
    expect(parseCurrency('UAH')).toBe('UAH');
    expect(parseCurrency('₴')).toBe('UAH');
    expect(parseCurrency('грн.')).toBe('UAH');
    expect(parseCurrency('$')).toBe('USD');
    expect(parseCurrency(' usd ')).toBe('USD');
    expect(parseCurrency('€')).toBe('EUR');
    expect(parseCurrency('Eur')).toBe('EUR');
    expect(parseCurrency('Євро')).toBe('EUR');
    expect(parseCurrency(840)).toBe('USD');
    expect(parseCurrency('PLN')).toBeNull();
    expect(parseCurrency(null)).toBeNull();
  });
});
