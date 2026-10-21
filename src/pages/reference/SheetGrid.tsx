// Таблиця аркуша «Довідника» як в Excel: подвійний клік чи Enter — правка (Shift+Enter — новий рядок у клітинці),
// Delete — очистити, Ctrl+V — вставити таблицю з Excel від клітинки, ширину й порядок колонок задають перетягуванням.
// Рядки й колонки додаються прямо в таблиці (правки власника 21.10): «+» біля рядка вставляє під ним, «+ Додати рядок»
// під останнім рядком — у кінець, «+» праворуч від заголовків — колонку; меню «⋮» у заголовку — перейменувати чи видалити.
import { App } from 'antd';
import type {
  CellEditRequestEvent,
  CellKeyDownEvent,
  ColDef,
  ColumnMovedEvent,
  ColumnResizedEvent,
  FullWidthCellKeyDownEvent,
  GridApi,
  RowSelectionOptions,
  SelectionColumnDef,
} from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, type ClipboardEvent, type KeyboardEvent, type Ref } from 'react';
import { parseTsv } from '@shared/parse';
import {
  REFERENCE_COLUMN_MAX_WIDTH,
  REFERENCE_COLUMN_MIN_WIDTH,
  REFERENCE_MAX_CELL,
  REFERENCE_MAX_COLUMNS,
  REFERENCE_MAX_ROWS,
} from '@shared/reference/limits';
import type { ReferenceRow } from '@shared/types';
import { GRID_LOCALE, gridTheme } from '@/lib/agGrid';
import { useUiPrefs } from '@/stores/uiPrefsStore';
import { addColumn, addRow, applyPaste, cellText, newRow, reorderColumns, setCell, setColumnWidth, type PasteTarget, type SheetContent } from './sheet';
import {
  ADD_COL_ID,
  ADD_ROW,
  ADD_ROW_ID,
  AddColumnHeader,
  AddRowCell,
  ColumnHeader,
  INSERT_COL_ID,
  InsertRowCell,
  LinkCell,
  type SheetGridActions,
} from './SheetGridParts';

const DEFAULT_COLUMN_WIDTH = 240;
/** Ctrl+V без події paste (буває, коли фокус на клітинці, а не в полі) — читаємо буфер самі після паузи. */
const PASTE_FALLBACK_MS = 150;
// «Вибрати все» — лише рядки, що видно за пошуком: інакше «Видалити» зачепило б і приховані
const ROW_SELECTION: RowSelectionOptions<ReferenceRow> = {
  mode: 'multiRow',
  checkboxes: true,
  headerCheckbox: true,
  enableClickSelection: false,
  selectAll: 'filtered',
  isRowSelectable: (node) => node.data?.id !== ADD_ROW_ID,
};
const SELECTION_COLUMN: SelectionColumnDef = { pinned: 'left', width: 40, maxWidth: 40, resizable: false, suppressHeaderMenuButton: true };
const DEFAULT_COL_DEF: ColDef<ReferenceRow> = {
  resizable: true,
  sortable: false,
  lockPinned: true,
  wrapHeaderText: true,
  autoHeaderHeight: true,
  suppressHeaderMenuButton: true,
  minWidth: REFERENCE_COLUMN_MIN_WIDTH,
  maxWidth: REFERENCE_COLUMN_MAX_WIDTH,
};
const SERVICE_COLUMN: ColDef<ReferenceRow> = {
  headerName: '',
  resizable: false,
  suppressMovable: true,
  suppressNavigable: true,
  editable: false,
  getQuickFilterText: () => '',
};
const INSERT_COLUMN: ColDef<ReferenceRow> = {
  ...SERVICE_COLUMN,
  colId: INSERT_COL_ID,
  pinned: 'left',
  width: 34,
  minWidth: 34,
  maxWidth: 34,
  cellRenderer: InsertRowCell,
  cellClass: 'po-ref-insert-cell',
};
const ADD_COLUMN: ColDef<ReferenceRow> = { ...SERVICE_COLUMN, colId: ADD_COL_ID, lockPosition: 'right', width: 48, minWidth: 48, maxWidth: 48, headerComponent: AddColumnHeader };
const CONTAINER_STYLE = { height: '100%' };
const RESIZE_SOURCES = new Set(['uiColumnResized', 'autosizeColumns']);
const CLIPPED_PASTE = `Вставлено не все: в аркуші до ${REFERENCE_MAX_ROWS} рядків і ${REFERENCE_MAX_COLUMNS} колонок, у клітинці до ${REFERENCE_MAX_CELL} символів`;

export interface SheetGridHandle {
  selectedRowIds: () => string[];
}

export interface SheetGridProps {
  content: SheetContent;
  search: string;
  /** false — зміну не прийнято (аркуш завеликий); повідомлення показує той, хто передав onChange. */
  onChange: (change: (sheet: SheetContent) => SheetContent) => boolean;
  onSelectionCount: (count: number) => void;
  /** Перед вставкою рядка: з пошуком новий порожній рядок не було б видно. */
  onRowInsert: () => void;
  onRenameColumn: (colId: string) => void;
  onDeleteColumn: (colId: string) => void;
  ref?: Ref<SheetGridHandle>;
}

// e.code, а не e.key: в українській розкладці key — «м»
const isPasteKey = (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'KeyV';
const inTextField = (target: EventTarget | null) => target instanceof Element && !!target.closest('input, textarea, [contenteditable="true"]');
/** Подія з самої таблиці, а не з випадного меню заголовка (його вікно — портал, події якого спливають сюди ж). */
const fromGrid = (e: { target: EventTarget; currentTarget: Element }) => e.target instanceof Node && e.currentTarget.contains(e.target);

export const SheetGrid = memo(function SheetGrid(props: SheetGridProps) {
  const { content, search, onChange, onSelectionCount, ref } = props;
  const { message } = App.useApp();
  const density = useUiPrefs((s) => s.density);
  const apiRef = useRef<GridApi<ReferenceRow> | null>(null);
  const revealRef = useRef<string | null>(null);
  const revealColumnRef = useRef(false);
  const pasteTimer = useRef(0);
  const firstColId = content.columns[0]?.id ?? null;

  useImperativeHandle(ref, () => ({ selectedRowIds: () => apiRef.current?.getSelectedRows().map((r) => r.id) ?? [] }), []);

  // новий пошук — вибір знімається, щоб не видалити рядки, яких уже не видно
  useEffect(() => apiRef.current?.deselectAll(), [search]);

  // дії для «плюсиків» і меню заголовка: один об'єкт на весь час, усередині — завжди свіжі дані
  const latest = useRef({ props, content });
  latest.current = { props, content };
  const actions = useMemo<SheetGridActions>(
    () => ({
      insertRow: (afterId) => {
        const { props: p, content: c } = latest.current;
        if (c.rows.length >= REFERENCE_MAX_ROWS) {
          message.info(`В аркуші до ${REFERENCE_MAX_ROWS} рядків`);
          return;
        }
        const row = newRow();
        p.onRowInsert();
        revealRef.current = row.id;
        p.onChange((s) => addRow(s, afterId, row));
      },
      addColumn: () => {
        const { props: p, content: c } = latest.current;
        if (c.columns.length >= REFERENCE_MAX_COLUMNS) {
          message.info(`В аркуші до ${REFERENCE_MAX_COLUMNS} колонок`);
          return;
        }
        if (p.onChange(addColumn)) revealColumnRef.current = true;
      },
      renameColumn: (colId) => latest.current.props.onRenameColumn(colId),
      deleteColumn: (colId) => latest.current.props.onDeleteColumn(colId),
    }),
    [message],
  );

  const rowData = useMemo(() => [...content.rows, ADD_ROW], [content.rows]);

  const columnDefs = useMemo<ColDef<ReferenceRow>[]>(
    () => [
      INSERT_COLUMN,
      ...content.columns.map(
        (c): ColDef<ReferenceRow> => ({
          colId: c.id,
          headerName: c.title || 'Без назви',
          headerComponent: ColumnHeader,
          valueGetter: (p) => (p.data ? cellText(p.data, c.id) : ''),
          width: c.width ?? DEFAULT_COLUMN_WIDTH,
          editable: true,
          cellEditor: 'agLargeTextCellEditor',
          cellEditorPopup: true,
          cellEditorParams: { maxLength: REFERENCE_MAX_CELL, rows: 6, cols: 50 },
          cellRenderer: LinkCell,
          cellClass: 'po-cell-text po-ref-cell',
          wrapText: true,
          autoHeight: true,
        }),
      ),
      ADD_COLUMN,
    ],
    [content.columns],
  );

  const pasteText = useCallback(
    (text: string) => {
      const api = apiRef.current;
      if (!api || api.isDestroyed() || !text || api.getEditingCells().length || !firstColId) return;
      const focused = api.getFocusedCell();
      const dataCol = (colId: string) => (latest.current.content.columns.some((c) => c.id === colId) ? colId : firstColId);
      const rowIds: string[] = [];
      let target: PasteTarget;
      if (focused && !focused.rowPinned) {
        for (let i = focused.rowIndex; i < api.getDisplayedRowCount(); i++) {
          const id = api.getDisplayedRowAtIndex(i)?.data?.id;
          if (id && id !== ADD_ROW_ID) rowIds.push(id);
        }
        target = { rowIds, colId: dataCol(focused.column.getColId()) };
      } else if (!latest.current.content.rows.length) {
        target = { rowIds, colId: firstColId };
      } else {
        message.info('Клацніть клітинку, з якої вставити таблицю');
        return;
      }
      let clipped = false;
      const accepted = onChange((sheet) => {
        const result = applyPaste(sheet, target, parseTsv(text));
        clipped = result.clipped;
        return result.sheet;
      });
      if (accepted && clipped) message.warning(CLIPPED_PASTE);
    },
    [firstColId, message, onChange],
  );

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    window.clearTimeout(pasteTimer.current);
    if (!fromGrid(e) || inTextField(e.target)) return;
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    pasteText(text);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!isPasteKey(e) || !fromGrid(e) || inTextField(e.target)) return;
    window.clearTimeout(pasteTimer.current);
    pasteTimer.current = window.setTimeout(() => {
      navigator.clipboard
        ?.readText()
        .then(pasteText, () => message.info('Браузер не дав прочитати буфер обміну. Спробуйте Ctrl+V ще раз'));
    }, PASTE_FALLBACK_MS);
  };
  useEffect(() => () => window.clearTimeout(pasteTimer.current), []);

  const onCellEditRequest = useCallback(
    (e: CellEditRequestEvent<ReferenceRow>) => {
      const rowId = e.data?.id;
      if (!rowId || rowId === ADD_ROW_ID) return;
      const value = e.newValue == null ? '' : String(e.newValue);
      onChange((sheet) => setCell(sheet, rowId, e.column.getColId(), value));
    },
    [onChange],
  );

  // з клавіатури: стрілкою вниз до «+ Додати рядок» і Enter (пробіл) — новий рядок у кінці
  const onCellKeyDown = useCallback(
    (e: CellKeyDownEvent<ReferenceRow> | FullWidthCellKeyDownEvent<ReferenceRow>) => {
      const ev = e.event;
      if (e.data?.id !== ADD_ROW_ID || !(ev instanceof KeyboardEvent) || (ev.key !== 'Enter' && ev.key !== ' ')) return;
      ev.preventDefault();
      actions.insertRow(null);
    },
    [actions],
  );

  const onColumnResized = useCallback(
    (e: ColumnResizedEvent<ReferenceRow>) => {
      if (!e.finished || !RESIZE_SOURCES.has(e.source)) return;
      for (const col of e.columns ?? []) onChange((sheet) => setColumnWidth(sheet, col.getColId(), col.getActualWidth()));
    },
    [onChange],
  );

  const onColumnMoved = useCallback(
    (e: ColumnMovedEvent<ReferenceRow>) => {
      if (!e.finished || e.source !== 'uiColumnMoved') return;
      const order = e.api.getAllDisplayedColumns().map((c) => c.getColId());
      onChange((sheet) => reorderColumns(sheet, order));
    },
    [onChange],
  );

  // новий рядок — у полі зору з курсором у першій клітинці; нова колонка — прокрутити до неї
  const onRowDataUpdated = useCallback(() => {
    const api = apiRef.current;
    const id = revealRef.current;
    if (!api || !id) return;
    revealRef.current = null;
    const node = api.getRowNode(id);
    if (node?.rowIndex == null) return;
    api.ensureIndexVisible(node.rowIndex);
    if (firstColId) api.setFocusedCell(node.rowIndex, firstColId);
  }, [firstColId]);

  const onGridColumnsChanged = useCallback(() => {
    if (!revealColumnRef.current) return;
    revealColumnRef.current = false;
    apiRef.current?.ensureColumnVisible(ADD_COL_ID);
  }, []);

  return (
    <div className="po-grid-wrap" onPaste={onPaste} onKeyDown={onKeyDown}>
      <AgGridReact<ReferenceRow>
        theme={gridTheme(density)}
        localeText={GRID_LOCALE}
        containerStyle={CONTAINER_STYLE}
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={DEFAULT_COL_DEF}
        context={actions}
        getRowId={(p) => p.data.id}
        isFullWidthRow={(p) => p.rowNode.data?.id === ADD_ROW_ID}
        fullWidthCellRenderer={AddRowCell}
        rowSelection={ROW_SELECTION}
        selectionColumnDef={SELECTION_COLUMN}
        quickFilterText={search}
        readOnlyEdit
        stopEditingWhenCellsLoseFocus
        onGridReady={(e) => {
          apiRef.current = e.api;
        }}
        onCellEditRequest={onCellEditRequest}
        onCellKeyDown={onCellKeyDown}
        onColumnResized={onColumnResized}
        onColumnMoved={onColumnMoved}
        onRowDataUpdated={onRowDataUpdated}
        onGridColumnsChanged={onGridColumnsChanged}
        onSelectionChanged={(e) => onSelectionCount(e.api.getSelectedRows().length)}
        overlayNoRowsTemplate="<span>Нічого не знайдено</span>"
      />
    </div>
  );
});
