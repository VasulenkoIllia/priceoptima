import { EditOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, DatePicker, Form, Input, InputNumber, Modal, Radio, Spin, Table, Tag, type TableColumnsType } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { FOREIGN_CURRENCIES, RATE_POLICY_LABELS, type ForeignCurrency } from '@shared/enums';
import { formatDate, formatRate, toIsoDate } from '@shared/format';
import { effectiveSeries } from '@shared/pricing';
import type { CurrencyRateDto, EffectiveRate, EffectiveRates, ISODate, SupplierListItem } from '@shared/types';
import { EmptyState, LoadError, ManualRateFields, PageHeader, SupplierLogo } from '@/components';
import { ds, errorMessage, qk } from '@/data';
import { GENERAL_RATE_HINT, requestRatesLabel, usePriceListRateMaxAge } from '@/lib/rateLabels';
import { BRAND_COLOR } from '@/theme';
import { RateChart, type RatePoint } from './RateChart';
import './rates.css';

const DAY_MS = 86_400_000;
const CURRENCY_NAMES: Record<ForeignCurrency, string> = { USD: 'долар США', EUR: 'євро' };
const CHART_COLORS: Record<ForeignCurrency, string> = { USD: BRAND_COLOR, EUR: '#00838F' };

/** Курси за день у таблиці: НБУ і ручний (якщо вводили), окремо по валютах. */
interface DayCell {
  nbu: number | null;
  manual: { rate: number; cancelled: boolean } | null;
}
interface DayRow {
  date: ISODate;
  USD: DayCell;
  EUR: DayCell;
}

/** Діючий курс по днях для графіка — те саме правило, що й на сервері: більший із НБУ й останнього ручного. */
function seriesOf(rates: readonly CurrencyRateDto[], currency: ForeignCurrency): RatePoint[] {
  return effectiveSeries(rates, currency).map((e) => ({ date: e.date, rate: e.rate, manual: e.source === 'manual' }));
}

/** Останній відомий курс на дату за 7 днів до останньої. */
function weekBefore(points: RatePoint[]): RatePoint | undefined {
  const last = points[points.length - 1];
  const target = new Date(Date.parse(last.date) - 7 * DAY_MS).toISOString().slice(0, 10);
  for (let i = points.length - 1; i >= 0; i--) if (points[i].date <= target) return points[i];
  return undefined;
}

/** Звідки діючий курс: «Вручну від 24.09.2026 · НБУ 44,8571 нижчий» / «НБУ на 25.09.2026 · ручний 45,10 від 24.09.2026 нижчий». */
function effectiveSourceText(now: EffectiveRate): string {
  if (now.source === 'manual') {
    return `Вручну від ${formatDate(now.rateDate)}${now.nbu ? ` · НБУ ${formatRate(now.nbu.rate)} нижчий` : ''}`;
  }
  return `НБУ на ${formatDate(now.rateDate)}${now.manual ? ` · ручний ${formatRate(now.manual.rate)} від ${formatDate(now.manual.rateDate)} нижчий` : ''}`;
}

function RateCard({ currency, points, now }: { currency: ForeignCurrency; points: RatePoint[]; now: EffectiveRate | null }) {
  const { modal, message } = App.useApp();
  const queryClient = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => ds.cancelManualRates(currency),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.ratesList });
      void queryClient.invalidateQueries({ queryKey: ['rates'] });
      message.success(`Ручний курс ${currency} скасовано, далі діє НБУ`);
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const confirmCancel = () =>
    modal.confirm({
      title: `Скасувати ручний курс ${currency}?`,
      content: `Далі діятиме курс НБУ${now?.nbu ? ` (${formatRate(now.nbu.rate)})` : ''}, доки не введуть новий ручний. Курси в уже створених блоках заявок не зміняться.`,
      okText: 'Скасувати ручний курс',
      okButtonProps: { danger: true },
      cancelText: 'Залишити',
      onOk: () => cancel.mutateAsync(),
    });
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
          <div className="po-muted po-rates-caption">Діє для заявок зараз</div>
          <div className="po-rates-value po-num">
            {formatRate(now?.rate ?? last.rate)} <span className="po-rates-unit">грн</span>
          </div>
          <div className="po-muted">{now ? effectiveSourceText(now) : `${last.manual ? 'Вручну' : 'НБУ'} на ${formatDate(last.date)}`}</div>
          {now?.manual ? (
            <Button size="small" type="link" danger className="po-rates-cancel" loading={cancel.isPending} onClick={confirmCancel}>
              Скасувати ручний курс
            </Button>
          ) : null}
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

const rateCell = (cell: DayCell) => (
  <span className="po-num">
    {formatRate(cell.nbu)}
    {cell.manual ? (
      <Tag
        color={cell.manual.cancelled ? undefined : 'gold'}
        bordered={false}
        className={cell.manual.cancelled ? 'po-rates-cancelled' : undefined}
        title={cell.manual.cancelled ? 'Ручний курс скасовано' : 'Ручний курс: діє до нового ручного, поки вищий за НБУ'}
        style={{ marginInlineStart: 6, marginInlineEnd: 0 }}
      >
        вручну {formatRate(cell.manual.rate)}
      </Tag>
    ) : null}
  </span>
);

const NBU_COLUMNS: TableColumnsType<DayRow> = [
  { title: 'Дата', dataIndex: 'date', render: (v: ISODate) => <span className="po-num">{formatDate(v)}</span> },
  { title: 'USD', dataIndex: 'USD', render: rateCell },
  { title: 'EUR', dataIndex: 'EUR', render: rateCell },
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
        Для блоків постачальників без курсу в прайсі й без ручного курсу в картці. Діє з обраної дати, доки не введуть новий ручний або не
        скасують, і лише поки він вищий за курс НБУ.
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

interface SupplierRateValues {
  manualRateUsd: number | null;
  manualRateEur: number | null;
}

/** Ручний курс із картки постачальника — його можна поправити прямо звідси, не відкриваючи постачальників. */
function SupplierRateDialog({ supplier, onClose }: { supplier: SupplierListItem | null; onClose: () => void }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<SupplierRateValues>();

  const save = useMutation({
    mutationFn: async (v: SupplierRateValues) => {
      // повний SupplierInput беремо з картки, щоб не загубити поля, яких немає в цій формі
      const { id, productsCount: _p, lastImportAt: _l, priceSource: _s, priceListRates: _r, legalEntities, contacts, ...rest } = await ds.getSupplier(supplier!.id);
      const changed = v.manualRateUsd !== rest.manualRateUsd || v.manualRateEur !== rest.manualRateEur;
      return ds.saveSupplier(id, {
        ...rest,
        manualRateUsd: v.manualRateUsd,
        manualRateEur: v.manualRateEur,
        // дата ручного курсу — день, коли його востаннє змінили (як у картці постачальника)
        manualRatesDate: changed ? (v.manualRateUsd != null || v.manualRateEur != null ? toIsoDate(new Date()) : null) : rest.manualRatesDate,
        legalEntities: legalEntities.map(({ supplierId: _sid, ...le }) => le),
        contacts: contacts.map(({ supplierId: _sid, ...ct }) => ct),
      });
    },
    onSuccess: (s) => {
      void queryClient.invalidateQueries({ queryKey: qk.suppliers });
      void queryClient.invalidateQueries({ queryKey: qk.supplier(s.id) });
      message.success(`Ручний курс ${s.name} збережено`);
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  if (!supplier) return null;
  const ignored = supplier.ratePolicy === 'nbu' || supplier.ratePolicy === 'nbu_adjusted';
  return (
    <Modal
      open
      title={`Ручний курс: ${supplier.name}`}
      okText="Зберегти"
      cancelText="Скасувати"
      confirmLoading={save.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
      width={460}
    >
      <p className="po-muted" style={{ marginTop: 0 }}>
        Діє для заявок цього постачальника, коли в його прайсі курсу немає. Прайс у {supplier.defaultCurrency}, спосіб:{' '}
        {RATE_POLICY_LABELS[supplier.ratePolicy]}.
      </p>
      {ignored ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={`Зараз курс береться за способом «${RATE_POLICY_LABELS[supplier.ratePolicy]}», тому цей ручний курс не застосується, доки спосіб не змінити в картці постачальника.`}
        />
      ) : null}
      <Form<SupplierRateValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        key={supplier.id}
        initialValues={{ manualRateUsd: supplier.manualRateUsd, manualRateEur: supplier.manualRateEur }}
        onFinish={(v) => save.mutate({ manualRateUsd: v.manualRateUsd ?? null, manualRateEur: v.manualRateEur ?? null })}
      >
        <ManualRateFields inputStyle={{ width: 180 }} />
      </Form>
    </Modal>
  );
}

function supplierColumns(
  onEdit: (s: SupplierListItem) => void,
  today: EffectiveRates | undefined,
  maxAgeDays: number,
): TableColumnsType<SupplierListItem> {
  const pair = (fromPrice: number | null, manual: number | null) =>
    fromPrice != null ? (
      <span className="po-num">{formatRate(fromPrice)}</span>
    ) : manual != null ? (
      <Tag bordered={false} title="Ручний курс постачальника">ручний {formatRate(manual)}</Tag>
    ) : null;
  return [
    {
      title: 'Постачальник',
      key: 'name',
      render: (_, s) => <SupplierLogo name={s.name} logoUrl={s.logoUrl} color={s.color} size={18} showName />,
    },
    { title: 'Прайс', key: 'currency', render: (_, s) => <span className="po-num">{s.defaultCurrency}</span> },
    // одна колонка на обидві валюти: у постачальника прайс в одній валюті, друга колонка завжди була б порожня
    {
      title: 'Курс у прайсі',
      key: 'listed',
      render: (_, s) => {
        const usd = pair(s.priceListRates.USD, s.manualRateUsd);
        const eur = pair(s.priceListRates.EUR, s.manualRateEur);
        return (
          <>
            {usd ? <div>USD {usd}</div> : null}
            {eur ? <div>EUR {eur}</div> : null}
          </>
        );
      },
    },
    { title: 'Дата прайсу', key: 'date', render: (_, s) => <span className="po-num">{formatDate(s.priceListRates.date)}</span> },
    {
      title: <span title={GENERAL_RATE_HINT}>Курс для заявок сьогодні</span>,
      key: 'effective',
      // довгий підпис («USD 44,86 (загальний на 24.09.2026)») переноситься, а не розпирає таблицю
      render: (_, s) => <span className="po-rates-effective">{requestRatesLabel(s, today, maxAgeDays)}</span>,
    },
    {
      title: '',
      key: 'actions',
      render: (_, s) => (
        <Button size="small" type="link" icon={<EditOutlined />} onClick={() => onEdit(s)}>
          Ручний курс
        </Button>
      ),
    },
  ];
}

/** Курси валют: НБУ — довідково; у заявці курс береться з прайсу постачальника. */
export default function RatesPage() {
  const rates = useQuery({ queryKey: qk.ratesList, queryFn: () => ds.listRates() });
  const suppliers = useQuery({ queryKey: qk.suppliers, queryFn: () => ds.listSuppliers() });
  const todayDate = toIsoDate(new Date());
  const todayRates = useQuery({ queryKey: qk.rates(todayDate), queryFn: () => ds.getRates(todayDate) });
  const maxAgeDays = usePriceListRateMaxAge();

  const [manualOpen, setManualOpen] = useState(false);
  const [rateSupplier, setRateSupplier] = useState<SupplierListItem | null>(null);
  // курс має сенс лише там, де прайс у валюті
  const foreignSuppliers = useMemo(() => (suppliers.data ?? []).filter((s) => s.defaultCurrency !== 'UAH'), [suppliers.data]);
  const series = useMemo(() => ({ USD: seriesOf(rates.data ?? [], 'USD'), EUR: seriesOf(rates.data ?? [], 'EUR') }), [rates.data]);

  const days = useMemo<DayRow[]>(() => {
    const byDate = new Map<ISODate, DayRow>();
    const empty = (): DayCell => ({ nbu: null, manual: null });
    for (const r of rates.data ?? []) {
      const row = byDate.get(r.rateDate) ?? { date: r.rateDate, USD: empty(), EUR: empty() };
      if (r.source === 'manual') row[r.currency].manual = { rate: r.rate, cancelled: !!r.cancelledAt };
      else row[r.currency].nbu = r.rate;
      byDate.set(r.rateDate, row);
    }
    return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [rates.data]);

  let body;
  if (rates.isPending) body = <Spin style={{ display: 'block', margin: '48px auto' }} />;
  else if (rates.isError) body = <LoadError title="Не вдалося завантажити курси" error={rates.error} onRetry={rates.refetch} />;
  else if (!days.length) body = <EmptyState title="Курсів ще немає" />;
  else
    body = (
      <div className="po-rates-top">
        {FOREIGN_CURRENCIES.map((c) =>
          series[c].length ? <RateCard key={c} currency={c} points={series[c]} now={todayRates.data?.[c] ?? null} /> : null,
        )}
      </div>
    );

  return (
    <div className="po-page po-rates-page">
      <PageHeader
        title="Курси валют"
        subtitle="У заявці курс береться так: з прайсу постачальника; якщо там немає, то ручний курс із картки постачальника; далі загальний: більший із курсу НБУ й ручного, заданого тут (ручний діє до нового або до скасування)."
        extra={
          <Button icon={<EditOutlined />} onClick={() => setManualOpen(true)}>
            Задати курс вручну
          </Button>
        }
      />
      <ManualRateDialog open={manualOpen} onClose={() => setManualOpen(false)} />
      {body}
      <div className="po-rates-bottom">
        <Card title="Загальні курси за датами (НБУ і вручну)" size="small">
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
        <Card title="Курси постачальників" size="small">
          {suppliers.isError ? (
            <LoadError title="Не вдалося завантажити постачальників" error={suppliers.error} onRetry={suppliers.refetch} />
          ) : (
            <Table<SupplierListItem>
              className="po-rates-table"
              size="small"
              rowKey="id"
              loading={suppliers.isPending}
              columns={supplierColumns(setRateSupplier, todayRates.data, maxAgeDays)}
              dataSource={foreignSuppliers}
              pagination={false}
              locale={{ emptyText: 'Немає постачальників із прайсом у валюті, курс нікому не потрібен' }}
            />
          )}
          <div className="po-rates-hint">
            Показано лише постачальників, чий прайс у валюті. Курс приходить разом із прайсом; якщо в прайсі його немає, у заявці береться
            ручний курс із картки постачальника, а якщо й його немає, то загальний курс на сьогодні.
          </div>
        </Card>
        <SupplierRateDialog supplier={rateSupplier} onClose={() => setRateSupplier(null)} />
      </div>
    </div>
  );
}
