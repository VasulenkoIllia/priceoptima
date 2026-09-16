// @vitest-environment node
import { Prisma } from '@prisma/client';
import type { Supplier, SupplierPriceFeed } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { hostOf, toPriceSource, toPriceSourceSettings, toSupplierListItem } from '../modules/suppliers/suppliers.mapper';

const dec = (v: string) => new Prisma.Decimal(v);

const supplier: Supplier = {
  id: 'f2a1c0de-0000-4000-8000-000000000001',
  name: 'Дніпро-Сантехніка',
  color: '#1677ff',
  logoUrl: null,
  defaultCurrency: 'EUR',
  pricesIncludeVat: false,
  rrpIncludesVat: true,
  supplierMarkupPct: dec('2.5'),
  ratePolicy: 'nbu_adjusted',
  rateAdjustPct: dec('1.25'),
  manualRateUsd: dec('44.9000'),
  manualRateEur: null,
  manualRatesDate: new Date('2026-09-10T00:00:00.000Z'),
  priceListRateUsd: dec('44.5500'),
  priceListRateEur: dec('51.9000'),
  priceListRateDate: new Date('2026-09-11T00:00:00.000Z'),
  minOrderAmount: dec('5000.00'),
  priceStaleDays: 5,
  searchUrlTemplate: 'https://example.com/search?q={query}',
  website: 'example.com',
  b2bUrl: null,
  notes: 'Самовивіз зі складу',
  deliveryInfo: 'Нова пошта',
  isActive: true,
  sortOrder: 3,
  lastImportAt: new Date('2026-09-15T06:12:00.000Z'),
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-15T06:12:00.000Z'),
};

const feed: SupplierPriceFeed = {
  supplierId: supplier.id,
  kind: 'auto',
  format: 'yml',
  url: 'https://feed.example.com:8443/price.yml?token=дуже-секретний',
  auth: 'bearer',
  secret: 'v1.aaa.bbb.ccc',
  scheduleHour: 6,
  hasPurchasePrice: true,
  columnMapping: null,
  note: 'Оновлення щоранку',
  lastError: null,
  lastErrorAt: null,
  failCount: 0,
  updatedAt: new Date('2026-09-15T06:12:00.000Z'),
};

describe('хост вигрузки', () => {
  it('береться з посилання разом із портом', () => {
    expect(hostOf('https://feed.example.com:8443/price.yml?token=x')).toBe('feed.example.com:8443');
    expect(hostOf('https://b2b.example.com/export')).toBe('b2b.example.com');
  });

  it('порожнє або зіпсоване посилання — немає хоста', () => {
    expect(hostOf(null)).toBeNull();
    expect(hostOf('')).toBeNull();
    expect(hostOf('не посилання')).toBeNull();
  });
});

describe('джерело прайсу', () => {
  it('назовні не йдуть ні посилання, ні токен', () => {
    const source = toPriceSource(feed);
    expect(source).toEqual({
      kind: 'auto',
      format: 'yml',
      host: 'feed.example.com:8443',
      scheduleHour: 6,
      hasPurchasePrice: true,
      note: 'Оновлення щоранку',
    });
    expect(JSON.stringify(source)).not.toContain('token');
    expect(JSON.stringify(source)).not.toContain('секретний');
    expect(JSON.stringify(source)).not.toContain(feed.secret);
  });

  it('без налаштованої вигрузки прайс вважається файловим', () => {
    expect(toPriceSource(null)).toEqual({
      kind: 'manual',
      format: null,
      host: null,
      scheduleHour: null,
      hasPurchasePrice: true,
      note: null,
    });
  });

  it('у відповіді на збереження видно лише сам факт збереженого токена', () => {
    expect(toPriceSourceSettings(feed).hasSecret).toBe(true);
    expect(toPriceSourceSettings({ ...feed, secret: null, auth: 'none' }).hasSecret).toBe(false);
    expect(Object.keys(toPriceSourceSettings(feed))).not.toContain('secret');
    expect(Object.keys(toPriceSourceSettings(feed))).not.toContain('url');
  });
});

describe('постачальник у списку', () => {
  it('гроші й відсотки стають звичайними числами, дати — рядками', () => {
    const item = toSupplierListItem({ ...supplier, feed }, 128);
    expect(item.supplierMarkupPct).toBe(2.5);
    expect(item.rateAdjustPct).toBe(1.25);
    expect(item.manualRateUsd).toBe(44.9);
    expect(item.manualRateEur).toBeNull();
    expect(item.minOrderAmount).toBe(5000);
    expect(item.priceListRates).toEqual({ USD: 44.55, EUR: 51.9, date: '2026-09-11' });
    expect(item.lastImportAt).toBe('2026-09-15T06:12:00.000Z');
    expect(item.productsCount).toBe(128);
    expect(item.ratePolicy).toBe('nbu_adjusted');
    expect(item.defaultCurrency).toBe('EUR');
  });

  it('невідоме значення з бази замінюється значенням за замовчуванням', () => {
    const item = toSupplierListItem({ ...supplier, ratePolicy: 'старе' as Supplier['ratePolicy'], feed: null }, 0);
    expect(item.ratePolicy).toBe('price_list');
  });
});
