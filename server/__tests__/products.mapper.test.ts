// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Prisma, type Product, type Supplier, type User } from '@prisma/client';
import {
  toPriceHistoryEntry,
  toProductDetail,
  toProductListItem,
  type CatalogContext,
  type PriceHistoryRow,
} from '../modules/products/products.mapper';

const NOW = new Date('2026-09-16T12:00:00.000Z');
const DAY_MS = 86_400_000;
const dec = (v: number) => new Prisma.Decimal(v);

function supplier(part: Partial<Supplier> = {}): Supplier {
  return {
    id: 'sup-1',
    name: 'Пласт-Сервіс',
    color: '#123456',
    logoUrl: null,
    defaultCurrency: 'UAH',
    pricesIncludeVat: false,
    rrpIncludesVat: true,
    supplierMarkupPct: dec(0),
    ratePolicy: 'price_list',
    rateAdjustPct: dec(0),
    manualRateUsd: null,
    manualRateEur: null,
    manualRatesDate: null,
    priceListRateUsd: null,
    priceListRateEur: null,
    priceListRateDate: null,
    minOrderAmount: null,
    priceStaleDays: null,
    searchUrlTemplate: null,
    website: null,
    b2bUrl: null,
    notes: null,
    deliveryInfo: null,
    isActive: true,
    sortOrder: 0,
    lastImportAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...part,
  };
}

function product(part: Partial<Product> = {}): Product {
  return {
    id: 'prd-1',
    supplierId: 'sup-1',
    sku: 'ЦР-100',
    skuKey: 'CP100',
    nameWork: 'Кран кульовий 1/2',
    name1c: null,
    searchText: 'цр-100 кран кульовий 1/2',
    brand: 'Valtec',
    unitCode: 'шт',
    currency: 'UAH',
    purchasePrice: dec(120.5),
    rrp: dec(180),
    multiplicity: dec(1),
    minOrderQty: null,
    stockQty: dec(5),
    availability: 'in_stock',
    barcode: null,
    categoryPath: null,
    imageUrl: null,
    productUrl: null,
    notes: null,
    priceOrigin: 'import',
    priceUpdatedAt: new Date(NOW.getTime() - DAY_MS),
    missingSince: null,
    isArchived: false,
    createdAt: new Date('2026-08-01T09:00:00.000Z'),
    updatedAt: NOW,
    ...part,
  };
}

function context(part: Partial<CatalogContext> = {}): CatalogContext {
  return {
    now: NOW,
    staleDays: 14,
    nbu: { USD: 42, EUR: 49 },
    suppliers: new Map([['sup-1', supplier()]]),
    ...part,
  };
}

describe('товар у DTO', () => {
  it('Decimal стає числом, дати — рядками ISO', () => {
    const dto = toProductDetail(product({ minOrderQty: dec(3), missingSince: new Date('2026-09-10T00:00:00.000Z') }), context());
    expect(dto.purchasePrice).toBe(120.5);
    expect(dto.rrp).toBe(180);
    expect(dto.multiplicity).toBe(1);
    expect(dto.stockQty).toBe(5);
    expect(dto.minOrderQty).toBe(3);
    expect(dto.missingSince).toBe('2026-09-10');
    expect(dto.createdAt).toBe('2026-08-01T09:00:00.000Z');
    expect(dto.supplierName).toBe('Пласт-Сервіс');
    expect(dto.priceSource).toBe('import');
  });

  it('гривня — без перерахунку, валюта — за курсом постачальника з прайсу', () => {
    expect(toProductDetail(product(), context()).purchasePriceUah).toBe(120.5);

    const ctx = context({
      suppliers: new Map([['sup-1', supplier({ ratePolicy: 'price_list', priceListRateUsd: dec(41.5) })]]),
    });
    expect(toProductDetail(product({ currency: 'USD', purchasePrice: dec(100) }), ctx).purchasePriceUah).toBe(4150);
  });

  it('курсу постачальника немає — беремо НБУ; немає й НБУ — ціни в гривні теж немає', () => {
    const nbuOnly = context({ suppliers: new Map([['sup-1', supplier({ ratePolicy: 'nbu' })]]) });
    expect(toProductDetail(product({ currency: 'USD', purchasePrice: dec(10) }), nbuOnly).purchasePriceUah).toBe(420);

    const noRates = context({ nbu: { USD: null, EUR: null } });
    expect(toProductDetail(product({ currency: 'EUR', purchasePrice: dec(10) }), noRates).purchasePriceUah).toBeNull();
    expect(toProductDetail(product({ purchasePrice: null }), context()).purchasePriceUah).toBeNull();
  });

  it('норма застарілості постачальника важливіша за загальну', () => {
    const old = product({ priceUpdatedAt: new Date(NOW.getTime() - 20 * DAY_MS) });
    expect(toProductDetail(old, context({ staleDays: 30 })).isStale).toBe(false);

    const strict = context({
      staleDays: 30,
      suppliers: new Map([['sup-1', supplier({ priceStaleDays: 7 })]]),
    });
    expect(toProductDetail(old, strict).isStale).toBe(true);
    expect(toProductDetail(product({ priceUpdatedAt: null }), strict).isStale).toBe(false);
  });

  it('постачальника немає в контексті — прочерк замість назви', () => {
    expect(toProductDetail(product(), context({ suppliers: new Map() })).supplierName).toBe('—');
  });

  it('позиція списку — без полів картки', () => {
    const item = toProductListItem(toProductDetail(product(), context()));
    expect(item).not.toHaveProperty('notes');
    expect(item).not.toHaveProperty('priceSource');
    expect(item).toHaveProperty('supplierName');
  });
});

describe('історія цін у DTO', () => {
  const user: User = {
    id: 'usr-1',
    login: 'koval',
    passwordHash: null,
    fullName: 'Коваль Олександр',
    shortName: 'Коваль О.В.',
    role: 'user',
    email: null,
    phone: null,
    isActive: true,
    lastLoginAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };

  function entry(part: Partial<PriceHistoryRow> = {}): PriceHistoryRow {
    return {
      id: 7,
      productId: 'prd-1',
      effectiveAt: NOW,
      currency: 'USD',
      purchasePrice: dec(10.25),
      rrp: null,
      stockQty: dec(4),
      availability: 'in_stock',
      origin: 'manual',
      importRunId: null,
      userId: user.id,
      note: 'Уточнили в постачальника',
      user,
      ...part,
    };
  }

  it('користувач згортається до id + короткого імені, Decimal — до числа', () => {
    expect(toPriceHistoryEntry(entry())).toEqual({
      id: 7,
      productId: 'prd-1',
      effectiveAt: '2026-09-16T12:00:00.000Z',
      currency: 'USD',
      purchasePrice: 10.25,
      rrp: null,
      stockQty: 4,
      availability: 'in_stock',
      source: 'manual',
      importId: null,
      requestId: null,
      requestNumber: null,
      user: { id: 'usr-1', shortName: 'Коваль О.В.' },
      note: 'Уточнили в постачальника',
    });
  });

  it('запис від оновлення прайсу — без користувача, з номером оновлення', () => {
    const dto = toPriceHistoryEntry(entry({ origin: 'import', user: null, userId: null, importRunId: 42, note: null }));
    expect(dto).toMatchObject({ source: 'import', user: null, importId: '42', note: null });
  });
});
