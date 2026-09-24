// Заповнення як в Excel (п.2.2 правок клієнта): протягнути одиницю або кількість за куточок клітинки, Ctrl+D — з рядка вище.
import type { RequestLine, UUID } from '@shared/types';
import type { LinePatchEntry } from '@/stores/requestDocStore';
import { parseColId, type LineField } from './colIds';

/** Колонки клієнта, які можна протягувати. */
export type FillField = Extract<LineField, 'clientUnit' | 'qty'>;

export function fillFieldOf(colId: string | null | undefined): FillField | null {
  const col = parseColId(colId);
  return col.kind === 'line' && (col.field === 'clientUnit' || col.field === 'qty') ? col.field : null;
}

/** Значення джерела в цільові рядки; рядки, де воно вже таке, пропускаються. */
export function planFill(field: FillField, source: Pick<RequestLine, 'clientUnit' | 'qty'>, targets: readonly RequestLine[]): LinePatchEntry[] {
  const out: LinePatchEntry[] = [];
  for (const t of targets) {
    if (field === 'clientUnit' && t.clientUnit !== source.clientUnit) out.push({ id: t.id, patch: { clientUnit: source.clientUnit } });
    if (field === 'qty' && t.qty !== source.qty) out.push({ id: t.id, patch: { qty: source.qty } });
  }
  return out;
}

/**
 * Ctrl+D: кілька виділених рядків (з фокусним серед них) — значення верхнього з них у решту;
 * інакше — значення рядка вище у фокусний. Порядок — як показано в сітці. null — нема звідки брати.
 */
export function fillDownTargets(
  displayed: readonly UUID[],
  focusedId: UUID,
  selectedIds: readonly UUID[],
): { sourceId: UUID; targetIds: UUID[] } | null {
  const selected = new Set(selectedIds);
  if (selected.size > 1 && selected.has(focusedId)) {
    const ordered = displayed.filter((id) => selected.has(id));
    return ordered.length > 1 ? { sourceId: ordered[0], targetIds: ordered.slice(1) } : null;
  }
  const i = displayed.indexOf(focusedId);
  return i > 0 ? { sourceId: displayed[i - 1], targetIds: [focusedId] } : null;
}

export { dragTargets } from '@/lib/gridFillDrag';
