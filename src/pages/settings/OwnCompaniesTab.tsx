// Наші юрособи: реквізити для заявок і КП.
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Descriptions, Result, Spin, Tag } from 'antd';
import { useState, type ReactNode } from 'react';
import type { OwnCompanyDto } from '@shared/types';
import { EmptyState } from '@/components';
import { ds, errorMessage, qk } from '@/data';
import { OwnCompanyDialog } from './OwnCompanyDialog';

const mono = (v: string | null): ReactNode => (v ? <span className="po-num">{v}</span> : '—');

function CompanyCard({ c, onEdit }: { c: OwnCompanyDto; onEdit: () => void }) {
  const items: { key: string; label: string; children: ReactNode }[] = [
    { key: 'edrpou', label: 'ЄДРПОУ', children: mono(c.edrpou) },
    { key: 'ipn', label: 'ІПН', children: mono(c.ipn) },
    { key: 'iban', label: 'IBAN', children: mono(c.iban) },
    { key: 'bank', label: 'Банк', children: c.bankName ?? '—' },
    { key: 'address', label: 'Адреса', children: c.addressLegal ?? '—' },
    { key: 'phone', label: 'Телефон', children: mono(c.phone) },
    { key: 'email', label: 'E-mail', children: c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : '—' },
    { key: 'site', label: 'Сайт', children: c.website ?? '—' },
    { key: 'slogan', label: 'Слоган', children: c.slogan ? <span className="po-set-slogan">{c.slogan}</span> : '—' },
  ];
  return (
    <Card styles={{ body: { padding: 16 } }}>
      <div className="po-set-company-head">
        <div className="po-set-company-logo">{c.logoUrl ? <img src={c.logoUrl} alt={c.nameShort} /> : <span className="po-muted">—</span>}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="po-set-company-name">{c.nameShort}</div>
          <div className="po-set-company-tags">
            <Tag color={c.isVatPayer ? 'green' : 'default'} bordered={false}>
              {c.isVatPayer ? 'платник ПДВ' : 'без ПДВ'}
            </Tag>
            {c.isDefault ? (
              <Tag color="blue" bordered={false}>
                за замовчуванням
              </Tag>
            ) : null}
            <Button size="small" type="link" icon={<EditOutlined />} onClick={onEdit} className="po-set-company-edit">
              Редагувати
            </Button>
          </div>
        </div>
      </div>
      <div className="po-set-company-full">{c.nameFull}</div>
      <Descriptions column={1} size="small" items={items} styles={{ label: { width: 90 } }} />
    </Card>
  );
}

export function OwnCompaniesTab() {
  const companies = useQuery({ queryKey: qk.ownCompanies, queryFn: () => ds.listOwnCompanies() });
  const [editing, setEditing] = useState<OwnCompanyDto | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const add = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const addButton = (
    <Button type="primary" icon={<PlusOutlined />} onClick={add}>
      Додати юрособу
    </Button>
  );

  let body: ReactNode;
  if (companies.isPending) body = <Spin style={{ display: 'block', margin: '48px auto' }} />;
  else if (companies.isError) body = <Result status="error" title="Не вдалося завантажити юрособи" subTitle={errorMessage(companies.error)} />;
  else if (!companies.data.length)
    body = (
      <EmptyState
        title="Юросіб ще немає"
        description="Додайте юрособу, від імені якої виставляєте КП: її реквізити й логотип потрапляють у бланк."
        action={addButton}
      />
    );
  else
    body = (
      <div className="po-set-companies">
        {companies.data.map((c) => (
          <CompanyCard
            key={c.id}
            c={c}
            onEdit={() => {
              setEditing(c);
              setDialogOpen(true);
            }}
          />
        ))}
      </div>
    );

  return (
    <>
      <Alert className="po-set-note" type="info" showIcon message="Сформовані КП не змінюються — у них збережено реквізити на момент формування." />
      {companies.data?.length ? <div className="po-set-toolbar">{addButton}</div> : null}
      {body}
      {dialogOpen ? <OwnCompanyDialog open company={editing} isFirst={!companies.data?.length} onClose={() => setDialogOpen(false)} /> : null}
    </>
  );
}
