import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryChannelHub } from '@/data/channel';
import type { DataSourceEvent } from '@/data/DataSource';
import { DataSourceError } from '@/data/errors';
import { MemoryStorage } from '@/data/storage';
import { createTestEnv, TEST_NOW, type TestEnv } from '@/test/mockEnv';
import { sha256Hex } from '../auth';
import { DB_SCHEMA_VERSION } from '../db';
import { MockDataSource } from '../MockDataSource';
import { overridesFingerprint, type SeedOverrides } from '../overrides';
import { memoryPersistence, type DbPersistence } from '../persistence';
import { DEMO_USER_IDS, requestIdOf, SEED_VERSION, supplierIdOf } from '../seed';

const REQ1 = requestIdOf(1);
let env: TestEnv;

afterEach(() => env?.dispose());

async function loggedTab(label: string, userId: string) {
  return env.tab(label, userId);
}

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(DataSourceError);
  await p.catch((e: DataSourceError) => expect(e.code).toBe(code));
}

describe('MockDataSource — сесія і дані', () => {
  it('без входу — UNAUTHORIZED; вхід лише логіном і паролем облікового запису із сіду; вихід', async () => {
    env = createTestEnv();
    const tab = env.tab('a');
    expect(await tab.me()).toBeNull();
    await expectCode(tab.listRequests(), 'UNAUTHORIZED');
    expect(await tab.listUsers()).toHaveLength(3);
    await expectCode(tab.login('admin', 'не той'), 'UNAUTHORIZED');
    // решта користувачів — довідник відповідальних, без пароля
    await expectCode(tab.login('koval', 'admin'), 'UNAUTHORIZED');
    const me = await tab.login(' admin ', 'admin');
    expect(me.user).toMatchObject({ id: DEMO_USER_IDS.admin, role: 'admin' });
    expect(me.user.lastLoginAt).not.toBeNull();
    expect((await tab.me())?.user.id).toBe(DEMO_USER_IDS.admin);
    await tab.logout();
    expect(await tab.me()).toBeNull();
    await expectCode(tab.listRequests(), 'UNAUTHORIZED');
  });

  it('реєстр: 6 заявок, пошук, фільтри статусу й відповідального', async () => {
    env = createTestEnv();
    const tab = await loggedTab('a', DEMO_USER_IDS.koval);
    const all = await tab.listRequests();
    expect(all.map((r) => r.numberLabel)).toEqual(['000006', '000005', '000004', '000003', '000002', '000001']);
    expect(all.every((r) => r.lock === null)).toBe(true);
    expect((await tab.listRequests({ search: '000001' })).map((r) => r.number)).toEqual([1]);
    const done = await tab.listRequests({ status: ['done'] });
    expect(done.every((r) => r.status === 'done')).toBe(true);
    const byManager = await tab.listRequests({ managerId: DEMO_USER_IDS.bondar });
    expect(byManager.length).toBeGreaterThan(0);
    expect(byManager.every((r) => r.manager.id === DEMO_USER_IDS.bondar)).toBe(true);
  });

  it('створення заявки: наскрізний номер, курси НБУ на дату, дефолтна юрособа', async () => {
    env = createTestEnv();
    const tab = await loggedTab('a', DEMO_USER_IDS.bondar);
    const { id, number } = await tab.createRequest({ clientId: 'cli-c2' });
    expect(number).toBe(7);
    const doc = await tab.getRequestDocument(id);
    expect(doc.header.status).toBe('in_progress');
    expect(doc.header.managerId).toBe(DEMO_USER_IDS.bondar);
    expect(doc.header.counterpartyId).not.toBeNull();
    expect(doc.header.rates.USD).toBeGreaterThan(44);
    expect(doc.refs.ownCompany.isVatPayer).toBe(true);
    expect(doc.lines).toHaveLength(0);
  });

  it('пошук товарів: точний артикул першим; назви; пошук за артикулами', async () => {
    env = createTestEnv();
    const tab = await loggedTab('a', DEMO_USER_IDS.koval);
    const doc = await tab.getRequestDocument(REQ1);
    const offer = doc.offers[0];
    const bySku = await tab.searchProducts({ q: offer.sku! });
    expect(bySku[0].matchKind).toBe('sku_exact');
    expect(bySku[0].id).toBe(offer.productId);
    expect(bySku[0].purchasePriceUah).toBeGreaterThan(0);

    const byText = await tab.searchProducts({ q: 'кран кульовий', limit: 10 });
    expect(byText.length).toBeGreaterThan(0);
    expect(byText[0].matchKind).toBe('text');

    const res = await tab.lookupSkus({ skus: [offer.sku!.toLowerCase(), 'НЕМАЄ-ТАКОГО'] });
    expect(res.results[offer.sku!.toLowerCase()][0].id).toBe(offer.productId);
    expect(res.results['НЕМАЄ-ТАКОГО']).toEqual([]);
  });

  it('ціну вручну змінюють лише в товарів, доданих вручну: історія; без змін — без запису; товар з прайсу — помилка', async () => {
    env = createTestEnv();
    const tab = await loggedTab('a', DEMO_USER_IDS.koval);
    const doc = await tab.getRequestDocument(REQ1);
    await expectCode(tab.updateProductPrice(doc.offers[0].productId!, { currency: 'UAH', purchasePrice: 1, rrp: null, source: 'manual' }), 'INVALID_STATE');

    const product = await tab.createProduct({ supplierId: 'sup-s1', sku: 'ТЕСТ-2', nameWork: 'Тестовий товар', unitCode: 'шт', currency: 'UAH', purchasePrice: 100, rrp: 150 });
    const historyBefore = await tab.getPriceHistory(product.id);
    const res = await tab.updateProductPrice(product.id, { currency: 'UAH', purchasePrice: 110, rrp: 160, source: 'manual' });
    expect(res.historyEntry?.user?.shortName).toBe('Коваль О.В.');
    expect(res.product).toMatchObject({ purchasePrice: 110, priceSource: 'manual' });
    const historyAfter = await tab.getPriceHistory(product.id);
    expect(historyAfter).toHaveLength(historyBefore.length + 1);
    expect(historyAfter[0].id).toBe(res.historyEntry!.id);
    const same = await tab.updateProductPrice(product.id, { currency: 'UAH', purchasePrice: 110, rrp: 160, source: 'manual' });
    expect(same.historyEntry).toBeNull();
    // вхід, введений з ПДВ (п.7 правок), зберігається без ПДВ
    const gross = await tab.updateProductPrice(product.id, { currency: 'UAH', purchasePrice: 144, priceIncludesVat: true, rrp: 160, source: 'manual' });
    expect(gross.product.purchasePrice).toBe(120);
    const created = await tab.createProduct({ supplierId: 'sup-s1', sku: 'ТЕСТ-3', nameWork: 'З ПДВ', unitCode: 'шт', currency: 'UAH', purchasePrice: 60, priceIncludesVat: true });
    expect(created.purchasePrice).toBe(50);
  });

  it('лічильники номерів можна лише збільшити; у демо є товари, додані вручну', async () => {
    env = createTestEnv();
    const admin = await loggedTab('a', DEMO_USER_IDS.admin);
    // номер КП — стала частина, його можна змінити в будь-який бік
    expect((await admin.updateSettings({ nextKpNumber: 2000 })).nextKpNumber).toBe(2000);
    await expectCode(admin.updateSettings({ nextKpNumber: 0 }), 'VALIDATION_ERROR');
    expect((await admin.updateSettings({ nextKpNumber: 2200 })).nextKpNumber).toBe(2200);
    const manual = (await admin.listProducts()).filter((p) => p.priceSource === 'manual');
    expect(manual.length).toBeGreaterThanOrEqual(3);
    expect((await admin.getPriceHistory(manual[0].id)).every((h) => h.source === 'manual')).toBe(true);
  });
});

describe('MockDataSource — синхронізація вкладок', () => {
  it('паралельні зміни у двох вкладках не губляться (спільна «IndexedDB»)', async () => {
    env = createTestEnv();
    const a = await loggedTab('a', DEMO_USER_IDS.koval);
    const b = await loggedTab('b', DEMO_USER_IDS.bondar);
    const events: DataSourceEvent[] = [];
    b.subscribe((e) => events.push(e));
    await a.acquireLock(REQ1);
    const doc = await a.getRequestDocument(REQ1);
    // обидві вкладки змінюють дані до того, як будь-яка записала їх у сховище
    await a.saveRequestDocument(REQ1, { baseVersion: doc.version, sessionId: a.sessionId, header: { notes: 'з вкладки A' } });
    const created = await b.createRequest({ title: 'з вкладки B' });
    await a.flushPersistence();
    await b.flushPersistence();
    await a.flushPersistence();
    expect(events.some((e) => e.kind === 'db')).toBe(true);
    for (const tab of [a, b]) {
      expect((await tab.getRequestDocument(REQ1)).header.notes).toBe('з вкладки A');
      expect((await tab.getRequestDocument(created.id)).header.title).toBe('з вкладки B');
    }
    const fresh = await loggedTab('c', DEMO_USER_IDS.admin);
    expect((await fresh.listRequests()).map((r) => r.number)).toContain(created.number);
    expect((await fresh.getRequestDocument(REQ1)).header.notes).toBe('з вкладки A');
  });
});

describe('MockDataSource — блокування', () => {
  it('друга сесія не отримує lock і не може зберегти; адмін забирає редагування', async () => {
    env = createTestEnv();
    const a = await loggedTab('a', DEMO_USER_IDS.koval);
    const b = await loggedTab('b', DEMO_USER_IDS.bondar);
    const admin = await loggedTab('admin', DEMO_USER_IDS.admin);
    const eventsA: DataSourceEvent[] = [];
    a.subscribe((e) => eventsA.push(e));

    const la = await a.acquireLock(REQ1);
    expect(la.acquired).toBe(true);
    expect(la.lock?.isMySession).toBe(true);

    const lb = await b.acquireLock(REQ1);
    expect(lb.acquired).toBe(false);
    expect(lb.lock?.userShortName).toBe('Коваль О.В.');
    expect(lb.lock?.isMySession).toBe(false);
    const docB = await b.getRequestDocument(REQ1);
    expect(docB.meta.readOnlyReason).toBe('lock');
    await expectCode(b.saveRequestDocument(REQ1, { baseVersion: docB.version, sessionId: b.sessionId, header: { notes: 'x' } }), 'LOCK_LOST');
    await expectCode(b.forceLock(REQ1), 'FORBIDDEN');

    const list = await b.listRequests({ search: '000001' });
    expect(list[0].lock?.userShortName).toBe('Коваль О.В.');

    const forced = await admin.forceLock(REQ1);
    expect(forced.isMySession).toBe(true);
    const ev = eventsA.find((e) => e.kind === 'lock-forced');
    expect(ev).toMatchObject({ kind: 'lock-forced', requestId: REQ1, fromSessionId: a.sessionId });
    await expectCode(a.heartbeat(REQ1), 'LOCK_LOST');
    await expectCode(a.saveRequestDocument(REQ1, { baseVersion: docB.version, sessionId: a.sessionId, header: { notes: 'x' } }), 'LOCK_LOST');
  });

  it('прострочене блокування (TTL 180 с — стійкість до гальмування таймерів у фонових вкладках) можна взяти іншій сесії; звільнення', async () => {
    env = createTestEnv();
    const a = await loggedTab('a', DEMO_USER_IDS.koval);
    const b = await loggedTab('b', DEMO_USER_IDS.bondar);
    expect((await a.acquireLock(REQ1)).acquired).toBe(true);
    env.clock.t += 20_000;
    await a.heartbeat(REQ1);
    env.clock.t += 20_000;
    expect((await b.acquireLock(REQ1)).acquired).toBe(false);
    env.clock.t += 181_000;
    expect((await b.acquireLock(REQ1)).acquired).toBe(true);
    await expectCode(a.heartbeat(REQ1), 'LOCK_LOST');
    await b.releaseLock(REQ1);
    expect((await a.getLockStatus(REQ1)).lock).toBeNull();
  });

  it('збереження дельти: версія, підсумки; інша вкладка бачить зміни; конфлікт версій', async () => {
    env = createTestEnv();
    const a = await loggedTab('a', DEMO_USER_IDS.koval);
    const b = await loggedTab('b', DEMO_USER_IDS.bondar);
    await a.acquireLock(REQ1);
    const doc = await a.getRequestDocument(REQ1);
    const line = doc.lines[0];
    const res = await a.saveRequestDocument(REQ1, {
      baseVersion: doc.version,
      sessionId: a.sessionId,
      header: { notes: 'Нотатка' },
      upsert: { lines: [{ ...line, clientName: 'Змінена назва' }] },
      delete: { lineIds: [doc.lines[1].id] },
    });
    expect(res.version).toBe(doc.version + 1);
    expect(res.totals.linesCount).toBe(doc.lines.length - 1);
    await a.flushPersistence();
    const seen = await b.getRequestDocument(REQ1);
    expect(seen.header.notes).toBe('Нотатка');
    expect(seen.lines.find((l) => l.id === line.id)?.clientName).toBe('Змінена назва');
    expect(seen.offers.some((o) => o.lineId === doc.lines[1].id)).toBe(false);
    await expectCode(a.saveRequestDocument(REQ1, { baseVersion: doc.version, sessionId: a.sessionId, header: { notes: 'y' } }), 'VERSION_CONFLICT');
  });

  it('статуси: скасування з причиною, «Виконано» — лише перегляд, перевідкриття', async () => {
    env = createTestEnv();
    const a = await loggedTab('a', DEMO_USER_IDS.koval);
    await a.acquireLock(REQ1);
    let doc = await a.getRequestDocument(REQ1);
    await expectCode(a.changeStatus(REQ1, { to: 'cancelled', reason: ' ', baseVersion: doc.version, sessionId: a.sessionId }), 'VALIDATION_ERROR');
    const done = await a.changeStatus(REQ1, { to: 'done', baseVersion: doc.version, sessionId: a.sessionId });
    expect(done.status).toBe('done');
    doc = await a.getRequestDocument(REQ1);
    expect(doc.meta.readOnlyReason).toBe('status');
    await expectCode(a.saveRequestDocument(REQ1, { baseVersion: doc.version, sessionId: a.sessionId, header: { notes: 'z' } }), 'READ_ONLY');
    const reopened = await a.changeStatus(REQ1, { to: 'in_progress', baseVersion: doc.version, sessionId: a.sessionId });
    expect(reopened.status).toBe('in_progress');
  });
});

describe('MockDataSource — фонові вкладки', () => {
  it('прихована вкладка (document.visibilityState = hidden) — без штучної мережевої затримки', async () => {
    const original = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    const ds = new MockDataSource({
      persistence: memoryPersistence(),
      channelFactory: createMemoryChannelHub(),
      localStorage: new MemoryStorage(),
      sessionStorage: new MemoryStorage(),
      latencyMs: [2000, 3000],
      now: () => new Date(TEST_NOW),
      overrides: null,
      logos: {},
      bindPageLifecycle: false,
    });
    try {
      const t0 = performance.now();
      await ds.listUsers();
      expect(performance.now() - t0).toBeLessThan(200);
    } finally {
      ds.dispose();
      if (original) Object.defineProperty(document, 'visibilityState', original);
    }
  });

  it('видима вкладка — штучна затримка застосовується як завжди', async () => {
    const ds = new MockDataSource({
      persistence: memoryPersistence(),
      channelFactory: createMemoryChannelHub(),
      localStorage: new MemoryStorage(),
      sessionStorage: new MemoryStorage(),
      latencyMs: [30, 30],
      now: () => new Date(TEST_NOW),
      overrides: null,
      logos: {},
      bindPageLifecycle: false,
    });
    try {
      const t0 = performance.now();
      await ds.listUsers();
      expect(performance.now() - t0).toBeGreaterThanOrEqual(15);
    } finally {
      ds.dispose();
    }
  });
});

describe('MockDataSource — версія сіду', () => {
  it('несумісна версія сіду в IndexedDB (seedVersion) — БД пересіюється', async () => {
    const persistence = memoryPersistence();
    // Відбиток збігається зі свіжим (та сама версія схеми й оверрайди) — лише seedVersion застарілий.
    const staleFingerprint = `${DB_SCHEMA_VERSION}.${SEED_VERSION}.${overridesFingerprint(null)}`;
    await persistence.save({
      schemaVersion: DB_SCHEMA_VERSION,
      seedVersion: SEED_VERSION - 1,
      fingerprint: staleFingerprint,
      rev: 3,
      seededAt: new Date(TEST_NOW).toISOString(),
      settings: {},
      users: [],
      ownCompanies: [],
      clients: {},
      suppliers: [],
      products: {},
      priceHistory: {},
      nextPriceHistoryId: 1,
      rates: [],
      requests: {},
    } as never);
    const ds = new MockDataSource({
      persistence,
      channelFactory: createMemoryChannelHub(),
      localStorage: new MemoryStorage(),
      sessionStorage: new MemoryStorage(),
      now: () => new Date(TEST_NOW),
      overrides: null,
      logos: {},
      bindPageLifecycle: false,
    });
    try {
      const users = await ds.listUsers();
      expect(users).toHaveLength(3); // свіжий сід демо-користувачів, а не порожня стара БД
    } finally {
      ds.dispose();
    }
  });
});

describe('MockDataSource — вхід', () => {
  function standalone(o: { persistence?: DbPersistence; local?: MemoryStorage; overrides?: SeedOverrides } = {}) {
    return new MockDataSource({
      persistence: o.persistence ?? memoryPersistence(),
      channelFactory: createMemoryChannelHub(),
      localStorage: o.local ?? new MemoryStorage(),
      sessionStorage: new MemoryStorage(),
      latencyMs: [0, 0],
      now: () => new Date(TEST_NOW),
      overrides: o.overrides ?? null,
      logos: {},
      bindPageLifecycle: false,
    });
  }

  it('вхід пам’ятає localStorage: нова вкладка (і перезавантаження) — уже з користувачем; вихід — для всіх вкладок', async () => {
    const persistence = memoryPersistence();
    const local = new MemoryStorage();
    const a = standalone({ persistence, local });
    const b = standalone({ persistence, local });
    try {
      await a.login('admin', 'admin');
      expect((await b.me())?.user.id).toBe(DEMO_USER_IDS.admin);
      // блокування, як і раніше, — на вкладку
      expect(a.sessionId).not.toBe(b.sessionId);
      await b.logout();
      expect(await a.me()).toBeNull();
    } finally {
      a.dispose();
      b.dispose();
    }
  });

  it('облікові дані з оверрайду; у БД — лише SHA-256 пароля; passwordSha256 має перевагу над password', async () => {
    const persistence = memoryPersistence();
    const ds = standalone({ persistence, overrides: { auth: { login: 'manager', password: 'Секрет-1' } } });
    try {
      await expectCode(ds.login('admin', 'admin'), 'UNAUTHORIZED');
      expect((await ds.login('manager', 'Секрет-1')).user.id).toBe(DEMO_USER_IDS.admin);
      await ds.flushPersistence();
      const stored = JSON.stringify(await persistence.load());
      expect(stored).not.toContain('Секрет-1');
      expect(stored).toContain(await sha256Hex('Секрет-1'));
    } finally {
      ds.dispose();
    }
    const byHash = standalone({ overrides: { auth: { password: 'ігнорується', passwordSha256: (await sha256Hex('інший')).toUpperCase() } } });
    try {
      expect((await byHash.login('admin', 'інший')).user.role).toBe('admin');
    } finally {
      byHash.dispose();
    }
  });
});

describe('MockDataSource — прайс файлом', () => {
  it('dryRun нічого не змінює; далі — нові позиції, зміни цін і «немає у прайсі», товари вручну не чіпає', async () => {
    env = createTestEnv();
    const tab = await loggedTab('a', DEMO_USER_IDS.admin);
    const supplierId = supplierIdOf('s1');
    const before = await tab.listProducts({ supplierId });
    const target = before.find((p) => p.priceSource !== 'manual' && p.purchasePrice != null)!;
    const manual = before.find((p) => p.priceSource === 'manual')!;
    expect(manual).toBeDefined();
    const rows = [
      { code: target.sku, name: target.nameWork, purchasePrice: (target.purchasePrice ?? 0) * 2, rrp: target.rrp, stockQty: 7 },
      { code: 'НОВИЙ-001', name: 'Новий товар з прайсу', purchasePrice: 100, rrp: 180, stockQty: 3 },
    ];
    const body = { rows, fileName: 'price-16-09.xlsx', markMissing: true };

    const dry = await tab.importSupplierPrices(supplierId, { ...body, dryRun: true });
    expect(dry).toMatchObject({ added: 1, changed: 1, priceUp: 1, source: 'file', fileName: 'price-16-09.xlsx' });
    expect(dry.missing).toBeGreaterThan(0);
    expect((await tab.getProduct(target.id)).purchasePrice).toBe(target.purchasePrice);
    expect(await tab.listPriceUpdates(supplierId)).toHaveLength(1); // лише запис із сіду

    const run = await tab.importSupplierPrices(supplierId, body);
    expect(run).toMatchObject({ added: 1, changed: 1, missing: dry.missing, productsTotal: 2 });
    const after = await tab.getProduct(target.id);
    expect(after.purchasePrice).toBe((target.purchasePrice ?? 0) * 2);
    expect(after.stockQty).toBe(7);
    expect(after.missingSince).toBeNull();
    expect((await tab.getPriceHistory(target.id))[0]).toMatchObject({ source: 'import', note: 'Прайс price-16-09.xlsx' });

    const all = await tab.listProducts({ supplierId });
    expect(all.find((p) => p.sku === 'НОВИЙ-001')).toMatchObject({ nameWork: 'Новий товар з прайсу', priceSource: 'import' });
    expect(all.filter((p) => p.missingSince)).toHaveLength(run.missing);
    expect((await tab.getProduct(manual.id)).missingSince).toBeNull();
    expect((await tab.listPriceUpdates(supplierId))[0]).toMatchObject({ source: 'file', fileName: 'price-16-09.xlsx', user: { id: DEMO_USER_IDS.admin } });
  });
});
