// Журнал дій (лише адміністратор): хто, коли, що зробив — входи, користувачі, налаштування, довідники, каталог.
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Button, Select, Table, type TableColumnsType } from 'antd';
import { useState } from 'react';
import { formatDateTime } from '@shared/format';
import type { AuditEventDto, UUID } from '@shared/types';
import { ds, qk } from '@/data';
import { LoadError } from '@/components';

const ENTITY_OPTIONS = [
  { value: 'user', label: 'Користувачі й входи' },
  { value: 'settings', label: 'Налаштування' },
  { value: 'own_company', label: 'Наші юрособи' },
  { value: 'supplier', label: 'Постачальники' },
  { value: 'client', label: 'Клієнти' },
  { value: 'product', label: 'Номенклатура' },
  { value: 'rate', label: 'Курси' },
  { value: 'request', label: 'Заявки' },
];

const columns: TableColumnsType<AuditEventDto> = [
  { title: 'Коли', dataIndex: 'at', width: 150, render: (v: string) => <span className="po-num">{formatDateTime(v)}</span> },
  { title: 'Хто', key: 'user', width: 170, render: (_: unknown, e) => e.user?.shortName ?? 'система' },
  { title: 'Що', dataIndex: 'summary' },
];

export function AuditTab() {
  const [userId, setUserId] = useState<UUID | undefined>();
  const [entityType, setEntityType] = useState<string | undefined>();
  const users = useQuery({ queryKey: qk.users, queryFn: () => ds.listUsers() });
  const audit = useInfiniteQuery({
    queryKey: ['audit', userId ?? '', entityType ?? ''],
    queryFn: ({ pageParam }) => ds.listAudit({ userId, entityType, before: pageParam, limit: 100 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const rows = audit.data?.pages.flatMap((p) => p.items) ?? [];

  if (audit.isError) return <LoadError title="Не вдалося завантажити журнал" error={audit.error} onRetry={audit.refetch} />;
  return (
    <div style={{ maxWidth: 1100 }}>
      <div className="po-set-toolbar">
        <Select
          allowClear
          placeholder="Усі користувачі"
          style={{ width: 220 }}
          value={userId}
          onChange={setUserId}
          options={(users.data ?? []).map((u) => ({ value: u.id, label: u.shortName }))}
        />
        <Select allowClear placeholder="Усі розділи" style={{ width: 220 }} value={entityType} onChange={setEntityType} options={ENTITY_OPTIONS} />
      </div>
      <Table<AuditEventDto>
        size="small"
        rowKey="id"
        loading={audit.isPending}
        columns={columns}
        dataSource={rows}
        pagination={false}
        locale={{ emptyText: 'Записів немає' }}
      />
      {audit.hasNextPage ? (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <Button loading={audit.isFetchingNextPage} onClick={() => void audit.fetchNextPage()}>
            Показати ще
          </Button>
        </div>
      ) : null}
    </div>
  );
}
