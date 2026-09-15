// Дії стору, додані для сітки підбору: вставка артикулів у показані рядки і пакетне оновлення рядків.
import { afterEach, describe, expect, it } from 'vitest';
import type { MockDataSource } from '@/data/mock/MockDataSource';
import { DEMO_USER_IDS, supplierIdOf } from '@/data/mock/seed';
import { createTestEnv, type TestEnv } from '@/test/mockEnv';
import { createRequestDocStore, type RequestDocStoreApi } from '../requestDocStore';

let env: TestEnv | undefined;
const stores: RequestDocStoreApi[] = [];

afterEach(async () => {
  for (const s of stores.splice(0)) await s.getState().unload();
  env?.dispose();
  env = undefined;
});

async function openNew(): Promise<{ tab: MockDataSource; store: RequestDocStoreApi }> {
  env = createTestEnv();
  const tab = env.tab('a', DEMO_USER_IDS.koval);
  const { id } = await tab.createRequest({ clientId: 'cli-c1' });
  const store = createRequestDocStore({ ds: tab, bindPageLifecycle: false });
  stores.push(store);
  await store.getState().load(id);
  return { tab, store };
}

describe('requestDocStore — дії сітки підбору', () => {
  it('pasteSkusToLines: артикули в задані рядки (порядок сітки з фільтром), невідомі — у звіті', async () => {
    const { tab, store } = await openNew();
    const [l1, l2, l3] = store.getState().addLines([
      { clientName: 'Позиція 1', qty: 1 },
      { clientName: 'Позиція 2', qty: 1 },
      { clientName: 'Позиція 3', qty: 1 },
    ]);
    const blockId = store.getState().addBlock(supplierIdOf('s1'))!;
    const [p1, p2] = await tab.searchProducts({ q: '', supplierId: supplierIdOf('s1'), limit: 2 });
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
    const { tab, store } = await openNew();
    const [l1, l2] = store.getState().addLines([
      { clientName: 'А', qty: 1 },
      { clientName: 'Б', qty: 1 },
    ]);
    const blockId = store.getState().addBlock(supplierIdOf('s1'))!;
    const [p] = await tab.searchProducts({ q: '', supplierId: supplierIdOf('s1'), limit: 1 });
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
