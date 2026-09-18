// Бічна панель постачальника: картка й умови (редагуються у формі), джерело прайсу, журнал оновлень.
import { EditOutlined, ExperimentOutlined, GlobalOutlined, MailOutlined, PhoneOutlined, SettingOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, App, Button, Descriptions, Drawer, Modal, Result, Spin, Table, Tag, Tooltip, Typography, type TableColumnsType } from 'antd';
import { useState, type ReactNode } from 'react';
import { CURRENCY_LABELS, RATE_POLICY_LABELS } from '@shared/enums';
import { formatDateTime, formatMoneyUah, formatRate } from '@shared/format';
import type { PriceUpdateDto, SupplierDetail, SupplierListItem } from '@shared/types';
import { SupplierLogo } from '@/components';
import { ds, errorMessage, qk } from '@/data';
import { PriceSourceDialog } from './PriceSourceDialog';
import { PriceUpdateReportView } from './PriceUpdateReport';
import { SupplierFormDialog } from './SupplierFormDialog';
import { hostOf, pctLabel, PRICE_SOURCE_COLORS, priceListRatesLabel, priceSourceLabel, viaLink } from './supplierView';

/** «НБУ + 1,5 %», «Вручну: USD 41,20 · EUR 45,10». */
function ratePolicyLabel(s: SupplierDetail): string {
  if (s.ratePolicy === 'nbu_adjusted') return `НБУ ${s.rateAdjustPct >= 0 ? '+' : '−'} ${pctLabel(Math.abs(s.rateAdjustPct))}`;
  const parts = [s.manualRateUsd != null ? `USD ${formatRate(s.manualRateUsd)}` : null, s.manualRateEur != null ? `EUR ${formatRate(s.manualRateEur)}` : null].filter(Boolean);
  if (s.ratePolicy === 'manual') return parts.length ? `Вручну: ${parts.join(' · ')}` : 'Вручну (курс не вказано)';
  // з прайсу; запасний — ручний курс постачальника, далі загальний курс
  if (s.ratePolicy === 'price_list') return parts.length ? `З прайсу; якщо немає: ${parts.join(' · ')}` : 'З прайсу; якщо немає: загальний курс';
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
  { title: 'Дата і час', dataIndex: 'at', width: 124, render: (v: string) => <span className="po-num">{formatDateTime(v)}</span> },
  {
    title: 'Стан',
    key: 'status',
    width: 100,
    render: (_, u) =>
      u.status === 'error' ? (
        <Tooltip title={u.error}>
          <Tag color="red" bordered={false}>
            не застосовано
          </Tag>
        </Tooltip>
      ) : (u.detailsDiffer ?? 0) + (u.skipped ?? 0) > 0 ? (
        <Tag color="gold" bordered={false}>
          є зауваги
        </Tag>
      ) : (
        <Tag color="green" bordered={false}>
          ок
        </Tag>
      ),
  },
  { title: 'Товарів', dataIndex: 'productsTotal', align: 'right', render: (v: number) => <span className="po-num">{v}</span> },
  {
    title: 'Змінилось',
    key: 'changed',
    width: 130,
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
    title: 'Зникли',
    dataIndex: 'missing',
    align: 'right',
    render: (v: number) => <span className="po-num">{v || <span className="po-muted">—</span>}</span>,
  },
  {
    title: 'Джерело',
    key: 'source',
    width: 130,
    ellipsis: { showTitle: false },
    render: (_, u) => {
      const label = u.source === 'file' ? (u.fileName ?? 'файл') : 'посилання';
      const who = u.user ? u.user.shortName : 'за розкладом';
      return (
        <Tooltip title={`${u.source === 'file' ? `Файл ${label}` : 'Вигрузка за посиланням'} · ${who}`}>
          <span className={u.source === 'file' ? undefined : 'po-muted'}>{label}</span>
          <div className="po-muted" style={{ fontSize: 11 }}>
            {who}
          </div>
        </Tooltip>
      );
    },
  },
];

/** Запис журналу зі звітом (звіт вантажимо окремо — у списку журналу його немає). */
function PriceUpdateModal({ id, onClose }: { id: number | null; onClose: () => void }) {
  const entry = useQuery({ queryKey: qk.priceUpdate(id ?? 0), queryFn: () => ds.getPriceUpdate(id!), enabled: id != null });
  return (
    <Modal
      open={id != null}
      width={880}
      footer={null}
      onCancel={onClose}
      destroyOnHidden
      title={entry.data ? `Оновлення прайсу ${formatDateTime(entry.data.at)} · ${entry.data.source === 'file' ? (entry.data.fileName ?? 'файл') : 'за посиланням'}` : 'Оновлення прайсу'}
    >
      {entry.data ? (
        <PriceUpdateReportView update={entry.data} />
      ) : entry.isError ? (
        <Alert type="error" showIcon message="Не вдалося завантажити звіт" description={errorMessage(entry.error)} />
      ) : (
        <Spin style={{ display: 'block', margin: '32px auto' }} />
      )}
    </Modal>
  );
}

interface SupplierCardProps {
  detail: SupplierDetail;
  onSource: () => void;
}

function SupplierCard({ detail, onSource }: SupplierCardProps) {
  const { message, modal } = App.useApp();
  const log = useQuery({ queryKey: qk.priceUpdates(detail.id), queryFn: () => ds.listPriceUpdates(detail.id) });
  const source = detail.priceSource;
  const [openedUpdate, setOpenedUpdate] = useState<number | null>(null);

  // вигрузка без запису: чи працює посилання й що саме зміниться
  const check = useMutation({
    mutationFn: () => ds.refreshSupplierPrices(detail.id, { dryRun: true }),
    onSuccess: (dry) =>
      modal.info({
        title: `Перевірка вигрузки ${detail.name} — нічого не записано`,
        width: 880,
        icon: null,
        okText: 'Закрити',
        content: (
          <div className="po-pi-confirm">
            <PriceUpdateReportView update={dry} preview />
          </div>
        ),
      }),
    onError: (e) => message.error({ content: errorMessage(e), duration: 8 }),
  });

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
      <Descriptions column={1} size="small" items={info} styles={{ label: { width: 190 } }} />

      <div className="po-sup-section">Умови для заявок</div>
      <Descriptions column={1} size="small" items={terms} styles={{ label: { width: 190 } }} />

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
          <span className="po-sup-source-actions">
            {viaLink(source.kind) ? (
              <Tooltip title="Завантажити вигрузку й показати, що зміниться, нічого не записуючи">
                <Button size="small" icon={<ExperimentOutlined />} loading={check.isPending} onClick={() => check.mutate()}>
                  Перевірити
                </Button>
              </Tooltip>
            ) : null}
            <Button size="small" icon={<SettingOutlined />} onClick={onSource}>
              Налаштувати
            </Button>
          </span>
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
          onRow={(u) => (u.id > 0 ? { onClick: () => setOpenedUpdate(u.id), style: { cursor: 'pointer' } } : {})}
        />
      )}
      <div className="po-muted" style={{ fontSize: 12, marginTop: 4 }}>
        Натисніть на рядок, щоб побачити звіт: великі зміни цін, розбіжності описів, пропущені рядки.
      </div>
      <PriceUpdateModal id={openedUpdate} onClose={() => setOpenedUpdate(null)} />
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
      width={760}
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
