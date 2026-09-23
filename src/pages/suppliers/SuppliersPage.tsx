import { FileExcelOutlined, PlusOutlined, RightOutlined, SyncOutlined, UploadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Result, Space, Spin, Tag, Tooltip } from 'antd';
import { useState } from 'react';
import { CURRENCY_LABELS } from '@shared/enums';
import { formatDate, formatDateTime, formatMoneyUah, formatQty, toIsoDate } from '@shared/format';
import type { EffectiveRates, SupplierListItem } from '@shared/types';
import { EmptyState, PageHeader, SupplierLogo } from '@/components';
import { ds, errorMessage, qk } from '@/data';
import { GENERAL_RATE_HINT, requestRatesLabel, usePriceListRateMaxAge } from '@/lib/rateLabels';
import { downloadPriceTemplate, PriceImportDialog } from './priceImport';
import { PriceUpdateReportView } from './PriceUpdateReport';
import { SupplierDrawer } from './SupplierDrawer';
import { SupplierFormDialog } from './SupplierFormDialog';
import { pctLabel, PRICE_SOURCE_COLORS, priceListRatesLabel, priceSourceLabel, pricesFromFile, ratePolicyLabel, viaLink } from './supplierView';
import './suppliers.css';

interface SupplierCardProps {
  s: SupplierListItem;
  /** Загальні курси на сьогодні — щоб показати, який курс отримає новий блок заявки. */
  rates: EffectiveRates | undefined;
  /** Строк дії курсу з прайсу, днів. */
  maxAgeDays: number;
  refreshing: boolean;
  onRefresh: () => void;
  onImport: () => void;
  onOpen: () => void;
}

function SupplierCard({ s, rates, maxAgeDays, refreshing, onRefresh, onImport, onOpen }: SupplierCardProps) {
  return (
    <Card className="po-sup-card" styles={{ body: { padding: 16 } }}>
      <div className="po-sup-head">
        <SupplierLogo name={s.name} logoUrl={s.logoUrl} color={s.color} size={40} />
        <div style={{ minWidth: 0 }}>
          <div className="po-sup-name" title={s.name}>
            {s.name}
          </div>
          <div className="po-sup-count">Товарів: {formatQty(s.productsCount)}</div>
        </div>
      </div>
      <dl className="po-sup-facts">
        <dt>Валюта прайсу</dt>
        <dd>{CURRENCY_LABELS[s.defaultCurrency]}</dd>
        <dt>Курс для заявок</dt>
        <dd style={{ fontVariantNumeric: 'tabular-nums' }}>
          <Tooltip
            title={
              <>
                Спосіб: {ratePolicyLabel(s)}. Курс у прайсі: {priceListRatesLabel(s.priceListRates)}.
                <br />
                {GENERAL_RATE_HINT}.
              </>
            }
          >
            <span>{requestRatesLabel(s, rates, maxAgeDays)}</span>
          </Tooltip>
        </dd>
        <dt>Націнка постачальника</dt>
        <dd className="po-num">{pctLabel(s.supplierMarkupPct)}</dd>
        <dt>Мін. замовлення з ПДВ</dt>
        <dd className="po-num">{s.minOrderAmount != null ? formatMoneyUah(s.minOrderAmount) : '—'}</dd>
      </dl>
      <div className="po-sup-status">
        <Tag color={PRICE_SOURCE_COLORS[s.priceSource.kind]} bordered={false}>
          {priceSourceLabel(s.priceSource)}
        </Tag>
        {s.priceSource.kind !== 'auto' || s.priceSource.hasPurchasePrice ? null : (
          <Tooltip title={s.priceSource.note}>
            <Tag color="orange" bordered={false}>
              лише РРЦ
            </Tag>
          </Tooltip>
        )}
        {s.priceSource.lastErrorAt && viaLink(s.priceSource.kind) ? (
          <Tooltip
            title={
              <>
                {s.priceSource.lastError ?? 'Вигрузка не відповіла або повернула помилку'}
                {s.priceSource.failCount > 1 ? ` (невдалих спроб поспіль: ${s.priceSource.failCount})` : ''}.
                <br />
                Ціни лишаються з останнього вдалого оновлення. Що робити: натисніть «Оновити зараз»; не допоможе — перевірте посилання й
                доступ у «Детальніше → Джерело прайсу» або завантажте прайс файлом.
              </>
            }
          >
            <Tag color="red" bordered={false}>
              Оновлення не вдалося {formatDate(s.priceSource.lastErrorAt)}
            </Tag>
          </Tooltip>
        ) : null}
        <span>{s.lastImportAt ? `Прайс оновлено ${formatDateTime(s.lastImportAt)}` : 'Прайс ще не завантажено'}</span>
      </div>
      <div className="po-sup-actions">
        {viaLink(s.priceSource.kind) ? (
          <Button icon={<SyncOutlined />} loading={refreshing} onClick={onRefresh}>
            Оновити зараз
          </Button>
        ) : null}
        <Button icon={<UploadOutlined />} type={pricesFromFile(s.priceSource.kind) ? 'primary' : 'default'} ghost={pricesFromFile(s.priceSource.kind)} onClick={onImport}>
          Завантажити прайс
        </Button>
        <Button type="link" onClick={onOpen}>
          Детальніше <RightOutlined />
        </Button>
      </div>
    </Card>
  );
}

/** Постачальники: картки з умовами і станом прайсу; прайси оновлюються автоматично. */
export default function SuppliersPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<SupplierListItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importFor, setImportFor] = useState<SupplierListItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const suppliers = useQuery({ queryKey: qk.suppliers, queryFn: () => ds.listSuppliers() });
  const today = toIsoDate(new Date());
  const rates = useQuery({ queryKey: qk.rates(today), queryFn: () => ds.getRates(today) });
  const maxAgeDays = usePriceListRateMaxAge();

  const refresh = useMutation({
    mutationFn: (s: SupplierListItem) => ds.refreshSupplierPrices(s.id),
    onSuccess: (r, s) => {
      // звіт оновлення відкривається сам — що змінилось і які є зауваги
      modal.info({
        title: `Прайс ${s.name} оновлено`,
        width: 880,
        icon: null,
        okText: 'Закрити',
        content: (
          <div className="po-pi-confirm">
            <PriceUpdateReportView update={r} />
          </div>
        ),
      });
      for (const queryKey of [qk.suppliers, qk.supplier(s.id), qk.productsAll, qk.productAll, qk.priceHistoryAll, qk.priceUpdatesAll]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: (e, s) => {
      message.error({ content: errorMessage(e), duration: 8 });
      // невдалий запуск теж лягає в журнал
      void queryClient.invalidateQueries({ queryKey: qk.priceUpdatesAll });
      void queryClient.invalidateQueries({ queryKey: qk.supplier(s.id) });
    },
  });

  return (
    <div className="po-page po-sup-page">
      <PageHeader
        title="Постачальники"
        subtitle="Прайси з вигрузкою оновлюються щоранку автоматично; решту завантажуємо файлом"
        extra={
          <Space>
            <Button
              icon={<FileExcelOutlined />}
              onClick={() => void downloadPriceTemplate().catch((e: unknown) => message.error(errorMessage(e)))}
              title="Наш формат прайсу — можна надіслати постачальнику"
            >
              Шаблон Excel
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              Новий постачальник
            </Button>
          </Space>
        }
      />
      {suppliers.isPending ? (
        <Spin style={{ display: 'block', margin: '48px auto' }} />
      ) : suppliers.isError ? (
        <Result status="error" title="Не вдалося завантажити постачальників" subTitle={errorMessage(suppliers.error)} />
      ) : suppliers.data.length === 0 ? (
        <EmptyState
          title="Постачальників ще немає"
          action={
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              Додати постачальника
            </Button>
          }
        />
      ) : (
        <div className="po-sup-grid">
          {suppliers.data.map((s) => (
            <SupplierCard
              key={s.id}
              s={s}
              rates={rates.data}
              maxAgeDays={maxAgeDays}
              refreshing={refresh.isPending && refresh.variables?.id === s.id}
              onRefresh={() => refresh.mutate(s)}
              onImport={() => setImportFor(s)}
              onOpen={() => {
                setSelected(s);
                setDrawerOpen(true);
              }}
            />
          ))}
        </div>
      )}
      <SupplierDrawer open={drawerOpen} supplier={selected} onClose={() => setDrawerOpen(false)} />
      <SupplierFormDialog
        open={createOpen}
        supplier={null}
        onClose={() => setCreateOpen(false)}
        onSaved={(saved) => {
          setSelected(saved);
          setDrawerOpen(true);
        }}
      />
      {importFor ? (
        <PriceImportDialog supplierId={importFor.id} supplierName={importFor.name} open onClose={() => setImportFor(null)} />
      ) : null}
    </div>
  );
}
