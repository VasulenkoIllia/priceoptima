import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DataSource } from '@/data/DataSource';
import { FakeServer, USERS, type FakeUser } from '@/test/fakeServer';
import { createServerWithRequest } from '@/test/requestFixture';
import { createRequestDocStore, type RequestDocStoreApi } from '../requestDocStore';

let srv: FakeServer;
let REQ1: string;
const stores: RequestDocStoreApi[] = [];

afterEach(async () => {
  for (const s of stores.splice(0)) await s.getState().unload();
});

async function openStore(tab: DataSource, requestId = REQ1, watchIntervalMs = 0): Promise<RequestDocStoreApi> {
  const store = createRequestDocStore({ ds: tab, bindPageLifecycle: false, watchIntervalMs });
  stores.push(store);
  await store.getState().load(requestId);
  expect(store.getState().loadState).toBe('ready');
  return store;
}

/** Новий «сервер» з типовою заявкою; вкладка користувача. */
function setup(user: FakeUser = USERS.koval, label = 'a', fresh = true): DataSource {
  if (fresh) ({ srv, requestId: REQ1 } = createServerWithRequest());
  return srv.tab(user, label);
}

const product = (id: string) => srv.products.get(id)!;

/** Рядок з ≥ 2 заповненими кандидатами і без ручного вибору. */
function lineWithCandidates(store: RequestDocStoreApi) {
  const s = store.getState();
  const c = s.getComputed()!;
  const line = s.doc!.lines.find((l) => !l.selection.blockId && (c.lines[l.id]?.candidateCount ?? 0) >= 2)!;
  expect(line).toBeDefined();
  return { line, cmp: c.lines[line.id] };
}

describe('requestDocStore', () => {
  it('load: документ, блокування, живий розрахунок', async () => {
    const store = await openStore(setup());
    const s = store.getState();
    expect(s.hasLock).toBe(true);
    expect(s.readOnly).toBe(false);
    expect(s.doc!.lines).toHaveLength(6);
    expect(s.doc!.blocks).toHaveLength(3);
    const c = s.getComputed()!;
    expect(c.totals.linesCount).toBe(6);
    expect(s.getComputed()).toBe(c); // мемоізація за посиланням
  });

  it('selectOffer: ручний вибір і повернення до рекомендації', async () => {
    const store = await openStore(setup());
    const { line, cmp } = lineWithCandidates(store);
    const other = Object.keys(store.getState().getComputed()!.offerIndex[line.id]).find((b) => b !== cmp.recommendedBlockId)!;
    store.getState().selectOffer(line.id, other);
    let c = store.getState().getComputed()!.lines[line.id];
    expect(store.getState().doc!.lines.find((l) => l.id === line.id)!.selection.blockId).toBe(other);
    expect(c.effectiveBlockId).toBe(other);
    expect(['manual_optimal', 'manual_non_optimal']).toContain(c.selectionState);
    store.getState().selectOffer(line.id, null);
    c = store.getState().getComputed()!.lines[line.id];
    expect(c.selectionState).toBe('recommended');
    expect(store.getState().dirty).toBe(true);
  });

  it('toggleExclude: виключення знімає затвердження, повернення', async () => {
    const store = await openStore(setup());
    const { line, cmp } = lineWithCandidates(store);
    store.getState().selectOffer(line.id, cmp.recommendedBlockId);
    const offerId = cmp.recommendedOfferId!;
    store.getState().toggleExclude(offerId, 'Нерентабельно');
    const s = store.getState();
    const offer = s.doc!.offers.find((o) => o.id === offerId)!;
    expect(offer.excluded).toBe(true);
    expect(offer.excludeReason).toBe('Нерентабельно');
    expect(s.doc!.lines.find((l) => l.id === line.id)!.selection.blockId).toBeNull();
    const c = s.getComputed()!;
    expect(c.offers[offerId].isExcluded).toBe(true);
    expect(c.lines[line.id].recommendedOfferId).not.toBe(offerId);
    store.getState().toggleExclude(offerId);
    expect(store.getState().doc!.offers.find((o) => o.id === offerId)!.excluded).toBe(false);
  });

  it('acceptAllRecommendations: затверджує рекомендації, ручний вибір не чіпає', async () => {
    const store = await openStore(setup());
    const before = store.getState().getComputed()!;
    const manualNonOptimal = Object.values(before.lines).filter((l) => l.selectionState === 'manual_non_optimal').map((l) => l.lineId);
    const n = store.getState().acceptAllRecommendations();
    expect(n).toBeGreaterThan(0);
    const after = store.getState().getComputed()!;
    for (const l of Object.values(after.lines)) {
      if (!l.isActive || !l.recommendedBlockId) continue;
      if (manualNonOptimal.includes(l.lineId)) expect(l.selectionState).toBe('manual_non_optimal');
      else expect(['manual_optimal']).toContain(l.selectionState);
    }
    expect(store.getState().acceptAllRecommendations()).toBe(0);
  });

  it('pasteSkus: масова вставка артикулів вниз від рядка; невідомі — у звіті', async () => {
    const tab = setup();
    const { id } = await tab.createRequest({});
    const store = await openStore(tab, id);
    const lineIds = store.getState().addLines([
      { clientName: 'Позиція 1', qty: 2 },
      { clientName: 'Позиція 2', qty: 3 },
      { clientName: 'Позиція 3', qty: 1 },
      { clientName: 'Позиція 4', qty: 5 },
    ]);
    expect(lineIds).toHaveLength(4);
    const blockId = store.getState().addBlock('s2')!;
    expect(blockId).toBeTruthy();
    const products = [product('p-s2-a'), product('p-s2-b')];
    // з рядка 1: артикул, порожньо (пропуск), артикул у нижньому регістрі, невідомий, зайвий (рядків не вистачило)
    const res = await store.getState().pasteSkus(lineIds[0], blockId, [products[0].sku, '', products[1].sku.toLowerCase(), 'XX-НЕМАЄ', 'зайвий']);
    expect(res).toEqual({ applied: 2, notFound: ['XX-НЕМАЄ'], ambiguous: [], skipped: 1 });
    const offers = store.getState().doc!.offers;
    expect(offers.find((o) => o.lineId === lineIds[0])?.productId).toBe(products[0].id);
    expect(offers.find((o) => o.lineId === lineIds[1])).toBeUndefined();
    expect(offers.find((o) => o.lineId === lineIds[2])?.productId).toBe(products[1].id);
    expect(offers.find((o) => o.lineId === lineIds[3])).toBeUndefined();
  });

  it('setOfferFromProduct: автоокруглення кратності 118 → 120, зміна к-сті рядка перераховує', async () => {
    const tab = setup();
    const pipe = product('p-pipe');
    const { id } = await tab.createRequest({});
    const store = await openStore(tab, id);
    const [lineId] = store.getState().addLines([{ clientName: 'Труба ППР 40', clientUnit: 'м', qty: 118 }]);
    const blockId = store.getState().addBlock(pipe.supplierId)!;
    const offerId = store.getState().setOfferFromProduct(lineId, blockId, pipe)!;
    let offer = store.getState().doc!.offers.find((o) => o.id === offerId)!;
    expect(offer.qty).toBe(120);
    let oc = store.getState().getComputed()!.offers[offerId];
    expect(oc.qtyEffective).toBe(120);
    expect(oc.warnings.map((w) => w.code)).toContain('QTY_ROUNDED');

    store.getState().updateLine(lineId, { qty: 200 });
    offer = store.getState().doc!.offers.find((o) => o.id === offerId)!;
    expect(offer.qty).toBeNull();
    store.getState().updateLine(lineId, { qty: 13 });
    expect(store.getState().doc!.offers.find((o) => o.id === offerId)!.qty).toBe(16);
    store.getState().setOfferQty(offerId, 20);
    store.getState().updateLine(lineId, { qty: 5 });
    expect(store.getState().doc!.offers.find((o) => o.id === offerId)!.qty).toBe(20);
    oc = store.getState().getComputed()!.offers[offerId];
    expect(oc.qtyEffective).toBe(20);
  });

  it('addProductsToLine: товар іншого постачальника створює блок', async () => {
    const store = await openStore(setup());
    const s4product = product('p-s4');
    const line = store.getState().doc!.lines[0];
    const res = store.getState().addProductsToLine(line.id, [s4product]);
    expect(res.createdBlockIds).toHaveLength(1);
    expect(res.offerIds).toHaveLength(1);
    const s = store.getState();
    const block = s.doc!.blocks.find((b) => b.id === res.createdBlockIds[0])!;
    expect(block.supplierId).toBe('s4');
    expect(block.position).toBe(4);
    expect(s.doc!.refs.suppliers['s4']).toBeDefined();
    expect(s.ctx!.suppliers['s4']).toBeDefined();
    expect(s.getComputed()!.offers[res.offerIds[0]].isFilled).toBe(true);
    // повторне додавання в той самий блок — заміна, без нового блоку
    const again = store.getState().addProductsToLine(line.id, [s4product]);
    expect(again.createdBlockIds).toHaveLength(0);
    expect(again.replaced).toBe(1);
  });

  it('refreshOfferPrice: вхідна ціна лише з прайсу — знімок оновлюється з каталогу, ▲▼ від попередньої, подія в історії', async () => {
    const tab = setup();
    const store = await openStore(tab);
    const c = store.getState().getComputed()!;
    const o = store.getState().doc!.offers.find((x) => c.offers[x.id]?.catalogChanged)!;
    expect(o?.catalog).toBeTruthy();

    expect(store.getState().refreshOfferPrice(o.id)).toBe(true);
    const s = store.getState();
    const after = s.doc!.offers.find((x) => x.id === o.id)!;
    expect(after.purchasePriceCur).toBe(o.catalog!.purchasePrice);
    expect(after.priceChange).toMatchObject({ reason: 'catalog_refresh', prevPurchasePriceCur: o.purchasePriceCur });
    expect(s.getComputed()!.offers[o.id].warnings.map((w) => w.code)).not.toContain('CATALOG_PRICE_CHANGED');
    // уже актуальна — нічого не робить
    expect(store.getState().refreshOfferPrice(o.id)).toBe(false);

    await store.getState().flush();
    const { events } = await tab.getRequestHistory(s.requestId!);
    expect(events[0]).toMatchObject({ kind: 'price_update' });
  });

  it('змінити ціну в заявці: лише тут або і в каталозі (РЕД-10)', async () => {
    const store = await openStore(setup());
    const offer = store.getState().doc!.offers.find((o) => o.lineId === 'L1' && o.blockId === 'b1')!;
    expect(await store.getState().setOfferPurchasePrice(offer.id, 90)).toBe(true);
    let saved = store.getState().doc!.offers.find((o) => o.id === offer.id)!;
    expect(saved.purchasePriceCur).toBe(90);
    expect(saved.priceChange).toMatchObject({ reason: 'manual_edit', prevPurchasePriceCur: 100 });
    // у каталозі ціна поки стара
    expect(product(offer.productId!).purchasePrice).toBe(100);

    // прайс тим часом змінив РРЦ: із заявки в каталог іде лише вхідна ціна, РРЦ лишається прайсова
    srv.addProducts({ ...product(offer.productId!), rrp: 555 });
    await store.getState().setOfferPurchasePrice(offer.id, 80, { updateCatalog: true });
    saved = store.getState().doc!.offers.find((o) => o.id === offer.id)!;
    expect(saved.purchasePriceCur).toBe(80);
    expect(product(offer.productId!).purchasePrice).toBe(80);
    expect(product(offer.productId!).rrp).toBe(555);
    // знімок каталогу теж оновлено — «ціна в каталозі змінилась» не показуємо
    expect(saved.catalog?.purchasePrice).toBe(80);
  });

  it('змінити ціну і в каталозі: валюта товару змінилась — у каталог не пишемо', async () => {
    const store = await openStore(setup());
    const offer = store.getState().doc!.offers.find((o) => o.lineId === 'L1' && o.blockId === 'b1')!;
    srv.addProducts({ ...product(offer.productId!), currency: offer.currency === 'EUR' ? 'USD' : 'EUR' });
    await expect(store.getState().setOfferPurchasePrice(offer.id, 70, { updateCatalog: true })).rejects.toThrow(/Валюта/);
    // у заявці ціну змінено, у каталозі — ні
    expect(store.getState().doc!.offers.find((o) => o.id === offer.id)!.purchasePriceCur).toBe(70);
    expect(product(offer.productId!).purchasePrice).toBe(100);
  });

  it('applyMix: оптимальний мікс — мінімальна ціна в кожному рядку, і поверх ручного вибору', async () => {
    const store = await openStore(setup());
    const { line, cmp } = lineWithCandidates(store);
    const other = Object.keys(store.getState().getComputed()!.offerIndex[line.id]).find((b) => b !== cmp.recommendedBlockId)!;
    store.getState().selectOffer(line.id, other);

    expect(store.getState().applyMix()).toBeGreaterThan(0);
    const s = store.getState();
    const comp = s.getComputed()!;
    for (const l of s.doc!.lines) {
      const lc = comp.lines[l.id];
      if (lc?.isActive && lc.recommendedBlockId) expect(l.selection.blockId).toBe(lc.recommendedBlockId);
    }
    expect(store.getState().applyMix()).toBe(0);
  });

  it('setApprovals і resetLineMarkups — одним кроком', async () => {
    const store = await openStore(setup());
    const [l1, l2] = store.getState().doc!.lines;
    store.getState().setLineMarkup(l1.id, { method: 'markup_on_cost', value: 10 });
    store.getState().setLineMarkup(l2.id, { manualPriceNet: 100 });
    store.getState().resetLineMarkups();
    for (const { markup } of store.getState().doc!.lines) {
      expect([markup.method, markup.value, markup.manualPriceNet, markup.manualPriceGross ?? null]).toEqual([null, null, null, null]);
    }

    store.getState().setApprovals([
      { lineId: l1.id, approved: true },
      { lineId: l2.id, approved: true, qty: 1 },
    ]);
    const lines = store.getState().doc!.lines;
    expect(lines[0].approval).toEqual({ approved: true, approvedQty: l1.qty });
    expect(lines[1].approval).toEqual({ approved: true, approvedQty: 1 });
    store.getState().undo();
    expect(store.getState().doc!.lines[0].approval.approved).toBe(l1.approval.approved);
  });

  it('flush: невдале збереження — помилка викликачу (КП і копія будуються лише зі збереженої заявки)', async () => {
    const tab = setup();
    const store = await openStore(tab);
    const spy = vi.spyOn(tab, 'saveRequestDocument').mockRejectedValueOnce(new Error('Мережа недоступна'));
    store.getState().setHeader({ notes: 'нова нотатка' });
    await expect(store.getState().flush()).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(store.getState().dirty).toBe(true);
    expect(store.getState().save.state).toBe('error');

    spy.mockRestore();
    await store.getState().flush();
    expect(store.getState().dirty).toBe(false);
    expect(store.getState().save.state).toBe('saved');
  });

  it('автозбереження дельтою: версія зростає, сервер має зміни; undo/redo', async () => {
    const tab = setup();
    const store = await openStore(tab);
    const v0 = store.getState().version;
    const line = store.getState().doc!.lines[0];
    const notes0 = store.getState().doc!.header.notes;
    store.getState().updateLine(line.id, { clientName: 'Нова назва' });
    store.getState().setHeader({ notes: 'Нотатка менеджера' });
    await store.getState().flush();
    expect(store.getState().version).toBe(v0 + 1);
    expect(store.getState().save.state).toBe('saved');
    expect(store.getState().dirty).toBe(false);
    const server = await tab.getRequestDocument(REQ1);
    expect(server.lines.find((l) => l.id === line.id)!.clientName).toBe('Нова назва');
    expect(server.header.notes).toBe('Нотатка менеджера');

    store.getState().undo();
    expect(store.getState().doc!.header.notes).toBe(notes0);
    store.getState().redo();
    expect(store.getState().doc!.header.notes).toBe('Нотатка менеджера');
    store.getState().undo();
    store.getState().undo();
    await store.getState().flush();
    const reverted = await tab.getRequestDocument(REQ1);
    expect(reverted.lines.find((l) => l.id === line.id)!.clientName).toBe(line.clientName);
  });

  it('зміни шапки доїжджають на сервер: формула знижки й КП для погодження', async () => {
    const tab = setup();
    const store = await openStore(tab);
    store.getState().setHeader({ discountFormula: 'excel_divisor', approvalKpId: 'kp-1' });
    await store.getState().flush();
    const saved = await tab.getRequestDocument(REQ1);
    expect(saved.header.discountFormula).toBe('excel_divisor');
    expect(saved.header.approvalKpId).toBe('kp-1');
  });

  it('readOnly без блокування: друга сесія лише переглядає; адмін забирає редагування — власник дізнається при збереженні', async () => {
    const koval = setup(USERS.koval, 'a');
    const bondar = setup(USERS.bondar, 'b', false);
    const admin = setup(USERS.admin, 'c', false);
    const storeA = await openStore(koval);
    const storeB = await openStore(bondar);
    const b = storeB.getState();
    expect(b.hasLock).toBe(false);
    expect(b.readOnly).toBe(true);
    expect(b.readOnlyReason).toBe('lock');
    expect(b.lock?.userShortName).toBe('Коваль О.В.');
    const docBefore = b.doc;
    b.selectOffer(b.doc!.lines[0].id, null);
    b.addLines([{ clientName: 'не має додатись' }]);
    expect(storeB.getState().doc).toBe(docBefore);

    const storeAdmin = await openStore(admin);
    expect(storeAdmin.getState().hasLock).toBe(false);
    await storeAdmin.getState().forceLock();
    expect(storeAdmin.getState().hasLock).toBe(true);
    expect(storeAdmin.getState().readOnly).toBe(false);

    storeA.getState().setHeader({ notes: 'не збережеться' });
    await storeA.getState().flush().catch(() => undefined);
    const a = storeA.getState();
    expect(a.hasLock).toBe(false);
    expect(a.readOnly).toBe(true);
    expect(a.lockLost).toMatchObject({ reason: 'forced', byUserShortName: 'Адміністратор' });
    expect((await admin.getRequestDocument(REQ1)).header.notes).toBeNull();
    // що саме не збереглося — видно, щоб внести ще раз
    expect(a.lostChanges?.items).toEqual(['Шапка: змінено «Нотатки»']);
    storeA.getState().dismissLostChanges();
    expect(storeA.getState().lostChanges).toBeNull();
  });

  it('режим перегляду сам підтягує збережені зміни й звільнення заявки', async () => {
    const koval = setup(USERS.koval, 'a');
    const bondar = setup(USERS.bondar, 'b', false);
    const storeA = await openStore(koval);
    const storeB = await openStore(bondar, REQ1, 10);
    storeA.getState().setHeader({ notes: 'нотатка з іншої вкладки' });
    await storeA.getState().flush();
    await vi.waitFor(() => expect(storeB.getState().doc!.header.notes).toBe('нотатка з іншої вкладки'));
    expect(storeB.getState().version).toBe(storeA.getState().version);

    await storeA.getState().unload();
    await vi.waitFor(() => expect(storeB.getState().lock).toBeNull());
    expect(await storeB.getState().retryLock()).toBe(true);
    expect(storeB.getState().readOnly).toBe(false);
  });

  it('прострочене блокування (вкладку закрили без звільнення) може взяти інший', async () => {
    const storeA = await openStore(setup(USERS.koval, 'a'));
    expect(storeA.getState().hasLock).toBe(true);
    srv.clock.t += srv.settings.lockTtlSeconds * 1000 + 1;
    const storeB = await openStore(setup(USERS.bondar, 'b', false));
    expect(storeB.getState().hasLock).toBe(true);
  });

  it('строк блокування минув (сон ноутбука), але ніхто не взяв — редагування й збереження тривають', async () => {
    const storeA = await openStore(setup(USERS.koval, 'a'));
    srv.clock.t += srv.settings.lockTtlSeconds * 1000 + 1;
    storeA.getState().setHeader({ notes: 'після сну' });
    await storeA.getState().flush();
    expect(storeA.getState().hasLock).toBe(true);
    expect(storeA.getState().save.state).toBe('saved');
  });

  it('setStatus: «Виконано» — лише перегляд; перевідкриття повертає редагування', async () => {
    const store = await openStore(setup());
    await store.getState().setStatus('done');
    expect(store.getState().doc!.header.status).toBe('done');
    expect(store.getState().readOnlyReason).toBe('status');
    const before = store.getState().doc;
    store.getState().setHeader({ notes: 'ігнорується' });
    expect(store.getState().doc).toBe(before);
    await store.getState().setStatus('in_progress');
    expect(store.getState().readOnly).toBe(false);
  });
});
