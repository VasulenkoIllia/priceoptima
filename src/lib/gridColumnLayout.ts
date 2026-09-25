// Ширина й порядок колонок, задані користувачем (перетягуванням межі чи заголовка), запам'ятовуються для нього
// (правки замовника 25.09 п.1; на сервері — src/stores/uiPrefsSync.ts). Сітка будується заново при кожному поверненні
// на вкладку, тож збережене підставляємо в опис колонок. Ключ ширини задає сітка: однаковий ключ — одна ширина
// (те саме поле в усіх блоках). Порядок — для сітки цілком; закріплені й нерухомі колонки лишаються на своїх місцях.
import type { ColumnMovedEvent, ColumnResizedEvent, GridApi } from 'ag-grid-community';
import { useUiPrefs } from '@/stores/uiPrefsStore';

/** Ключ збереженої ширини для колонки; null — ширину не запам'ятовуємо. */
export type ColumnWidthKey = (colId: string) => string | null;

/** Ключ для сітки без спільних колонок: «сітка:колонка». */
export function gridWidthKey(grid: string): ColumnWidthKey {
  return (colId) => `${grid}:${colId}`;
}

/** Те, що з опису колонки (ColDef чи ColGroupDef будь-якої сітки) потрібно для ширини. */
interface WidthColumn {
  colId?: string;
  /** Без colId AG Grid бере id колонки з field. */
  field?: string;
  children?: object[];
  pinned?: unknown;
  suppressMovable?: boolean;
  lockPosition?: unknown;
}

/** Колонки зі збереженою шириною; flex знімаємо — ширину задав користувач. */
export function withSavedWidths<C extends object>(
  columns: C[],
  keyOf: ColumnWidthKey,
  saved: Record<string, number> = useUiPrefs.getState().columnWidths,
): C[] {
  return columns.map((column) => {
    const { colId, field, children } = column as WidthColumn;
    if (children) return { ...column, children: withSavedWidths(children, keyOf, saved) };
    const id = colId ?? field;
    const key = id ? keyOf(id) : null;
    const width = key ? saved[key] : undefined;
    return width ? { ...column, width, flex: undefined } : column;
  });
}

/** Користувач змінив ширину: запам'ятати й підтягнути колонки з тим самим ключем (те саме поле в інших блоках). */
export function rememberColumnWidths<T>(e: ColumnResizedEvent<T>, keyOf: ColumnWidthKey): void {
  // під час перетягування подія йде безперервно — зберігаємо лише в кінці; свої ж setColumnWidths (source 'api') пропускаємо
  if (!e.finished || e.source !== 'uiColumnResized' || !e.columns?.length) return;
  const widths: Record<string, number> = {};
  for (const column of e.columns) {
    const key = keyOf(column.getColId());
    if (key) widths[key] = column.getActualWidth();
  }
  if (!Object.keys(widths).length) return;
  useUiPrefs.getState().setColumnWidths(widths);

  const same = (e.api.getColumns() ?? []).flatMap((column) => {
    const key = keyOf(column.getColId());
    const width = key ? widths[key] : undefined;
    return width != null && column.getActualWidth() !== width ? [{ key: column, newWidth: width }] : [];
  });
  if (same.length) e.api.setColumnWidths(same, true, 'api');
}

// ── порядок ──────────────────────────────────────────────────────────

/** id у збереженому порядку; ті, яких у збереженому немає (нові колонки), — на своєму стандартному місці. */
export function orderByPreference<T extends string>(defaults: readonly T[], saved: readonly string[] | undefined): T[] {
  if (!saved?.length) return [...defaults];
  const known = new Set<string>(defaults);
  const result: T[] = [];
  for (const id of saved) if (known.has(id) && !result.includes(id as T)) result.push(id as T);
  defaults.forEach((id, i) => {
    if (result.includes(id)) return;
    const prev = defaults.slice(0, i).reverse().find((d) => result.includes(d));
    result.splice(prev ? result.indexOf(prev) + 1 : 0, 0, id);
  });
  return result;
}

/**
 * Частину колонок переставили (напр., у згорнутому блоці видно лише три): у повному порядку ці колонки займають
 * ті самі місця, але в новій послідовності; решта не рухається.
 */
export function reorderSubset<T extends string>(full: readonly T[], subset: readonly T[]): T[] {
  const inSubset = new Set(subset);
  let i = 0;
  return full.map((id) => (inSubset.has(id) ? subset[i++] : id));
}

const columnIdOf = (column: object): string | null => {
  const { colId, field } = column as WidthColumn;
  return colId ?? field ?? null;
};

/** Колонка, яку можна переставити: не закріплена, не заборонена до перетягування. */
function isMovable(column: object): boolean {
  const { pinned, suppressMovable, lockPosition, children } = column as WidthColumn;
  return !children && !pinned && !suppressMovable && !lockPosition && columnIdOf(column) != null;
}

/** Колонки сітки в збереженому порядку; закріплені й нерухомі — на своїх місцях. */
export function withSavedOrder<C extends object>(
  columns: C[],
  key: string,
  saved: Record<string, string[]> = useUiPrefs.getState().columnOrder,
): C[] {
  const order = saved[key];
  if (!order?.length) return columns;
  const movable = columns.filter(isMovable);
  const byId = new Map(movable.map((c) => [columnIdOf(c) as string, c]));
  const sorted = orderByPreference([...byId.keys()], order).map((id) => byId.get(id) as C);
  let i = 0;
  return columns.map((c) => (isMovable(c) ? sorted[i++] : c));
}

/** Поточний порядок незакріплених колонок сітки. */
export function movableColumnOrder<T>(api: GridApi<T>): string[] {
  return api
    .getColumnState()
    .filter((s) => !s.pinned)
    .map((s) => s.colId);
}

/** Користувач переставив колонку (перетягуванням заголовка): запам'ятати порядок сітки. */
export function rememberColumnOrder<T>(e: ColumnMovedEvent<T>, key: string): void {
  if (!e.finished || e.source !== 'uiColumnMoved') return;
  useUiPrefs.getState().setColumnOrder(key, movableColumnOrder(e.api));
}

// ── сітка без груп колонок: усе разом ────────────────────────────────

/** Збережені ширина й порядок сітки (ключ ширини — «сітка:колонка», порядку — «сітка»); закріплені колонки нерухомі. */
export function withSavedLayout<C extends object>(columns: C[], grid: string): C[] {
  const fixed = columns.map((c) => ((c as WidthColumn).pinned ? { ...c, suppressMovable: true } : c));
  return withSavedOrder(withSavedWidths(fixed, gridWidthKey(grid)), grid);
}

/** Обробники сітки без груп: запам'ятати ширину й порядок, які задав користувач. */
export function columnLayoutHandlers<T>(grid: string) {
  const widthKey = gridWidthKey(grid);
  return {
    onColumnResized: (e: ColumnResizedEvent<T>) => rememberColumnWidths(e, widthKey),
    onColumnMoved: (e: ColumnMovedEvent<T>) => rememberColumnOrder(e, grid),
  };
}

