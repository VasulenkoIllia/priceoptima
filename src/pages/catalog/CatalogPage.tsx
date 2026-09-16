import { DownOutlined, PlusOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Checkbox, Dropdown, Input, Result, Select, Space, Tag } from 'antd';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { useMemo, useState } from 'react';
import { AVAILABILITY_LABELS, type AvailabilityStatus } from '@shared/enums';
import { formatDate, formatMoney, formatQty } from '@shared/format';
import { buildSearchText, matchesAllTokens, normalizeSku, searchTokens } from '@shared/parse';
import type { ProductDetail, SupplierListItem, UUID } from '@shared/types';
import { PageHeader, SupplierLogo } from '@/components';
import { NewProductDialog } from '@/components/ProductPicker';
import { ds, errorMessage, qk } from '@/data';
import { GRID_LOCALE, gridTheme } from '@/lib/agGrid';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useUiPrefs } from '@/stores/uiPrefsStore';
import { PriceImportDialog } from '../suppliers/priceImport';
import { ProductDrawer } from './ProductDrawer';
import { Availability, PriceSourceTag, priceCur } from './productView';
import './catalog.css';

type Cell = ICellRendererParams<ProductDetail>;
type AvailabilityFilter = 'all' | Exclude<AvailabilityStatus, 'unknown'>;

const AVAILABILITY_OPTIONS: { value: AvailabilityFilter; label: string }[] = [
  { value: 'all', label: 'Уся наявність' },
  { value: 'in_stock', label: AVAILABILITY_LABELS.in_stock },
  { value: 'low_stock', label: AVAILABILITY_LABELS.low_stock },
  { value: 'out_of_stock', label: AVAILABILITY_LABELS.out_of_stock },
  { value: 'on_order', label: AVAILABILITY_LABELS.on_order },
];

interface Indexed {
  p: ProductDetail;
  skuKey: string;
  text: string;
}

function DateCell({ data }: Cell) {
  if (!data) return null;
  return (
    <span className="po-cat-date">
      <span className="po-num">{formatDate(data.priceUpdatedAt)}</span>
      {data.isStale ? (
        <Tag color="orange" bordered={false} className="po-cat-tag">
          застаріла
        </Tag>
      ) : null}
    </span>
  );
}

/** Номенклатура: товари всіх постачальників; ціни — з прайсів (автоматично), у доданих вручну — вручну. */
export default function CatalogPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const density = useUiPrefs((s) => s.density);
  const [search, setSearch] = useState('');
  const [supplierId, setSupplierId] = useState<UUID | 'all'>('all');
  const [availability, setAvailability] = useState<AvailabilityFilter>('all');
  const [staleOnly, setStaleOnly] = useState(false);
  const [manualOnly, setManualOnly] = useState(false);
  const [selected, setSelected] = useState<ProductDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importFor, setImportFor] = useState<SupplierListItem | null>(null);
  const q = useDebouncedValue(search.trim(), 200);

  const products = useQuery({ queryKey: qk.products({}), queryFn: () => ds.listProducts() });
  const suppliers = useQuery({ queryKey: qk.suppliers, queryFn: () => ds.listSuppliers() });
  const supplierById = useMemo(() => new Map<UUID, SupplierListItem>((suppliers.data ?? []).map((s) => [s.id, s])), [suppliers.data]);

  // ключі пошуку рахуємо один раз на завантаження списку
  const index = useMemo<Indexed[]>(
    () => (products.data ?? []).map((p) => ({ p, skuKey: normalizeSku(p.sku), text: buildSearchText(p.sku, p.nameWork, p.brand) })),
    [products.data],
  );

  const rows = useMemo(() => {
    const tokens = searchTokens(q);
    const qSku = normalizeSku(q);
    return index
      .filter(({ p, skuKey, text }) => {
        if (supplierId !== 'all' && p.supplierId !== supplierId) return false;
        if (availability !== 'all' && p.availability !== availability) return false;
        if (staleOnly && !p.isStale) return false;
        if (manualOnly && p.priceSource !== 'manual') return false;
        if (tokens.length && !(qSku.length >= 2 && skuKey.includes(qSku)) && !matchesAllTokens(text, tokens)) return false;
        return true;
      })
      .map((x) => x.p);
  }, [index, q, supplierId, availability, staleOnly, manualOnly]);

  const columns = useMemo<ColDef<ProductDetail>[]>(
    () => [
      {
        headerName: 'Постачальник',
        colId: 'supplier',
        valueGetter: (p) => p.data?.supplierName ?? '',
        width: 170,
        cellRenderer: ({ data }: Cell) => {
          if (!data) return null;
          const s = supplierById.get(data.supplierId);
          return <SupplierLogo name={data.supplierName} logoUrl={s?.logoUrl} color={s?.color} size={18} showName />;
        },
      },
      { headerName: 'Артикул', field: 'sku', width: 130, cellClass: 'po-num' },
      { headerName: 'Назва', field: 'nameWork', flex: 1, minWidth: 260, tooltipField: 'nameWork' },
      { headerName: 'Од.', field: 'unitCode', width: 64 },
      {
        headerName: 'Кратн.',
        field: 'multiplicity',
        width: 78,
        type: 'rightAligned',
        cellClass: 'po-num',
        valueFormatter: (p) => formatQty(p.value),
        headerTooltip: 'Кратність відвантаження',
      },
      {
        headerName: 'Вхід без ПДВ',
        colId: 'purchasePrice',
        valueGetter: (p) => p.data?.purchasePrice ?? null,
        valueFormatter: (p) => (p.data ? priceCur(p.data.purchasePrice, p.data.currency) : ''),
        width: 132,
        type: 'rightAligned',
        cellClass: 'po-num',
        headerTooltip: 'Вхідна ціна без ПДВ у валюті прайсу',
      },
      {
        headerName: 'Вхід, грн',
        field: 'purchasePriceUah',
        width: 116,
        type: 'rightAligned',
        cellClass: 'po-num',
        valueFormatter: (p) => formatMoney(p.value),
        headerTooltip: 'За курсом з прайсу постачальника. Націнку постачальника й курс блоку застосовують лише в заявці',
      },
      {
        headerName: 'РРЦ з ПДВ',
        colId: 'rrp',
        valueGetter: (p) => p.data?.rrp ?? null,
        valueFormatter: (p) => (p.data ? priceCur(p.data.rrp, p.data.currency) : ''),
        width: 128,
        type: 'rightAligned',
        cellClass: 'po-num',
        headerTooltip: 'Рекомендована роздрібна ціна з ПДВ у валюті прайсу',
      },
      {
        headerName: 'Наявність',
        colId: 'availability',
        valueGetter: (p) => (p.data ? AVAILABILITY_LABELS[p.data.availability] : ''),
        width: 156,
        cellRenderer: ({ data }: Cell) =>
          data ? (
            <span className="po-cat-date">
              <Availability status={data.availability} qty={data.stockQty} />
              {data.missingSince ? (
                <Tag color="red" bordered={false} className="po-cat-tag" title={`Немає у прайсі з ${formatDate(data.missingSince)} — ціна остання відома`}>
                  немає у прайсі
                </Tag>
              ) : null}
            </span>
          ) : null,
      },
      { headerName: 'Дата ціни', field: 'priceUpdatedAt', width: 164, cellRenderer: DateCell },
      {
        headerName: 'Джерело',
        field: 'priceSource',
        width: 104,
        cellRenderer: ({ data }: Cell) => (data ? <PriceSourceTag source={data.priceSource} /> : null),
        headerTooltip: 'Прайс — ціна оновлюється автоматично; Вручну — товар додано вручну',
      },
    ],
    [supplierById],
  );

  const supplierOptions = [
    { value: 'all', label: 'Усі постачальники' },
    ...(suppliers.data ?? []).map((s) => ({
      value: s.id,
      label: <SupplierLogo name={s.name} logoUrl={s.logoUrl} color={s.color} size={16} showName />,
    })),
  ];

  const openProduct = (p: ProductDetail) => {
    setSelected(p);
    setDrawerOpen(true);
  };

  const onProductCreated = (p: ProductDetail) => {
    void queryClient.invalidateQueries({ queryKey: qk.productsAll });
    void queryClient.invalidateQueries({ queryKey: qk.suppliers });
    message.success(`Товар ${p.sku} додано в номенклатуру`);
    openProduct(p);
  };

  return (
    <div className="po-page">
      <PageHeader
        title="Номенклатура"
        subtitle="Товари постачальників. Ціни оновлюються автоматично з прайсів; товари, додані вручну, оновлюються вручну."
        extra={
          <Space>
            <Dropdown
              trigger={['click']}
              disabled={!suppliers.data?.length}
              menu={{
                items: (suppliers.data ?? [])
                  .filter((s) => s.isActive)
                  .map((s) => ({ key: s.id, label: <SupplierLogo name={s.name} logoUrl={s.logoUrl} color={s.color} size={16} showName /> })),
                onClick: ({ key }) => setImportFor(supplierById.get(key) ?? null),
              }}
            >
              <Button icon={<UploadOutlined />}>
                Імпортувати прайс <DownOutlined />
              </Button>
            </Dropdown>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              Створити товар
            </Button>
          </Space>
        }
      />
      <div className="po-toolbar">
        <Input
          allowClear
          prefix={<SearchOutlined className="po-muted" />}
          placeholder="Пошук: артикул або назва"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 280 }}
        />
        <Select<UUID | 'all'>
          value={supplierId}
          onChange={setSupplierId}
          options={supplierOptions}
          loading={suppliers.isPending}
          style={{ width: 210 }}
        />
        <Select<AvailabilityFilter> value={availability} onChange={setAvailability} options={AVAILABILITY_OPTIONS} style={{ width: 170 }} />
        <Checkbox checked={staleOnly} onChange={(e) => setStaleOnly(e.target.checked)}>
          Застарілі ціни
        </Checkbox>
        <Checkbox checked={manualOnly} onChange={(e) => setManualOnly(e.target.checked)}>
          Додані вручну
        </Checkbox>
        <span className="po-muted" style={{ marginLeft: 'auto' }}>
          {products.data ? `Товарів: ${rows.length}` : ''}
        </span>
      </div>
      {products.isError ? (
        <Result status="error" title="Не вдалося завантажити номенклатуру" subTitle={errorMessage(products.error)} />
      ) : (
        <div className="po-grid-wrap">
          <AgGridReact<ProductDetail>
            theme={gridTheme(density)}
            localeText={GRID_LOCALE}
            containerStyle={{ height: '100%' }}
            rowData={rows}
            columnDefs={columns}
            defaultColDef={{ sortable: true, resizable: true, suppressMovable: true }}
            getRowId={(p) => p.data.id}
            rowClass="po-cat-row"
            loading={products.isPending}
            overlayNoRowsTemplate="<span>Товарів не знайдено</span>"
            onRowClicked={(e) => e.data && openProduct(e.data)}
            onCellKeyDown={(e) => {
              const ev = e.event as KeyboardEvent | undefined;
              if (ev?.key === 'Enter' && e.data) openProduct(e.data);
            }}
            tooltipShowDelay={400}
          />
        </div>
      )}
      <ProductDrawer
        open={drawerOpen}
        product={selected}
        supplier={selected ? supplierById.get(selected.supplierId) : undefined}
        onClose={() => setDrawerOpen(false)}
      />
      <NewProductDialog
        open={createOpen}
        suppliers={suppliers.data ?? []}
        supplierId={supplierId !== 'all' ? supplierId : null}
        requirePrice
        okText="Створити"
        intro="Товар з'явиться в номенклатурі з позначкою «Вручну»: прайс постачальника його не оновлює — ціну змінюють у картці товару («Змінити ціну», «Ціну перевірено»)."
        onSubmit={(input) => ds.createProduct(input)}
        onClose={() => setCreateOpen(false)}
        onCreated={onProductCreated}
      />
      {importFor ? (
        <PriceImportDialog supplierId={importFor.id} supplierName={importFor.name} open onClose={() => setImportFor(null)} />
      ) : null}
    </div>
  );
}
