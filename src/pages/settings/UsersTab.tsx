// Користувачі (лише адміністратор): запрошення разовим посиланням, роль, блокування, посилання для зміни пароля, дані.
import { EllipsisOutlined, UserAddOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Dropdown, Form, Input, Modal, Radio, Table, Tag, type MenuProps, type TableColumnsType } from 'antd';
import { useState } from 'react';
import { USER_ROLES, USER_ROLE_LABELS, type UserRole } from '@shared/enums';
import { formatDateTime } from '@shared/format';
import type { AccessLinkCreated, AccessLinkDto, AccessLinkKind, AccessLinkState, UserDto } from '@shared/types';
import { useSession } from '@/app/session';
import { ds, errorMessage, qk } from '@/data';
import { AccessLinkModal } from './AccessLinkModal';
import { UserDialog } from './UserDialog';
import { LoadError } from '@/components';

const LINKS_KEY = ['access-links'] as const;

const LINK_STATE: Record<AccessLinkState, { color: string; label: string }> = {
  valid: { color: 'blue', label: 'чекає' },
  used: { color: 'green', label: 'використано' },
  revoked: { color: 'default', label: 'скасовано' },
  expired: { color: 'default', label: 'прострочено' },
};

type ReadyLink = AccessLinkCreated & { kind: AccessLinkKind; forWhom: string };

function InviteDialog({ open, onClose, onCreated }: { open: boolean; onClose(): void; onCreated(link: ReadyLink): void }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{ role: UserRole; note?: string }>();
  const create = useMutation({
    mutationFn: (v: { role: UserRole; note?: string }) => ds.createInvite({ role: v.role, note: v.note?.trim() || null }),
    onSuccess: (link, v) => {
      void queryClient.invalidateQueries({ queryKey: LINKS_KEY });
      onCreated({ ...link, kind: 'invite', forWhom: v.note?.trim() || 'новий користувач' });
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  return (
    <Modal
      open={open}
      title="Запросити користувача"
      okText="Створити посилання"
      cancelText="Скасувати"
      confirmLoading={create.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark={false} preserve={false} initialValues={{ role: 'user' }} onFinish={(v) => create.mutate(v)}>
        <Form.Item name="role" label="Роль">
          <Radio.Group
            optionType="button"
            options={USER_ROLES.map((r) => ({ value: r, label: USER_ROLE_LABELS[r] }))}
          />
        </Form.Item>
        <Form.Item name="note" label="Для кого" extra="Підказка вам у списку запрошень: «Олена, закупівлі»">
          <Input maxLength={120} placeholder="необов’язково" />
        </Form.Item>
      </Form>
      <div className="po-muted" style={{ fontSize: 12 }}>
        Посилання разове й діє 7 днів. Адміністратор — усе, включно з налаштуваннями, користувачами й джерелами прайсів; користувач — щоденна робота.
      </div>
    </Modal>
  );
}

export function UsersTab() {
  const { modal, message } = App.useApp();
  const queryClient = useQueryClient();
  const { user: me } = useSession();
  const users = useQuery({ queryKey: qk.users, queryFn: () => ds.listUsers() });
  const links = useQuery({ queryKey: LINKS_KEY, queryFn: () => ds.listAccessLinks() });
  const [editing, setEditing] = useState<UserDto | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [ready, setReady] = useState<ReadyLink | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.users });
    void queryClient.invalidateQueries({ queryKey: LINKS_KEY });
  };
  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: refresh,
    onError: (e) => message.error(errorMessage(e)),
  });

  const menuFor = (u: UserDto): MenuProps => {
    const self = u.id === me.id;
    const otherRole: UserRole = u.role === 'admin' ? 'user' : 'admin';
    return {
      items: [
        { key: 'edit', label: 'Змінити дані' },
        { key: 'role', label: `Зробити: ${USER_ROLE_LABELS[otherRole]}`, disabled: self },
        { key: 'reset', label: 'Посилання для зміни пароля', disabled: !u.isActive },
        { type: 'divider' },
        u.isActive ? { key: 'block', label: 'Заблокувати', danger: true, disabled: self } : { key: 'unblock', label: 'Розблокувати' },
      ],
      onClick: ({ key }) => {
        if (key === 'edit') setEditing(u);
        else if (key === 'role') {
          modal.confirm({
            title: `${u.shortName}: роль «${USER_ROLE_LABELS[otherRole]}»?`,
            okText: 'Змінити',
            cancelText: 'Скасувати',
            onOk: () => act.mutateAsync(() => ds.setUserRole(u.id, otherRole)).then(() => message.success('Роль змінено')),
          });
        } else if (key === 'reset') {
          void ds
            .createResetLink(u.id)
            .then((link) => {
              refresh();
              setReady({ ...link, kind: 'reset', forWhom: u.shortName });
            })
            .catch((e: unknown) => message.error(errorMessage(e)));
        } else if (key === 'block') {
          modal.confirm({
            title: `Заблокувати ${u.shortName}?`,
            content: 'Вхід закриється одразу, відкриті заявки звільняться. Заявки й історія лишаються; розблокувати можна будь-коли.',
            okText: 'Заблокувати',
            okButtonProps: { danger: true },
            cancelText: 'Скасувати',
            onOk: () => act.mutateAsync(() => ds.blockUser(u.id)).then(() => message.success(`${u.shortName}: заблоковано`)),
          });
        } else if (key === 'unblock') {
          act.mutate(() => ds.unblockUser(u.id));
        }
      },
    };
  };

  const userColumns: TableColumnsType<UserDto> = [
    {
      title: 'ПІБ',
      dataIndex: 'fullName',
      render: (v: string, u) => (
        <span>
          {v}
          {u.id === me.id ? <Tag bordered={false} style={{ marginLeft: 6 }}>це ви</Tag> : null}
          {!u.isActive ? (
            <Tag color="red" bordered={false} style={{ marginLeft: 6 }}>
              заблоковано {u.blockedAt ? formatDateTime(u.blockedAt) : ''}
            </Tag>
          ) : null}
          {u.mustChangePassword ? (
            <Tag color="gold" bordered={false} style={{ marginLeft: 6 }}>
              ще не змінив пароль
            </Tag>
          ) : null}
        </span>
      ),
    },
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
    { title: 'Телефон', dataIndex: 'phone', render: (v: string | null) => <span className="po-num">{v ?? '—'}</span> },
    { title: 'E-mail', dataIndex: 'email', render: (v: string | null) => v ?? '—' },
    { title: 'Запросив', dataIndex: 'invitedBy', render: (v: string | null) => v ?? '—' },
    { title: 'Останній вхід', dataIndex: 'lastLoginAt', render: (v: string | null) => <span className="po-num">{formatDateTime(v)}</span> },
    {
      key: 'actions',
      width: 48,
      align: 'right',
      render: (_: unknown, u) => (
        <Dropdown trigger={['click']} menu={menuFor(u)}>
          <Button size="small" type="text" icon={<EllipsisOutlined />} aria-label="Дії з користувачем" />
        </Dropdown>
      ),
    },
  ];

  const linkColumns: TableColumnsType<AccessLinkDto> = [
    { title: 'Створено', dataIndex: 'createdAt', width: 140, render: (v: string) => <span className="po-num">{formatDateTime(v)}</span> },
    {
      title: 'Що',
      key: 'what',
      render: (_: unknown, l) =>
        l.kind === 'invite'
          ? `Запрошення: ${USER_ROLE_LABELS[l.role ?? 'user'].toLowerCase()}${l.note ? ` · ${l.note}` : ''}`
          : `Зміна пароля: ${l.user?.shortName ?? '—'}`,
    },
    { title: 'Хто створив', key: 'by', render: (_: unknown, l) => l.createdBy?.shortName ?? '—' },
    {
      title: 'Стан',
      key: 'state',
      render: (_: unknown, l) => (
        <>
          <Tag bordered={false} color={LINK_STATE[l.state].color}>
            {LINK_STATE[l.state].label}
          </Tag>
          {l.state === 'used' && l.kind === 'invite' && l.user ? <span className="po-muted">{l.user.shortName}</span> : null}
          {l.state === 'valid' ? <span className="po-muted po-num">до {formatDateTime(l.expiresAt)}</span> : null}
        </>
      ),
    },
    {
      key: 'actions',
      width: 110,
      align: 'right',
      render: (_: unknown, l) =>
        l.state === 'valid' ? (
          <Button size="small" type="link" danger onClick={() => act.mutate(() => ds.revokeAccessLink(l.id))}>
            Скасувати
          </Button>
        ) : null,
    },
  ];

  if (users.isError) return <LoadError title="Не вдалося завантажити користувачів" error={users.error} onRetry={users.refetch} />;
  const activeCount = users.data?.filter((u) => u.isActive).length ?? 0;
  return (
    <div style={{ maxWidth: 1200 }}>
      <div className="po-set-toolbar">
        <Button type="primary" icon={<UserAddOutlined />} onClick={() => setInviteOpen(true)}>
          Запросити користувача
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
        columns={userColumns}
        dataSource={users.data}
        pagination={false}
        rowClassName={(u) => (u.isActive ? '' : 'po-set-user-inactive')}
        locale={{ emptyText: 'Користувачів немає' }}
      />

      <h4 className="po-set-subtitle">Запрошення й посилання для зміни пароля</h4>
      <Table<AccessLinkDto>
        size="small"
        rowKey="id"
        loading={links.isPending}
        columns={linkColumns}
        dataSource={links.data}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        locale={{ emptyText: 'Посилань ще не створювали' }}
      />
      <div className="po-set-hint">
        Адміністратор — усе, включно з налаштуваннями, нашими юрособами, користувачами й джерелами прайсів; користувач — заявки, номенклатура, клієнти,
        постачальники й курси. Користувачів не видаляють: заблокований не може увійти, його заявки й історія лишаються.
      </div>

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} onCreated={setReady} />
      <AccessLinkModal link={ready} onClose={() => setReady(null)} />
      <UserDialog open={!!editing} user={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
