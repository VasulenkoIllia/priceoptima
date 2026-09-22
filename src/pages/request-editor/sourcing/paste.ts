// Власний обробник вставки (Ctrl+V) для AG Grid Community: TSV з Excel → план змін для стору.
import { parseLocaleNumber, parseTsv } from '@shared/parse';
import type { UUID } from '@shared/types';
import type { LinePatch, LinePatchEntry, NewLineInput, SkuTarget } from '@/stores/requestDocStore';
import { LINE_FIELDS, parseColId, type LineField } from './colIds';

export type PastePlan =
  /** Колонка «Артикул» блоку: масова вставка вниз від фокусного рядка. */
  | { kind: 'skus'; blockId: UUID; targets: SkuTarget[]; /** Артикули, для яких не вистачило рядків. */ overflow: number }
  /** Колонки клієнта: значення в наявні рядки + нові рядки в кінець. */
  | { kind: 'lines'; updates: LinePatchEntry[]; newRows: NewLineInput[]; /** Некоректні числа (пропущено). */ invalid: number }
  | { kind: 'unsupported' }
  | { kind: 'empty' };

export interface PastePlanInput {
  text: string;
  /** colId фокусної клітинки. */
  colId: string;
  /** id показаних рядків, починаючи з фокусного (порядок сітки з урахуванням фільтра). */
  lineIds: readonly UUID[];
}

/** Прибирає повністю порожні рядки в кінці (Excel додає перенос після останнього рядка). */
function trimTrailingEmpty(rows: string[][]): string[][] {
  let end = rows.length;
  while (end > 0 && rows[end - 1].every((c) => c.trim() === '')) end--;
  return rows.slice(0, end);
}

export function planPaste({ text, colId, lineIds }: PastePlanInput): PastePlan {
  const rows = trimTrailingEmpty(parseTsv(text ?? ''));
  if (!rows.length) return { kind: 'empty' };
  const col = parseColId(colId);

  if (col.kind === 'block' && col.field === 'sku') {
    const skus = rows.map((r) => (r[0] ?? '').trim());
    const targets: SkuTarget[] = [];
    skus.forEach((sku, i) => {
      const lineId = lineIds[i];
      if (lineId && sku) targets.push({ lineId, sku });
    });
    const overflow = skus.slice(lineIds.length).filter(Boolean).length;
    return { kind: 'skus', blockId: col.blockId, targets, overflow };
  }

  // № / колонки клієнта → вставка в колонки клієнта (з «№» — від назви, інакше — від фокусної колонки)
  if (col.kind === 'line' || col.kind === 'pos') {
    const start = col.kind === 'line' ? LINE_FIELDS.indexOf(col.field) : 0;
    const fields = LINE_FIELDS.slice(start);
    const updates: LinePatchEntry[] = [];
    const newRows: NewLineInput[] = [];
    let invalid = 0;
    rows.forEach((cells, i) => {
      const { patch, bad } = patchFromCells(cells, fields);
      invalid += bad;
      if (!Object.keys(patch).length) return;
      const lineId = lineIds[i];
      if (lineId) updates.push({ id: lineId, patch });
      else newRows.push(newLineFrom(patch));
    });
    return { kind: 'lines', updates, newRows, invalid };
  }

  return { kind: 'unsupported' };
}

function patchFromCells(cells: string[], fields: readonly LineField[]): { patch: LinePatch; bad: number } {
  const patch: LinePatch = {};
  let bad = 0;
  fields.forEach((field, j) => {
    if (j >= cells.length) return;
    const raw = cells[j].trim();
    if (field === 'clientName') patch.clientName = raw;
    else if (field === 'clientUnit') patch.clientUnit = raw || null;
    else if (raw !== '') {
      const n = parseLocaleNumber(raw);
      if (n.valid && n.value != null && n.value >= 0) patch.qty = n.value;
      else bad++;
    }
  });
  return { patch, bad };
}

function newLineFrom(patch: LinePatch): NewLineInput {
  return {
    clientName: patch.clientName ?? '',
    // порожню клітинку «Од.» не передаємо — спрацює типове «шт»
    ...(patch.clientUnit ? { clientUnit: patch.clientUnit } : {}),
    ...(patch.qty !== undefined ? { qty: patch.qty } : {}),
  };
}

/** «вставлено 12, не знайдено 3 (СІ-1, СІ-2 …)» */
export function pasteSkusSummary(r: { applied: number; notFound: string[]; ambiguous: string[]; skipped: number }): string {
  const parts = [`Вставлено артикулів: ${r.applied}`];
  if (r.notFound.length) parts.push(`не знайдено ${r.notFound.length} (${listPreview(r.notFound)})`);
  if (r.ambiguous.length) parts.push(`кілька збігів ${r.ambiguous.length} (${listPreview(r.ambiguous)})`);
  if (r.skipped) parts.push(`не вистачило рядків: ${r.skipped}`);
  return parts.join(', ');
}

function listPreview(list: readonly string[], max = 3): string {
  return list.length > max ? `${list.slice(0, max).join(', ')} …` : list.join(', ');
}
