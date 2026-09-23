// Сітка «Позиції і підбір» (AG Grid Community): одна сітка, два набори колонок; стор — єдине джерело правди
// (readOnlyEdit + onCellEditRequest), власні вставка з буфера (TSV), клавіші й контекстне меню.
import {
  DeleteOutlined,
  GlobalOutlined,
  ProfileOutlined,
  SearchOutlined,
  StopOutlined,
  SwapOutlined,
  SyncOutlined,
  VerticalAlignBottomOutlined,
  VerticalAlignTopOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import type {
  CellClickedEvent,
  CellDoubleClickedEvent,
  CellEditRequestEvent,
  CellKeyDownEvent,
  ColDef,
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
import { useCallback, useEffect, useMemo, useRef, type ClipboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import type { UUID } from '@shared/types';
import { GRID_LOCALE, gridTheme } from '@/lib/agGrid';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { siteSearchUrl } from '@/components/ProductPicker';
import { getRequestDocStore, useRequestComputed, useRequestDoc } from '@/stores/requestDocStore';
import type { EditorMode } from '@/stores/uiPrefsStore';
import { useUiPrefs } from '@/stores/uiPrefsStore';
import type { Density } from '@/theme';
import { NoRowsOverlay } from './cells';
import { COL, parseColId, type BlockField } from './colIds';
import { buildColumnDefs } from './columns';
import { dragTargets, fillDownTargets, fillFieldOf } from './fill';
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
const EDITABLE_BLOCK_FIELDS = new Set<BlockField>(['sku', 'qty', 'note']);

const isPickerKey = (e: KeyboardEvent) => e.key === 'F4' || ((e.ctrlKey || e.metaKey) && (e.key === ' ' || e.code === 'Space'));
const isDeleteKey = (e: KeyboardEvent) => e.key === 'Delete' || (isMac && e.key === 'Backspace');
const isPasteKey = (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'v';
/** Ctrl+D (на Mac і Cmd+D) — заповнити з рядка вище, як в Excel; розкладка неважлива (e.code). */
const isFillKey = (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.code === 'KeyD' || e.key.toLowerCase() === 'd');

/** Колонки блоку, подвійний клік по яких відкриває панель пропозиції (решта редагується в клітинці). */
const DETAIL_FIELDS: ReadonlySet<string> = new Set(['name', 'net', 'gross', 'sum', 'rrp']);

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
  suppressMovable: true,
  suppressHeaderMenuButton: true,
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
  const columnDefs = useMemo(
    () =>
      buildColumnDefs({
        mode,
        blockIds: blockKey ? blockKey.split('|') : [],
        collapsed: new Set(collapsedKey ? collapsedKey.split('|') : []),
      }),
    [mode, blockKey, collapsedKey],
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
      const sites = (s.doc?.blocks ?? []).flatMap((b) => {
        const sup = supplierOfBlock(b.id);
        const url = sup ? siteSearchUrl(sup.searchUrlTemplate, { query: row.line.clientName, sku: row.cells[b.id]?.offer?.sku }) : null;
        return sup && url ? [{ key: `web:${b.id}`, label: sup.name, url }] : [];
      });
      return {
        items: [
          { key: 'above', icon: <VerticalAlignTopOutlined />, label: 'Вставити рядок вище', disabled: ro },
          { key: 'below', icon: <VerticalAlignBottomOutlined />, label: 'Вставити рядок нижче', disabled: ro },
          { type: 'divider' },
          { key: 'pick', icon: <SearchOutlined />, label: 'Підібрати в каталозі (F4)', disabled: ro },
          sites.length
            ? { key: 'web', icon: <GlobalOutlined />, label: 'Знайти на сайті постачальника', children: sites.map((x) => ({ key: x.key, label: x.label })) }
            : { key: 'web', icon: <GlobalOutlined />, label: 'Знайти на сайті постачальника', disabled: true },
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
          else if (key.startsWith('web:')) {
            const site = sites.find((x) => x.key === key);
            if (site) window.open(site.url, '_blank', 'noopener,noreferrer');
          }
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
          ...(changed ? [{ key: 'refresh', icon: <SyncOutlined />, label: 'Оновити ціну з прайсу', disabled: ro }] : []),
          { key: 'replace', icon: <SwapOutlined />, label: 'Замінити товар (F4)', disabled: ro },
          { key: 'clear', icon: <StopOutlined />, label: 'Очистити (Delete)', disabled: ro, danger: true },
        ],
        onClick: ({ key, domEvent }) => {
          domEvent.stopPropagation();
          const a = actionsRef.current;
          if (key === 'details') useSourcingUi.getState().openDrawer({ lineId: row.id, blockId });
          else if (key === 'refresh') a.refreshOfferPrice(row.id, blockId);
          else if (key === 'replace') a.openPickerFor(row.id, blockId, 'replace');
          else if (key === 'clear') a.clearOffer(row.id, blockId);
        },
      };
    },
    [store],
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
      const root = e.currentTarget.closest<HTMLElement>('.ag-root-wrapper');
      const cell = e.currentTarget.closest<HTMLElement>('.ag-cell');
      if (!field || !api || !root || !cell || e.button !== 0 || store.getState().readOnly) return;
      e.preventDefault();
      const displayed = displayedLineIds(api);
      const from = displayed.indexOf(row.id);
      if (from < 0) return;
      const x = cell.getBoundingClientRect().left + cell.offsetWidth / 2;
      let to = from;
      let pointerY = e.clientY;
      let frame = 0;
      let lastScroll = 0;

      const paint = () => {
        root.querySelectorAll('.po-fill-range').forEach((el) => el.classList.remove('po-fill-range'));
        const [lo, hi] = to > from ? [from + 1, to] : [to, from - 1];
        for (let i = lo; i <= hi; i++) {
          root.querySelector(`.ag-row[row-index="${i}"] .ag-cell[col-id="${colId}"]`)?.classList.add('po-fill-range');
        }
      };
      /** Смуга рядків (між шапкою й рядком підсумків). */
      const bodyBounds = () => {
        const r = root.getBoundingClientRect();
        const top = root.querySelector('.ag-header')?.getBoundingClientRect().bottom ?? r.top;
        const bottom = root.querySelector('.ag-row-pinned')?.getBoundingClientRect().top ?? r.bottom;
        return { top, bottom };
      };
      /** Рядок під курсором (за межами смуги рядків — крайній видимий). */
      const locate = () => {
        const b = bodyBounds();
        const y = Math.max(b.top + 2, Math.min(pointerY, b.bottom - 2));
        const rowEl = document.elementFromPoint(x, y)?.closest<HTMLElement>('.ag-row[row-index]');
        const index = Number(rowEl?.getAttribute('row-index'));
        if (rowEl && Number.isInteger(index)) to = Math.min(index, displayed.length - 1);
      };
      /** 1 / −1 — курсор біля нижнього / верхнього краю смуги рядків (автопрокрутка), 0 — всередині. */
      const edgeDir = () => {
        const b = bodyBounds();
        return pointerY > b.bottom - 24 ? 1 : pointerY < b.top + 24 ? -1 : 0;
      };
      // біля краю — прокрутка по рядку (~12 рядків за секунду)
      const track = (time: number) => {
        const dir = edgeDir();
        if (dir && time - lastScroll > 80) {
          lastScroll = time;
          to = Math.max(0, Math.min(to + dir, displayed.length - 1));
          api.ensureIndexVisible(to, dir > 0 ? 'bottom' : 'top');
        } else if (!dir) locate();
        paint();
        frame = requestAnimationFrame(track);
      };
      const onMove = (ev: MouseEvent) => {
        pointerY = ev.clientY;
        if (!edgeDir()) locate();
      };
      const finish = (apply: boolean) => {
        cancelAnimationFrame(frame);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('keydown', onKey, true);
        document.body.classList.remove('po-filling');
        root.querySelectorAll('.po-fill-range').forEach((el) => el.classList.remove('po-fill-range'));
        fillCleanup.current = null;
        if (apply) actionsRef.current.fillLines(field, row.id, dragTargets(displayed, row.id, to));
      };
      const onUp = (ev: MouseEvent) => {
        pointerY = ev.clientY;
        // швидкий рух, коли кадр ще не встиг — рядок під курсором; після автопрокрутки лишається її рядок
        if (!lastScroll || !edgeDir()) locate();
        finish(true);
      };
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key !== 'Escape') return;
        ev.stopPropagation();
        finish(false);
      };
      fillCleanup.current?.();
      fillCleanup.current = () => finish(false);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('keydown', onKey, true);
      document.body.classList.add('po-filling');
      frame = requestAnimationFrame(track);
    },
    [store],
  );
  useEffect(() => () => fillCleanup.current?.(), []);

  const context = useMemo<SourcingGridContext>(
    () => ({
      isReadOnly: () => store.getState().readOnly,
      blockOf,
      supplierOfBlock,
      rowMenu,
      nameMenu,
      onMissClick: (row, blockId) => actionsRef.current.resolveMiss(row.id, blockId),
      onPickerKey: openPickerAt,
      onPasteKey: startPasteFallback,
      onFillStart: startFill,
    }),
    [store, rowMenu, nameMenu, openPickerAt, startPasteFallback, startFill],
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
        if (row.cells[col.blockId]?.offer) ui.openDrawer({ lineId: row.id, blockId: col.blockId });
        else if (!store.getState().readOnly) a.openPickerFor(row.id, col.blockId, 'add');
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
      } else if (col.kind === 'compare' || (col.kind === 'chosen' && mode === 'comparison')) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          openCell(row, colId);
        } else if (isDeleteKey(ev) && col.kind === 'compare') {
          a.clearOffer(row.id, col.blockId);
        }
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
    <div className="po-sourcing-grid-inner" onPaste={onPaste}>
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
        onBodyScrollEnd={(e) => useSourcingUi.getState().rememberScroll(e.api.getFirstDisplayedRowIndex())}
        stopEditingWhenCellsLoseFocus
        enterNavigatesVerticallyAfterEdit
        suppressMovableColumns
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
