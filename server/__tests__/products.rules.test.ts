// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isPriceStale, priceAgeDays } from '@shared/pricing';
import {
  availabilityOf,
  likePattern,
  priceChanged,
  productOrderBy,
  searchTextOf,
  staleBefore,
} from '../modules/products/products.rules';

const DAY_MS = 86_400_000;

describe('текст пошуку', () => {
  it('складається з артикула, назв і бренду', () => {
    expect(searchTextOf({ sku: 'ЦР-100', nameWork: 'Кран кульовий 1/2"', name1c: 'Кран 1/2', brand: 'Valtec' })).toBe(
      'цр-100 кран кульовий 1/2 кран 1/2 valtec',
    );
  });

  it('порожні поля не лишають зайвих пробілів', () => {
    expect(searchTextOf({ sku: 'A1', nameWork: 'Сифон', name1c: null, brand: null })).toBe('a1 сифон');
  });
});

describe('межа застарілості ціни', () => {
  it('збігається з правилом isPriceStale для всіх днів', () => {
    const now = new Date('2026-09-16T10:30:00.000Z');
    for (const staleDays of [0, 1, 7, 14, 30]) {
      const cutoff = staleBefore(now, staleDays);
      for (let hours = 0; hours <= 24 * 35; hours += 7) {
        const at = new Date(now.getTime() - hours * 3_600_000);
        const byRule = isPriceStale(priceAgeDays(at.toISOString(), now), staleDays);
        expect({ staleDays, hours, stale: at.getTime() <= cutoff.getTime() }).toEqual({ staleDays, hours, stale: byRule });
      }
    }
  });

  it('рівно staleDays + 1 доба — уже застаріла', () => {
    const now = new Date('2026-09-16T10:30:00.000Z');
    expect(staleBefore(now, 14).getTime()).toBe(now.getTime() - 15 * DAY_MS);
  });
});

describe('наявність за залишком', () => {
  it('немає даних — unknown, більше нуля — in_stock', () => {
    expect(availabilityOf(null)).toBe('unknown');
    expect(availabilityOf(0)).toBe('out_of_stock');
    expect(availabilityOf(12.5)).toBe('in_stock');
  });
});

describe('зміна ціни', () => {
  const before = {
    currency: 'UAH' as const,
    purchasePrice: 100,
    rrp: 150,
    stockQty: 5,
    availability: 'in_stock' as const,
  };

  it('однакові значення — запис в історію не потрібен', () => {
    expect(priceChanged(before, { ...before })).toBe(false);
  });

  it('будь-яке поле інше — це зміна', () => {
    expect(priceChanged(before, { ...before, purchasePrice: 101 })).toBe(true);
    expect(priceChanged(before, { ...before, rrp: null })).toBe(true);
    expect(priceChanged(before, { ...before, currency: 'USD' })).toBe(true);
    expect(priceChanged(before, { ...before, stockQty: null })).toBe(true);
    expect(priceChanged(before, { ...before, availability: 'out_of_stock' })).toBe(true);
  });
});

describe('екранування LIKE', () => {
  it('відсоток і підкреслення в артикулі не стають шаблоном', () => {
    expect(likePattern('50%_A')).toBe('50\\%\\_A');
    expect(likePattern('CP100')).toBe('CP100');
  });
});

describe('порядок сторінки номенклатури', () => {
  it('за замовчуванням — як у постачальників, далі назва; останнім id, щоб сторінки не перекривались', () => {
    expect(productOrderBy(undefined)).toEqual([
      { supplier: { sortOrder: 'asc' } },
      { supplier: { name: 'asc' } },
      { nameWork: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('ціни й дата: порожні значення в кінці в обидва боки', () => {
    expect(productOrderBy('purchasePrice', 'desc')[0]).toEqual({ purchasePrice: { sort: 'desc', nulls: 'last' } });
    expect(productOrderBy('priceUpdatedAt', 'asc')[0]).toEqual({ priceUpdatedAt: { sort: 'asc', nulls: 'last' } });
  });

  it('джерело ціни — за полем бази priceOrigin; постачальник — за назвою', () => {
    expect(productOrderBy('priceSource', 'desc')[0]).toEqual({ priceOrigin: 'desc' });
    expect(productOrderBy('supplier', 'desc')[0]).toEqual({ supplier: { name: 'desc' } });
    expect(productOrderBy('sku', 'asc').at(-1)).toEqual({ id: 'asc' });
  });
});
