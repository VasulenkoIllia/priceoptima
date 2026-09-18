import { afterEach, describe, expect, it } from 'vitest';
import { computeRequest, kpChecks, pricingSettingsFrom } from '@shared/pricing';
import { DataSourceError } from '@/data/errors';
import { createTestEnv, TEST_NOW, type TestEnv } from '@/test/mockEnv';
import { buildSeedDb, DEMO_USER_IDS, requestIdOf, supplierIdOf, supplierRefsOf } from '../seed';

const REQ1 = requestIdOf(1);
let env: TestEnv;

afterEach(() => env?.dispose());

async function loggedTab(label = 'a', userId: string = DEMO_USER_IDS.koval) {
  return env.tab(label, userId);
}

/** Вкладка, що редагує 000001 (тримає блокування). */
async function editorTab() {
  const tab = await loggedTab();
  expect((await tab.acquireLock(REQ1)).acquired).toBe(true);
  return tab;
}

describe('КП, історія заявки, прайси (mock)', () => {
  it('демо-заявка 000001: більшість позицій піде в КП; позиції без РРЦ (метод «по РРЦ») — без ціни, не блокують', () => {
    const db = buildSeedDb({ now: new Date(TEST_NOW), overrides: null, logos: {}, fingerprint: 'test' });
    const r = db.requests[REQ1];
    const computed = computeRequest(r, { now: new Date(TEST_NOW), settings: pricingSettingsFrom(db.settings), suppliers: supplierRefsOf(db) });
    const checks = kpChecks(r.lines, computed);
    expect(checks.inKp).toBeGreaterThan(20);
    expect(checks.noPrice).toBeLessThan(checks.inKp);
  });

  it('КП: номер сталий «2114 / номер заявки», знімок, реєстр, історія; без блокування — помилка', async () => {
    env = createTestEnv();
    const viewer = await loggedTab('b', DEMO_USER_IDS.bondar);
    const tab = await editorTab();
    const doc = await tab.getRequestDocument(REQ1);
    await expect(viewer.createKp(REQ1, { settings: doc.header.kpSettings, sessionId: viewer.sessionId })).rejects.toBeInstanceOf(DataSourceError);

    const kp = await tab.createKp(REQ1, { settings: doc.header.kpSettings, sessionId: tab.sessionId });
    expect(kp.kpNumber).toBe(2114);
    expect(kp.numberLabel).toBe('2114 / 000001');
    expect(kp.snapshot.rows.length).toBeGreaterThan(10);
    expect(kp.totalGross).toBe(kp.snapshot.totals.totalGross);
    // номер не витрачається: наступне КП цієї чи іншої заявки теж 2114
    expect((await tab.getSettings()).nextKpNumber).toBe(2114);

    const [item] = await tab.listRequests({ search: '000001' });
    expect(item.kpCount).toBe(1);
    expect(item.lastKp).toEqual({ kpNumber: 2114, final: false });
    expect((await tab.listKps(REQ1)).map((k) => k.kpNumber)).toEqual([2114]);
    const { events } = await tab.getRequestHistory(REQ1);
    expect(events[0].kind).toBe('kp_created');
    expect(events[0].summary).toContain('2114 / 000001');
  });

  it('фінальне КП: лише погоджені рядки КП-основи; без погоджених — помилка; погоджена сума в реєстрі', async () => {
    env = createTestEnv();
    const tab = await editorTab();
    const doc = await tab.getRequestDocument(REQ1);
    const base = await tab.createKp(REQ1, { settings: doc.header.kpSettings, sessionId: tab.sessionId });
    await expect(tab.createKp(REQ1, { settings: doc.header.kpSettings, final: true, sessionId: tab.sessionId })).rejects.toBeInstanceOf(DataSourceError);

    const [r1, r2] = base.snapshot.rows;
    const approvedLines = doc.lines
      .filter((l) => l.id === r1.lineId || l.id === r2.lineId)
      .map((l) => ({ ...l, approval: { approved: true, approvedQty: l.id === r2.lineId ? 1 : null } }));
    await tab.saveRequestDocument(REQ1, { baseVersion: doc.version, sessionId: tab.sessionId, upsert: { lines: approvedLines } });

    const fin = await tab.createKp(REQ1, { settings: doc.header.kpSettings, final: true, sessionId: tab.sessionId });
    expect(fin.kpNumber).toBe(base.kpNumber);
    expect(fin.version).toBe(base.version + 1);
    expect(fin.onlyApproved).toBe(true);
    expect(fin.snapshot.final).toBe(true);
    expect(fin.snapshot.rows.map((r) => r.lineId)).toEqual([r1.lineId, r2.lineId]);
    expect(fin.snapshot.rows[1].qty).toBe(1);

    const [item] = await tab.listRequests({ search: '000001' });
    expect(item.approvedSaleGross).toBe(fin.totalGross);
    expect(item.lastKp).toEqual({ kpNumber: fin.kpNumber, final: true });
    const kinds = (await tab.getRequestHistory(REQ1)).events.map((e) => e.kind);
    expect(kinds).toContain('approval');
  });

  it('статус: подія історії з причиною скасування', async () => {
    env = createTestEnv();
    const tab = await editorTab();
    const doc = await tab.getRequestDocument(REQ1);
    await tab.changeStatus(REQ1, { to: 'cancelled', reason: 'Клієнт відмовився', baseVersion: doc.version, sessionId: tab.sessionId });
    const [last] = (await tab.getRequestHistory(REQ1)).events;
    expect(last.kind).toBe('status_change');
    expect(last.summary).toContain('Клієнт відмовився');
  });

  it('копія заявки: подія «копія» в історії нової заявки, КП не копіюються', async () => {
    env = createTestEnv();
    const tab = await loggedTab();
    const res = await tab.copyRequest(requestIdOf(2), { include: 'full', priceMode: 'refresh' });
    const { events } = await tab.getRequestHistory(res.id);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('copy');
    expect(events[0].summary).toContain('000002');
    expect(await tab.listKps(res.id)).toEqual([]);
  });

  it('оновлення прайсу: дата ціни — зараз, зміни з історією; товари, додані вручну, не чіпає', async () => {
    env = createTestEnv();
    const tab = await loggedTab();
    const supplierId = supplierIdOf('s1');
    const manual = await tab.createProduct({ supplierId, sku: 'ТЕСТ-1', nameWork: 'Тестовий товар', unitCode: 'шт', currency: 'UAH', purchasePrice: 100, rrp: 150 });
    const res = await tab.refreshSupplierPrices(supplierId);
    expect(res.productsTotal).toBeGreaterThan(100);
    expect(res.changed).toBe(res.priceUp + res.priceDown);
    expect(res.user?.shortName).toBe('Коваль О.В.');

    const products = await tab.listProducts({ supplierId });
    const m = products.find((p) => p.id === manual.id)!;
    expect(m.priceSource).toBe('manual');
    expect(m.purchasePrice).toBe(100);
    expect(products.filter((p) => p.priceSource !== 'manual').every((p) => !p.isStale)).toBe(true);
    expect((await tab.listPriceUpdates(supplierId))[0].id).toBe(res.id);
  });

  it('загальний ручний курс: за ту саму дату замінює НБУ; повторний на ту саму дату замінює попередній', async () => {
    env = createTestEnv();
    const tab = await loggedTab();
    const today = (await tab.listRates()).map((r) => r.rateDate).sort().at(-1)!;
    const nbu = (await tab.getRates(today)).USD!;
    expect(nbu.source).toBe('nbu');
    await tab.addManualRate({ currency: 'USD', rateDate: today, rate: 41.5 });
    await tab.addManualRate({ currency: 'USD', rateDate: today, rate: 41.75, note: 'узгоджений' });
    const eff = (await tab.getRates(today)).USD!;
    expect(eff).toMatchObject({ rate: 41.75, source: 'manual', rateDate: today });
    expect((await tab.listRates()).filter((r) => r.source === 'manual')).toHaveLength(1);
    await expect(tab.addManualRate({ currency: 'EUR', rateDate: today, rate: 0 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('каталог: фільтри постачальника, пошуку й застарілих цін', async () => {
    env = createTestEnv();
    const tab = await loggedTab();
    const all = await tab.listProducts();
    expect(all.length).toBeGreaterThan(1000);
    const s2 = await tab.listProducts({ supplierId: supplierIdOf('s2') });
    expect(s2.length).toBeGreaterThan(0);
    expect(s2.every((p) => p.supplierId === supplierIdOf('s2'))).toBe(true);
    expect((await tab.listProducts({ search: all[0].sku })).some((p) => p.id === all[0].id)).toBe(true);
    expect((await tab.listProducts({ stale: true })).every((p) => p.isStale)).toBe(true);
  });

  it('сторінка номенклатури: загальна кількість, зсув і сортування (порожні ціни — в кінці)', async () => {
    env = createTestEnv();
    const tab = await loggedTab();
    const all = await tab.listProducts();
    const first = await tab.listProductsPage({ offset: 0, limit: 50 });
    expect(first.total).toBe(all.length);
    expect(first.items.map((p) => p.id)).toEqual(all.slice(0, 50).map((p) => p.id));
    const second = await tab.listProductsPage({ offset: 50, limit: 50 });
    expect(second.items[0].id).toBe(all[50].id);

    const byPrice = await tab.listProductsPage({ offset: 0, limit: all.length, sortField: 'purchasePrice', sortDir: 'desc' });
    const prices = byPrice.items.map((p) => p.purchasePrice);
    const known = prices.filter((v): v is number => v != null);
    expect(known).toEqual([...known].sort((a, b) => b - a));
    expect(prices.slice(known.length).every((v) => v == null)).toBe(true);
  });
});
