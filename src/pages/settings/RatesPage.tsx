import { EditOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, DatePicker, Form, Input, InputNumber, Modal, Radio, Result, Spin, Table, Tag, type TableColumnsType } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { FOREIGN_CURRENCIES, type ForeignCurrency, type RateSource } from '@shared/enums';
import { formatDate, formatRate, toIsoDate } from '@shared/format';
import type { CurrencyRateDto, ISODate, SupplierListItem } from '@shared/types';
import { EmptyState, PageHeader, SupplierLogo } from '@/components';
import { ds, errorMessage, qk } from '@/data';
import { BRAND_COLOR } from '@/theme';
import { RateChart, type RatePoint } from './RateChart';
import './rates.css';

const DAY_MS = 86_400_000;
const CURRENCY_NAMES: Record<ForeignCurrency, string> = { USD: 'долар США', EUR: 'євро' };
const CHART_COLORS: Record<ForeignCurrency, string> = { USD: BRAND_COLOR, EUR: '#00838F' };

interface DayRow {
  date: ISODate;
  USD: number | null;
  EUR: number | null;
  sources: Partial<Record<ForeignCurrency, RateSource>>;
}

/** Діючі курси за датами: за ту саму дату ручний курс переважає НБУ (так само рахує сервер). */
function effectiveByDate(rates: readonly CurrencyRateDto[]): CurrencyRateDto[] {
  const best = new Map<string, CurrencyRateDto>();
  for (const r of rates) {
    const key = `${r.currency}:${r.rateDate}`;
    const cur = best.get(key);
    if (!cur || (r.source === 'manual' && cur.source !== 'manual')) best.set(key, r);
  }
  return [...best.values()];
}

function seriesOf(rates: CurrencyRateDto[], currency: ForeignCurrency): RatePoint[] {
  return rates
    .filter((r) => r.currency === currency)
    .sort((a, b) => a.rateDate.localeCompare(b.rateDate))
    .map((r) => ({ date: r.rateDate, rate: r.rate, manual: r.source === 'manual' }));
}

/** Останній відомий курс на дату за 7 днів до останньої. */
function weekBefore(points: RatePoint[]): RatePoint | undefined {
  const last = points[points.length - 1];
  const target = new Date(Date.parse(last.date) - 7 * DAY_MS).toISOString().slice(0, 10);
  for (let i = points.length - 1; i >= 0; i--) if (points[i].date <= target) return points[i];
  return undefined;
}

function RateCard({ currency, points }: { currency: ForeignCurrency; points: RatePoint[] }) {
  const last = points[points.length - 1];
  const prev = weekBefore(points);
  const delta = prev ? last.rate - prev.rate : null;
  const deltaClass = delta == null || Math.abs(delta) < 0.00005 ? '' : delta > 0 ? 'po-rates-up' : 'po-rates-down';
  return (
    <Card styles={{ body: { padding: 16 } }}>
      <div className="po-rates-head">
        <div>
          <div className="po-rates-cur">
            {currency} <span className="po-muted">· {CURRENCY_NAMES[currency]}</span>
          </div>
          <div className="po-rates-value po-num">
            {formatRate(last.rate)} <span className="po-rates-unit">грн</span>
          </div>
          <div className="po-muted">
            {last.manual ? 'Вручну' : 'НБУ'} на {formatDate(last.date)}
          </div>
        </div>
        {delta != null ? (
          <span className={`po-rates-delta po-num ${deltaClass}`} title={`Порівняно з ${formatDate(prev?.date)}`}>
            {deltaClass === 'po-rates-up' ? '▲ ' : deltaClass === 'po-rates-down' ? '▼ ' : ''}
            {formatRate(Math.abs(delta))} за 7 днів
          </span>
        ) : null}
      </div>
      <RateChart points={points} currency={currency} color={CHART_COLORS[currency]} />
    </Card>
  );
}

const rateCell = (currency: ForeignCurrency) => (v: number | null, row: DayRow) => (
  <span className="po-num">
    {formatRate(v)}
    {row.sources[currency] === 'manual' ? (
      <Tag color="gold" bordered={false} style={{ marginInlineStart: 6, marginInlineEnd: 0 }}>
        вручну
      </Tag>
    ) : null}
  </span>
);

const NBU_COLUMNS: TableColumnsType<DayRow> = [
  { title: 'Дата', dataIndex: 'date', render: (v: ISODate) => <span className="po-num">{formatDate(v)}</span> },
  { title: 'USD', dataIndex: 'USD', align: 'right', render: rateCell('USD') },
  { title: 'EUR', dataIndex: 'EUR', align: 'right', render: rateCell('EUR') },
];

interface ManualRateValues {
  currency: ForeignCurrency;
  date: Dayjs;
  rate: number;
  note?: string;
}

/** Загальний ручний курс на дату: діє для постачальників без курсу в прайсі й без ручного курсу в картці. */
function ManualRateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<ManualRateValues>();
  const save = useMutation({
    mutationFn: (v: ManualRateValues) => ds.addManualRate({ currency: v.currency, rateDate: toIsoDate(v.date.toDate()), rate: v.rate, note: v.note?.trim() || null }),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: qk.ratesList });
      void queryClient.invalidateQueries({ queryKey: ['rates'] });
      message.success(`Курс ${r.currency} ${formatRate(r.rate)} на ${formatDate(r.rateDate)} збережено`);
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  return (
    <Modal
      open={open}
      title="Задати курс вручну"
      okText="Зберегти"
      cancelText="Скасувати"
      confirmLoading={save.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
      width={460}
    >
      <p className="po-muted" style={{ marginTop: 0 }}>
        Діє на обрану дату для нових заявок і блоків постачальників, у яких немає курсу в прайсі й ручного курсу в картці. За цю дату він
        замінює курс НБУ.
      </p>
      <Form<ManualRateValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{ currency: 'USD', date: dayjs() }}
        onFinish={(v) => save.mutate(v)}
      >
        <Form.Item name="currency" label="Валюта">
          <Radio.Group optionType="button" options={FOREIGN_CURRENCIES.map((c) => ({ value: c, label: c }))} />
        </Form.Item>
        <Form.Item name="date" label="Дата" rules={[{ required: true, message: 'Вкажіть дату' }]}>
          <DatePicker format="DD.MM.YYYY" style={{ width: 180 }} allowClear={false} />
        </Form.Item>
        <Form.Item name="rate" label="Курс, грн" rules={[{ required: true, message: 'Вкажіть курс' }]}>
          <InputNumber min={0.0001} max={10_000} step={0.01} decimalSeparator="," style={{ width: 180 }} />
        </Form.Item>
        <Form.Item name="note" label="Примітка">
          <Input placeholder="Напр.: узгоджений курс на тиждень" maxLength={200} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

const SUPPLIER_COLUMNS: TableColumnsType<SupplierListItem> = [
  {
    title: 'Постачальник',
    key: 'name',
    render: (_, s) => <SupplierLogo name={s.name} logoUrl={s.logoUrl} color={s.color} size={18} showName />,
  },
  { title: 'USD', key: 'usd', align: 'right', render: (_, s) => <span className="po-num">{formatRate(s.priceListRates.USD)}</span> },
  { title: 'EUR', key: 'eur', align: 'right', render: (_, s) => <span className="po-num">{formatRate(s.priceListRates.EUR)}</span> },
  { title: 'Дата прайсу', key: 'date', render: (_, s) => <span className="po-num">{formatDate(s.priceListRates.date)}</span> },
];

/** Курси валют: НБУ — довідково; у заявці курс береться з прайсу постачальника. */
export default function RatesPage() {
  const rates = useQuery({ queryKey: qk.ratesList, queryFn: () => ds.listRates() });
  const suppliers = useQuery({ queryKey: qk.suppliers, queryFn: () => ds.listSuppliers() });

  const [manualOpen, setManualOpen] = useState(false);
  const series = useMemo(() => {
    const data = effectiveByDate(rates.data ?? []);
    return { USD: seriesOf(data, 'USD'), EUR: seriesOf(data, 'EUR') };
  }, [rates.data]);

  const days = useMemo<DayRow[]>(() => {
    const byDate = new Map<ISODate, DayRow>();
    for (const r of effectiveByDate(rates.data ?? [])) {
      const row = byDate.get(r.rateDate) ?? { date: r.rateDate, USD: null, EUR: null, sources: {} };
      row[r.currency] = r.rate;
      row.sources[r.currency] = r.source;
      byDate.set(r.rateDate, row);
    }
    return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [rates.data]);

  let body;
  if (rates.isPending) body = <Spin style={{ display: 'block', margin: '48px auto' }} />;
  else if (rates.isError) body = <Result status="error" title="Не вдалося завантажити курси" subTitle={errorMessage(rates.error)} />;
  else if (!days.length) body = <EmptyState title="Курсів ще немає" />;
  else
    body = (
      <div className="po-rates-top">
        {FOREIGN_CURRENCIES.map((c) => (series[c].length ? <RateCard key={c} currency={c} points={series[c]} /> : null))}
      </div>
    );

  return (
    <div className="po-page po-rates-page">
      <PageHeader
        title="Курси валют"
        subtitle="У заявці курс береться так: з прайсу постачальника; якщо там немає, то ручний курс із картки постачальника; далі загальний курс на дату (ручний, якщо задано тут, інакше НБУ)."
        extra={
          <Button icon={<EditOutlined />} onClick={() => setManualOpen(true)}>
            Задати курс вручну
          </Button>
        }
      />
      <ManualRateDialog open={manualOpen} onClose={() => setManualOpen(false)} />
      {body}
      <div className="po-rates-bottom">
        <Card title="Загальні курси за датами (НБУ або вручну)" size="small">
          <Table<DayRow>
            className="po-rates-table"
            size="small"
            rowKey="date"
            loading={rates.isPending}
            columns={NBU_COLUMNS}
            dataSource={days}
            pagination={{ pageSize: 15, size: 'small', showSizeChanger: false }}
            locale={{ emptyText: 'Курсів ще немає' }}
          />
        </Card>
        <Card title="Курси з прайсів постачальників" size="small">
          {suppliers.isError ? (
            <Result status="error" title="Не вдалося завантажити постачальників" subTitle={errorMessage(suppliers.error)} />
          ) : (
            <Table<SupplierListItem>
              className="po-rates-table"
              size="small"
              rowKey="id"
              loading={suppliers.isPending}
              columns={SUPPLIER_COLUMNS}
              dataSource={suppliers.data}
              pagination={false}
              locale={{ emptyText: 'Постачальників ще немає' }}
            />
          )}
          <div className="po-rates-hint">
            Курс приходить разом із прайсом постачальника. Якщо в прайсі курсу немає, у заявці береться ручний курс із картки постачальника, а
            якщо й його немає, то загальний курс на дату заявки.
          </div>
        </Card>
      </div>
    </div>
  );
}
