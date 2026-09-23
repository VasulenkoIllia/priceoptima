import { describe, expect, it } from 'vitest';
import type { Offer, RequestDocument, RequestLine } from '@shared/types';
import { describeUnsavedChanges } from '../unsavedChanges';

const line = (id: string, position: number, patch: Partial<RequestLine> = {}): RequestLine => ({
  id,
  position,
  clientName: `Позиція ${id}`,
  clientUnit: 'шт',
  qty: 1,
  clientNote: null,
  selection: { blockId: null },
  markup: { method: null, value: null, manualPriceNet: null },
  approval: { approved: false, approvedQty: null },
  kpName: null,
  ...patch,
});

const offer = (id: string, lineId: string, patch: Partial<Offer> = {}): Offer =>
  ({ id, lineId, blockId: 'b1', sku: 'A-1', purchasePriceCur: 100, qty: null, excluded: false, note: null, ...patch }) as Offer;

function doc(lines: RequestLine[], offers: Offer[] = []): RequestDocument {
  return {
    header: { title: "Об'єкт", notes: null },
    markup: { method: 'markup_on_cost', value: 20, rounding: 'kopecks', excludeUnavailable: false },
    lines,
    blocks: [{ id: 'b1', position: 1, supplierId: 's1' }],
    offers,
    refs: { suppliers: { s1: { name: 'САНТЕХ' } } },
  } as unknown as RequestDocument;
}

describe('незбережені зміни людською мовою', () => {
  it('рядки: нові, змінені, видалені; пропозиції; шапка', () => {
    const l1 = line('L1', 1, { clientName: 'Кран', qty: 4 });
    const l2 = line('L2', 2, { clientName: 'Муфта' });
    const prev = doc([l1, l2], [offer('o1', 'L1')]);
    const next = {
      ...doc(
        [{ ...l1, qty: 6, selection: { blockId: 'b1' } }, line('L3', 3, { clientName: 'Трійник', qty: 2 })],
        [{ ...prev.offers[0]!, sku: 'A-2', excluded: true }],
      ),
      header: { ...prev.header, notes: 'нова нотатка' },
    } as RequestDocument;
    expect(describeUnsavedChanges(prev, next)).toEqual([
      'Шапка: змінено «Нотатки»',
      'Рядок 1 «Кран»: к-сть 4 → 6; ✔ САНТЕХ',
      'Новий рядок 2: «Трійник», 2 шт',
      'Видалено рядок 2 «Муфта»',
      'Рядок 1 «Кран», САНТЕХ: артикул A-1 → A-2; «не підходить»',
    ]);
  });

  it('без змін — порожньо', () => {
    const d = doc([line('L1', 1)]);
    expect(describeUnsavedChanges(d, d)).toEqual([]);
  });
});
