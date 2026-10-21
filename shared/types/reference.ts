// «Довідник» (правки замовника 21.10, п.11): спільні аркуші-таблиці — сайти брендів, нотатки.
import type { ISODateTime, UserRef, UUID } from './common';

export interface ReferenceColumn {
  /** Ключ клітинок цієї колонки в рядках; незмінний, коли колонку перейменовують чи переставляють. */
  id: string;
  title: string;
  /** Ширина, яку задали перетягуванням; немає — типова. */
  width?: number;
}

export interface ReferenceRow {
  id: string;
  /** Текст за id колонки; порожніх клітинок немає. */
  cells: Record<string, string>;
}

/** Аркуш у списку вкладок: без вмісту, щоб список був легким і його можна було часто перечитувати. */
export interface ReferenceSheetMeta {
  id: UUID;
  /** Версія аркуша: передається назад при збереженні, щоб не стерти чужі правки (ДОВ-6). */
  version: number;
  title: string;
  sortOrder: number;
  updatedAt: ISODateTime;
  updatedBy: UserRef | null;
}

export interface ReferenceSheetDto extends ReferenceSheetMeta {
  columns: ReferenceColumn[];
  rows: ReferenceRow[];
}

/** Аркуш цілком; version — та, що була відкрита (обов'язкова при збереженні, для нового аркуша не передається). */
export interface ReferenceSheetInput {
  version?: number;
  title: string;
  columns: ReferenceColumn[];
  rows: ReferenceRow[];
}
