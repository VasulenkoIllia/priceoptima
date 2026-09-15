// Користувачі: перегляд, додавання й редагування.
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Result, Table, Tag, type TableColumnsType } from 'antd';
import { useMemo, useState } from 'react';
import { USER_ROLE_LABELS, type UserRole } from '@shared/enums';
import { formatDateTime } from '@shared/format';
import type { UserDto } from '@shared/types';
import { ds, errorMessage, qk } from '@/data';
import { UserDialog } from './UserDialog';

function userColumns(onEdit: (u: UserDto) => void): TableColumnsType<UserDto> {
  return [
    {
      title: 'ПІБ',
      dataIndex: 'fullName',
      render: (v: string, u) => (
        <span>
          {v}
          {!u.isActive ? (
            <Tag bordered={false} style={{ marginLeft: 6 }}>
              неактивний
            </Tag>
          ) : null}
        </span>
      ),
    },
    { title: 'Коротко', dataIndex: 'shortName' },
    { title: 'Логін', dataIndex: 'login', render: (v: string) => <span className="po-num">{v}</span> },
    {
      title: 'Роль',
      dataIndex: 'role',
      render: (r: UserRole) => (
        <Tag color={r === 'admin' ? 'blue' : 'default'} bordered={false}>
          {USER_ROLE_LABELS[r]}
        </Tag>
      ),
    },
    { title: 'E-mail', dataIndex: 'email', render: (v: string | null) => v ?? '—' },
    { title: 'Телефон', dataIndex: 'phone', render: (v: string | null) => <span className="po-num">{v ?? '—'}</span> },
    { title: 'Останній вхід', dataIndex: 'lastLoginAt', render: (v: string | null) => <span className="po-num">{formatDateTime(v)}</span> },
    {
      key: 'actions',
      width: 120,
      align: 'right',
      className: 'po-set-user-act',
      render: (_: unknown, u) => (
        <Button size="small" type="link" icon={<EditOutlined />} onClick={() => onEdit(u)}>
          Редагувати
        </Button>
      ),
    },
  ];
}

export function UsersTab() {
  const users = useQuery({ queryKey: qk.users, queryFn: () => ds.listUsers() });
  // user: null — новий; окремий open — щоб діалог закривався з анімацією, не втрачаючи даних
  const [dialog, setDialog] = useState<{ open: boolean; user: UserDto | null }>({ open: false, user: null });
  const columns = useMemo(() => userColumns((user) => setDialog({ open: true, user })), []);

  if (users.isError) return <Result status="error" title="Не вдалося завантажити користувачів" subTitle={errorMessage(users.error)} />;
  const activeCount = users.data?.filter((u) => u.isActive).length ?? 0;
  return (
    <div style={{ maxWidth: 1200 }}>
      <div className="po-set-toolbar">
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setDialog({ open: true, user: null })}>
          Додати користувача
        </Button>
        {users.data ? (
          <span className="po-muted">
            Користувачів: {users.data.length}, активних: {activeCount}
          </span>
        ) : null}
      </div>
      <Table<UserDto>
        className="po-set-users"
        size="small"
        rowKey="id"
        loading={users.isPending}
        columns={columns}
        dataSource={users.data}
        pagination={false}
        rowClassName={(u) => (u.isActive ? '' : 'po-set-user-inactive')}
        locale={{ emptyText: 'Користувачів немає' }}
      />
      <div className="po-set-hint">
        Адміністратор — усі розділи, налаштування і скидання демо-даних; користувач — заявки й довідники.
        <br />
        У прототипі входить один обліковий запис (логін і пароль); решта — довідник відповідальних. Входи й доступи для кожного — у робочій версії.
      </div>
      <UserDialog open={dialog.open} user={dialog.user} onClose={() => setDialog((d) => ({ ...d, open: false }))} />
    </div>
  );
}
