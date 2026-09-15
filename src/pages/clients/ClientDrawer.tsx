// Картка клієнта: контрагенти, контакти, заявки клієнта.
import { EditOutlined, MailOutlined, PhoneOutlined, UserOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Drawer, Result, Spin, Table, Tag, Typography, type TableColumnsType } from 'antd';
import { useNavigate } from 'react-router';
import { formatDate, formatMoney } from '@shared/format';
import type { ClientDetail, RequestListItem, UUID } from '@shared/types';
import { StatusTag } from '@/components';
import { ds, errorMessage, qk } from '@/data';

const REQUEST_COLUMNS: TableColumnsType<RequestListItem> = [
  { title: '№', dataIndex: 'numberLabel', width: 84, render: (v: string) => <Typography.Link className="po-num">{v}</Typography.Link> },
  { title: 'Дата', dataIndex: 'requestDate', width: 96, render: (v: string) => <span className="po-num">{formatDate(v)}</span> },
  { title: 'Статус', dataIndex: 'status', render: (_, r) => <StatusTag status={r.status} /> },
  { title: 'Сума з ПДВ', dataIndex: 'totalSaleGross', align: 'right', render: (v: number) => <span className="po-num">{formatMoney(v)}</span> },
];

function ClientCard({ client }: { client: ClientDetail }) {
  const navigate = useNavigate();
  const users = useQuery({ queryKey: qk.users, queryFn: () => ds.listUsers() });
  const requestsQuery = { clientId: client.id };
  const requests = useQuery({ queryKey: qk.requests(requestsQuery), queryFn: () => ds.listRequests(requestsQuery) });
  const responsible = users.data?.find((u) => u.id === client.responsibleUserId);
  const cpName = new Map(client.counterparties.map((cp) => [cp.id, cp.nameShort] as const));

  return (
    <>
      <div className="po-cli-summary">
        <span>
          <UserOutlined className="po-muted" /> Відповідальний: <b>{responsible?.shortName ?? '—'}</b>
        </span>
        {client.note ? <Typography.Paragraph type="secondary">{client.note}</Typography.Paragraph> : null}
      </div>

      <div className="po-cli-section">Контрагенти</div>
      <div className="po-cli-items">
        {client.counterparties.map((cp) => (
          <div key={cp.id} className="po-cli-item">
            <div className="po-cli-item-head">
              {cp.nameShort}
              <Tag color={cp.isVatPayer ? 'green' : 'default'} bordered={false}>
                {cp.isVatPayer ? 'платник ПДВ' : 'без ПДВ'}
              </Tag>
              {cp.isDefault ? (
                <Tag color="blue" bordered={false}>
                  основний
                </Tag>
              ) : null}
            </div>
            {cp.nameFull ? <div className="po-cli-item-full">{cp.nameFull}</div> : null}
            <div className="po-cli-item-meta">
              <span className="po-num">ЄДРПОУ / РНОКПП: {cp.edrpou ?? '—'}</span>
              {cp.addressLegal ? <span>Юр. адреса: {cp.addressLegal}</span> : null}
              {cp.addressActual && cp.addressActual !== cp.addressLegal ? <span>Факт. адреса: {cp.addressActual}</span> : null}
            </div>
          </div>
        ))}
      </div>

      <div className="po-cli-section">Контакти</div>
      {client.contacts.length ? (
        <div className="po-cli-items">
          {client.contacts.map((c) => (
            <div key={c.id} className="po-cli-item">
              <div className="po-cli-item-head">
                {c.fullName}
                {c.position ? <span className="po-muted" style={{ fontWeight: 400 }}>· {c.position}</span> : null}
                {c.counterpartyId && cpName.has(c.counterpartyId) ? <Tag bordered={false}>{cpName.get(c.counterpartyId)}</Tag> : null}
              </div>
              <div className="po-cli-item-meta">
                {c.phone ? (
                  <a href={`tel:${c.phone.replace(/[^\d+]/gu, '')}`}>
                    <PhoneOutlined /> {c.phone}
                  </a>
                ) : null}
                {c.email ? (
                  <a href={`mailto:${c.email}`}>
                    <MailOutlined /> {c.email}
                  </a>
                ) : null}
                {!c.phone && !c.email ? <span>Телефон і e-mail не вказано</span> : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Typography.Text type="secondary">Контактів ще немає</Typography.Text>
      )}

      <div className="po-cli-section">
        Заявки клієнта <span className="po-cli-section-hint">клік — відкрити заявку</span>
      </div>
      {requests.isError ? (
        <Alert type="error" showIcon message="Не вдалося завантажити заявки" description={errorMessage(requests.error)} />
      ) : (
        <Table<RequestListItem>
          className="po-cli-requests"
          size="small"
          rowKey="id"
          loading={requests.isPending}
          columns={REQUEST_COLUMNS}
          dataSource={requests.data}
          pagination={{ pageSize: 8, size: 'small', hideOnSinglePage: true }}
          locale={{ emptyText: 'Заявок ще немає' }}
          onRow={(r) => ({ onClick: () => navigate(`/requests/${r.id}`) })}
        />
      )}
    </>
  );
}

export interface ClientDrawerProps {
  open: boolean;
  clientId: UUID | null;
  /** Заголовок, поки картка завантажується. */
  fallbackTitle?: string;
  onClose: () => void;
  onEdit: (client: ClientDetail) => void;
}

export function ClientDrawer({ open, clientId, fallbackTitle, onClose, onEdit }: ClientDrawerProps) {
  const id = clientId ?? '';
  const detail = useQuery({ queryKey: qk.client(id), queryFn: () => ds.getClient(id), enabled: open && !!id });
  const data = detail.data?.id === clientId ? detail.data : undefined;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={660}
      destroyOnHidden
      title={data?.name ?? fallbackTitle ?? 'Клієнт'}
      extra={
        <Button icon={<EditOutlined />} disabled={!data} onClick={() => data && onEdit(data)}>
          Редагувати
        </Button>
      }
    >
      {data ? (
        <ClientCard key={data.id} client={data} />
      ) : detail.isError ? (
        <Result status="error" title="Не вдалося завантажити клієнта" subTitle={errorMessage(detail.error)} />
      ) : (
        <Spin style={{ display: 'block', margin: '48px auto' }} />
      )}
    </Drawer>
  );
}
