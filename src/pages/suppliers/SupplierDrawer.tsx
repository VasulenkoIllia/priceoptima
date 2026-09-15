// Бічна панель постачальника: картка, умови для заявок (редагуються), журнал оновлень прайсу.
import { GlobalOutlined, MailOutlined, PhoneOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Col, Descriptions, Drawer, Form, Input, InputNumber, Result, Row, Spin, Table, Tag, Typography, type TableColumnsType } from 'antd';
import type { ReactNode } from 'react';
import { CURRENCY_LABELS } from '@shared/enums';
import { formatDateTime, formatRate } from '@shared/format';
import type { PriceUpdateDto, SupplierDetail, SupplierInput, SupplierListItem } from '@shared/types';
import { SupplierLogo } from '@/components';
import { ds, errorMessage, qk } from '@/data';
import { hostOf, priceListRatesLabel } from './supplierView';

interface TermsValues {
  supplierMarkupPct: number | null;
  minOrderAmount: number | null;
  notes: string;
}

/** Повний SupplierInput з картки + змінені умови. */
function toInput(s: SupplierDetail, v: TermsValues): SupplierInput {
  const { id: _id, productsCount: _count, lastImportAt: _last, legalEntities: _le, contacts: _ct, importProfiles: _ip, ...rest } = s;
  return { ...rest, supplierMarkupPct: v.supplierMarkupPct ?? 0, minOrderAmount: v.minOrderAmount ?? null, notes: v.notes.trim() || null };
}

function ExtLink({ url }: { url: string | null }) {
  if (!url) return <span className="po-muted">—</span>;
  return (
    <Typography.Link href={url} target="_blank" rel="noopener noreferrer">
      <GlobalOutlined /> {hostOf(url)}
    </Typography.Link>
  );
}

const LOG_COLUMNS: TableColumnsType<PriceUpdateDto> = [
  { title: 'Дата і час', dataIndex: 'at', render: (v: string) => <span className="po-num">{formatDateTime(v)}</span> },
  { title: 'Товарів', dataIndex: 'productsTotal', align: 'right', render: (v: number) => <span className="po-num">{v}</span> },
  {
    title: 'Змінилось',
    key: 'changed',
    align: 'right',
    render: (_, u) => (
      <span className="po-num">
        {u.changed}
        {u.changed ? (
          <span className="po-muted">
            {' '}
            (<span className="po-sup-up">▲ {u.priceUp}</span>, <span className="po-sup-down">▼ {u.priceDown}</span>)
          </span>
        ) : null}
      </span>
    ),
  },
  { title: 'Курс USD / EUR', key: 'rates', align: 'right', render: (_, u) => <span className="po-num">{`${formatRate(u.rates.USD)} / ${formatRate(u.rates.EUR)}`}</span> },
  {
    title: 'Хто',
    key: 'user',
    render: (_, u) => (u.user ? `запущено: ${u.user.shortName}` : <span className="po-muted">автоматично</span>),
  },
];

function SupplierCard({ detail }: { detail: SupplierDetail }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const log = useQuery({ queryKey: qk.priceUpdates(detail.id), queryFn: () => ds.listPriceUpdates(detail.id) });

  const save = useMutation({
    mutationFn: (v: TermsValues) => ds.saveSupplier(detail.id, toInput(detail, v)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.suppliers });
      void queryClient.invalidateQueries({ queryKey: qk.supplier(detail.id) });
      message.success('Умови постачальника збережено');
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const info: { key: string; label: string; children: ReactNode }[] = [
    { key: 'site', label: 'Сайт', children: <ExtLink url={detail.website} /> },
    { key: 'b2b', label: 'B2B-кабінет', children: <ExtLink url={detail.b2bUrl} /> },
    {
      key: 'currency',
      label: 'Валюта прайсу',
      children: `${CURRENCY_LABELS[detail.defaultCurrency]}, ціни ${detail.pricesIncludeVat ? 'з ПДВ' : 'без ПДВ'}`,
    },
    { key: 'rates', label: 'Курс з прайсу', children: <span className="po-num">{priceListRatesLabel(detail.priceListRates)}</span> },
    { key: 'delivery', label: 'Доставка', children: detail.deliveryInfo ?? '—' },
    {
      key: 'import',
      label: 'Прайс',
      children: (
        <span>
          <Tag color="green" bordered={false}>
            Автоматично
          </Tag>
          {detail.lastImportAt ? `оновлено ${formatDateTime(detail.lastImportAt)}` : 'ще не завантажено'}
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="po-sup-section">Картка</div>
      <Descriptions column={1} size="small" items={info} styles={{ label: { width: 140 } }} />

      <div className="po-sup-section">Юрособи</div>
      {detail.legalEntities.length ? (
        <div className="po-sup-items">
          {detail.legalEntities.map((le) => (
            <div key={le.id} className="po-sup-item">
              <div className="po-sup-item-head">
                {le.nameShort}
                <Tag color={le.isVatPayer ? 'green' : 'default'} bordered={false}>
                  {le.isVatPayer ? 'платник ПДВ' : 'без ПДВ'}
                </Tag>
                {le.isDefault ? (
                  <Tag color="blue" bordered={false}>
                    основна
                  </Tag>
                ) : null}
              </div>
              <div className="po-sup-item-meta">
                {le.nameFull ? <span>{le.nameFull}</span> : null}
                {le.edrpou ? <span className="po-num">ЄДРПОУ {le.edrpou}</span> : null}
                {le.iban ? <span className="po-num">IBAN {le.iban}</span> : null}
                {le.address ? <span>{le.address}</span> : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Typography.Text type="secondary">Юрособи не вказано</Typography.Text>
      )}

      <div className="po-sup-section">Контакти</div>
      {detail.contacts.length ? (
        <div className="po-sup-items">
          {detail.contacts.map((c) => (
            <div key={c.id} className="po-sup-item">
              <div className="po-sup-item-head">
                {c.fullName}
                {c.position ? <span className="po-muted" style={{ fontWeight: 400 }}>· {c.position}</span> : null}
              </div>
              <div className="po-sup-item-meta">
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
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Typography.Text type="secondary">Контактів немає</Typography.Text>
      )}

      <div className="po-sup-section">Умови для заявок</div>
      <Form<TermsValues>
        className="po-sup-form"
        layout="vertical"
        requiredMark={false}
        initialValues={{ supplierMarkupPct: detail.supplierMarkupPct, minOrderAmount: detail.minOrderAmount, notes: detail.notes ?? '' }}
        onFinish={(v) => save.mutate(v)}
      >
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="supplierMarkupPct" label="Націнка постачальника, %" extra="Додається до вхідної ціни в заявці">
              <InputNumber min={0} max={100} step={0.5} decimalSeparator="," style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="minOrderAmount" label="Мін. замовлення, грн">
              <InputNumber min={0} step={100} decimalSeparator="," style={{ width: '100%' }} placeholder="немає" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="notes" label="Примітки">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="Умови оплати, особливості прайсу…" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={save.isPending}>
            Зберегти
          </Button>
        </Form.Item>
      </Form>

      <div className="po-sup-section">Журнал оновлень прайсу</div>
      {log.isError ? (
        <Alert type="error" showIcon message="Не вдалося завантажити журнал" description={errorMessage(log.error)} />
      ) : (
        <Table<PriceUpdateDto>
          className="po-sup-log"
          size="small"
          rowKey="id"
          loading={log.isPending}
          columns={LOG_COLUMNS}
          dataSource={log.data}
          pagination={{ pageSize: 6, size: 'small', hideOnSinglePage: true }}
          locale={{ emptyText: 'Оновлень ще не було' }}
        />
      )}
    </>
  );
}

export interface SupplierDrawerProps {
  open: boolean;
  supplier: SupplierListItem | null;
  onClose: () => void;
}

export function SupplierDrawer({ open, supplier, onClose }: SupplierDrawerProps) {
  const id = supplier?.id ?? '';
  const detail = useQuery({ queryKey: qk.supplier(id), queryFn: () => ds.getSupplier(id), enabled: open && !!id });
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={640}
      destroyOnHidden
      title={supplier ? <SupplierLogo name={supplier.name} logoUrl={supplier.logoUrl} color={supplier.color} size={24} showName /> : 'Постачальник'}
    >
      {detail.data ? (
        <SupplierCard key={detail.data.id} detail={detail.data} />
      ) : detail.isError ? (
        <Result status="error" title="Не вдалося завантажити постачальника" subTitle={errorMessage(detail.error)} />
      ) : (
        <Spin style={{ display: 'block', margin: '48px auto' }} />
      )}
    </Drawer>
  );
}
