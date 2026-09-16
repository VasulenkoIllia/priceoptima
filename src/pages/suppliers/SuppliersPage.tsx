import { FileExcelOutlined, RightOutlined, SyncOutlined, UploadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Result, Spin, Tag, Tooltip } from 'antd';
import { useState } from 'react';
import { CURRENCY_LABELS } from '@shared/enums';
import { formatDateTime, formatMoneyUah, formatQty } from '@shared/format';
import type { SupplierListItem } from '@shared/types';
import { EmptyState, PageHeader, SupplierLogo } from '@/components';
import { ds, errorMessage, qk } from '@/data';
import { downloadPriceTemplate, PriceImportDialog } from './priceImport';
import { SupplierDrawer } from './SupplierDrawer';
import { pctLabel, priceListRatesLabel, priceSourceLabel } from './supplierView';
import './suppliers.css';

interface SupplierCardProps {
  s: SupplierListItem;
  refreshing: boolean;
  onRefresh: () => void;
  onImport: () => void;
  onOpen: () => void;
}

function SupplierCard({ s, refreshing, onRefresh, onImport, onOpen }: SupplierCardProps) {
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
        <dt>Курс з прайсу</dt>
        <dd style={{ fontVariantNumeric: 'tabular-nums' }}>{priceListRatesLabel(s.priceListRates)}</dd>
        <dt>Націнка постачальника</dt>
        <dd className="po-num">{pctLabel(s.supplierMarkupPct)}</dd>
        <dt>Мін. замовлення</dt>
        <dd className="po-num">{s.minOrderAmount != null ? formatMoneyUah(s.minOrderAmount) : '—'}</dd>
      </dl>
      <div className="po-sup-status">
        <Tag color={s.priceSource.kind === 'auto' ? 'green' : 'blue'} bordered={false}>
          {priceSourceLabel(s.priceSource)}
        </Tag>
        {s.priceSource.hasPurchasePrice ? null : (
          <Tooltip title={s.priceSource.note}>
            <Tag color="orange" bordered={false}>
              лише РРЦ
            </Tag>
          </Tooltip>
        )}
        <span>{s.lastImportAt ? `Прайс оновлено ${formatDateTime(s.lastImportAt)}` : 'Прайс ще не завантажено'}</span>
      </div>
      <div className="po-sup-actions">
        {s.priceSource.kind === 'auto' ? (
          <Button icon={<SyncOutlined />} loading={refreshing} onClick={onRefresh}>
            Оновити зараз
          </Button>
        ) : null}
        <Button icon={<UploadOutlined />} type={s.priceSource.kind === 'manual' ? 'primary' : 'default'} ghost={s.priceSource.kind === 'manual'} onClick={onImport}>
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
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<SupplierListItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importFor, setImportFor] = useState<SupplierListItem | null>(null);
  const suppliers = useQuery({ queryKey: qk.suppliers, queryFn: () => ds.listSuppliers() });

  const refresh = useMutation({
    mutationFn: (s: SupplierListItem) => ds.refreshSupplierPrices(s.id),
    onSuccess: (r, s) => {
      message.success({
        content: `Прайс ${s.name} оновлено: товарів ${r.productsTotal}, змінилось цін ${r.changed} (▲ ${r.priceUp}, ▼ ${r.priceDown})`,
        duration: 5,
      });
      for (const queryKey of [qk.suppliers, qk.supplier(s.id), qk.productsAll, qk.productAll, qk.priceHistoryAll, qk.priceUpdatesAll]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <div className="po-page po-sup-page">
      <PageHeader
        title="Постачальники"
        subtitle="Прайси з вигрузкою оновлюються щоранку автоматично; решту завантажуємо файлом"
        extra={
          <Button
            icon={<FileExcelOutlined />}
            onClick={() => void downloadPriceTemplate().catch((e: unknown) => message.error(errorMessage(e)))}
            title="Наш формат прайсу — можна надіслати постачальнику"
          >
            Шаблон Excel
          </Button>
        }
      />
      {suppliers.isPending ? (
        <Spin style={{ display: 'block', margin: '48px auto' }} />
      ) : suppliers.isError ? (
        <Result status="error" title="Не вдалося завантажити постачальників" subTitle={errorMessage(suppliers.error)} />
      ) : suppliers.data.length === 0 ? (
        <EmptyState title="Постачальників ще немає" />
      ) : (
        <div className="po-sup-grid">
          {suppliers.data.map((s) => (
            <SupplierCard
              key={s.id}
              s={s}
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
      {importFor ? (
        <PriceImportDialog supplierId={importFor.id} supplierName={importFor.name} open onClose={() => setImportFor(null)} />
      ) : null}
    </div>
  );
}
