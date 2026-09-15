import { useQuery } from '@tanstack/react-query';
import { Card, Result, Spin, Table, type TableColumnsType } from 'antd';
import { useMemo } from 'react';
import { FOREIGN_CURRENCIES, type ForeignCurrency } from '@shared/enums';
import { formatDate, formatRate } from '@shared/format';
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
}

function seriesOf(rates: CurrencyRateDto[], currency: ForeignCurrency): RatePoint[] {
  return rates
    .filter((r) => r.currency === currency)
    .sort((a, b) => a.rateDate.localeCompare(b.rateDate))
    .map((r) => ({ date: r.rateDate, rate: r.rate }));
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
          <div className="po-muted">НБУ на {formatDate(last.date)}</div>
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

const NBU_COLUMNS: TableColumnsType<DayRow> = [
  { title: 'Дата', dataIndex: 'date', render: (v: ISODate) => <span className="po-num">{formatDate(v)}</span> },
  { title: 'USD', dataIndex: 'USD', align: 'right', render: (v: number | null) => <span className="po-num">{formatRate(v)}</span> },
  { title: 'EUR', dataIndex: 'EUR', align: 'right', render: (v: number | null) => <span className="po-num">{formatRate(v)}</span> },
];

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

  const series = useMemo(() => {
    const data = rates.data ?? [];
    return { USD: seriesOf(data, 'USD'), EUR: seriesOf(data, 'EUR') };
  }, [rates.data]);

  const days = useMemo<DayRow[]>(() => {
    const byDate = new Map<ISODate, DayRow>();
    for (const r of rates.data ?? []) {
      const row = byDate.get(r.rateDate) ?? { date: r.rateDate, USD: null, EUR: null };
      row[r.currency] = r.rate;
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
        subtitle="Курс НБУ — довідково. У заявці курс береться з прайсу постачальника, а якщо його там немає — курс НБУ."
      />
      {body}
      <div className="po-rates-bottom">
        <Card title="Курси НБУ за датами" size="small">
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
            Курс приходить разом із прайсом постачальника. Якщо в прайсі курсу немає — у заявці береться курс НБУ на дату заявки.
          </div>
        </Card>
      </div>
    </div>
  );
}
