// Картка товару: усі поля, історія цін; ціну змінюють вручну лише в товарів, доданих вручну.
import { CheckOutlined, EditOutlined, GlobalOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Descriptions, Drawer, Space, Spin, Table, Tag, Tooltip, Typography, type TableColumnsType } from 'antd';
import { useState, type ReactNode } from 'react';
import { CURRENCY_LABELS } from '@shared/enums';
import { formatDate, formatDateTime, formatMoneyUah, formatQty, formatRequestNumber } from '@shared/format';
import { webUrl } from '@shared/parse';
import type { PriceHistoryEntry, ProductDetail, SupplierListItem } from '@shared/types';
import { LastChangeNote, LoadError, SupplierLogo } from '@/components';
import { ds, errorMessage, qk } from '@/data';
import { ManualPriceDialog } from './ManualPriceDialog';
import { ProductEditDialog } from './ProductEditDialog';
import { PriceHistoryChart } from './PriceHistoryChart';
import { ProductPhotos } from './ProductPhotos';
import { Availability, grossPrice, HISTORY_SOURCE_LABELS, PriceSourceTag, priceCur, useVatRate } from './productView';

function historyColumns(vatRatePct: number): TableColumnsType<PriceHistoryEntry> {
  return [
    { title: 'Дата і час', dataIndex: 'effectiveAt', width: 118, render: (v: string) => <span className="po-num">{formatDateTime(v)}</span> },
    {
      title: 'Вхід з ПДВ',
      key: 'price',
      align: 'right',
      render: (_, h) => <span className="po-num">{priceCur(grossPrice(h.purchasePrice, vatRatePct), h.currency)}</span>,
    },
    { title: 'РРЦ', key: 'rrp', align: 'right', render: (_, h) => <span className="po-num po-rrp">{priceCur(h.rrp, h.currency)}</span> },
    { title: 'Наявність', key: 'stock', render: (_, h) => (h.availability ? <Availability status={h.availability} qty={h.stockQty} /> : null) },
    {
      title: 'Джерело',
      key: 'source',
      render: (_, h) => (h.source === 'request' && h.requestNumber != null ? `Заявка № ${formatRequestNumber(h.requestNumber)}` : HISTORY_SOURCE_LABELS[h.source]),
    },
    {
      title: 'Примітка / хто',
      key: 'note',
      render: (_, h) => (
        <span>
          {h.note ?? ''}
          {h.user ? <span className="po-muted">{h.note ? ' · ' : ''}{h.user.shortName}</span> : null}
        </span>
      ),
    },
  ];
}

function ProductCard({ product, supplier }: { product: ProductDetail; supplier?: SupplierListItem }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [priceOpen, setPriceOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const history = useQuery({ queryKey: qk.priceHistory(product.id), queryFn: () => ds.getPriceHistory(product.id) });
  const isManual = product.priceSource === 'manual';
  const vatRatePct = useVatRate();
  // НОМ-5: «Ціну перевірено» — дата ціни зараз, ціна без змін (лише в доданих вручну; решту оновлює прайс)
  const checked = useMutation({
    mutationFn: () =>
      ds.updateProductPrice(product.id, { currency: product.currency, purchasePrice: product.purchasePrice, rrp: product.rrp, source: 'manual' }),
    onSuccess: () => {
      for (const queryKey of [qk.productsAll, qk.product(product.id), qk.priceHistory(product.id)]) void queryClient.invalidateQueries({ queryKey });
      message.success('Дату ціни оновлено: ціну перевірено');
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  // архівний товар (зник із прайсу надовго або прибрано вручну) — повернути, щоб знову пропонувався в підборі
  const restore = useMutation({
    mutationFn: () => ds.updateProduct(product.id, { version: product.version, isArchived: false }),
    onSuccess: () => {
      for (const queryKey of [qk.productsAll, qk.product(product.id)]) void queryClient.invalidateQueries({ queryKey });
      message.success('Товар повернуто з архіву, знову пропонується в підборі');
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const items: { key: string; label: ReactNode; children: ReactNode; span?: number }[] = [
    {
      key: 'sku',
      label: 'Артикул',
      children: (
        <Typography.Text className="po-num" copyable={{ text: product.sku, tooltips: ['Копіювати', 'Скопійовано'] }}>
          {product.sku}
        </Typography.Text>
      ),
    },
    { key: 'name1c', label: 'Найменування 1С', children: product.name1c ?? <span className="po-muted">не задано</span>, span: 2 },
    { key: 'brand', label: 'Бренд', children: product.brand ?? '' },
    { key: 'unit', label: 'Од.', children: product.unitCode },
    { key: 'mult', label: 'Кратність', children: <span className="po-num">{formatQty(product.multiplicity)}</span> },
    { key: 'currency', label: 'Валюта', children: CURRENCY_LABELS[product.currency] },
    { key: 'minQty', label: 'Мін. замовлення', children: <span className="po-num">{formatQty(product.minOrderQty)}</span> },
    {
      key: 'price',
      label: (
        <Tooltip title={`У підборі, порівнянні й КП ціна рахується без ПДВ: ${priceCur(product.purchasePrice, product.currency)}`}>
          <span>Вхід з ПДВ</span>
        </Tooltip>
      ),
      children: <b className="po-num">{priceCur(grossPrice(product.purchasePrice, vatRatePct), product.currency)}</b>,
    },
    {
      key: 'priceUah',
      label: (
        <Tooltip title="За курсом з прайсу постачальника. Націнку постачальника й курс блоку застосовують лише в заявці">
          <span>Вхід з ПДВ, грн</span>
        </Tooltip>
      ),
      children: <span className="po-num">{formatMoneyUah(grossPrice(product.purchasePriceUah, vatRatePct))}</span>,
    },
    { key: 'rrp', label: 'РРЦ з ПДВ', children: <span className="po-num po-rrp">{priceCur(product.rrp, product.currency)}</span> },
    { key: 'stock', label: 'Наявність', children: <Availability status={product.availability} qty={product.stockQty} /> },
    {
      key: 'date',
      label: 'Дата ціни',
      children: (
        <span className="po-cat-date">
          <span className="po-num">{formatDate(product.priceUpdatedAt)}</span>
          {product.isStale ? (
            <Tag color="orange" bordered={false} className="po-cat-tag">
              застаріла
            </Tag>
          ) : null}
          {product.missingSince ? (
            <Tag color="red" bordered={false} className="po-cat-tag">
              немає у прайсі з {formatDate(product.missingSince)}
            </Tag>
          ) : null}
        </span>
      ),
    },
    { key: 'source', label: 'Джерело', children: <PriceSourceTag source={product.priceSource} /> },
  ];
  if (product.notes) items.push({ key: 'notes', label: 'Примітка', children: product.notes, span: 2 });

  return (
    <>
      <div className="po-cat-drawer-title" style={{ marginBottom: 10 }}>
        <SupplierLogo name={product.supplierName} logoUrl={supplier?.logoUrl} color={supplier?.color} size={24} showName />
        <LastChangeNote change={product.lastChange} />
      </div>
      {product.isArchived ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 10 }}
          message="Товар в архіві, у підборі не пропонується"
          action={
            <Button size="small" loading={restore.isPending} onClick={() => restore.mutate()}>
              Повернути
            </Button>
          }
        />
      ) : null}
      <div className="po-cat-name-row">
        <h3 className="po-cat-name">{product.nameWork}</h3>
        <Button size="small" icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
          Редагувати
        </Button>
      </div>
      {webUrl(product.productUrl) ? (
        <Typography.Link href={webUrl(product.productUrl)!} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginBottom: 12 }}>
          <GlobalOutlined /> Сторінка товару на сайті постачальника
        </Typography.Link>
      ) : null}
      <Descriptions column={2} size="small" bordered items={items} styles={{ label: { width: 128 } }} />

      <ProductPhotos productId={product.id} />

      <div className="po-cat-price-action">
        {isManual ? (
          <Alert
            type="warning"
            showIcon
            message="Товар додано вручну, його ціну оновлюють вручну"
            action={
              <Space>
                <Tooltip title="Ціна актуальна: оновити лише дату ціни">
                  <Button size="small" icon={<CheckOutlined />} loading={checked.isPending} onClick={() => checked.mutate()}>
                    Ціну перевірено
                  </Button>
                </Tooltip>
                <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => setPriceOpen(true)}>
                  Змінити ціну
                </Button>
              </Space>
            }
          />
        ) : (
          <Alert type="info" showIcon message="Ціна оновлюється автоматично з прайсу постачальника. Скоригувати ціну для клієнта можна лише в заявці." />
        )}
      </div>

      <div className="po-cat-section">Історія цін</div>
      {history.isPending ? (
        <Spin style={{ display: 'block', margin: '24px auto' }} />
      ) : history.isError ? (
        <LoadError inline title="Не вдалося завантажити історію цін" error={history.error} onRetry={history.refetch} />
      ) : (
        <>
          <PriceHistoryChart history={history.data} currency={product.currency} vatRatePct={vatRatePct} />
          <Table<PriceHistoryEntry>
            className="po-cat-history"
            size="small"
            rowKey="id"
            columns={historyColumns(vatRatePct)}
            dataSource={history.data}
            pagination={{ pageSize: 8, size: 'small', hideOnSinglePage: true }}
            locale={{ emptyText: 'Історія цін порожня' }}
          />
        </>
      )}
      {isManual ? <ManualPriceDialog open={priceOpen} product={product} onClose={() => setPriceOpen(false)} /> : null}
      <ProductEditDialog open={editOpen} product={product} onClose={() => setEditOpen(false)} />
    </>
  );
}

export interface ProductDrawerProps {
  open: boolean;
  /** Товар зі списку (показується одразу, поки картка довантажується). */
  product: ProductDetail | null;
  supplier?: SupplierListItem;
  onClose: () => void;
}

export function ProductDrawer({ open, product, supplier, onClose }: ProductDrawerProps) {
  const id = product?.id ?? '';
  const detail = useQuery({
    queryKey: qk.product(id),
    queryFn: () => ds.getProduct(id),
    enabled: open && !!id,
    placeholderData: product ?? undefined,
  });

  return (
    <Drawer open={open} onClose={onClose} width={640} title="Картка товару" destroyOnHidden>
      {detail.data ? (
        <ProductCard key={detail.data.id} product={detail.data} supplier={supplier} />
      ) : detail.isError ? (
        <LoadError title="Не вдалося завантажити товар" error={detail.error} onRetry={detail.refetch} />
      ) : (
        <Spin style={{ display: 'block', margin: '48px auto' }} />
      )}
    </Drawer>
  );
}
