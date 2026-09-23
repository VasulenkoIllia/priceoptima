import { DownOutlined, FileExcelOutlined, PlusOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Checkbox, Dropdown, Input, Select, Space, Tag } from 'antd';
import type { ColDef, GridApi, ICellRendererParams, IDatasource } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AVAILABILITY_LABELS, type AvailabilityStatus } from '@shared/enums';
import { formatDate, formatMoney, formatQty } from '@shared/format';
import type { ProductDetail, ProductPageQuery, ProductSortField, SupplierListItem, UUID } from '@shared/types';
import { PageHeader, SupplierLogo } from '@/components';
import { NewProductDialog } from '@/components/ProductPicker';
import { ds, errorMessage, qk } from '@/data';
import { saveBlob } from '@/lib/files';
import { GRID_LOCALE, gridTheme } from '@/lib/agGrid';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useUiPrefs } from '@/stores/uiPrefsStore';
import { PriceImportDialog } from '../suppliers/priceImport';
import { Name1cImportDialog } from './Name1cImportDialog';
import { ProductDrawer } from './ProductDrawer';
import { Availability, grossPrice, PriceSourceTag, priceCur, useVatRate } from './productView';
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

/** Скільки рядків підвантажуємо за раз під час гортання. */
const PAGE_SIZE = 100;

/** Колонка таблиці → поле сортування на сервері. */
const SORT_FIELDS: Record<string, ProductSortField> = {
  supplier: 'supplier',
  sku: 'sku',
  nameWork: 'nameWork',
  name1c: 'name1c',
  unitCode: 'unitCode',
  multiplicity: 'multiplicity',
  purchasePrice: 'purchasePrice',
  rrp: 'rrp',
  availability: 'availability',
  priceUpdatedAt: 'priceUpdatedAt',
  priceSource: 'priceSource',
};

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

/**
 * Номенклатура: товари всіх постачальників; ціни — з прайсів (автоматично), у доданих вручну — вручну.
 * Каталог на десятки тисяч позицій: пошук, фільтри й сортування виконує сервер, таблиця підвантажує рядки під час гортання.
 */
export default function CatalogPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const density = useUiPrefs((s) => s.density);
  const [search, setSearch] = useState('');
  const [supplierId, setSupplierId] = useState<UUID | 'all'>('all');
  const [availability, setAvailability] = useState<AvailabilityFilter>('all');
  const [staleOnly, setStaleOnly] = useState(false);
  const [manualOnly, setManualOnly] = useState(false);
  const [missingOnly, setMissingOnly] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const totalRef = useRef<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const gridApi = useRef<GridApi<ProductDetail> | null>(null);
  const [selected, setSelected] = useState<ProductDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importFor, setImportFor] = useState<SupplierListItem | null>(null);
  const [name1cFor, setName1cFor] = useState<SupplierListItem | null>(null);
  const q = useDebouncedValue(search.trim(), 300);

  const suppliers = useQuery({ queryKey: qk.suppliers, queryFn: () => ds.listSuppliers() });
  const supplierById = useMemo(() => new Map<UUID, SupplierListItem>((suppliers.data ?? []).map((s) => [s.id, s])), [suppliers.data]);

  const filters = useMemo<Omit<ProductPageQuery, 'offset' | 'limit'>>(
    () => ({
      search: q || undefined,
      supplierId: supplierId !== 'all' ? supplierId : undefined,
      availability: availability !== 'all' ? [availability] : undefined,
      stale: staleOnly || undefined,
      manual: manualOnly || undefined,
      missing: missingOnly || undefined,
    }),
    [q, supplierId, availability, staleOnly, manualOnly, missingOnly],
  );

  // нові фільтри — нове джерело рядків: таблиця скидає підвантажене й читає з першої сторінки
  const datasource = useMemo<IDatasource>(() => {
    return {
      getRows: (params) => {
        const sort = params.sortModel[0];
        const sortField = sort ? SORT_FIELDS[sort.colId] : undefined;
        ds.listProductsPage({
          ...filters,
          offset: params.startRow,
          limit: params.endRow - params.startRow,
          sortField,
          sortDir: sortField ? (sort.sort ?? 'asc') : undefined,
        }).then(
          (page) => {
            // загальну кількість сервер рахує лише для першої сторінки
            if (page.total != null) totalRef.current = page.total;
            setTotal(totalRef.current);
            setLoadError(null);
            params.successCallback(page.items, totalRef.current ?? undefined);
            if (totalRef.current === 0) gridApi.current?.showNoRowsOverlay();
            else gridApi.current?.hideOverlay();
          },
          (e: unknown) => {
            setLoadError(errorMessage(e));
            params.failCallback();
          },
        );
      },
    };
  }, [filters]);

  // каталог змінився деінде (прайс, новий товар, ціна) — інвалідується весь ['products'], разом із цією позначкою;
  // перечитуємо підвантажені сторінки, не скидаючи прокрутку
  const version = useQuery({ queryKey: qk.productsVersion, queryFn: () => Date.now(), staleTime: Infinity });
  const seenVersion = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (version.data == null) return;
    if (seenVersion.current != null && seenVersion.current !== version.data) gridApi.current?.refreshInfiniteCache();
    seenVersion.current = version.data;
  }, [version.data]);

  const [exporting, setExporting] = useState(false);
  /** Вивантаження — те саме, що на екрані: поточні фільтри й пошук (НОМ-7). */
  const exportToExcel = async () => {
    setExporting(true);
    try {
      const blob = await ds.exportProducts(filters);
      saveBlob(blob, `Номенклатура ${formatDate(new Date().toISOString())}.xlsx`);
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const vatRatePct = useVatRate();
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
      { headerName: 'Найменування робоче', field: 'nameWork', flex: 1, minWidth: 260, tooltipField: 'nameWork' },
      {
        headerName: 'Найменування 1С',
        field: 'name1c',
        flex: 1,
        minWidth: 200,
        tooltipField: 'name1c',
        valueFormatter: (p) => (p.value as string | null) ?? '',
        headerTooltip: 'Назва як у бухгалтерії: заповнюється в картці товару',
      },
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
        headerName: 'Вхід з ПДВ',
        colId: 'purchasePrice',
        valueGetter: (p) => grossPrice(p.data?.purchasePrice, vatRatePct),
        valueFormatter: (p) => (p.data ? priceCur(p.value as number | null, p.data.currency) : ''),
        width: 132,
        type: 'rightAligned',
        cellClass: 'po-num',
        headerTooltip: `Вхідна ціна з ПДВ ${vatRatePct} % у валюті прайсу. У підборі, порівнянні й КП ціни рахуються без ПДВ`,
      },
      {
        headerName: 'Вхід з ПДВ, грн',
        colId: 'purchasePriceUah',
        valueGetter: (p) => grossPrice(p.data?.purchasePriceUah, vatRatePct),
        width: 128,
        sortable: false,
        type: 'rightAligned',
        cellClass: 'po-num',
        valueFormatter: (p) => formatMoney(p.value as number | null),
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
    [supplierById, vatRatePct],
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
            <Dropdown
              trigger={['click']}
              disabled={!suppliers.data?.length}
              menu={{
                items: (suppliers.data ?? [])
                  .filter((s) => s.isActive)
                  .map((s) => ({ key: s.id, label: <SupplierLogo name={s.name} logoUrl={s.logoUrl} color={s.color} size={16} showName /> })),
                onClick: ({ key }) => setName1cFor(supplierById.get(key) ?? null),
              }}
            >
              <Button title="Файл «артикул → назва 1С» для товарів постачальника">
                Назви 1С з Excel <DownOutlined />
              </Button>
            </Dropdown>
            <Button
              icon={<FileExcelOutlined />}
              loading={exporting}
              title="Excel із позиціями за поточними фільтрами"
              onClick={() => void exportToExcel()}
            >
              Вивантажити в Excel
            </Button>
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
        <Checkbox checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)}>
          Немає у прайсі
        </Checkbox>
        <span className="po-muted" style={{ marginLeft: 'auto' }}>
          {total != null ? `Товарів: ${formatQty(total)}` : ''}
        </span>
      </div>
      {loadError ? (
        <Alert
          type="error"
          showIcon
          message="Не вдалося завантажити номенклатуру"
          description={loadError}
          action={
            <Button size="small" onClick={() => gridApi.current?.refreshInfiniteCache()}>
              Спробувати ще
            </Button>
          }
          style={{ marginBottom: 8 }}
        />
      ) : null}
      <div className="po-grid-wrap">
        <AgGridReact<ProductDetail>
          theme={gridTheme(density)}
          localeText={GRID_LOCALE}
          containerStyle={{ height: '100%' }}
          rowModelType="infinite"
          datasource={datasource}
          cacheBlockSize={PAGE_SIZE}
          maxBlocksInCache={20}
          columnDefs={columns}
          defaultColDef={{ sortable: true, resizable: true, suppressMovable: true }}
          getRowId={(p) => p.data.id}
          rowClass="po-cat-row"
          overlayNoRowsTemplate="<span>Товарів не знайдено</span>"
          onGridReady={(e) => {
            gridApi.current = e.api;
          }}
          onRowClicked={(e) => e.data && openProduct(e.data)}
          onCellKeyDown={(e) => {
            const ev = e.event as KeyboardEvent | undefined;
            if (ev?.key === 'Enter' && e.data) openProduct(e.data);
          }}
          tooltipShowDelay={400}
        />
      </div>
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
      {name1cFor ? <Name1cImportDialog supplierId={name1cFor.id} supplierName={name1cFor.name} open onClose={() => setName1cFor(null)} /> : null}
      {importFor ? (
        <PriceImportDialog supplierId={importFor.id} supplierName={importFor.name} open onClose={() => setImportFor(null)} />
      ) : null}
    </div>
  );
}
