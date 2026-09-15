import type { CellClassParams, ColDef, ColGroupDef, EditableCallbackParams } from 'ag-grid-community';
import { describe, expect, it } from 'vitest';
import { computeRequest } from '@shared/pricing';
import { makeBlock, makeCtx, makeDoc, makeLine, makeSupplier, uah } from '@shared/pricing/__tests__/fixtures';
import { BLOCK_FIELDS, COL } from '../colIds';
import { buildColumnDefs, flattenColIds, type SourcingColumn } from '../columns';
import type { SourcingGridContext } from '../gridContext';
import { buildLineRows, buildTotalsRow, NEW_ROW, type SourcingRow } from '../rows';

const BLOCKS = ['b1', 'b2'];
const none = new Set<string>();

function findCol(cols: readonly SourcingColumn[], colId: string): ColDef<SourcingRow> {
  for (const c of cols) {
    if ('children' in c) {
      const hit = c.children.find((x) => 'colId' in x && x.colId === colId);
      if (hit) return hit as ColDef<SourcingRow>;
    } else if (c.colId === colId) return c;
  }
  throw new Error(`no column ${colId}`);
}

const ctx = (readOnly: boolean) => ({ isReadOnly: () => readOnly }) as unknown as SourcingGridContext;

/** Класи з cellClassRules, що спрацювали для рядка. */
const classesOf = (cols: readonly SourcingColumn[], colId: string, data: SourcingRow) =>
  Object.entries(findCol(cols, colId).cellClassRules ?? {})
    .filter(([, rule]) => (rule as (p: CellClassParams<SourcingRow>) => boolean)({ data } as CellClassParams<SourcingRow>))
    .map(([name]) => name);

describe('buildColumnDefs — «Підбір»', () => {
  const cols = buildColumnDefs({ mode: 'sourcing', blockIds: BLOCKS, collapsed: none });

  it('закріплені колонки клієнта і «Обрано», далі групи блоків з повним набором колонок', () => {
    const ids = flattenColIds(cols);
    expect(ids.slice(0, 5)).toEqual([COL.pos, COL.line('clientName'), COL.line('clientUnit'), COL.line('qty'), COL.chosen]);
    expect(ids.slice(5, 5 + BLOCK_FIELDS.length)).toEqual(BLOCK_FIELDS.map((f) => COL.block('b1', f)));
    expect(ids).toHaveLength(5 + BLOCK_FIELDS.length * 2);
    for (const c of cols.slice(0, 5)) expect((c as ColDef).pinned).toBe('left');
  });

  it('група на блок — з власним вмістом шапки і маркером початку блоку', () => {
    const groups = cols.filter((c): c is ColGroupDef<SourcingRow> => 'children' in c);
    expect(groups.map((g) => g.groupId)).toEqual([COL.group('b1'), COL.group('b2')]);
    expect(groups[0].headerGroupComponentParams).toMatchObject({ blockId: 'b1' });
    expect(groups[0].headerGroupComponentParams.innerHeaderGroupComponent).toBeTypeOf('function');
    expect((groups[0].children[0] as ColDef).cellClass).toContain('po-block-start');
    expect((groups[0].children[1] as ColDef).cellClass).not.toContain('po-block-start');
  });

  it('згорнутий блок: Артикул | Без ПДВ | ✔', () => {
    const collapsed = buildColumnDefs({ mode: 'sourcing', blockIds: BLOCKS, collapsed: new Set(['b2']) });
    const ids = flattenColIds(collapsed).filter((id) => id.startsWith('b:b2:'));
    expect(ids).toEqual([COL.block('b2', 'sku'), COL.block('b2', 'net'), COL.block('b2', 'pick')]);
    expect(flattenColIds(collapsed).filter((id) => id.startsWith('b:b1:'))).toHaveLength(BLOCK_FIELDS.length);
    // у згорнутому блоці «Без ПДВ» показує всі попередження пропозиції (кратність, наявність тощо)
    expect(findCol(collapsed, COL.block('b2', 'net')).cellRendererParams).toEqual({ blockId: 'b2', allWarnings: true });
    expect(findCol(collapsed, COL.block('b1', 'net')).cellRendererParams).toEqual({ blockId: 'b1', allWarnings: false });
  });

  it('попередження підсвічуються лише в невиключених пропозиціях (кратність — у «К-сть», наявність — у «Наявн.»)', () => {
    const doc = makeDoc({
      lines: [makeLine('l1', 5), makeLine('l2', 5)],
      blocks: [makeBlock('b1', 1), makeBlock('b2', 2)],
      offers: [uah('l1', 'b1', 10, { qty: 5, multiplicity: 4, stockQty: 2 }), uah('l2', 'b1', 10, { stockQty: 2, excluded: true })],
    });
    const [r1, r2] = buildLineRows({ doc, computed: computeRequest(doc, makeCtx([makeSupplier('b1'), makeSupplier('b2')])), misses: {} });
    expect(classesOf(cols, COL.block('b1', 'qty'), r1)).toContain('po-cell-warning');
    expect(classesOf(cols, COL.block('b1', 'stock'), r1)).toContain('po-cell-warning');
    expect(classesOf(cols, COL.block('b1', 'stock'), r2)).not.toContain('po-cell-warning');
    expect(classesOf(cols, COL.block('b1', 'stock'), r2)).toContain('po-cell-excluded');
  });

  it('редагування: лише рядки клієнта і не в режимі перегляду; к-сть/примітка — лише з пропозицією; порожній рядок унизу — колонки клієнта', () => {
    const doc = makeDoc({ lines: [makeLine('l1', 2), makeLine('l2', 1)], blocks: [makeBlock('b1', 1), makeBlock('b2', 2)], offers: [uah('l1', 'b1', 100)] });
    const computed = computeRequest(doc, makeCtx([makeSupplier('b1'), makeSupplier('b2')]));
    const [row1, row2] = buildLineRows({ doc, computed, misses: {} });
    const totals = buildTotalsRow(doc, computed);
    const editable = (colId: string, data: SourcingRow, readOnly = false) => {
      const e = findCol(cols, colId).editable as (p: EditableCallbackParams<SourcingRow>) => boolean;
      return e({ data, context: ctx(readOnly) } as EditableCallbackParams<SourcingRow>);
    };
    expect(editable(COL.line('clientName'), row1)).toBe(true);
    expect(editable(COL.line('clientName'), row1, true)).toBe(false);
    expect(editable(COL.line('qty'), totals)).toBe(false);
    expect(editable(COL.block('b1', 'sku'), row2)).toBe(true);
    expect(editable(COL.block('b1', 'qty'), row1)).toBe(true);
    expect(editable(COL.block('b1', 'qty'), row2)).toBe(false);
    expect(findCol(cols, COL.block('b1', 'net')).editable).toBeUndefined();
    // порожній рядок: введення в назву / од. / к-сть створює рядок заявки; колонки блоку — ні
    for (const f of ['clientName', 'clientUnit', 'qty'] as const) {
      expect(editable(COL.line(f), NEW_ROW)).toBe(true);
      expect(editable(COL.line(f), NEW_ROW, true)).toBe(false);
    }
    expect(editable(COL.block('b1', 'sku'), NEW_ROW)).toBe(false);
  });

  it('кольори: мінімум, затверджено, «не затверджено», виключено, порожньо', () => {
    const doc = makeDoc({
      lines: [makeLine('l1', 1), makeLine('l2', 1, { selection: { blockId: 'b2' } }), makeLine('l3', 1)],
      blocks: [makeBlock('b1', 1), makeBlock('b2', 2)],
      offers: [uah('l1', 'b1', 100), uah('l1', 'b2', 120), uah('l2', 'b1', 50), uah('l2', 'b2', 60), uah('l3', 'b1', 10, { excluded: true })],
    });
    const computed = computeRequest(doc, makeCtx([makeSupplier('b1'), makeSupplier('b2')]));
    const [r1, r2, r3] = buildLineRows({ doc, computed, misses: {} });
    const cls = (colId: string, data: SourcingRow) =>
      Object.entries(findCol(cols, colId).cellClassRules ?? {})
        .filter(([, rule]) => (rule as (p: CellClassParams<SourcingRow>) => boolean)({ data } as CellClassParams<SourcingRow>))
        .map(([name]) => name);
    expect(cls(COL.block('b1', 'net'), r1)).toEqual(expect.arrayContaining(['po-cell-min', 'po-cell-not-approved']));
    expect(cls(COL.block('b2', 'net'), r1)).toEqual([]);
    expect(cls(COL.block('b2', 'net'), r2)).toContain('po-cell-approved');
    expect(cls(COL.block('b1', 'sum'), r3)).toContain('po-cell-excluded');
    expect(cls(COL.block('b2', 'sku'), r3)).toContain('po-cell-empty');
  });
});

describe('buildColumnDefs — «Порівняння»', () => {
  const cols = buildColumnDefs({ mode: 'comparison', blockIds: BLOCKS, collapsed: new Set(['b1']) });

  it('№ | Найменування | Од. | К-сть, по колонці на блок, «Обрано» закріплено праворуч', () => {
    expect(flattenColIds(cols)).toEqual([COL.pos, COL.line('clientName'), COL.line('clientUnit'), COL.line('qty'), COL.compare('b1'), COL.compare('b2'), COL.chosen]);
    expect(cols.some((c) => 'children' in c)).toBe(false);
    expect(findCol(cols, COL.chosen).pinned).toBe('right');
    expect(findCol(cols, COL.compare('b1')).headerComponentParams).toEqual({ blockId: 'b1' });
  });

  it('набори колонок режимів не перетинаються в колонках блоків', () => {
    const sourcing = flattenColIds(buildColumnDefs({ mode: 'sourcing', blockIds: BLOCKS, collapsed: none }));
    const comparison = flattenColIds(cols);
    expect(sourcing.filter((id) => comparison.includes(id))).toEqual([COL.pos, COL.line('clientName'), COL.line('clientUnit'), COL.line('qty'), COL.chosen]);
  });

  it('колонки клієнта закріплені ліворуч; клітинка блоку — ціна без ПДВ (під нею артикул)', () => {
    for (const id of [COL.pos, COL.line('clientName'), COL.line('clientUnit'), COL.line('qty')]) expect(findCol(cols, id).pinned).toBe('left');
    expect(findCol(cols, COL.compare('b1')).pinned).toBeUndefined();
    const doc = makeDoc({ lines: [makeLine('l1', 2)], blocks: [makeBlock('b1', 1), makeBlock('b2', 2)], offers: [uah('l1', 'b2', 100)] });
    const [row] = buildLineRows({ doc, computed: computeRequest(doc, makeCtx([makeSupplier('b1'), makeSupplier('b2')])), misses: {} });
    const value = (colId: string) => (findCol(cols, colId).valueGetter as (p: { data: SourcingRow }) => unknown)({ data: row });
    expect(value(COL.compare('b2'))).toBe(100);
    expect(value(COL.compare('b1'))).toBeNull();
    expect(value(COL.chosen)).toBe(100);
  });

  it('кольори як у «Підборі»: мінімум, «не затверджено» (у т.ч. затверджена стала недійсною), затверджено, виключено', () => {
    const doc = makeDoc({
      lines: [makeLine('l1', 1), makeLine('l2', 1, { selection: { blockId: 'b1' } }), makeLine('l3', 1, { selection: { blockId: 'b2' } })],
      blocks: [makeBlock('b1', 1), makeBlock('b2', 2)],
      offers: [
        uah('l1', 'b1', 100),
        uah('l1', 'b2', 120),
        uah('l2', 'b1', 50, { purchasePriceCur: null }),
        uah('l2', 'b2', 60),
        uah('l3', 'b1', 10, { excluded: true }),
        uah('l3', 'b2', 12),
      ],
    });
    const [r1, r2, r3] = buildLineRows({ doc, computed: computeRequest(doc, makeCtx([makeSupplier('b1'), makeSupplier('b2')])), misses: {} });
    expect(classesOf(cols, COL.compare('b1'), r1)).toEqual(expect.arrayContaining(['po-cell-min', 'po-cell-not-approved']));
    expect(classesOf(cols, COL.compare('b2'), r1)).toEqual([]);
    // l2: затверджено b1, але ціни там немає → діє рекомендація b2 «не затверджено»
    expect(classesOf(cols, COL.compare('b2'), r2)).toEqual(expect.arrayContaining(['po-cell-min', 'po-cell-not-approved']));
    expect(classesOf(cols, COL.compare('b2'), r3)).toEqual(expect.arrayContaining(['po-cell-min', 'po-cell-approved']));
    expect(classesOf(cols, COL.compare('b1'), r3)).toEqual(['po-cell-excluded']);
  });

  it('без блоків — лише колонки клієнта і «Обрано»', () => {
    expect(flattenColIds(buildColumnDefs({ mode: 'comparison', blockIds: [], collapsed: none }))).toHaveLength(5);
    expect(flattenColIds(buildColumnDefs({ mode: 'sourcing', blockIds: [], collapsed: none }))).toHaveLength(5);
  });
});
