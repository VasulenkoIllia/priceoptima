// Бічна панель постачальника: картка й умови (редагуються у формі), джерело прайсу, журнал оновлень.
import { EditOutlined, GlobalOutlined, MailOutlined, PhoneOutlined, SettingOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Descriptions, Drawer, Result, Spin, Table, Tag, Typography, type TableColumnsType } from 'antd';
import { useState, type ReactNode } from 'react';
import { CURRENCY_LABELS, RATE_POLICY_LABELS } from '@shared/enums';
import { formatDateTime, formatMoneyUah, formatRate } from '@shared/format';
import type { PriceUpdateDto, SupplierDetail, SupplierListItem } from '@shared/types';
import { SupplierLogo } from '@/components';
import { ds, errorMessage, qk } from '@/data';
import { PriceSourceDialog } from './PriceSourceDialog';
import { SupplierFormDialog } from './SupplierFormDialog';
import { hostOf, pctLabel, PRICE_SOURCE_COLORS, priceListRatesLabel, priceSourceLabel } from './supplierView';

/** «НБУ + 1,5 %», «Вручну: USD 41,20 · EUR 45,10». */
function ratePolicyLabel(s: SupplierDetail): string {
  if (s.ratePolicy === 'nbu_adjusted') return `НБУ ${s.rateAdjustPct >= 0 ? '+' : '−'} ${pctLabel(Math.abs(s.rateAdjustPct))}`;
  if (s.ratePolicy === 'manual') {
    const parts = [s.manualRateUsd != null ? `USD ${formatRate(s.manualRateUsd)}` : null, s.manualRateEur != null ? `EUR ${formatRate(s.manualRateEur)}` : null].filter(Boolean);
    return parts.length ? `Вручну: ${parts.join(' · ')}` : 'Вручну (курс не вказано)';
  }
  return RATE_POLICY_LABELS[s.ratePolicy];
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
  {
    title: 'Нові',
    dataIndex: 'added',
    align: 'right',
    render: (v: number) => <span className="po-num">{v || <span className="po-muted">—</span>}</span>,
  },
  {
    title: 'Немає у прайсі',
    dataIndex: 'missing',
    align: 'right',
    render: (v: number) => <span className="po-num">{v || <span className="po-muted">—</span>}</span>,
  },
  { title: 'Курс USD / EUR', key: 'rates', align: 'right', render: (_, u) => <span className="po-num">{`${formatRate(u.rates.USD)} / ${formatRate(u.rates.EUR)}`}</span> },
  {
    title: 'Джерело',
    key: 'source',
    render: (_, u) => (
      <span>
        {u.source === 'file' ? (u.fileName ? `файл ${u.fileName}` : 'файл') : <span className="po-muted">за посиланням</span>}
        {u.user ? <span className="po-muted"> · {u.user.shortName}</span> : null}
      </span>
    ),
  },
];

interface SupplierCardProps {
  detail: SupplierDetail;
  onSource: () => void;
}

function SupplierCard({ detail, onSource }: SupplierCardProps) {
  const log = useQuery({ queryKey: qk.priceUpdates(detail.id), queryFn: () => ds.listPriceUpdates(detail.id) });
  const source = detail.priceSource;

  const info: { key: string; label: string; children: ReactNode }[] = [
    { key: 'site', label: 'Сайт', children: <ExtLink url={detail.website} /> },
    { key: 'b2b', label: 'B2B-кабінет', children: <ExtLink url={detail.b2bUrl} /> },
    { key: 'delivery', label: 'Доставка', children: detail.deliveryInfo ?? '—' },
  ];
  const terms: { key: string; label: string; children: ReactNode }[] = [
    {
      key: 'currency',
      label: 'Валюта прайсу',
      children: `${CURRENCY_LABELS[detail.defaultCurrency]}, вхід ${detail.pricesIncludeVat ? 'з ПДВ' : 'без ПДВ'}, РРЦ ${detail.rrpIncludesVat ? 'з ПДВ' : 'без ПДВ'}`,
    },
    { key: 'rate', label: 'Курс для заявок', children: ratePolicyLabel(detail) },
    { key: 'rates', label: 'Курс з прайсу', children: <span className="po-num">{priceListRatesLabel(detail.priceListRates)}</span> },
    { key: 'markup', label: 'Націнка постачальника', children: <span className="po-num">{pctLabel(detail.supplierMarkupPct)}</span> },
    { key: 'min', label: 'Мін. замовлення', children: <span className="po-num">{detail.minOrderAmount != null ? formatMoneyUah(detail.minOrderAmount) : '—'}</span> },
    { key: 'stale', label: 'Ціна актуальна', children: detail.priceStaleDays != null ? `${detail.priceStaleDays} дн.` : 'як у налаштуваннях' },
    { key: 'notes', label: 'Примітки', children: detail.notes ? <span style={{ whiteSpace: 'pre-line' }}>{detail.notes}</span> : '—' },
  ];

  return (
    <>
      <div className="po-sup-section">Картка</div>
      <Descriptions column={1} size="small" items={info} styles={{ label: { width: 170 } }} />

      <div className="po-sup-section">Умови для заявок</div>
      <Descriptions column={1} size="small" items={terms} styles={{ label: { width: 170 } }} />

      <div className="po-sup-section">Джерело прайсу</div>
      <div className="po-sup-source">
        <div className="po-sup-source-head">
          <Tag color={PRICE_SOURCE_COLORS[source.kind]} bordered={false}>
            {priceSourceLabel(source)}
          </Tag>
          {source.kind === 'auto' && !source.hasPurchasePrice ? (
            <Tag color="orange" bordered={false}>
              лише РРЦ
            </Tag>
          ) : null}
          <Button size="small" icon={<SettingOutlined />} onClick={onSource}>
            Налаштувати
          </Button>
        </div>
        <span className="po-muted">
          {detail.lastImportAt ? `Оновлено ${formatDateTime(detail.lastImportAt)}` : 'Прайс ще не завантажено'}
          {source.host ? ` · ${source.host}` : ''}
        </span>
        {source.note ? <span className="po-muted">{source.note}</span> : null}
      </div>

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
  const [editOpen, setEditOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  // після редагування назва й колір беруться з картки, а не зі списку, з якого відкрили
  const shown = detail.data ?? supplier;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={640}
      destroyOnHidden
      title={shown ? <SupplierLogo name={shown.name} logoUrl={shown.logoUrl} color={shown.color} size={24} showName /> : 'Постачальник'}
      extra={
        detail.data ? (
          <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
            Редагувати
          </Button>
        ) : null
      }
    >
      {detail.data ? (
        <SupplierCard key={detail.data.id} detail={detail.data} onSource={() => setSourceOpen(true)} />
      ) : detail.isError ? (
        <Result status="error" title="Не вдалося завантажити постачальника" subTitle={errorMessage(detail.error)} />
      ) : (
        <Spin style={{ display: 'block', margin: '48px auto' }} />
      )}
      {detail.data ? (
        <>
          <SupplierFormDialog open={editOpen} supplier={detail.data} onClose={() => setEditOpen(false)} />
          <PriceSourceDialog open={sourceOpen} supplierId={detail.data.id} supplierName={detail.data.name} onClose={() => setSourceOpen(false)} />
        </>
      ) : null}
    </Drawer>
  );
}
