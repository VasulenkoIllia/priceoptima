import { describe, expect, it } from 'vitest';
import { REQUEST_STATUSES } from '@shared/enums';
import { approvedTotalsFromKp, computeRequest, latestBaseKp, pricingSettingsFrom } from '@shared/pricing';
import { SEED_VERSION, buildSeedDb, OWN_COMPANY_IDS, requestIdOf, supplierRefsOf } from '../seed';
import { TEST_NOW } from '@/test/mockEnv';

const db = buildSeedDb({ now: new Date(TEST_NOW), overrides: null, logos: {}, fingerprint: 'test' });

describe('сід демо-БД', () => {
  it('версія сіду й відбиток БД', () => {
    expect(db.seedVersion).toBe(SEED_VERSION);
    expect(db.fingerprint).toBe('test');
  });

  it('6 демо-заявок у 3 статусах, лічильники заявок і КП (демо-КП 2110–2113, нове — з 2114)', () => {
    const requests = Object.values(db.requests);
    expect(requests).toHaveLength(6);
    expect(new Set(requests.map((r) => r.header.status))).toEqual(new Set(REQUEST_STATUSES));
    expect(requests.map((r) => r.header.number).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(db.settings.nextRequestNumber).toBe(7);
    const withKp = requests.filter((r) => r.meta.kpCount > 0).length;
    expect(withKp).toBe(3);
    expect(db.settings.nextKpNumber).toBe(2114);
    const numbers = Object.values(db.kps)
      .flat()
      .map((k) => k.kpNumber)
      .sort();
    expect(numbers).toEqual([2110, 2111, 2112, 2113]);
  });

  it('000002 «Виконано»: КП-основа і фінальне КП лише з погоджених рядків; історія від створення до статусу', () => {
    const id = requestIdOf(2);
    const r = db.requests[id];
    const [base, fin] = db.kps[id];
    expect(base.onlyApproved).toBe(false);
    expect(fin.onlyApproved).toBe(true);
    expect(fin.snapshot.final).toBe(true);
    const approved = r.lines.filter((l) => l.approval.approved).length;
    expect(fin.snapshot.rows).toHaveLength(approved);
    expect(fin.totalGross).toBe(r.totals.approvedSaleGross);
    const kinds = db.events[id].map((e) => e.kind);
    expect(kinds[0]).toBe('created');
    expect(kinds[kinds.length - 1]).toBe('status_change');
    expect(kinds).toContain('kp_created');
    expect(kinds).toContain('approval');
    for (const req of Object.values(db.requests)) expect(db.events[req.id]?.[0]?.kind).toBe('created');
  });

  it('журнал оновлень прайсів: запис на кожного постачальника', () => {
    expect(db.priceUpdates).toHaveLength(4);
    for (const u of db.priceUpdates) {
      expect(u.productsTotal).toBeGreaterThan(100);
      expect(u.changed).toBe(u.priceUp + u.priceDown);
    }
  });

  it('блокування: TTL 180 с і heartbeat 20 с (стійкість до гальмування таймерів у фонових вкладках)', () => {
    expect(db.settings.lockTtlSeconds).toBe(180);
    expect(db.settings.lockHeartbeatSeconds).toBe(20);
  });

  it('заявка 000001: ~40 рядків, 3 блоки, частина затверджена, 1 виключена, труба 118 → 120', () => {
    const r = db.requests[requestIdOf(1)];
    expect(r.lines.length).toBeGreaterThanOrEqual(38);
    expect(r.lines.length).toBeLessThanOrEqual(42);
    expect(r.blocks).toHaveLength(3);
    expect(r.header.status).toBe('in_progress');
    const approved = r.lines.filter((l) => l.selection.blockId).length;
    expect(approved).toBeGreaterThan(5);
    expect(approved).toBeLessThan(r.lines.length);
    expect(r.offers.filter((o) => o.excluded)).toHaveLength(1);

    const pipe = r.lines.find((l) => l.qty === 118);
    expect(pipe).toBeDefined();
    const pipeOffers = r.offers.filter((o) => o.lineId === pipe!.id);
    expect(pipeOffers.length).toBeGreaterThan(0);
    for (const o of pipeOffers) {
      expect(o.multiplicity).toBe(4);
      expect(o.qty).toBe(120);
    }
  });

  it('блоки мають курси за F33 (з прайсу постачальника), пропозиції — знімки товарів', () => {
    const r = db.requests[requestIdOf(1)];
    for (const b of r.blocks) {
      const s = db.suppliers.find((x) => x.id === b.supplierId)!;
      expect(b.rateSource).toBe('price_list');
      expect(b.rates.USD).toBe(s.priceListRates.USD);
      expect(b.rates.EUR).toBe(s.priceListRates.EUR);
    }
    for (const o of r.offers) {
      const p = db.products[o.productId!];
      expect(p).toBeDefined();
      expect(o.sku).toBe(p.sku);
      expect(o.purchasePriceCur).toBe(p.purchasePrice);
      expect(o).not.toHaveProperty('catalog');
    }
  });

  it('довідники: користувачі, юрособи, постачальники, клієнти, курси, історія цін', () => {
    expect(db.users.map((u) => [u.shortName, u.role])).toEqual([
      ['Коваль О.В.', 'user'],
      ['Бондар І.С.', 'user'],
      ['Адміністратор', 'admin'],
    ]);
    const own = Object.fromEntries(db.ownCompanies.map((c) => [c.id, c]));
    expect(own[OWN_COMPANY_IDS.main].isVatPayer).toBe(true);
    expect(own[OWN_COMPANY_IDS.fop].isVatPayer).toBe(false);
    expect(own[OWN_COMPANY_IDS.main].nameShort).toContain('ДЕМО ТРЕЙД');

    expect(db.suppliers).toHaveLength(4);
    for (const s of db.suppliers) {
      expect(s.priceListRates.USD).toBeGreaterThan(40);
      expect(s.priceListRates.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.logoUrl).toMatch(/^data:image\/svg\+xml/);
    }

    const clients = Object.values(db.clients);
    expect(clients).toHaveLength(6);
    for (const c of clients) {
      expect(c.counterparties.length).toBeGreaterThan(0);
      expect(c.contacts.length).toBeGreaterThan(0);
    }

    expect(db.rates).toHaveLength(61 * 2);
    for (const r of db.rates) {
      const [lo, hi] = r.currency === 'USD' ? [44.5, 45] : [51.7, 52.2];
      expect(r.rate).toBeGreaterThanOrEqual(lo);
      expect(r.rate).toBeLessThanOrEqual(hi);
    }

    const products = Object.values(db.products);
    expect(products.length).toBeGreaterThan(1000);
    const withHistory = products.filter((p) => (db.priceHistory[p.id]?.length ?? 0) > 1).length;
    expect(withHistory).toBeGreaterThan(50);
  });

  it('збережені підсумки збігаються з живим розрахунком; є погоджена сума', () => {
    const suppliers = supplierRefsOf(db);
    for (const r of Object.values(db.requests)) {
      const live = computeRequest(r, { now: new Date(TEST_NOW), settings: pricingSettingsFrom(db.settings), suppliers });
      expect(r.totals).toEqual(live.totals);
    }
    expect(db.requests[requestIdOf(2)].totals.approvedSaleGross).not.toBeNull();
    expect(db.requests[requestIdOf(1)].totals.totalSaleGross).toBeGreaterThan(0);
  });

  it('ПОГ-1: погоджена сума — за цінами КП-основи (останнє звичайне КП)', () => {
    for (const id of [requestIdOf(2), requestIdOf(6)]) {
      const r = db.requests[id];
      const base = latestBaseKp(db.kps[id]);
      expect(base).not.toBeNull();
      const expected = approvedTotalsFromKp(base!.snapshot, r.lines);
      expect(expected!.rows.length).toBeGreaterThan(0);
      expect(r.totals.approvedSaleGross).toBe(expected!.totalGross);
    }
  });

  it('AC-НОМ-3: заявка 000004 має пропозицію арт. 123 зі знімком, що розходиться з каталогом', () => {
    const r = db.requests[requestIdOf(4)];
    const offer = r.offers.find((o) => o.sku === 'СІ0000123');
    expect(offer).toBeDefined();
    expect(offer!.purchasePriceCur).toBe(8.45);
    const product = Object.values(db.products).find((p) => p.sku === 'СІ0000123')!;
    expect(product.purchasePrice).toBe(8.602);
    expect(product.purchasePrice).not.toBe(offer!.purchasePriceCur);
  });
});
