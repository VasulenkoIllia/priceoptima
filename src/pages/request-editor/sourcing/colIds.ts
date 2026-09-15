// Ідентифікатори колонок сітки підбору: колонки клієнта, колонки блоків «b:<blockId>:<поле>», колонки режиму «Порівняння».
import type { UUID } from '@shared/types';

/** Поля рядка клієнта, що редагуються в сітці (порядок = порядок колонок, важливий для вставки TSV). */
export const LINE_FIELDS = ['clientName', 'clientUnit', 'qty'] as const;
export type LineField = (typeof LINE_FIELDS)[number];

/** Колонки блоку постачальника в режимі «Підбір» (повний набір). */
export const BLOCK_FIELDS = ['sku', 'name', 'unit', 'qty', 'net', 'gross', 'sum', 'rrp', 'stock', 'note', 'exclude', 'pick'] as const;
export type BlockField = (typeof BLOCK_FIELDS)[number];

/** У згорнутому блоці лишаються: Артикул | Без ПДВ | ✔. */
export const COLLAPSED_BLOCK_FIELDS: readonly BlockField[] = ['sku', 'net', 'pick'];

export const COL = {
  pos: 'pos',
  chosen: 'chosen',
  line: (field: LineField) => `line:${field}`,
  block: (blockId: UUID, field: BlockField) => `b:${blockId}:${field}`,
  compare: (blockId: UUID) => `cmp:${blockId}`,
  group: (blockId: UUID) => `grp:${blockId}`,
} as const;

export type ParsedColId =
  | { kind: 'pos' }
  | { kind: 'chosen' }
  | { kind: 'line'; field: LineField }
  | { kind: 'block'; blockId: UUID; field: BlockField }
  | { kind: 'compare'; blockId: UUID }
  | { kind: 'other' };

export function parseColId(colId: string | null | undefined): ParsedColId {
  if (!colId) return { kind: 'other' };
  if (colId === COL.pos) return { kind: 'pos' };
  if (colId === COL.chosen) return { kind: 'chosen' };
  if (colId.startsWith('line:')) {
    const field = colId.slice(5) as LineField;
    return LINE_FIELDS.includes(field) ? { kind: 'line', field } : { kind: 'other' };
  }
  if (colId.startsWith('b:')) {
    const at = colId.lastIndexOf(':');
    const blockId = colId.slice(2, at);
    const field = colId.slice(at + 1) as BlockField;
    return blockId && BLOCK_FIELDS.includes(field) ? { kind: 'block', blockId, field } : { kind: 'other' };
  }
  if (colId.startsWith('cmp:')) return { kind: 'compare', blockId: colId.slice(4) };
  return { kind: 'other' };
}
