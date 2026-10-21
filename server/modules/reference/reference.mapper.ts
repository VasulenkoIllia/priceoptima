// Рядок бази → аркуш «Довідника». JSON колонок і рядків перевіряємо на вході в API; тут лише не падаємо на зіпсованому.
import type { ReferenceSheet } from '@prisma/client';
import type { ReferenceColumn, ReferenceRow, ReferenceSheetDto, ReferenceSheetMeta, UserRef } from '@shared/types';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function toColumns(json: unknown): ReferenceColumn[] {
  if (!Array.isArray(json)) return [];
  return json.filter(isObject).flatMap((c) =>
    typeof c.id === 'string' ? [{ id: c.id, title: typeof c.title === 'string' ? c.title : '', ...(typeof c.width === 'number' ? { width: c.width } : {}) }] : [],
  );
}

function toRows(json: unknown): ReferenceRow[] {
  if (!Array.isArray(json)) return [];
  return json.filter(isObject).flatMap((r) =>
    typeof r.id === 'string' && isObject(r.cells)
      ? [{ id: r.id, cells: Object.fromEntries(Object.entries(r.cells).filter((e): e is [string, string] => typeof e[1] === 'string')) }]
      : [],
  );
}

export type ReferenceSheetMetaRow = Pick<ReferenceSheet, 'id' | 'version' | 'title' | 'sortOrder' | 'updatedAt' | 'updatedById'>;

export function toReferenceSheetMeta(row: ReferenceSheetMetaRow, users: ReadonlyMap<string, UserRef>): ReferenceSheetMeta {
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedById ? (users.get(row.updatedById) ?? null) : null,
  };
}

export function toReferenceSheetDto(row: ReferenceSheet, users: ReadonlyMap<string, UserRef>): ReferenceSheetDto {
  return { ...toReferenceSheetMeta(row, users), columns: toColumns(row.columns), rows: toRows(row.rows) };
}
