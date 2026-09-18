import { describe, expect, it } from 'vitest';
import { MARKUP, makeBlock, makeHeader, makeLine, makeSupplier, uah } from '../../pricing/__tests__/fixtures';
import { copyRequestDoc, type CopyInputs } from '../copy';

let seq = 0;
const inputs = (patch: Partial<CopyInputs> = {}): CopyInputs => ({
  source: {
    id: 'src',
    header: makeHeader({ number: 5, status: 'done', approvalKpId: 'kp-1' }),
    markup: { ...MARKUP, method: 'markup_on_cost', value: 20 },
    lines: [makeLine('L1', 2, { position: 1, selection: { blockId: 'A' }, markup: { method: 'rrp', value: null, manualPriceNet: null }, approval: { approved: true, approvedQty: 2 } })],
    blocks: [makeBlock('A', 1)],
    offers: [uah('L1', 'A', 100, { productId: 'p1' })],
  },
  body: { include: 'sourcing', priceMode: 'keep' },
  number: 12,
  today: '2026-09-18',
  now: new Date('2026-09-18T10:00:00Z'),
  at: '2026-09-18T10:00:00Z',
  user: { id: 'u2', shortName: 'Бондар І.С.' },
  rates: { USD: 45, EUR: 52, date: '2026-09-18' },
  client: null,
  kpSettings: makeHeader().kpSettings,
  markupDefaults: MARKUP,
  suppliers: { A: makeSupplier('A') },
  products: new Map(),
  newId: () => `n${++seq}`,
  ...patch,
});

describe('копія заявки', () => {
  it('новий номер, сьогодні, «В роботі», відповідальний — хто копіює; без погодження й КП-основи', () => {
    const { state, report, eventSummary } = copyRequestDoc(inputs());
    expect(state.header).toMatchObject({ number: 12, requestDate: '2026-09-18', status: 'in_progress', managerId: 'u2', approvalKpId: null });
    expect(state.lines[0].approval).toEqual({ approved: false, approvedQty: null });
    expect(state.lines[0].selection.blockId).toBe(state.blocks[0].id);
    expect(state.offers[0]).toMatchObject({ lineId: state.lines[0].id, blockId: state.blocks[0].id, purchasePriceCur: 100 });
    // підбір без націнки: націнка — за замовчуванням, рядкова — скинута
    expect(state.markup.method).toBe(MARKUP.method);
    expect(state.lines[0].markup.method).toBeNull();
    expect(report).toMatchObject({ offersTotal: 1, offersUnchanged: 1, include: 'sourcing' });
    expect(eventSummary).toBe('Створено копією заявки № 000005: позиції і підбір, ціни з оригіналу');
  });

  it('лише позиції: без блоків і пропозицій', () => {
    const { state } = copyRequestDoc(inputs({ body: { include: 'lines', priceMode: 'keep' } }));
    expect(state.blocks).toEqual([]);
    expect(state.offers).toEqual([]);
    expect(state.lines[0].selection.blockId).toBeNull();
  });

  it('перерахувати ціни за каталогом: ▲ і звіт; товару немає в каталозі — лишається зі старою ціною', () => {
    const product = { id: 'p1', sku: 'SKU', nameWork: 'Кран', name1c: null, unitCode: 'шт', currency: 'UAH' as const, purchasePrice: 110, rrp: null, multiplicity: 1, stockQty: 5, availability: 'in_stock' as const, priceUpdatedAt: '2026-09-17T00:00:00Z', isArchived: false };
    const up = copyRequestDoc(inputs({ body: { include: 'full', priceMode: 'refresh' }, products: new Map([['p1', product]]) }));
    expect(up.state.offers[0].purchasePriceCur).toBe(110);
    expect(up.state.offers[0].priceChange?.reason).toBe('copy_refresh');
    expect(up.report).toMatchObject({ offersRefreshed: 1, priceUp: 1 });
    expect(up.state.markup.value).toBe(20);
    const missing = copyRequestDoc(inputs({ body: { include: 'sourcing', priceMode: 'refresh' } }));
    expect(missing.report.offersNotInCatalog).toBe(1);
    expect(missing.state.offers[0].purchasePriceCur).toBe(100);
  });
});
