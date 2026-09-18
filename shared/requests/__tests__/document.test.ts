import { describe, expect, it } from 'vitest';
import { MARKUP, makeBlock, makeHeader, makeLine, uah } from '../../pricing/__tests__/fixtures';
import { applyDocumentPatch, diffById, type RequestDocState } from '../document';
import { createEventLog, documentEventsBefore, recordDocumentEvents } from '../events';

const state = (): RequestDocState => ({
  header: makeHeader(),
  markup: MARKUP,
  lines: [makeLine('L1', 1, { position: 1, selection: { blockId: 'B' } }), makeLine('L2', 2, { position: 2 })],
  blocks: [makeBlock('A', 1), makeBlock('B', 2)],
  offers: [uah('L1', 'A', 10), uah('L1', 'B', 12), uah('L2', 'A', 5)],
});

describe('документ заявки: застосування дельти', () => {
  it('каскад: видалений блок забирає пропозиції й ✔ на нього; вхід не змінюється', () => {
    const s = state();
    const next = applyDocumentPatch(s, { baseVersion: 1, sessionId: 's', delete: { blockIds: ['B'] } });
    expect(next.offers.map((o) => o.id)).toEqual(['L1:A', 'L2:A']);
    expect(next.lines[0].selection.blockId).toBeNull();
    expect(s.offers).toHaveLength(3);
  });

  it('upsert: нові й змінені записи; одна пропозиція на пару (перемагає остання); шапка — лише редаговані поля', () => {
    const next = applyDocumentPatch(state(), {
      baseVersion: 1,
      sessionId: 's',
      header: { title: 'Об’єкт', number: 99 } as never,
      upsert: { lines: [makeLine('L3', 5, { position: 3 })], offers: [uah('L2', 'A', 6, { id: 'new' })] },
    });
    expect(next.header.title).toBe('Об’єкт');
    expect(next.header.number).toBe(1);
    expect(next.lines.map((l) => l.id)).toEqual(['L1', 'L2', 'L3']);
    expect(next.offers.find((o) => o.lineId === 'L2')?.id).toBe('new');
  });

  it('різниця для бази: змінені, нові й видалені', () => {
    const before = state().offers;
    const after = [{ ...before[0], purchasePriceCur: 11 }, before[1], uah('L2', 'B', 7)];
    const diff = diffById(before, after);
    expect(diff.upsert.map((o) => o.id)).toEqual(['L1:A', 'L2:B']);
    expect(diff.deleteIds).toEqual(['L2:A']);
  });

  it('порядок ключів JSON (так віддає jsonb) — не зміна', () => {
    const before = state().lines;
    const after = before.map((l) => ({ ...l, markup: { manualPriceNet: l.markup.manualPriceNet, value: l.markup.value, method: l.markup.method } }));
    expect(diffById(before, after).upsert).toEqual([]);
  });
});

describe('історія заявки', () => {
  const user = { id: 'u1', shortName: 'Коваль О.В.' };
  const ctx = (at: string) => ({ supplierName: (id: string | null) => `Пост. ${id}`, kps: [], user, at });

  it('позиції: сусідні зміни одного користувача за 10 хв зливаються; постачальник — окремою подією', () => {
    const s0 = state();
    const log = createEventLog({ id: 7, at: '2026-09-18T10:00:00Z', user, kind: 'lines_change', group: 'lines', counts: { added: 1 }, summary: 'Позиції: додано 1' });
    const patch = { baseVersion: 1, sessionId: 's', upsert: { lines: [makeLine('L3', 5, { position: 3 })], blocks: [makeBlock('C', 3)] } };
    const s1 = applyDocumentPatch(s0, patch);
    recordDocumentEvents(log, s1, documentEventsBefore(s0), patch, ctx('2026-09-18T10:05:00Z'));
    const { update, insert } = log.changes();
    expect(update).toMatchObject({ id: 7, summary: 'Позиції: додано 2', at: '2026-09-18T10:05:00Z' });
    expect(insert.map((e) => e.summary)).toEqual(['Додано постачальника Пост. C']);
  });

  it('через 10 хв — нова подія; ✔ і погодження', () => {
    const s0 = state();
    const log = createEventLog({ at: '2026-09-18T09:00:00Z', user, kind: 'lines_change', group: 'lines', counts: { added: 1 }, summary: 'Позиції: додано 1' });
    const patch = {
      baseVersion: 1,
      sessionId: 's',
      upsert: {
        lines: [makeLine('L2', 2, { position: 2, selection: { blockId: 'A' }, approval: { approved: true, approvedQty: null } }), makeLine('L4', 1, { position: 4 })],
      },
    };
    const s1 = applyDocumentPatch(s0, patch);
    recordDocumentEvents(log, s1, documentEventsBefore(s0), patch, ctx('2026-09-18T10:00:00Z'));
    const { update, insert } = log.changes();
    expect(update).toBeNull();
    expect(insert.map((e) => e.summary)).toEqual(['Позиції: додано 1', 'Підбір: ✔ затверджено 1', 'Погоджено позицій: 1 з 3']);
  });

  it('змінено лише к-сть: без події «Націнка», хоч ключі націнки з бази в іншому порядку', () => {
    const s0 = state();
    s0.lines = s0.lines.map((l) => ({ ...l, markup: { value: l.markup.value, method: l.markup.method, manualPriceNet: l.markup.manualPriceNet } }));
    const log = createEventLog(null);
    const patch = { baseVersion: 1, sessionId: 's', upsert: { lines: [makeLine('L1', 7, { position: 1, selection: { blockId: 'B' } })] } };
    recordDocumentEvents(log, applyDocumentPatch(s0, patch), documentEventsBefore(s0), patch, ctx('2026-09-18T10:00:00Z'));
    expect(log.changes().insert.map((e) => e.kind)).toEqual(['lines_change']);
  });
});
