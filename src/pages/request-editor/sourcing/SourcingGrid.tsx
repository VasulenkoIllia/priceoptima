// Сітка «Позиції і підбір» (AG Grid Community): одна сітка, два набори колонок; стор — єдине джерело правди
// (readOnlyEdit + onCellEditRequest), власні вставка з буфера (TSV), клавіші й контекстне меню.
import {
  DeleteOutlined,
  EditOutlined,
  ProfileOutlined,
  SearchOutlined,
  StopOutlined,
  SwapOutlined,
  SyncOutlined,
  VerticalAlignBottomOutlined,
  VerticalAlignTopOutlined,
} from '@ant-design/icons';
import { Dropdown, type MenuProps } from 'antd';
import type {
  CellClickedEvent,
  CellDoubleClickedEvent,
  CellEditRequestEvent,
  CellKeyDownEvent,
  ColDef,
  ColumnMovedEvent,
  FullWidthCellKeyDownEvent,
  GetRowIdParams,
  GridApi,
  GridReadyEvent,
  RowClassParams,
  RowSelectionOptions,
  SelectionColumnDef,
  SuppressKeyboardEventParams,
  Theme,
} from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import type { UUID } from '@shared/types';
import { GRID_LOCALE, gridTheme } from '@/lib/agGrid';
import { orderByPreference, rememberColumnWidths, reorderSubset, withSavedWidths } from '@/lib/gridColumnLayout';
import { startFillDrag } from '@/lib/gridFillDrag';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { getRequestDocStore, useRequestComputed, useRequestDoc } from '@/stores/requestDocStore';
import type { EditorMode } from '@/stores/uiPrefsStore';
import { useUiPrefs } from '@/stores/uiPrefsStore';
import type { Density } from '@/theme';
import { NoRowsOverlay } from './cells';
import { BLOCK_FIELDS, BLOCK_ORDER_KEY, COL, columnWidthKey, parseColId, type BlockField } from './colIds';
import { buildColumnDefs } from './columns';
import { fillDownTargets, fillFieldOf } from './fill';
import type { SourcingGridContext } from './gridContext';
import { planPaste } from './paste';
import { isSkuSuggestOpen } from './SkuEditor';
import { buildTotalsRow, filterRows, isLineRow, isNewRow, NEW_ROW, NEW_ROW_ID, type LineRow, type SourcingRow } from './rows';
import { useSourcingUi } from './sourcingUiStore';
import { blockOf, supplierOfBlock, useSourcingActions } from './useSourcingActions';

export interface SourcingGridProps {
  mode: EditorMode;
  /** Усі рядки (без фільтра) — будуються у вкладці, щоб лічильники фільтра й сітка мали одні дані. */
  allRows: LineRow[];
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
/** Поля блоку, які AG Grid редагує/очищає сам (Delete → cellClear → onCellEditRequest). */
const EDITABLE_BLOCK_FIELDS = new Set<BlockField>(['sku', 'qty', 'note', 'net', 'gross', 'rrp']);

const isPickerKey = (e: KeyboardEvent) => e.key === 'F4' || ((e.ctrlKey || e.metaKey) && (e.key === ' ' || e.code === 'Space'));
const isDeleteKey = (e: KeyboardEvent) => e.key === 'Delete' || (isMac && e.key === 'Backspace');
const isPasteKey = (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'v';
/** Ctrl+D (на Mac і Cmd+D) — заповнити з рядка вище, як в Excel; розкладка неважлива (e.code). */
const isFillKey = (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.code === 'KeyD' || e.key.toLowerCase() === 'd');

/** Колонки блоку, подвійний клік по яких відкриває панель пропозиції (решта, зокрема ціни, редагується в клітинці). */
const DETAIL_FIELDS: ReadonlySet<string> = new Set(['name', 'sum']);

/** keydown, повністю оброблені в suppressKeyboardEvent (F4 під час введення), — onCellKeyDown їх пропускає. */
const handledKeys = new WeakSet<Event>();

/** Якою клавішею завершено введення (Enter / Tab / Shift+Tab) — куди перейти після нового рядка. */
let commitKey: 'enter' | 'next' | 'back' | null = null;
const resetCommitKey = () => {
  commitKey = null;
};
function takeCommitKey() {
  const key = commitKey;
  commitKey = null;
  return key;
}

/**
 * Клавіші, які обробляє сітка підбору, а не AG Grid (у режимі редагування — AG Grid, крім F4 у клітинці блоку).
 * Викликається синхронно в keydown: тут гасимо дію браузера (Space гортає сітку) і помічаємо Ctrl+V;
 * самі дії виконує onCellKeyDown — AG Grid викликає його асинхронно, коли preventDefault уже не діє.
 */
function suppressKeyboardEvent(p: SuppressKeyboardEventParams<SourcingRow>): boolean {
  const e = p.event;
  const ctx = p.context as SourcingGridContext | undefined;
  if (p.editing) {
    // відкрита підказка артикула: Enter і стрілки — для неї (вибір товару), а не для сітки
    if (isSkuSuggestOpen() && (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp')) return true;
    if (e.type === 'keydown' && (e.key === 'Enter' || e.key === 'Tab')) commitKey = e.key === 'Enter' ? 'enter' : e.shiftKey ? 'back' : 'next';
    // F4 / Ctrl+Space під час введення в клітинці блоку — вікно вибору з набраним текстом
    const row = p.node.data;
    const colId = p.column.getColId();
    if (e.type !== 'keydown' || !isPickerKey(e) || !isLineRow(row) || parseColId(colId).kind !== 'block') return false;
    e.preventDefault();
    handledKeys.add(e);
    const typed: unknown = p.api.getCellEditorInstances()[0]?.getValue();
    window.setTimeout(() => {
      p.api.stopEditing(true);
      ctx?.onPickerKey(row, colId, typeof typed === 'string' ? typed : undefined);
    }, 0);
    return true;
  }
  if (e.type === 'keydown' && isPasteKey(e)) ctx?.onPasteKey();
  let ours = isPickerKey(e) || (isFillKey(e) && fillFieldOf(p.column.getColId()) != null);
  if (!ours && e.key === ' ') {
    const col = parseColId(p.column.getColId());
    ours = col.kind === 'compare' || (col.kind === 'block' && (col.field === 'pick' || col.field === 'exclude'));
  }
  if (ours && e.type === 'keydown') e.preventDefault();
  return ours;
}

const DEFAULT_COL_DEF: ColDef<SourcingRow> = {
  sortable: false,
  resizable: true,
  // переставляються лише колонки блоків (у межах блоку); закріпити колонку перетягуванням не можна
  suppressMovable: true,
  lockPinned: true,
  suppressHeaderMenuButton: true,
  // довгі заголовки («Сума без ПДВ», «РРЦ з ПДВ») переносяться, а не обрізаються
  wrapHeaderText: true,
  autoHeaderHeight: true,
  suppressKeyboardEvent,
  // рендери показують більше, ніж значення клітинки (затвердження, попередження, «не знайдено»):
  // у зміненому рядку перемальовуємо всі клітинки; незмінені рядки зберігають посилання й не оновлюються
  equals: () => false,
};

const ROW_SELECTION: RowSelectionOptions<SourcingRow> = {
  mode: 'multiRow',
  checkboxes: true,
  headerCheckbox: true,
  enableClickSelection: false,
  hideDisabledCheckboxes: true,
  isRowSelectable: (node) => isLineRow(node.data),
};

const SELECTION_COLUMN: SelectionColumnDef = { pinned: 'left', width: 36, maxWidth: 36, resizable: false, suppressHeaderMenuButton: true };

const getRowId = (p: GetRowIdParams<SourcingRow>) => p.data.id;

/** Меню товару постачальника + меню рядка: два розділи з підписами; клік іде в меню, якому належить пункт. */
function joinMenus(offer: MenuProps | null, offerLabel: string, row: MenuProps, rowLabel: string): MenuProps {
  if (!offer?.items?.length) return row;
  const offerKeys = new Set(offer.items.map((i) => (i && 'key' in i ? i.key : null)));
  return {
    items: [
      { type: 'group', key: 'g-offer', label: offerLabel, children: offer.items },
      { type: 'divider' },
      { type: 'group', key: 'g-row', label: rowLabel, children: row.items },
    ],
    onClick: (info) => (offerKeys.has(info.key) ? offer.onClick : row.onClick)?.(info),
  };
}

type CellAt = { colId: string; rowIndex: number };

/** Клітинка рядка даних, з якої прийшла подія (рядок підсумків — ні). */
function cellAt(el: HTMLElement | null): CellAt | null {
  const cell = el?.closest<HTMLElement>('.ag-cell[col-id]');
  const row = cell?.closest<HTMLElement>('.ag-row[row-index]');
  const colId = cell?.getAttribute('col-id');
  const rowIndex = Number(row?.getAttribute('row-index'));
  return colId && row && !row.classList.contains('ag-row-pinned') && Number.isInteger(rowIndex) ? { colId, rowIndex } : null;
}

/** id рядків заявки в порядку показу (з урахуванням фільтра й пошуку). */
function displayedLineIds(api: GridApi<SourcingRow>): UUID[] {
  const ids: UUID[] = [];
  api.forEachNodeAfterFilterAndSort((n) => {
    if (isLineRow(n.data)) ids.push(n.data.id);
  });
  return ids;
}

/** «Порівняння»: дворядкові клітинки (ціна + артикул) і шапки — вищі рядки через параметри теми (вирівнювання тексту). */
const compareThemes = new Map<Density, Theme>();
function sourcingTheme(density: Density, mode: EditorMode): Theme {
  if (mode !== 'comparison') return gridTheme(density);
  let theme = compareThemes.get(density);
  if (!theme) {
    theme = gridTheme(density).withParams(density === 'compact' ? { rowHeight: 40, headerHeight: 46 } : { rowHeight: 48, headerHeight: 54 });
    compareThemes.set(density, theme);
  }
  return theme;
}
const getRowClass = (p: RowClassParams<SourcingRow>) =>
  p.data?.kind === 'totals' ? 'po-totals-row' : p.data?.kind === 'new' ? 'po-new-row' : undefined;

export function SourcingGrid({ mode, allRows }: SourcingGridProps) {
  const actions = useSourcingActions();
  const store = getRequestDocStore();
  const doc = useRequestDoc((s) => s.doc);
  const computed = useRequestComputed();
  const readOnly = useRequestDoc((s) => s.readOnly);
  const filter = useSourcingUi((s) => s.filter);
  const search = useDebouncedValue(useSourcingUi((s) => s.search), 150);
  const focusRequest = useSourcingUi((s) => s.focusRequest);
  const density = useUiPrefs((s) => s.density);
  const collapsedMap = useUiPrefs((s) => s.collapsedBlocks);
  const layoutEpoch = useUiPrefs((s) => s.layoutEpoch);
  const apiRef = useRef<GridApi<SourcingRow> | null>(null);
  const pasteFallback = useRef<ReturnType<typeof setTimeout> | null>(null);

  // порожній рядок унизу — позиції додаються прямо в таблиці (лише без фільтра й пошуку)
  const rows = useMemo<SourcingRow[]>(() => {
    const list = filterRows(allRows, filter, search);
    return !readOnly && filter === 'all' && !search.trim() ? [...list, NEW_ROW] : list;
  }, [allRows, filter, search, readOnly]);
  const pinnedBottom = useMemo(() => (doc && computed ? [buildTotalsRow(doc, computed)] : []), [doc, computed]);

  // колонки залежать лише від режиму, складу/порядку блоків і згорнутих блоків
  const blockKey = (doc?.blocks ?? []).map((b) => b.id).join('|');
  const collapsedKey = (doc?.blocks ?? [])
    .filter((b) => collapsedMap[b.id])
    .map((b) => b.id)
    .join('|');
  // ширина, задана користувачем, — зі збережених (сітка будується заново при кожному поверненні на вкладку)
  const widthKey = useCallback((colId: string) => columnWidthKey(mode, colId), [mode]);
  const columnDefs = useMemo(
    () =>
      withSavedWidths(
        buildColumnDefs({
          mode,
          blockIds: blockKey ? blockKey.split('|') : [],
          collapsed: new Set(collapsedKey ? collapsedKey.split('|') : []),
          blockOrder: useUiPrefs.getState().columnOrder[BLOCK_ORDER_KEY],
        }),
        widthKey,
      ),
    [mode, blockKey, collapsedKey, widthKey, layoutEpoch],
  );

  // ── контекст для рендерів (стабільний; дані — наживо зі стору) ──────
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const rowMenu = useCallback(
    (row: LineRow): MenuProps => {
      const s = store.getState();
      const ro = s.readOnly;
      const selected = apiRef.current?.getSelectedRows().filter(isLineRow).map((r) => r.id) ?? [];
      const targetIds = selected.length > 1 && selected.includes(row.id) ? selected : [row.id];
      return {
        items: [
          { key: 'above', icon: <VerticalAlignTopOutlined />, label: 'Вставити рядок вище', disabled: ro },
          { key: 'below', icon: <VerticalAlignBottomOutlined />, label: 'Вставити рядок нижче', disabled: ro },
          { type: 'divider' },
          { key: 'pick', icon: <SearchOutlined />, label: 'Підібрати в каталозі (F4)', disabled: ro },
          { type: 'divider' },
          {
            key: 'delete',
            icon: <DeleteOutlined />,
            danger: true,
            disabled: ro,
            label: targetIds.length > 1 ? `Видалити виділені (${targetIds.length})` : 'Видалити рядок',
          },
        ],
        onClick: ({ key, domEvent }) => {
          domEvent.stopPropagation();
          const a = actionsRef.current;
          if (key === 'above') a.addLine({ beforeId: row.id });
          else if (key === 'below') a.addLine({ afterId: row.id });
          else if (key === 'pick') a.openPickerFor(row.id, null, 'add');
          else if (key === 'delete') a.removeLines(targetIds);
        },
      };
    },
    [store],
  );

  const nameMenu = useCallback(
    (row: LineRow, blockId: UUID): MenuProps | null => {
      const cell = row.cells[blockId];
      if (!cell?.offer) return null;
      const ro = store.getState().readOnly;
      // вхідні ціни — лише з прайсу постачальника: змінилась у каталозі — «Оновити ціну з прайсу»
      const changed = !!cell.oc?.warnings.some((w) => w.code === 'CATALOG_PRICE_CHANGED');
      return {
        items: [
          { key: 'details', icon: <ProfileOutlined />, label: 'Пропозиція: ціна, кратність, примітка' },
          // ціна постачальника на цей запит — лише в цій заявці (правки замовника 23.09 п.8)
          { key: 'price', icon: <EditOutlined />, label: 'Змінити ціну (лише в цій заявці)', disabled: ro },
          ...(changed ? [{ key: 'refresh', icon: <SyncOutlined />, label: 'Оновити ціну з прайсу', disabled: ro }] : []),
          { key: 'replace', icon: <SwapOutlined />, label: 'Замінити товар (F4)', disabled: ro },
          { key: 'clear', icon: <StopOutlined />, label: 'Очистити (Delete)', disabled: ro, danger: true },
        ],
        onClick: ({ key, domEvent }) => {
          domEvent.stopPropagation();
          const a = actionsRef.current;
          if (key === 'details') useSourcingUi.getState().openDrawer({ lineId: row.id, blockId });
          else if (key === 'price' && cell.offer) useSourcingUi.getState().openPriceDialog(cell.offer.id);
          else if (key === 'refresh') a.refreshOfferPrice(row.id, blockId);
          else if (key === 'replace') a.openPickerFor(row.id, blockId, 'replace');
          else if (key === 'clear') a.clearOffer(row.id, blockId);
        },
      };
    },
    [store],
  );

  // ── меню правого кліку: одне на всю сітку, відкривається в точці кліку ──
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; menu: MenuProps } | null>(null);

  /** Правий клік будь-де в рядку: меню рядка; на клітинці постачальника з товаром зверху ще дії з цим товаром. */
  const onContextMenu = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      // у полі введення лишаємо меню браузера (копіювати, вставити)
      if (target.closest('input, textarea, .ag-cell-inline-editing')) return;
      const rowId = target.closest('.ag-row')?.getAttribute('row-id');
      const row = rowId ? apiRef.current?.getRowNode(rowId)?.data : null;
      if (!isLineRow(row)) return;
      e.preventDefault();
      const col = parseColId(target.closest('.ag-cell')?.getAttribute('col-id'));
      const offer = col.kind === 'block' || col.kind === 'compare' ? nameMenu(row, col.blockId) : null;
      const supplier = offer && (col.kind === 'block' || col.kind === 'compare') ? supplierOfBlock(col.blockId)?.name : null;
      setCtxMenu({ x: e.clientX, y: e.clientY, menu: joinMenus(offer, supplier ?? 'Товар постачальника', rowMenu(row), `Рядок ${row.line.position}`) });
    },
    [rowMenu, nameMenu],
  );

  // ── вставка з буфера (TSV з Excel) ─────────────────────────────────
  /** Вставка від клітинки: з події paste — клітинка, на якій фокус браузера; із запасного шляху — фокус AG Grid. */
  const handlePasteText = useCallback((text: string, at?: CellAt | null) => {
    const api = apiRef.current;
    if (!api || !text || api.getEditingCells().length) return;
    const focused = api.getFocusedCell();
    const start = at ?? (focused && !focused.rowPinned ? { colId: focused.column.getColId(), rowIndex: focused.rowIndex } : null);
    if (!start) return;
    const lineIds: UUID[] = [];
    const count = api.getDisplayedRowCount();
    for (let i = start.rowIndex; i < count; i++) {
      const data = api.getDisplayedRowAtIndex(i)?.data;
      if (isLineRow(data)) lineIds.push(data.id);
    }
    void actionsRef.current.applyPastePlan(planPaste({ text, colId: start.colId, lineIds }));
  }, []);

  /** Ctrl+V без події paste (деякі браузери не надсилають її для не редагованих елементів) — читаємо буфер самі. */
  const startPasteFallback = useCallback(() => {
    if (pasteFallback.current) clearTimeout(pasteFallback.current);
    pasteFallback.current = setTimeout(() => {
      pasteFallback.current = null;
      navigator.clipboard
        ?.readText()
        .then((text) => handlePasteText(text))
        .catch(() => undefined);
    }, 150);
  }, [handlePasteText]);

  /** Вікно вибору: з клітинки блоку/порівняння — фільтр постачальника (є пропозиція — заміна), інакше — усі постачальники. */
  const openPickerAt = useCallback((row: LineRow, colId: string, query?: string) => {
    const col = parseColId(colId);
    const blockId = col.kind === 'block' || col.kind === 'compare' ? col.blockId : null;
    actionsRef.current.openPickerFor(row.id, blockId, blockId && row.cells[blockId]?.offer ? 'replace' : 'add', query);
  }, []);

  // ── протягування за куточок (п.2.2 правок): підсвітка діапазону, автопрокрутка біля краю, заповнення на відпусканні ──
  const fillCleanup = useRef<(() => void) | null>(null);
  const startFill = useCallback(
    (e: ReactMouseEvent<HTMLElement>, row: LineRow, colId: string) => {
      const field = fillFieldOf(colId);
      const api = apiRef.current;
      if (!field || !api || store.getState().readOnly) return;
      fillCleanup.current?.();
      fillCleanup.current = startFillDrag({
        event: e,
        api,
        colId,
        displayed: displayedLineIds(api),
        sourceId: row.id,
        onApply: (targetIds) => {
          fillCleanup.current = null;
          actionsRef.current.fillLines(field, row.id, targetIds);
        },
      });
    },
    [store],
  );
  useEffect(() => () => fillCleanup.current?.(), []);

  const context = useMemo<SourcingGridContext>(
    () => ({
      isReadOnly: () => store.getState().readOnly,
      blockOf,
      supplierOfBlock,
      onInsertBelow: (row) => actionsRef.current.addLine({ afterId: row.id }),
      onMissClick: (row, blockId) => actionsRef.current.resolveMiss(row.id, blockId),
      onPickerKey: openPickerAt,
      onPasteKey: startPasteFallback,
      onFillStart: startFill,
    }),
    [store, openPickerAt, startPasteFallback, startFill],
  );

  // перехід у режим перегляду/редагування — перемалювати клітинки (плейсхолдери, доступність дій)
  useEffect(() => {
    apiRef.current?.refreshCells({ force: true });
  }, [readOnly]);

  // ── фокус нового рядка ─────────────────────────────────────────────
  const applyFocusRequest = useCallback(() => {
    const api = apiRef.current;
    const req = useSourcingUi.getState().focusRequest;
    if (!api || !req) return;
    const node = api.getRowNode(req.lineId);
    if (node?.rowIndex == null) return;
    useSourcingUi.getState().requestFocus(null);
    const rowIndex = node.rowIndex;
    // фокус міг лишитися на кнопці панелі/пункті меню — забираємо його в сітку
    const active = document.activeElement as HTMLElement | null;
    if (active && !active.closest('.ag-root-wrapper')) active.blur();
    api.ensureIndexVisible(rowIndex);
    api.setFocusedCell(rowIndex, req.colId);
    if (req.edit && !store.getState().readOnly) {
      window.setTimeout(() => api.startEditingCell({ rowIndex, colKey: req.colId }), 0);
    }
  }, [store]);

  useEffect(() => {
    if (focusRequest) applyFocusRequest();
  }, [focusRequest, rows, applyFocusRequest]);

  // ── редагування (readOnlyEdit → дії стору) ─────────────────────────
  const onCellEditRequest = useCallback(
    (e: CellEditRequestEvent<SourcingRow>) => {
      const row = e.data;
      const s = store.getState();
      const key = takeCommitKey();
      if (s.readOnly) return;
      const col = parseColId(e.column.getColId());
      const text = e.newValue == null ? '' : String(e.newValue);
      const a = actionsRef.current;
      if (isNewRow(row)) {
        if (col.kind === 'line') a.addLineFromNewRow(col.field, text, key);
        return;
      }
      if (!isLineRow(row)) return;
      if (col.kind === 'line') {
        if (col.field === 'clientName') s.updateLine(row.id, { clientName: text.trim() });
        else if (col.field === 'clientUnit') s.updateLine(row.id, { clientUnit: text.trim() || null });
        else if (col.field === 'clientNote') s.updateLine(row.id, { clientNote: text.trim() || null });
        else a.setLineQtyFromInput(row.id, text);
        // Enter в останньому рядку — далі порожній рядок: одразу назва наступної позиції
        if (key === 'enter' && e.node.rowIndex != null && isNewRow(e.api.getDisplayedRowAtIndex(e.node.rowIndex + 1)?.data)) {
          useSourcingUi.getState().requestFocus({ lineId: NEW_ROW_ID, colId: COL.line('clientName'), edit: true });
        }
      } else if (col.kind === 'block') {
        const offer = row.cells[col.blockId]?.offer;
        if (col.field === 'sku') void a.enterSku(row.id, col.blockId, text);
        else if (col.field === 'qty' && offer) a.setOfferQtyFromInput(row.id, offer.id, text);
        else if (col.field === 'note' && offer) s.setOfferNote(offer.id, text.trim() || null);
        else if ((col.field === 'net' || col.field === 'gross') && offer) a.setOfferPriceFromCell(row.id, col.blockId, text, col.field === 'gross');
        else if (col.field === 'rrp' && offer) a.setOfferRrpFromCell(row.id, col.blockId, text);
      } else if (col.kind === 'compare' && row.cells[col.blockId]?.offer) {
        a.setOfferPriceFromCell(row.id, col.blockId, text, false);
      }
    },
    [store],
  );

  // ── кліки ─────────────────────────────────────────────────────────
  const openCell = useCallback(
    (row: LineRow, colId: string) => {
      const col = parseColId(colId);
      const a = actionsRef.current;
      const ui = useSourcingUi.getState();
      if (col.kind === 'block') {
        if (col.field === 'pick') a.togglePick(row.id, col.blockId);
        else if (col.field === 'exclude') a.toggleExclude(row.id, col.blockId);
      } else if (col.kind === 'compare') {
        // клітинка з товаром: у редагуванні клік лише виділяє (ціну вводять одразу), у перегляді — показує пропозицію
        const hasOffer = !!row.cells[col.blockId]?.offer;
        const readOnly = store.getState().readOnly;
        if (hasOffer && readOnly) ui.openDrawer({ lineId: row.id, blockId: col.blockId });
        else if (!hasOffer && !readOnly) a.openPickerFor(row.id, col.blockId, 'add');
      } else if (col.kind === 'chosen' && mode === 'comparison' && row.chosen) {
        ui.openDrawer({ lineId: row.id, blockId: row.chosen.blockId });
      }
    },
    [mode, store],
  );

  const onCellClicked = useCallback(
    (e: CellClickedEvent<SourcingRow>) => {
      if (isLineRow(e.data)) openCell(e.data, e.column.getColId());
    },
    [openCell],
  );

  // «Підбір»: подвійний клік по назві чи ціні пропозиції — панель пропозиції (змінити ціну, кратність, примітка)
  const onCellDoubleClicked = useCallback((e: CellDoubleClickedEvent<SourcingRow>) => {
    if (!isLineRow(e.data)) return;
    const col = parseColId(e.column.getColId());
    if (col.kind !== 'block' || !DETAIL_FIELDS.has(col.field) || !e.data.cells[col.blockId]?.offer) return;
    useSourcingUi.getState().openDrawer({ lineId: e.data.id, blockId: col.blockId });
  }, []);

  // ── клавіатура ────────────────────────────────────────────────────
  const onCellKeyDown = useCallback(
    (e: CellKeyDownEvent<SourcingRow> | FullWidthCellKeyDownEvent<SourcingRow>) => {
      const ev = e.event as KeyboardEvent | null | undefined;
      const row = e.data;
      if (!ev || !('column' in e) || !isLineRow(row) || handledKeys.has(ev)) return;
      if (e.api.getEditingCells().length) return;
      const colId = e.column.getColId();
      const col = parseColId(colId);
      const a = actionsRef.current;

      // дія браузера за замовчуванням уже погашена в suppressKeyboardEvent (цей обробник AG Grid кличе асинхронно)
      const fillField = fillFieldOf(colId);
      if (fillField && isFillKey(ev)) {
        const selected = e.api.getSelectedRows().filter(isLineRow).map((r) => r.id);
        const t = fillDownTargets(displayedLineIds(e.api), row.id, selected);
        if (t) a.fillLines(fillField, t.sourceId, t.targetIds);
        return;
      }
      if (isPickerKey(ev)) {
        openPickerAt(row, colId);
        return;
      }
      if (col.kind === 'block') {
        if (isDeleteKey(ev) && !EDITABLE_BLOCK_FIELDS.has(col.field)) {
          a.clearOffer(row.id, col.blockId);
        } else if ((ev.key === 'Enter' || ev.key === ' ') && (col.field === 'pick' || col.field === 'exclude')) {
          openCell(row, colId);
        }
      } else if (col.kind === 'compare') {
        // клітинка з товаром: Enter і цифри — нова ціна (редагування AG Grid), пробіл — панель пропозиції
        const hasOffer = !!row.cells[col.blockId]?.offer;
        if (ev.key === ' ' && hasOffer) useSourcingUi.getState().openDrawer({ lineId: row.id, blockId: col.blockId });
        else if ((ev.key === 'Enter' || ev.key === ' ') && !hasOffer) openCell(row, colId);
        else if (isDeleteKey(ev)) a.clearOffer(row.id, col.blockId);
      } else if (col.kind === 'chosen' && mode === 'comparison') {
        if (ev.key === 'Enter' || ev.key === ' ') openCell(row, colId);
      }
    },
    [mode, openCell, openPickerAt, store],
  );

  const onPaste =(e: ClipboardEvent<HTMLDivElement>) => {
    if (pasteFallback.current) {
      clearTimeout(pasteFallback.current);
      pasteFallback.current = null;
    }
    const target = e.target as HTMLElement | null;
    if (target?.closest('input, textarea, [contenteditable="true"]')) return;
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    handlePasteText(text, cellAt(target));
  };

  useEffect(
    () => () => {
      if (pasteFallback.current) clearTimeout(pasteFallback.current);
    },
    [],
  );

  // повернулись до заявки — туди ж, де були в таблиці
  const applyPendingScroll = useCallback(() => {
    const api = apiRef.current;
    const count = api?.getDisplayedRowCount() ?? 0;
    if (!api || !count || useSourcingUi.getState().pendingScroll == null) return;
    const row = useSourcingUi.getState().takePendingScroll()!;
    api.ensureIndexVisible(Math.min(row, count - 1), 'top');
  }, []);

  const onRowDataUpdated = useCallback(() => {
    applyPendingScroll();
    applyFocusRequest();
  }, [applyPendingScroll, applyFocusRequest]);

  // колонку переставили в одному блоці — такий самий порядок полів у всіх блоках (таблиця перебудовується)
  const onColumnMoved = useCallback((e: ColumnMovedEvent<SourcingRow>) => {
    if (!e.finished || e.source !== 'uiColumnMoved') return;
    const moved = parseColId(e.columns?.[0]?.getColId());
    if (moved.kind !== 'block') return;
    const shown = e.api.getAllGridColumns().flatMap((c) => {
      const col = parseColId(c.getColId());
      return col.kind === 'block' && col.blockId === moved.blockId ? [col.field] : [];
    });
    const prefs = useUiPrefs.getState();
    const full = orderByPreference(BLOCK_FIELDS, prefs.columnOrder[BLOCK_ORDER_KEY]);
    prefs.setColumnOrder(BLOCK_ORDER_KEY, reorderSubset(full, shown), true);
  }, []);

  const onGridReady = useCallback(
    (e: GridReadyEvent<SourcingRow>) => {
      apiRef.current = e.api;
      applyPendingScroll();
      applyFocusRequest();
    },
    [applyPendingScroll, applyFocusRequest],
  );

  const comparison = mode === 'comparison';
  const groupHeaderHeight = density === 'compact' ? 74 : 82;

  return (
    <div className="po-sourcing-grid-inner" onPaste={onPaste} onContextMenu={onContextMenu}>
      {ctxMenu ? (
        <Dropdown
          key={`${ctxMenu.x}:${ctxMenu.y}`}
          open
          trigger={['contextMenu']}
          onOpenChange={(open) => {
            if (!open) setCtxMenu(null);
          }}
          menu={{
            ...ctxMenu.menu,
            onClick: (info) => {
              setCtxMenu(null);
              ctxMenu.menu.onClick?.(info);
            },
          }}
        >
          <span className="po-ctx-anchor" style={{ left: ctxMenu.x, top: ctxMenu.y }} />
        </Dropdown>
      ) : null}
      <AgGridReact<SourcingRow>
        theme={sourcingTheme(density, mode)}
        localeText={GRID_LOCALE}
        containerStyle={{ height: '100%' }}
        rowData={rows}
        pinnedBottomRowData={pinnedBottom}
        columnDefs={columnDefs}
        defaultColDef={DEFAULT_COL_DEF}
        getRowId={getRowId}
        getRowClass={getRowClass}
        context={context}
        rowSelection={comparison ? undefined : ROW_SELECTION}
        selectionColumnDef={SELECTION_COLUMN}
        onSelectionChanged={(e) =>
          useSourcingUi.getState().setSelectedLineIds(
            e.api
              .getSelectedRows()
              .filter(isLineRow)
              .map((r) => r.id),
          )
        }
        readOnlyEdit
        onCellEditRequest={onCellEditRequest}
        onCellClicked={onCellClicked}
        onCellDoubleClicked={onCellDoubleClicked}
        onCellEditingStarted={resetCommitKey}
        onCellKeyDown={onCellKeyDown}
        onGridReady={onGridReady}
        onRowDataUpdated={onRowDataUpdated}
        onColumnResized={(e) => rememberColumnWidths(e, widthKey)}
        onColumnMoved={onColumnMoved}
        onBodyScrollEnd={(e) => useSourcingUi.getState().rememberScroll(e.api.getFirstDisplayedRowIndex())}
        stopEditingWhenCellsLoseFocus
        enterNavigatesVerticallyAfterEdit
        suppressDragLeaveHidesColumns
        suppressScrollOnNewData
        animateRows={false}
        groupHeaderHeight={groupHeaderHeight}
        tooltipShowDelay={500}
        noRowsOverlayComponent={NoRowsOverlay}
        noRowsOverlayComponentParams={{ hasLines: allRows.length > 0 }}
      />
    </div>
  );
}
