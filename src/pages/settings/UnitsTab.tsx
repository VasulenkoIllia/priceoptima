// Одиниці виміру (перегляд): коди й синоніми, за якими одиниці розпізнаються при імпорті позицій клієнта.
import { Table, type TableColumnsType } from 'antd';
import { DEFAULT_UNITS } from '@shared/parse';
import type { UnitDto } from '@shared/types';

const COLUMNS: TableColumnsType<UnitDto> = [
  { title: 'Код', dataIndex: 'code', width: 110, render: (v: string) => <strong>{v}</strong> },
  { title: 'Назва', dataIndex: 'name', width: 220 },
  { title: 'Синоніми', dataIndex: 'aliases', className: 'po-cell-text', render: (v: string[]) => v.join(', ') },
];

export function UnitsTab() {
  return (
    <div style={{ maxWidth: 900 }}>
      <Table<UnitDto>
        className="po-set-units"
        size="small"
        rowKey="code"
        columns={COLUMNS}
        dataSource={DEFAULT_UNITS}
        pagination={false}
        locale={{ emptyText: 'Одиниць немає' }}
      />
      <div className="po-set-hint">Синоніми розпізнаються при імпорті позицій клієнта: «шт.», «штук» → «шт».</div>
    </div>
  );
}
