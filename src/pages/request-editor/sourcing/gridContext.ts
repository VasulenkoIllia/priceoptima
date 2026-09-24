// Контекст сітки підбору: доступ рендерів клітинок до поточного стану й дій (стабільний об'єкт, дані читаються «наживо»).
import type { MouseEvent } from 'react';
import type { SupplierBlock, SupplierRef, UUID } from '@shared/types';
import type { LineRow } from './rows';

export interface SourcingGridContext {
  isReadOnly(): boolean;
  blockOf(blockId: UUID): SupplierBlock | null;
  supplierOfBlock(blockId: UUID): SupplierRef | null;
  /** «+» у клітинці «№» (видно при наведенні): новий рядок одразу під цим. */
  onInsertBelow(row: LineRow): void;
  /** Клік по підказці невдалого артикула в клітинці. */
  onMissClick(row: LineRow, blockId: UUID): void;
  /** F4 / Ctrl+Space: вікно вибору товару для клітинки (query — текст, набраний у клітинці). */
  onPickerKey(row: LineRow, colId: string, query?: string): void;
  /** Ctrl/Cmd+V у клітинці (синхронно в keydown) — запасний шлях, якщо браузер не надішле подію paste. */
  onPasteKey(): void;
  /** Натиснули куточок клітинки «Од.» / «К-сть» — почати протягування (як в Excel). */
  onFillStart(e: MouseEvent<HTMLElement>, row: LineRow, colId: string): void;
}
