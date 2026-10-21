// Частини таблиці аркуша «Довідника»: посилання в клітинці, «+» біля рядка й під таблицею, «+» колонки, меню заголовка.
// Дії приходять через context таблиці (SheetGridActions), щоб ці компоненти не перестворювались при кожній правці.
import { DeleteOutlined, EditOutlined, MoreOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Dropdown } from 'antd';
import type { ICellRendererParams, IHeaderParams } from 'ag-grid-community';
import { useMemo } from 'react';
import type { ReferenceRow } from '@shared/types';
import { linkParts } from './sheet';

export interface SheetGridActions {
  /** Порожній рядок під afterId; null — у кінці аркуша. */
  insertRow: (afterId: string | null) => void;
  addColumn: () => void;
  renameColumn: (colId: string) => void;
  deleteColumn: (colId: string) => void;
}

/** Рядок-кнопка «+ Додати рядок» під останнім рядком: у таблиці, але не в аркуші й не зберігається. */
export const ADD_ROW_ID = '__add-row';
export const ADD_ROW: ReferenceRow = { id: ADD_ROW_ID, cells: {} };
export const INSERT_COL_ID = '__insert';
export const ADD_COL_ID = '__add-column';

export function LinkCell({ value }: ICellRendererParams<ReferenceRow, string>) {
  const parts = useMemo(() => linkParts(value ?? ''), [value]);
  return (
    <span className="po-ref-text">
      {parts.map((p, i) =>
        p.href ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer">
            {p.text}
          </a>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  );
}

export function InsertRowCell({ data, context }: ICellRendererParams<ReferenceRow, unknown, SheetGridActions>) {
  if (!data || data.id === ADD_ROW_ID) return null;
  return (
    <Button
      className="po-ref-insert"
      type="text"
      size="small"
      icon={<PlusOutlined />}
      title="Вставити порожній рядок нижче"
      aria-label="Вставити порожній рядок нижче"
      onClick={() => context.insertRow(data.id)}
    />
  );
}

export function AddRowCell({ context }: ICellRendererParams<ReferenceRow, unknown, SheetGridActions>) {
  return (
    <div className="po-ref-add-row">
      <Button type="link" icon={<PlusOutlined />} onClick={() => context.insertRow(null)}>
        Додати рядок
      </Button>
    </div>
  );
}

export function AddColumnHeader({ context }: IHeaderParams<ReferenceRow, SheetGridActions>) {
  return (
    <Button
      className="po-ref-add-col"
      type="text"
      size="small"
      icon={<PlusOutlined />}
      title="Додати колонку"
      aria-label="Додати колонку"
      onClick={() => context.addColumn()}
    />
  );
}

/** Заголовок колонки: назва і меню «⋮» (перейменувати, видалити). */
export function ColumnHeader({ displayName, column, context }: IHeaderParams<ReferenceRow, SheetGridActions>) {
  const colId = column.getColId();
  return (
    <div className="po-ref-header">
      <span className="po-ref-header-title">{displayName}</span>
      <Dropdown
        trigger={['click']}
        menu={{
          items: [
            { key: 'rename', icon: <EditOutlined />, label: 'Перейменувати колонку' },
            { key: 'delete', icon: <DeleteOutlined />, label: 'Видалити колонку', danger: true },
          ],
          onClick: ({ key }) => (key === 'rename' ? context.renameColumn(colId) : context.deleteColumn(colId)),
        }}
      >
        <Button className="po-ref-header-menu" type="text" size="small" icon={<MoreOutlined />} aria-label={`Дії з колонкою «${displayName}»`} />
      </Dropdown>
    </div>
  );
}
