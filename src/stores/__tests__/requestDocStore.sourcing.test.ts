// Дії стору, додані для сітки підбору: вставка артикулів у показані рядки і пакетне оновлення рядків.
import { afterEach, describe, expect, it } from 'vitest';
import type { FakeServer } from '@/test/fakeServer';
import { USERS } from '@/test/fakeServer';
import { createServerWithRequest } from '@/test/requestFixture';
import { createRequestDocStore, type RequestDocStoreApi } from '../requestDocStore';

const stores: RequestDocStoreApi[] = [];

afterEach(async () => {
  for (const s of stores.splice(0)) await s.getState().unload();
});

async function openNew(): Promise<{ srv: FakeServer; store: RequestDocStoreApi }> {
  const { srv } = createServerWithRequest();
  const tab = srv.tab(USERS.koval, 'a');
  const { id } = await tab.createRequest({});
  const store = createRequestDocStore({ ds: tab, bindPageLifecycle: false, watchIntervalMs: 0 });
  stores.push(store);
  await store.getState().load(id);
  return { srv, store };
}

describe('requestDocStore — дії сітки підбору', () => {
  it('pasteSkusToLines: артикули в задані рядки (порядок сітки з фільтром), невідомі — у звіті', async () => {
    const { srv, store } = await openNew();
    const [l1, l2, l3] = store.getState().addLines([
      { clientName: 'Позиція 1', qty: 1 },
      { clientName: 'Позиція 2', qty: 1 },
      { clientName: 'Позиція 3', qty: 1 },
    ]);
    const blockId = store.getState().addBlock('s1')!;
    const [p1, p2] = [srv.products.get('p-s1-a')!, srv.products.get('p-s1-b')!];
    const res = await store.getState().pasteSkusToLines(blockId, [
      { lineId: l3, sku: ` ${p1.sku} ` },
      { lineId: l1, sku: p2.sku.toLowerCase() },
      { lineId: l2, sku: 'НЕМАЄ-1' },
      { lineId: l2, sku: '' },
    ]);
    expect(res).toEqual({ applied: 2, notFound: ['НЕМАЄ-1'], ambiguous: [], skipped: 0 });
    const offers = store.getState().doc!.offers;
    expect(offers.find((o) => o.lineId === l3)?.productId).toBe(p1.id);
    expect(offers.find((o) => o.lineId === l1)?.productId).toBe(p2.id);
    expect(offers.find((o) => o.lineId === l2)).toBeUndefined();
    // одна вставка — один крок скасування
    store.getState().undo();
    expect(store.getState().doc!.offers).toHaveLength(0);
  });

  it('updateLines: кілька рядків одним кроком, к-сть пропозицій іде за рядком', async () => {
    const { srv, store } = await openNew();
    const [l1, l2] = store.getState().addLines([
      { clientName: 'А', qty: 1 },
      { clientName: 'Б', qty: 1 },
    ]);
    const blockId = store.getState().addBlock('s1')!;
    const p = srv.products.get('p-s1-a')!;
    const offerId = store.getState().setOfferFromProduct(l2, blockId, { ...p, multiplicity: 1 })!;
    store.getState().updateLines([
      { id: l1, patch: { clientName: 'Змішувач', clientUnit: 'шт' } },
      { id: l2, patch: { qty: 7 } },
      { id: 'немає-такого', patch: { clientName: 'x' } },
    ]);
    const s = store.getState();
    expect(s.doc!.lines.find((l) => l.id === l1)).toMatchObject({ clientName: 'Змішувач', clientUnit: 'шт', qty: 1 });
    expect(s.doc!.lines.find((l) => l.id === l2)?.qty).toBe(7);
    expect(s.getComputed()!.offers[offerId].qtyEffective).toBe(7);
    s.undo();
    expect(store.getState().doc!.lines.map((l) => l.clientName)).toEqual(['А', 'Б']);
  });
});

describe('requestDocStore — курс і націнка блоку (правки замовника 23.09 п.6, 15, 16)', () => {
  const today = (usd: number, eur: number) => ({
    date: '2026-09-24',
    USD: { rate: usd, rateDate: '2026-09-24', source: 'manual' as const },
    EUR: { rate: eur, rateDate: '2026-09-24', source: 'manual' as const },
    stale: false,
  });

  it('новий блок бере загальний курс на сьогодні, а не на дату заявки', async () => {
    const { srv } = createServerWithRequest();
    srv.ratesToday = today(46, 53);
    const tab = srv.tab(USERS.koval, 'a');
    const { id } = await tab.createRequest({});
    const store = createRequestDocStore({ ds: tab, bindPageLifecycle: false, watchIntervalMs: 0 });
    stores.push(store);
    await store.getState().load(id);
    expect(store.getState().doc!.header.rates).toMatchObject({ USD: 45, EUR: 52.1 });
    const blockId = store.getState().addBlock('s1')!;
    expect(store.getState().doc!.blocks.find((b) => b.id === blockId)!.rates).toEqual({ USD: 46, EUR: 53 });
  });

  it('«Оновити курс і націнку»: курс на сьогодні й ручний курс і націнка з картки постачальника; повтор нічого не змінює; Ctrl+Z повертає', async () => {
    const { srv } = createServerWithRequest();
    srv.ratesToday = today(46, 53);
    const tab = srv.tab(USERS.koval, 'a');
    const { id } = await tab.createRequest({});
    const store = createRequestDocStore({ ds: tab, bindPageLifecycle: false, watchIntervalMs: 0 });
    stores.push(store);
    await store.getState().load(id);
    const b1 = store.getState().addBlock('s1')!;
    const b2 = store.getState().addBlock('s2')!;
    store.getState().setBlockRates(b1, { EUR: 51.5 });

    // у «Курсах валют» новий курс, у картці s1 — ручний курс євро й націнка
    srv.ratesToday = today(47, 54);
    srv.suppliers = srv.suppliers.map((s) => (s.id === 's1' ? { ...s, manualRateEur: 52.5, supplierMarkupPct: 5 } : s));

    const changes = await store.getState().refreshBlocksFromSuppliers([b1]);
    expect(changes).toEqual([
      { blockId: b1, before: { rates: { USD: 46, EUR: 51.5 }, supplierMarkupPct: 0 }, after: { rates: { USD: 47, EUR: 52.5 }, supplierMarkupPct: 5 } },
    ]);
    const blocks = store.getState().doc!.blocks;
    expect(blocks.find((b) => b.id === b1)).toMatchObject({ rates: { USD: 47, EUR: 52.5 }, supplierMarkupPct: 5 });
    // інший блок без дії не змінюється
    expect(blocks.find((b) => b.id === b2)!.rates).toEqual({ USD: 46, EUR: 53 });

    expect(await store.getState().refreshBlocksFromSuppliers([b1])).toEqual([]);
    // усі блоки: s2 підтягує новий загальний курс
    const all = await store.getState().refreshBlocksFromSuppliers();
    expect(all.map((c) => c.blockId)).toEqual([b2]);

    store.getState().undo();
    store.getState().undo();
    expect(store.getState().doc!.blocks.find((b) => b.id === b1)).toMatchObject({ rates: { USD: 46, EUR: 51.5 }, supplierMarkupPct: 0 });
  });
});

describe('requestDocStore — РРЦ пропозиції лише в цій заявці (правки замовника 23.09 п.8)', () => {
  it('setOfferRrp: нова РРЦ рахується в заявці, некоректне значення не пишеться, Ctrl+Z повертає', async () => {
    const { srv, store } = await openNew();
    const [l1] = store.getState().addLines([{ clientName: 'Позиція', qty: 1 }]);
    const blockId = store.getState().addBlock('s1')!;
    const offerId = store.getState().setOfferFromProduct(l1, blockId, { ...srv.products.get('p-s1-a')!, rrp: 150 })!;
    expect(store.getState().getComputed()!.offers[offerId].rrpGrossUah).toBe(150);
    store.getState().setOfferRrp(offerId, 180);
    expect(store.getState().getComputed()!.offers[offerId].rrpGrossUah).toBe(180);
    store.getState().setOfferRrp(offerId, -5);
    expect(store.getState().doc!.offers.find((o) => o.id === offerId)?.rrpCur).toBe(180);
    store.getState().undo();
    expect(store.getState().getComputed()!.offers[offerId].rrpGrossUah).toBe(150);
  });
});
