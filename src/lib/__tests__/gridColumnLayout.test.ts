// Ширина й порядок колонок, задані користувачем, зберігаються й підставляються при новій побудові сітки (правки замовника 25.09 п.1).
import type { ColDef, ColGroupDef } from 'ag-grid-community';
import { beforeEach, describe, expect, it } from 'vitest';
import { COL, columnWidthKey } from '@/pages/request-editor/sourcing/colIds';
import { buildColumnDefs, type SourcingColumn } from '@/pages/request-editor/sourcing/columns';
import { useUiPrefs } from '@/stores/uiPrefsStore';
import { orderByPreference, reorderSubset, withSavedLayout, withSavedOrder, withSavedWidths } from '../gridColumnLayout';

type Row = { id: string };

function widthOf(cols: SourcingColumn[], colId: string): number | undefined {
  for (const c of cols) {
    if ('children' in c) {
      const inner = widthOf(c.children as SourcingColumn[], colId);
      if (inner != null) return inner;
    } else if (c.colId === colId) return c.width;
  }
  return undefined;
}

describe('ключ ширини в «Підборі»', () => {
  it('поле блоку — одне на всі блоки; колонки клієнта — окремо для «Підбору» й «Порівняння»', () => {
    expect(columnWidthKey('sourcing', COL.block('b1', 'name'))).toBe('sourcing:block:name');
    expect(columnWidthKey('sourcing', COL.block('b2', 'name'))).toBe('sourcing:block:name');
    expect(columnWidthKey('comparison', COL.compare('b1'))).toBe(columnWidthKey('comparison', COL.compare('b2')));
    expect(columnWidthKey('sourcing', COL.line('clientName'))).toBe('sourcing:line:clientName');
    expect(columnWidthKey('comparison', COL.line('clientName'))).toBe('comparison:line:clientName');
    expect(columnWidthKey('sourcing', 'щось-інше')).toBeNull();
  });
});

describe('withSavedWidths', () => {
  it('збережена ширина — у колонку й у всі блоки, у групах теж; решта без змін', () => {
    const saved = { 'sourcing:block:name': 333, 'sourcing:line:clientName': 410 };
    const cols = withSavedWidths(buildColumnDefs({ mode: 'sourcing', blockIds: ['b1', 'b2'], collapsed: new Set() }), (id) => columnWidthKey('sourcing', id), saved);
    expect(widthOf(cols, COL.block('b1', 'name'))).toBe(333);
    expect(widthOf(cols, COL.block('b2', 'name'))).toBe(333);
    expect(widthOf(cols, COL.line('clientName'))).toBe(410);
    expect(widthOf(cols, COL.block('b1', 'sku'))).toBe(118);
  });

  it('колонка з flex отримує задану ширину й перестає тягнутись', () => {
    const cols: (ColDef<Row> | ColGroupDef<Row>)[] = [{ colId: 'client', flex: 1, minWidth: 170 }, { colId: 'qty', width: 76 }];
    const [client, qty] = withSavedWidths(cols, (id) => `markup:${id}`, { 'markup:client': 520 }) as ColDef<Row>[];
    expect(client).toMatchObject({ width: 520, flex: undefined, minWidth: 170 });
    expect(qty).toBe(cols[1]);
  });
});

describe('збереження ширин', () => {
  beforeEach(() => useUiPrefs.setState({ columnWidths: {} }));

  it('нові ширини додаються до збережених і потрапляють у localStorage', () => {
    useUiPrefs.getState().setColumnWidths({ 'markup:client': 400 });
    useUiPrefs.getState().setColumnWidths({ 'markup:method': 120 });
    expect(useUiPrefs.getState().columnWidths).toEqual({ 'markup:client': 400, 'markup:method': 120 });
    const saved = JSON.parse(localStorage.getItem('po-ui-prefs') ?? '{}') as { state?: { columnWidths?: unknown } };
    expect(saved.state?.columnWidths).toEqual({ 'markup:client': 400, 'markup:method': 120 });
  });
});

describe('порядок колонок', () => {
  it('збережений порядок; нові колонки — на своєму стандартному місці; невідомі — відкидаються', () => {
    expect(orderByPreference(['a', 'b', 'c', 'd'], undefined)).toEqual(['a', 'b', 'c', 'd']);
    expect(orderByPreference(['a', 'b', 'c', 'd'], ['c', 'a', 'd', 'b'])).toEqual(['c', 'a', 'd', 'b']);
    // «b» з'явилась пізніше — стає після свого стандартного сусіда «a»; «x» більше немає
    expect(orderByPreference(['a', 'b', 'c'], ['c', 'x', 'a'])).toEqual(['c', 'a', 'b']);
    expect(orderByPreference(['a', 'b', 'c'], ['c', 'b'])).toEqual(['a', 'c', 'b']);
  });

  it('частину переставили — вона займає ті самі місця в повному порядку', () => {
    expect(reorderSubset(['sku', 'name', 'unit', 'net', 'gross', 'pick'], ['net', 'sku', 'pick'])).toEqual(['net', 'name', 'unit', 'sku', 'gross', 'pick']);
  });

  it('сітка: закріплені лишаються на місці, решта — у збереженому порядку; закріплені стають нерухомими', () => {
    const cols: ColDef<Row>[] = [{ colId: 'n', pinned: 'left' }, { colId: 'qty' }, { colId: 'cost' }, { field: 'rrp' as never }, { colId: 'warn', pinned: 'right' }];
    const ordered = withSavedOrder(cols, 'markup', { markup: ['rrp', 'qty', 'cost'] });
    expect(ordered.map((c) => c.colId ?? c.field)).toEqual(['n', 'rrp', 'qty', 'cost', 'warn']);
    const layout = withSavedLayout(cols, 'markup');
    expect(layout[0]).toMatchObject({ colId: 'n', suppressMovable: true });
    expect(layout[1].suppressMovable).toBeUndefined();
  });

  it('«Підбір»: порядок полів — у всіх блоках, межа блоку на першому; «✔» нерухома, решта переставляється', () => {
    const cols = buildColumnDefs({ mode: 'sourcing', blockIds: ['b1', 'b2'], collapsed: new Set(['b2']), blockOrder: ['net', 'sku', 'name', 'unit', 'qty', 'gross', 'sum', 'rrp', 'stock', 'note', 'exclude', 'pick'] });
    const group = (id: string) => cols.find((c) => 'groupId' in c && c.groupId === `grp:${id}`) as ColGroupDef<Row>;
    const b1 = group('b1').children as ColDef<Row>[];
    const b2 = group('b2').children as ColDef<Row>[];
    expect(b1.slice(0, 4).map((c) => c.colId)).toEqual([COL.block('b1', 'net'), COL.block('b1', 'sku'), COL.block('b1', 'name'), COL.block('b1', 'unit')]);
    expect(b2.map((c) => c.colId)).toEqual([COL.block('b2', 'net'), COL.block('b2', 'sku'), COL.block('b2', 'pick')]);
    expect(b1[0].headerClass).toContain('po-block-start');
    expect(b1[1].headerClass).not.toContain('po-block-start');
    expect(b1.find((c) => c.colId === COL.block('b1', 'pick'))?.suppressMovable).toBe(true);
    expect(b1[0].suppressMovable).toBe(false);
  });
});
