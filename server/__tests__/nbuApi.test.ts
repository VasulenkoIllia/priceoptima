// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { nbuUrl, parseNbuDate, parseNbuRate } from '../jobs/nbuApi';

const USD_RESPONSE = [{ r030: 840, txt: 'Долар США', rate: 41.2345, cc: 'USD', exchangedate: '16.09.2026' }];

describe('адреса запиту до НБУ', () => {
  it('валюта й дата без роздільників', () => {
    expect(nbuUrl('USD', '2026-09-16')).toBe(
      'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json&valcode=USD&date=20260916',
    );
    expect(nbuUrl('EUR', '2026-01-05')).toContain('valcode=EUR&date=20260105');
  });
});

describe('дата у відповіді НБУ', () => {
  it('переводиться у формат ISO', () => {
    expect(parseNbuDate('16.09.2026')).toBe('2026-09-16');
  });

  it('невідомий формат — null', () => {
    expect(parseNbuDate('2026-09-16')).toBeNull();
    expect(parseNbuDate(undefined)).toBeNull();
    expect(parseNbuDate(20260916)).toBeNull();
  });
});

describe('розбір відповіді НБУ', () => {
  it('курс і дата беруться з запису потрібної валюти', () => {
    expect(parseNbuRate(USD_RESPONSE, 'USD', '2026-09-16')).toEqual({
      currency: 'USD',
      rateDate: '2026-09-16',
      rate: 41.2345,
    });
  });

  it('із кількох записів вибирається потрібна валюта', () => {
    const payload = [
      { cc: 'USD', rate: 41.2, exchangedate: '16.09.2026' },
      { cc: 'EUR', rate: 48.9, exchangedate: '16.09.2026' },
    ];
    expect(parseNbuRate(payload, 'EUR', '2026-09-16').rate).toBe(48.9);
  });

  it('без дати у відповіді лишається запитана дата', () => {
    expect(parseNbuRate([{ cc: 'USD', rate: 41.2 }], 'USD', '2026-09-16').rateDate).toBe('2026-09-16');
  });

  it('курс рядком із комою теж розбирається', () => {
    expect(parseNbuRate([{ cc: 'USD', rate: '41,2345', exchangedate: '16.09.2026' }], 'USD', '2026-09-16').rate).toBe(41.2345);
  });

  it('порожня відповідь (вихідний або майбутня дата) — помилка з поясненням', () => {
    expect(() => parseNbuRate([], 'USD', '2026-09-16')).toThrow(/не повернув курс USD/u);
  });

  it('відповідь не про ту валюту — помилка', () => {
    expect(() => parseNbuRate(USD_RESPONSE, 'EUR', '2026-09-16')).toThrow(/не повернув курс EUR/u);
  });

  it('сторінка з помилкою замість JSON-масиву — помилка', () => {
    expect(() => parseNbuRate('<html>service unavailable</html>', 'USD', '2026-09-16')).toThrow(/не повернув курс/u);
    expect(() => parseNbuRate(null, 'USD', '2026-09-16')).toThrow(/не повернув курс/u);
  });

  it('нульовий або нечисловий курс не приймається', () => {
    expect(() => parseNbuRate([{ cc: 'USD', rate: 0 }], 'USD', '2026-09-16')).toThrow(/некоректний курс/u);
    expect(() => parseNbuRate([{ cc: 'USD', rate: 'н/д' }], 'USD', '2026-09-16')).toThrow(/некоректний курс/u);
    expect(() => parseNbuRate([{ cc: 'USD', rate: -5 }], 'USD', '2026-09-16')).toThrow(/некоректний курс/u);
  });
});
