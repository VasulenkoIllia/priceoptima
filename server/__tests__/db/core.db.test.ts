// Наскрізні перевірки сервісів на реальній PostgreSQL: імпорт прайсу, версії карток, збереження заявки дельтою,
// блокування, КП, статуси, заборона видалення. Запуск: npm run test:db (див. vitest.db.config.ts).
import { randomUUID } from 'node:crypto';
import type { User } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_UNITS } from '@shared/parse';
import { createOfferFromProduct, createRequestLine, createSupplierBlock } from '@shared/pricing';
import { toSupplierRef } from '@shared/requests';
import type { DocumentPatch, UUID } from '@shared/types';
import { prisma } from '../../db';
import { ApiError } from '../../http/errors';
import { parse } from '../../http/validate';
import { createOwnCompany } from '../../modules/own-companies/ownCompanies.service';
import { ownCompanyInputSchema } from '../../modules/own-companies/ownCompanies.schemas';
import { importBodySchema } from '../../modules/price-updates/priceUpdates.schemas';
import { importPriceRows } from '../../modules/price-updates/priceUpdates.service';
import { productPatchSchema, productPriceUpdateSchema } from '../../modules/products/products.schemas';
import { getPriceHistory, getProduct, updateProduct, updateProductPrice } from '../../modules/products/products.service';
import { kpCreateSchema, createRequestSchema, documentPatchSchema } from '../../modules/requests/requests.schemas';
import { createKp, listKps } from '../../modules/requests/kp.service';
import { acquireLock, activeLock, forceLock, releaseLock } from '../../modules/requests/locks.service';
import { toProductForOffer } from '../../modules/requests/requests.context';
import { changeStatus, createRequest, getRequestDocument, saveRequestDocument } from '../../modules/requests/requests.service';
import { addManualRate, cancelManualRates, getEffectiveRates, saveNbuRate } from '../../modules/rates/rates.service';
import { getSettings } from '../../modules/settings/settings.service';
import { supplierInputSchema } from '../../modules/suppliers/suppliers.schemas';
import { createSupplier, getSupplier } from '../../modules/suppliers/suppliers.service';

let admin: User;
let koval: User;
let bondar: User;
let supplierId: UUID;
let ownCompanyId: UUID;

/** Дані кожного запуску унікальні: тестову базу не треба стирати між запусками. */
const RUN = randomUUID().slice(0, 8);

async function user(login: string, shortName: string, role: 'admin' | 'user'): Promise<User> {
  return prisma.user.create({ data: { login: `${login}-${RUN}`, passwordHash: 'не для входу', fullName: shortName, shortName, role } });
}

/** Код помилки API, яку кинула дія. */
async function errorCode(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof ApiError) return e.code;
    throw e;
  }
  throw new Error('очікували помилку');
}

const importFile = (rows: object[], extra: object = {}) =>
  importPriceRows(parse(importBodySchema, { supplierId, fileName: 'прайс.xlsx', rows, ...extra }), admin, null);

beforeAll(async () => {
  await prisma.unit.createMany({
    data: DEFAULT_UNITS.map((u) => ({ code: u.code, name: u.name, aliases: [...u.aliases], sortOrder: u.sortOrder, isActive: u.isActive })),
    skipDuplicates: true,
  });
  await getSettings();
  admin = await user('admin', 'Адмін.', 'admin');
  koval = await user('koval', 'Коваль О.В.', 'user');
  bondar = await user('bondar', 'Бондар І.П.', 'user');
  ownCompanyId = (
    await createOwnCompany(parse(ownCompanyInputSchema, { code: `T${RUN}`.slice(0, 20), nameShort: `ТОВ «ТЕСТ ${RUN}»`, nameFull: `ТОВ «ТЕСТ ${RUN}»` }), admin)
  ).id;
  supplierId = (await createSupplier(parse(supplierInputSchema, { name: `Постачальник тест ${RUN}`, defaultCurrency: 'UAH' }), admin)).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('прайс файлом', () => {
  it('нові позиції, повтор без змін, зміна ціни, історія цін', async () => {
    const first = await importFile([
      { code: 'A-1', name: 'Кран', purchasePrice: 100, rrp: 150, stockQty: 5 },
      { code: 'A-2', name: 'Труба', purchasePrice: 50, rrp: 80 },
    ]);
    expect([first.added, first.changed]).toEqual([2, 0]);

    // той самий прайс ще раз — нічого не змінюється
    const same = await importFile([
      { code: 'A-1', name: 'Кран', purchasePrice: 100, rrp: 150, stockQty: 5 },
      { code: 'A-2', name: 'Труба', purchasePrice: 50, rrp: 80 },
    ]);
    expect([same.added, same.changed]).toEqual([0, 0]);

    const up = await importFile([
      { code: 'A-1', name: 'Кран', purchasePrice: 120, rrp: 150, stockQty: 5 },
      { code: 'A-2', name: 'Труба', purchasePrice: 50, rrp: 80 },
    ]);
    expect([up.changed, up.priceUp]).toEqual([1, 1]);
    const a1 = await prisma.product.findFirstOrThrow({ where: { supplierId, sku: 'A-1' } });
    const history = await getPriceHistory(a1.id);
    expect(history.map((h) => h.purchasePrice)).toEqual([120, 100]);
  });

  it('зниклі позначаються «немає у прайсі», курс із файлу стає курсом із прайсу', async () => {
    const res = await importFile([{ code: 'A-1', name: 'Кран', purchasePrice: 120, rrp: 150 }], {
      markMissing: true,
      rates: { USD: 41.2, EUR: null },
    });
    expect(res.missing).toBe(1);
    const a2 = await prisma.product.findFirstOrThrow({ where: { supplierId, sku: 'A-2' } });
    expect(a2.missingSince).not.toBeNull();
    expect((await getSupplier(supplierId)).priceListRates.USD).toBe(41.2);
  });

  it('перегляд (dryRun) нічого не записує', async () => {
    const before = await prisma.product.count({ where: { supplierId } });
    const dry = await importFile([{ code: 'NEW-1', name: 'Нове', purchasePrice: 10 }], { dryRun: true });
    expect(dry.added).toBe(1);
    expect(await prisma.product.count({ where: { supplierId } })).toBe(before);
  });
});

describe('картка товару: чужі правки не перезаписуються', () => {
  it('збереження зі старою версією — VERSION_CONFLICT', async () => {
    const a1 = await prisma.product.findFirstOrThrow({ where: { supplierId, sku: 'A-1' } });
    const opened = await getProduct(a1.id);
    const saved = await updateProduct(a1.id, parse(productPatchSchema, { version: opened.version, nameWork: 'Кран кульовий' }), koval);
    expect(saved.nameWork).toBe('Кран кульовий');
    expect(await errorCode(() => updateProduct(a1.id, parse(productPatchSchema, { version: opened.version, nameWork: 'Інша назва' }), bondar))).toBe(
      'VERSION_CONFLICT',
    );
    // «хто змінив» — з журналу дій
    expect((await getProduct(a1.id)).lastChange?.user?.shortName).toBe('Коваль О.В.');
  });
});

describe('ручна ціна й імпорт прайсу', () => {
  it('ручна зміна вхідної ціни піднімає версію товару (імпорт, що йде паралельно, її не перетре)', async () => {
    const a1 = await prisma.product.findFirstOrThrow({ where: { supplierId, sku: 'A-1' } });
    await updateProductPrice(
      a1.id,
      parse(productPriceUpdateSchema, { currency: 'UAH', purchasePrice: 130, purchaseOnly: true, source: 'manual' }),
      koval,
    );
    const after = await prisma.product.findUniqueOrThrow({ where: { id: a1.id } });
    expect(after.version).toBe(a1.version + 1);
    expect(Number(after.purchasePrice)).toBe(130);
    // РРЦ при зміні лише вхідної ціни лишається з каталогу
    expect(Number(after.rrp)).toBe(Number(a1.rrp));
  });
});

describe('заявка: збереження, блокування, КП, статуси', () => {
  const sessionA = randomUUID();
  const sessionB = randomUUID();
  let requestId: UUID;

  it('створення і блокування: одна вкладка редагує, інша бачить хто', async () => {
    requestId = (await createRequest(parse(createRequestSchema, { ownCompanyId }), koval)).id;
    expect((await acquireLock(requestId, koval, sessionA)).acquired).toBe(true);
    const other = await acquireLock(requestId, bondar, sessionB);
    expect(other.acquired).toBe(false);
    expect(other.lock?.userShortName).toBe('Коваль О.В.');
  });

  it('збереження дельтою: версія росте, стара версія й чужа вкладка — відмова', async () => {
    const doc = await getRequestDocument(requestId, koval, sessionA);
    const supplier = await getSupplier(supplierId);
    const product = await prisma.product.findFirstOrThrow({ where: { supplierId, sku: 'A-1' } });
    const line = createRequestLine({ id: randomUUID(), position: 1, clientName: 'Кран 1/2', qty: 3 });
    const block = createSupplierBlock(toSupplierRef(supplier), doc.header.rates, { id: randomUUID(), position: 1 });
    const offer = createOfferFromProduct(toProductForOffer(product), {
      id: randomUUID(),
      lineId: line.id,
      blockId: block.id,
      lineQty: line.qty,
      autoRoundMultiplicity: true,
    });
    const patch = (baseVersion: number, sessionId: string) =>
      parse(documentPatchSchema, { baseVersion, sessionId, upsert: { lines: [line], blocks: [block], offers: [offer] } }) as DocumentPatch;

    const saved = await saveRequestDocument(requestId, patch(doc.version, sessionA), koval);
    expect(saved.version).toBe(doc.version + 1);
    expect(saved.totals.linesCount).toBe(1);

    expect(await errorCode(() => saveRequestDocument(requestId, patch(doc.version, sessionA), koval))).toBe('VERSION_CONFLICT');
    expect(['LOCK_LOST', 'LOCK_REQUIRED']).toContain(await errorCode(() => saveRequestDocument(requestId, patch(saved.version, sessionB), bondar)));

    const reread = await getRequestDocument(requestId, koval, sessionA);
    expect(reread.offers).toHaveLength(1);
    expect(reread.offers[0]!.purchasePriceCur).toBe(130);
  });

  it('КП: номер «2114 / номер заявки», версії йдуть підряд, знімок зберігається', async () => {
    const doc = await getRequestDocument(requestId, koval, sessionA);
    const body = parse(kpCreateSchema, { settings: doc.header.kpSettings, sessionId: sessionA });
    const k1 = await createKp(requestId, body, koval);
    const k2 = await createKp(requestId, body, koval);
    expect(k2.numberLabel).toBe(k1.numberLabel);
    expect(k2.version).toBe(k1.version + 1);
    expect(k1.snapshot.rows).toHaveLength(1);
    expect(k1.snapshot.totals.payable).toBeGreaterThan(0);
    expect(await listKps(requestId)).toHaveLength(2);
  });

  it('«Виконано» знімає блокування; «Перевідкрити» — з блокуванням іншого менеджера', async () => {
    const doc = await getRequestDocument(requestId, koval, sessionA);
    const done = await changeStatus(requestId, { to: 'done', reason: null, baseVersion: doc.version, sessionId: sessionA }, koval);
    expect(done.status).toBe('done');
    expect(await activeLock(requestId)).toBeNull();

    expect((await acquireLock(requestId, bondar, sessionB)).acquired).toBe(true);
    const reopened = await changeStatus(requestId, { to: 'in_progress', reason: null, baseVersion: done.version, sessionId: sessionB }, bondar);
    expect(reopened.status).toBe('in_progress');
    // скасування без причини
    const cancelled = await changeStatus(requestId, { to: 'cancelled', reason: null, baseVersion: reopened.version, sessionId: sessionB }, bondar);
    expect(cancelled.status).toBe('cancelled');
  });

  it('адміністратор забирає блокування', async () => {
    const req = (await createRequest(parse(createRequestSchema, { ownCompanyId }), koval)).id;
    await acquireLock(req, koval, sessionA);
    const forced = await forceLock(req, admin, sessionB);
    expect(forced.previous?.userId).toBe(koval.id);
    expect((await activeLock(req))?.userId).toBe(admin.id);
    await releaseLock(req, admin, sessionB);
    expect(await activeLock(req)).toBeNull();
  });
});

describe('загальний курс: більший із НБУ й ручного', () => {
  it('ручний діє наступного дня, поки вищий; вищий НБУ перебиває; скасування повертає НБУ', async () => {
    // окремі далекі дати: у тестовій базі вони ні з чим не перетинаються
    await cancelManualRates({ currency: 'EUR' }, admin);
    await saveNbuRate('EUR', '2099-03-10', 60);
    await addManualRate({ currency: 'EUR', rateDate: '2099-03-10', rate: 61.5, note: null }, admin);
    await saveNbuRate('EUR', '2099-03-11', 60.2);
    expect((await getEffectiveRates('2099-03-11')).EUR).toMatchObject({ rate: 61.5, source: 'manual', nbu: { rate: 60.2 } });

    await saveNbuRate('EUR', '2099-03-12', 62);
    expect((await getEffectiveRates('2099-03-12')).EUR).toMatchObject({ rate: 62, source: 'nbu', manual: { rate: 61.5 } });

    expect(await cancelManualRates({ currency: 'EUR' }, admin)).toEqual({ cancelled: 1 });
    expect((await getEffectiveRates('2099-03-11')).EUR).toMatchObject({ rate: 60.2, source: 'nbu', manual: null });

    // повторне введення на ту саму дату знімає скасування
    await addManualRate({ currency: 'EUR', rateDate: '2099-03-10', rate: 61.5, note: null }, admin);
    expect((await getEffectiveRates('2099-03-11')).EUR?.source).toBe('manual');
    await cancelManualRates({ currency: 'EUR' }, admin);
  });
});

describe('цілісність', () => {
  it('постачальника з товарами видалити не можна (RESTRICT)', async () => {
    await expect(prisma.supplier.delete({ where: { id: supplierId } })).rejects.toThrow();
    expect(await prisma.supplier.count({ where: { id: supplierId } })).toBe(1);
  });
});
