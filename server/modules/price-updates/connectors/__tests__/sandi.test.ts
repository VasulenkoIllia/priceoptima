// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSandiJson } from '../sandi';
import { NO_PURCHASE_PRICES_WARNING } from '../collect';
import type { PriceRow } from '../types';

const FIXTURE = readFileSync(new URL('./fixtures/sandi.json', import.meta.url), 'utf8');
const IMG = 'https://media.supplier-a.example/imagecache/large';

type Feed = { products: Record<string, { main?: Record<string, unknown> }> };

/** Копія вигрузки з правками — для випадків, яких немає у справжньому файлі. */
function feedWith(change: (feed: Feed) => void): string {
  const feed = JSON.parse(FIXTURE) as Feed;
  change(feed);
  return JSON.stringify(feed);
}

const byCode = (rows: PriceRow[], code: string) => rows.find((r) => r.code === code);

describe('вигрузка САНДІ (JSON)', () => {
  it('усі товари вигрузки стають рядками, попереджень немає', () => {
    const { rows, warnings, rates } = parseSandiJson(FIXTURE);
    expect(rows.map((r) => r.code)).toEqual(['TS10045201', 'TS10045302', 'TS10045403', 'TS10045504', 'TS10045605']);
    expect(warnings).toEqual([]);
    expect(rates).toBeUndefined();
  });

  it('поля товару: код, артикул, ціни, залишок, бренд, категорія, фото; нерозривні пробіли в назві — звичайні', () => {
    const row = byCode(parseSandiJson(FIXTURE).rows, 'TS10045201');
    expect(row).toEqual({
      code: 'TS10045201',
      sku: 'TS74001',
      name: 'Шнур тефлоновий Prime 40 м для гермет. різьб. з’єднань TS74001 DemoBrand',
      brand: 'DemoBrand',
      unitCode: null,
      purchasePrice: 41.3,
      currency: 'UAH',
      rrp: 78,
      stockQty: 99,
      availability: 'in_stock',
      multiplicity: null,
      minOrderQty: null,
      barcode: '4820001000015',
      categoryPath: 'Ущільнювальні матеріали / Нитка пакувальна',
      imageUrls: [
        `${IMG}/2/0/20001.jpg?v=ea69f1511c7804b95dc811c443abac92?hash=ea69f1511c7804b95dc811c443abac92`,
        `${IMG}/2/0/20001/20001_2.jpg?v=ea69f1511c7804b95dc811c443abac92?hash=ea69f1511c7804b95dc811c443abac92`,
        `${IMG}/2/0/20001/20001_3.jpg?v=ea69f1511c7804b95dc811c443abac92?hash=ea69f1511c7804b95dc811c443abac92`,
      ],
    });
  });

  it('порожній vendorCode — артикул із характеристики «Артикул»; additional буває порожнім масивом', () => {
    const row = byCode(parseSandiJson(FIXTURE).rows, 'TS10045302');
    expect(row).toMatchObject({
      sku: 'TSK522',
      categoryPath: 'Труби і фітинги / Труби і фітинги PPR / PPR труби',
      purchasePrice: 19.84,
      rrp: 55,
    });
    expect(row?.imageUrls).toHaveLength(1);
  });

  it('залишок до 5 — «мало»; фото не більше п’яти, головне першим', () => {
    const row = byCode(parseSandiJson(FIXTURE).rows, 'TS10045403');
    expect(row).toMatchObject({ stockQty: 3, availability: 'low_stock' });
    expect(row?.imageUrls).toHaveLength(5);
    expect(row?.imageUrls[0]).toContain('/2/0/20003.jpg?');
    expect(row?.imageUrls[1]).toContain('/20003_1.jpg?');
  });

  it('нульовий залишок — «немає»; головного фото немає, пробіли в посиланні кодуються', () => {
    const row = byCode(parseSandiJson(FIXTURE).rows, 'TS10045504');
    expect(row).toMatchObject({ stockQty: 0, availability: 'out_of_stock', brand: 'DemoBrand2' });
    expect(row?.imageUrls).toEqual([
      `${IMG}/2/0/20004%20/20004%20_2.jpg?v=ce41b45ede8f1d4ab100a663595fc058?hash=ce41b45ede8f1d4ab100a663595fc058`,
      `${IMG}/2/0/20004%20/20004%20_3.jpg?v=ce41b45ede8f1d4ab100a663595fc058?hash=ce41b45ede8f1d4ab100a663595fc058`,
    ]);
  });

  it('дробові ціни й порожній штрихкод', () => {
    const row = byCode(parseSandiJson(FIXTURE).rows, 'TS10045605');
    expect(row).toMatchObject({ purchasePrice: 0.95, rrp: 1.45, barcode: null, sku: 'TST016' });
  });

  it('джерело без закупівельних цін: лише РРЦ і попередження', () => {
    const { rows, warnings } = parseSandiJson(FIXTURE, { hasPurchasePrice: false });
    expect(rows.every((r) => r.purchasePrice === null && r.rrp !== null)).toBe(true);
    expect(warnings).toEqual([NO_PURCHASE_PRICES_WARNING]);
  });

  it('товари без коду пропускаються й рахуються', () => {
    const body = feedWith((feed) => {
      feed.products.TS10045201.main!.sku = ' ';
      delete feed.products.TS10045302.main;
    });
    const { rows, warnings } = parseSandiJson(body);
    expect(rows.map((r) => r.code)).toEqual(['TS10045403', 'TS10045504', 'TS10045605']);
    expect(warnings).toEqual(['Пропущено позицій без коду: 2']);
  });

  it('повтор коду: лишається перший рядок', () => {
    const body = feedWith((feed) => {
      const copy = structuredClone(feed.products.TS10045201);
      copy.main!.balance = 1;
      feed.products['TS10045201-copy'] = copy;
    });
    const { rows, warnings } = parseSandiJson(body);
    expect(rows).toHaveLength(5);
    expect(byCode(rows, 'TS10045201')?.stockQty).toBe(99);
    expect(warnings).toEqual(['Повтори коду: 1, узято перший рядок (TS10045201)']);
  });

  it('частина позицій без закупівельної ціни', () => {
    const body = feedWith((feed) => {
      feed.products.TS10045201.main!.prices = { retail: { current: '78' }, purchase: { cash: { current: null } } };
    });
    expect(parseSandiJson(body).warnings).toEqual(['Позицій без закупівельної ціни: 1']);
  });

  it('битий JSON або без розділу products — зрозуміла помилка', () => {
    expect(() => parseSandiJson('{"products": ')).toThrow('Вигрузка САНДІ не є коректним JSON');
    expect(() => parseSandiJson('{"date": "2026-09-16"}')).toThrow('немає розділу products');
  });
});
