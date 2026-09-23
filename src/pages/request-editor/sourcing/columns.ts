// Набори колонок сітки для двох режимів (одна сітка, перемикання columnDefs).
import type { CellClassParams, ColDef, ColGroupDef, EditableCallbackParams, ValueGetterParams } from 'ag-grid-community';
import { formatMoney, formatQty } from '@shared/format';
import type { UUID } from '@shared/types';
import type { EditorMode } from '@/stores/uiPrefsStore';
import { BlockGroupHeader, CompareColumnHeader } from './BlockHeader';
import {
  BlockQtyCell,
  cellWarnings,
  ChosenCell,
  ClientNameCell,
  CompareCell,
  CompareChosenCell,
  EXCLUDE_HINT,
  ExcludeCell,
  FillCell,
  OfferNameCell,
  PickCell,
  PosCell,
  PriceCell,
  SkuCell,
  StockCell,
  UnitCell,
} from './cells';
import { BLOCK_FIELDS, COL, COLLAPSED_BLOCK_FIELDS, type BlockField } from './colIds';
import type { SourcingGridContext } from './gridContext';
import { isLineRow, isNotApproved, type BlockCell, type SourcingRow } from './rows';
import { SkuEditor } from './SkuEditor';

export type SourcingColDef = ColDef<SourcingRow>;
export type SourcingColumn = ColDef<SourcingRow> | ColGroupDef<SourcingRow>;

export interface BuildColumnsInput {
  mode: EditorMode;
  /** Блоки в порядку показу. */
  blockIds: readonly UUID[];
  /** Згорнуті блоки (лише для «Підбору»). */
  collapsed: ReadonlySet<UUID>;
}

type Ctx = { context: SourcingGridContext };

const canEditRow = (p: EditableCallbackParams<SourcingRow> & Ctx) => isLineRow(p.data) && !p.context.isReadOnly();
/** Колонки клієнта редагуються й у порожньому рядку внизу (введення створює новий рядок заявки). */
const canEditClient = (p: EditableCallbackParams<SourcingRow> & Ctx) =>
  (isLineRow(p.data) || p.data?.kind === 'new') && !p.context.isReadOnly();

const cellOf = (data: SourcingRow | undefined, blockId: UUID): BlockCell | undefined =>
  isLineRow(data) ? data.cells[blockId] : undefined;

const FILL_HINT = 'Щоб скопіювати значення в рядки нижче, потягніть за куточок клітинки (як в Excel). Ctrl+D — взяти з рядка вище';

// ── колонки клієнта ─────────────────────────────────────────────────
function clientColumns(mode: EditorMode): SourcingColDef[] {
  return [
    {
      colId: COL.pos,
      headerName: '№',
      width: 52,
      pinned: 'left',
      cellClass: 'po-num po-cell-pos',
      headerTooltip: 'Правий клік по номеру — меню рядка',
      valueGetter: (p) => (isLineRow(p.data) ? p.data.line.position : null),
      cellRenderer: PosCell,
    },
    {
      colId: COL.line('clientName'),
      headerName: 'Найменування (як у клієнта)',
      width: mode === 'comparison' ? 280 : 230,
      minWidth: 140,
      pinned: 'left',
      editable: canEditClient,
      cellEditor: 'agTextCellEditor',
      valueGetter: (p) => (isLineRow(p.data) ? p.data.line.clientName : p.data?.kind === 'totals' ? `Разом: ${p.data.activeCount} поз.` : ''),
      tooltipValueGetter: (p) => (isLineRow(p.data) && p.data.line.clientName.length > 30 ? p.data.line.clientName : null),
      cellRenderer: ClientNameCell,
      cellClassRules: { 'po-totals-label': (p) => p.data?.kind === 'totals' },
    },
    {
      colId: COL.line('clientUnit'),
      headerName: 'Од.',
      headerTooltip: FILL_HINT,
      width: 58,
      pinned: 'left',
      editable: canEditClient,
      cellEditor: 'agTextCellEditor',
      cellClass: 'po-fill-cell',
      valueGetter: (p) => (isLineRow(p.data) ? (p.data.line.clientUnit ?? '') : ''),
      cellRenderer: FillCell,
    },
    {
      colId: COL.line('qty'),
      headerName: 'К-сть',
      headerTooltip: FILL_HINT,
      width: 72,
      pinned: 'left',
      type: 'rightAligned',
      cellClass: 'po-num po-fill-cell',
      editable: canEditClient,
      cellEditor: 'agTextCellEditor',
      valueGetter: (p) => (isLineRow(p.data) ? p.data.line.qty : null),
      valueFormatter: (p) => (p.value == null ? '' : formatQty(p.value as number)),
      cellRenderer: FillCell,
    },
  ];
}

// ── «Підбір»: група колонок блоку ────────────────────────────────────
const HEADER: Record<BlockField, { name: string; tooltip?: string; width: number }> = {
  sku: { name: 'Артикул', tooltip: 'Введіть або вставте артикул — пошук у каталозі постачальника. F4 — вікно вибору товару', width: 118 },
  name: { name: 'Найменування', tooltip: 'Назва з каталогу; правий клік — дії з пропозицією', width: 200 },
  unit: { name: 'Од.', width: 54 },
  qty: { name: 'К-сть', tooltip: 'Кількість у постачальника (кратність — автоокруглення вгору)', width: 82 },
  net: { name: 'Без ПДВ', tooltip: 'Ціна без ПДВ, грн за од. — з прайсу постачальника (разом з націнкою постачальника)', width: 100 },
  gross: { name: 'З ПДВ', tooltip: 'Ціна з ПДВ, грн за од. — для довідки', width: 96 },
  sum: { name: 'Сума без ПДВ', tooltip: 'Ціна без ПДВ × кількість у постачальника, грн', width: 112 },
  rrp: { name: 'РРЦ з ПДВ', tooltip: 'Рекомендована роздрібна ціна з ПДВ, грн за од.', width: 96 },
  stock: { name: 'Наявн.', tooltip: 'Наявність у постачальника', width: 74 },
  note: { name: 'Примітка', width: 130 },
  exclude: { name: '✕', tooltip: EXCLUDE_HINT, width: 40 },
  pick: { name: '✔', tooltip: 'Затвердити постачальника для рядка (одна галочка на рядок)', width: 42 },
};

const money = (v: number | null | undefined) => (v == null ? '' : formatMoney(v));

/** Семантичні класи клітинки блоку (§5): мінімум, затверджено, «не затверджено», виключено, порожньо, попередження. */
function blockCellClassRules(blockId: UUID, field: BlockField, collapsed: boolean): ColDef<SourcingRow>['cellClassRules'] {
  const priceField = field === 'net' || field === 'gross' || field === 'sum';
  const rules: NonNullable<ColDef<SourcingRow>['cellClassRules']> = {
    'po-cell-excluded': (p: CellClassParams<SourcingRow>) => !!cellOf(p.data, blockId)?.offer?.excluded,
  };
  if (priceField) rules['po-cell-min'] = (p) => !!cellOf(p.data, blockId)?.oc?.isMin;
  if (field === 'net') {
    rules['po-cell-approved'] = (p) =>
      isLineRow(p.data) && p.data.line.selection.blockId === blockId && !!cellOf(p.data, blockId)?.oc?.isSelected;
    rules['po-cell-not-approved'] = (p) => isLineRow(p.data) && isNotApproved(p.data.cmp) && p.data.cmp?.effectiveBlockId === blockId;
    rules['po-cell-error'] = (p) => !!cellOf(p.data, blockId)?.oc?.warnings.some((w) => w.code === 'RATE_MISSING');
  }
  if (field === 'sku') {
    rules['po-cell-empty'] = (p) => isLineRow(p.data) && !cellOf(p.data, blockId)?.offer;
    rules['po-cell-miss'] = (p) => isLineRow(p.data) && !cellOf(p.data, blockId)?.offer && !!cellOf(p.data, blockId)?.miss;
  }
  if (field === 'unit' || field === 'qty' || field === 'stock' || field === 'net') {
    rules['po-cell-warning'] = (p) => {
      const cell = cellOf(p.data, blockId);
      return !!cell?.offer && !cell.offer.excluded && cellWarnings(cell.oc, field, collapsed && field === 'net').some((w) => w.severity === 'warning');
    };
  }
  return rules;
}

function blockColumn(blockId: UUID, field: BlockField, collapsed: boolean, first: boolean): SourcingColDef {
  const h = HEADER[field];
  const cls = (...extra: string[]) => (first ? ['po-block-start', ...extra] : extra);
  const base: SourcingColDef = {
    colId: COL.block(blockId, field),
    headerName: h.name,
    headerTooltip: h.tooltip,
    width: h.width,
    cellClass: cls(),
    headerClass: cls(),
    cellClassRules: blockCellClassRules(blockId, field, collapsed),
    cellRendererParams: { blockId, allWarnings: collapsed && field === 'net' },
  };
  const offerOf = (p: ValueGetterParams<SourcingRow>) => cellOf(p.data, blockId)?.offer ?? null;
  const ocOf = (p: ValueGetterParams<SourcingRow>) => cellOf(p.data, blockId)?.oc ?? null;
  switch (field) {
    case 'sku':
      return {
        ...base,
        editable: canEditRow,
        cellEditor: SkuEditor,
        valueGetter: (p) => offerOf(p)?.sku ?? cellOf(p.data, blockId)?.miss?.sku ?? '',
        cellRenderer: SkuCell,
      };
    case 'name':
      return { ...base, valueGetter: (p) => offerOf(p)?.nameWork ?? '', cellRenderer: OfferNameCell };
    case 'unit':
      return { ...base, valueGetter: (p) => offerOf(p)?.unitCode ?? '', cellRenderer: UnitCell };
    case 'qty':
      return {
        ...base,
        type: 'rightAligned',
        editable: (p) => canEditRow(p) && !!cellOf(p.data, blockId)?.offer,
        cellEditor: 'agTextCellEditor',
        valueGetter: (p) => ocOf(p)?.qtyEffective ?? null,
        cellRenderer: BlockQtyCell,
      };
    case 'net':
      return { ...base, type: 'rightAligned', valueGetter: (p) => ocOf(p)?.unitNetUah ?? null, cellRenderer: PriceCell };
    case 'gross':
      return { ...base, type: 'rightAligned', cellClass: cls('po-num'), valueGetter: (p) => ocOf(p)?.unitGrossUah ?? null, valueFormatter: (p) => money(p.value as number | null) };
    case 'sum':
      return {
        ...base,
        type: 'rightAligned',
        cellClass: cls('po-num'),
        valueGetter: (p) => (p.data?.kind === 'totals' ? (p.data.blocks[blockId]?.totalNet ?? null) : (ocOf(p)?.sumNetUah ?? null)),
        valueFormatter: (p) => money(p.value as number | null),
        tooltipValueGetter: (p) => (p.data?.kind === 'totals' ? 'Всього без ПДВ по блоку' : null),
      };
    case 'rrp':
      return { ...base, type: 'rightAligned', cellClass: cls('po-num'), valueGetter: (p) => ocOf(p)?.rrpGrossUah ?? null, valueFormatter: (p) => money(p.value as number | null) };
    case 'stock':
      return { ...base, type: 'rightAligned', valueGetter: (p) => offerOf(p)?.stockQty ?? null, cellRenderer: StockCell };
    case 'note':
      return {
        ...base,
        editable: (p) => canEditRow(p) && !!cellOf(p.data, blockId)?.offer,
        cellEditor: 'agTextCellEditor',
        valueGetter: (p) => offerOf(p)?.note ?? '',
        tooltipValueGetter: (p) => cellOf(p.data, blockId)?.offer?.note ?? null,
      };
    case 'exclude':
      return { ...base, cellClass: cls('po-cell-center'), valueGetter: (p) => offerOf(p)?.excluded ?? null, cellRenderer: ExcludeCell };
    case 'pick':
      return {
        ...base,
        cellClass: cls('po-cell-center'),
        valueGetter: (p) => (isLineRow(p.data) ? p.data.line.selection.blockId === blockId : null),
        cellRenderer: PickCell,
      };
  }
}

function blockGroup(blockId: UUID, collapsed: boolean): ColGroupDef<SourcingRow> {
  const fields = collapsed ? COLLAPSED_BLOCK_FIELDS : BLOCK_FIELDS;
  return {
    groupId: COL.group(blockId),
    headerName: '',
    // стандартна шапка групи (липка при горизонтальному скролі) з власним вмістом
    headerGroupComponentParams: { innerHeaderGroupComponent: BlockGroupHeader, blockId },
    headerClass: 'po-block-start',
    marryChildren: true,
    children: fields.map((f, i) => blockColumn(blockId, f, collapsed, i === 0)),
  };
}

// ── «Порівняння» ────────────────────────────────────────────────────
function compareColumn(blockId: UUID, first: boolean): SourcingColDef {
  return {
    colId: COL.compare(blockId),
    headerName: '',
    headerComponent: CompareColumnHeader,
    headerComponentParams: { blockId },
    width: 150,
    minWidth: 110,
    type: 'rightAligned',
    cellClass: first ? ['po-block-start', 'po-cell-compare'] : ['po-cell-compare'],
    headerClass: first ? ['po-block-start'] : [],
    valueGetter: (p) => cellOf(p.data, blockId)?.oc?.unitNetUah ?? null,
    cellRenderer: CompareCell,
    cellRendererParams: { blockId },
    cellClassRules: {
      'po-cell-excluded': (p) => !!cellOf(p.data, blockId)?.offer?.excluded,
      'po-cell-min': (p) => !!cellOf(p.data, blockId)?.oc?.isMin,
      'po-cell-approved': (p) =>
        isLineRow(p.data) && p.data.line.selection.blockId === blockId && !!cellOf(p.data, blockId)?.oc?.isSelected,
      'po-cell-not-approved': (p) => isLineRow(p.data) && isNotApproved(p.data.cmp) && p.data.cmp?.effectiveBlockId === blockId,
      'po-cell-warning': (p) => {
        const cell = cellOf(p.data, blockId);
        return !!cell?.offer && !cell.offer.excluded && cellWarnings(cell.oc, 'net', true).some((w) => w.severity === 'warning');
      },
    },
  };
}

/** Колонки сітки для режиму: «Підбір» — повні блоки (групи), «Порівняння» — по колонці на блок + «Обрано» праворуч. */
export function buildColumnDefs({ mode, blockIds, collapsed }: BuildColumnsInput): SourcingColumn[] {
  const client = clientColumns(mode);
  if (mode === 'comparison') {
    return [
      ...client,
      ...blockIds.map((id, i) => compareColumn(id, i === 0)),
      {
        colId: COL.chosen,
        headerName: 'Обрано',
        headerTooltip: 'Затверджена (або рекомендована) пропозиція рядка: постачальник, ціна без ПДВ, сума без ПДВ, переплата відносно мінімуму (без ПДВ)',
        width: 250,
        pinned: 'right',
        cellRenderer: CompareChosenCell,
        valueGetter: (p) => (isLineRow(p.data) ? (p.data.chosen?.oc.unitNetUah ?? null) : null),
      },
    ];
  }
  return [
    ...client,
    {
      colId: COL.chosen,
      headerName: 'Обрано',
      headerTooltip: 'Затверджена (або рекомендована — жовтий «!») пропозиція: ціна без ПДВ, грн',
      width: 136,
      pinned: 'left',
      cellRenderer: ChosenCell,
      valueGetter: (p) => (isLineRow(p.data) ? (p.data.chosen?.oc.unitNetUah ?? null) : null),
    },
    ...blockIds.map((id) => blockGroup(id, collapsed.has(id))),
  ];
}

/** Плаский список colId (для тестів і навігації). */
export function flattenColIds(cols: readonly SourcingColumn[]): string[] {
  const out: string[] = [];
  for (const c of cols) {
    if ('children' in c) out.push(...flattenColIds(c.children));
    else if (c.colId) out.push(c.colId);
  }
  return out;
}
