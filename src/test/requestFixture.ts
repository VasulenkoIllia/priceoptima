// Типова заявка для тестів стора: 3 постачальники, 6 рядків з різною кількістю кандидатів,
// ручний неоптимальний вибір у L4 і ціна в каталозі, що змінилась після підбору (L5).
import { makeBlock, makeLine, uah } from '@shared/pricing/__tests__/fixtures';
import type { Offer } from '@shared/types';
import { FakeServer, pickProduct, supplierItem, USERS } from './fakeServer';

export const SUPPLIERS = ['s1', 's2', 's3', 's4'] as const;

export function createServerWithRequest(): { srv: FakeServer; requestId: string } {
  const srv = new FakeServer();
  srv.suppliers = SUPPLIERS.map((id, i) => supplierItem(id, { sortOrder: i }));

  const blocks = [makeBlock('b1', 1, { supplierId: 's1' }), makeBlock('b2', 2, { supplierId: 's2' }), makeBlock('b3', 3, { supplierId: 's3' })];
  const lines = [
    makeLine('L1', 2, { position: 1 }),
    makeLine('L2', 3, { position: 2 }),
    makeLine('L3', 10, { position: 3 }),
    makeLine('L4', 1, { position: 4, selection: { blockId: 'b2' } }),
    makeLine('L5', 4, { position: 5 }),
    makeLine('L6', 5, { position: 6 }),
  ];
  const offers: Offer[] = [
    uah('L1', 'b1', 100),
    uah('L1', 'b2', 90),
    uah('L1', 'b3', 120),
    uah('L2', 'b1', 50),
    uah('L2', 'b2', 55),
    uah('L3', 'b1', 10),
    uah('L3', 'b3', 12),
    uah('L4', 'b2', 200),
    uah('L4', 'b3', 180),
    uah('L5', 'b1', 30),
    uah('L6', 'b2', 70),
    uah('L6', 'b3', 65),
  ];
  const supplierOf: Record<string, string> = { b1: 's1', b2: 's2', b3: 's3' };
  for (const o of offers) {
    // L5: після підбору постачальник підняв ціну
    const price = o.lineId === 'L5' ? 33 : o.purchasePriceCur;
    srv.addProducts(pickProduct(o.productId!, supplierOf[o.blockId], { sku: o.sku!, nameWork: o.nameWork!, purchasePrice: price }));
  }
  // товари без підбору: для вставки артикулів, кратності й нового постачальника
  srv.addProducts(
    pickProduct('p-s1-a', 's1', { sku: 'S1-001' }),
    pickProduct('p-s1-b', 's1', { sku: 'S1-002' }),
    pickProduct('p-s2-a', 's2', { sku: 'S2-A-10', purchasePrice: 40 }),
    pickProduct('p-s2-b', 's2', { sku: 'S2-B-20', purchasePrice: 60 }),
    pickProduct('p-pipe', 's2', { sku: 'PPR-40', nameWork: 'Труба ППР 40', unitCode: 'м', multiplicity: 4, purchasePrice: 25 }),
    pickProduct('p-s4', 's4', { sku: 'S4-001', purchasePrice: 15 }),
  );

  const requestId = srv.addRequest({
    header: { managerId: USERS.koval.id },
    markup: { method: 'markup_on_cost', value: 20, rounding: 'kopecks', excludeUnavailable: false },
    lines,
    blocks,
    offers,
  });
  return { srv, requestId };
}
