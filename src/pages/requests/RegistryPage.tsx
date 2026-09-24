import {
  CloseOutlined,
  CopyOutlined,
  EllipsisOutlined,
  FolderOpenOutlined,
  HistoryOutlined,
  LockOutlined,
  PaperClipOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Checkbox, DatePicker, Dropdown, Input, Result, Segmented, Select, Tag, Tooltip, type MenuProps } from 'antd';
import type { ColDef, GridApi, ICellRendererParams, IDatasource } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import dayjs, { type Dayjs } from 'dayjs';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useOpenTab } from '@/app/AppTabs';
import { REQUEST_STATUSES } from '@shared/enums';
import { formatDate, formatKpNumber, formatMoney, formatTime } from '@shared/format';
import { requestStageIndicators } from '@shared/status';
import type { RequestListItem, RequestListQuery, UUID } from '@shared/types';
import { PageHeader, StatusTag } from '@/components';
import { ds, errorMessage, qk } from '@/data';
import { GRID_LOCALE, gridTheme } from '@/lib/agGrid';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { CopyRequestDialog, type CopySource } from '@/pages/request-editor/CopyRequestDialog';
import { useUiPrefs } from '@/stores/uiPrefsStore';
import { CreateRequestDialog } from './CreateRequestDialog';
import { hasFilters, useRegistryFilters, type StatusFilter } from './registryFilters';

type Cell = ICellRendererParams<RequestListItem>;

/** Скільки заявок підвантажуємо за раз під час гортання. */
const PAGE_SIZE = 100;

/** Колонка → поле сортування на сервері (за іншими колонками реєстр не сортується). */
const SORT_FIELDS: Record<string, string> = {
  number: 'number',
  requestDate: 'requestDate',
  totalSaleGross: 'totalSaleGross',
  approvedSaleGross: 'approvedSaleGross',
};

function KpCell({ data }: Cell) {
  if (!data || !requestStageIndicators(data).hasKp) return null;
  const last = data.lastKp;
  return (
    <Tooltip title={last ? `КП № ${formatKpNumber(last.kpNumber, data.number)}${last.final ? ', останнє фінальне' : ''}; версій: ${data.kpCount}` : 'КП сформовано'}>
      <Tag bordered={false} color={last?.final ? 'purple' : 'blue'} style={{ margin: 0 }} className="po-num">
        {last?.final ? 'фінальне' : 'КП'}
        {data.kpCount > 1 ? ` · ${data.kpCount}` : ''}
      </Tag>
    </Tooltip>
  );
}

function StatusCell({ data }: Cell) {
  if (!data) return null;
  const { isApproved } = requestStageIndicators(data);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <StatusTag status={data.status} />
      {isApproved ? (
        <Tooltip title="Клієнт погодив позиції">
          <Tag bordered={false} color="green" style={{ margin: 0 }}>
            Погоджено
          </Tag>
        </Tooltip>
      ) : null}
    </span>
  );
}

function LockCell({ data }: Cell) {
  const lock = data?.lock;
  if (!lock) return null;
  return (
    <Tooltip title={`Редагує з ${formatTime(lock.lockedAt, false)}${lock.isMySession ? ' (ця вкладка)' : ''}`}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--po-warning)' }}>
        <LockOutlined />
        <span style={{ color: 'rgba(0,0,0,0.75)' }}>
          {lock.userShortName}
          {lock.isMine ? ' (ви)' : ''}
        </span>
      </span>
    </Tooltip>
  );
}

function FilesCell({ data }: Cell) {
  if (!data?.attachmentsCount) return null;
  return (
    <span className="po-num">
      <PaperClipOutlined /> {data.attachmentsCount}
    </span>
  );
}

/** Меню рядка (РЕЄ-4) — кнопка «⋯» і правий клік. Ключ — дія або вкладка редактора. */
const ROW_MENU_ITEMS: MenuProps['items'] = [
  { key: 'open', icon: <FolderOpenOutlined />, label: 'Відкрити' },
  { key: 'copy', icon: <CopyOutlined />, label: 'Копіювати…' },
  { type: 'divider' },
  { key: 'files', icon: <PaperClipOutlined />, label: 'Файли' },
  { key: 'history', icon: <HistoryOutlined />, label: 'Історія' },
];

function RowMenuButton({ onAction }: { onAction: (key: string) => void }) {
  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      menu={{
        items: ROW_MENU_ITEMS,
        onClick: ({ key, domEvent }) => {
          domEvent.stopPropagation();
          onAction(key);
        },
      }}
    >
      <Button type="text" size="small" icon={<EllipsisOutlined />} title="Дії із заявкою" aria-label="Дії із заявкою" onClick={(e) => e.stopPropagation()} />
    </Dropdown>
  );
}

const STATUS_OPTIONS = [
  { label: 'Усі', value: 'all' as StatusFilter },
  ...REQUEST_STATUSES.map((s) => ({ label: <StatusTag status={s} />, value: s as StatusFilter })),
];

/** Швидкий вибір періоду (тиждень — з понеділка, локаль uk). */
function periodPresets(): { label: string; value: [Dayjs, Dayjs] }[] {
  const today = dayjs();
  const lastMonth = today.subtract(1, 'month');
  return [
    { label: 'Цей тиждень', value: [today.startOf('week'), today.endOf('week')] },
    { label: 'Цей місяць', value: [today.startOf('month'), today.endOf('month')] },
    { label: 'Минулий місяць', value: [lastMonth.startOf('month'), lastMonth.endOf('month')] },
    { label: 'Останні 30 днів', value: [today.subtract(29, 'day'), today] },
  ];
}

/** Реєстр заявок (§6.2). */
export default function RegistryPage() {
  const navigate = useOpenTab();
  const density = useUiPrefs((s) => s.density);
  const filters = useRegistryFilters();
  const { search, status, clientId, managerId, dateFrom, dateTo, mine, setFilters, resetFilters } = filters;
  const [createOpen, setCreateOpen] = useState(false);
  const [copySource, setCopySource] = useState<CopySource | null>(null);
  // меню правого кліку: рядок і позиція курсора (позиція лишається й після закриття — без стрибка під час анімації)
  const [ctxMenu, setCtxMenu] = useState<{ row: RequestListItem; x: number; y: number } | null>(null);
  const [ctxOpen, setCtxOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(search.trim(), 250);

  const clients = useQuery({ queryKey: qk.clients, queryFn: () => ds.listClients() });
  const users = useQuery({ queryKey: qk.users, queryFn: () => ds.listUsers() });
  const clientOptions = useMemo(() => clients.data?.map((c) => ({ value: c.id, label: c.name })), [clients.data]);
  // неактивних не пропонуємо, але вже обраного лишаємо
  const managerOptions = useMemo(
    () => users.data?.filter((u) => u.isActive || u.id === managerId).map((u) => ({ value: u.id, label: u.shortName })),
    [users.data, managerId],
  );
  const period: [Dayjs, Dayjs] | null = dateFrom && dateTo ? [dayjs(dateFrom), dayjs(dateTo)] : null;

  const query = useMemo<RequestListQuery>(
    () => ({
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(status !== 'all' ? { status: [status] } : {}),
      ...(clientId ? { clientId } : {}),
      ...(mine ? { mine: true } : managerId ? { managerId } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    }),
    [debouncedSearch, status, clientId, managerId, mine, dateFrom, dateTo],
  );

  // заявки читаємо порціями з сервера (сортування й фільтри — у базі), загальна кількість — з першої порції
  const gridApi = useRef<GridApi<RequestListItem> | null>(null);
  const totalRef = useRef<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // запізніла відповідь за попереднім пошуком чи фільтром не переписує лічильник нового.
  // Яке джерело зараз у таблиці, позначаємо після рендеру: обчислення в useMemo React у режимі розробки викликає двічі
  const activeSource = useRef<IDatasource | null>(null);
  const datasource = useMemo<IDatasource>(() => {
    const source: IDatasource = {
      getRows: (params) => {
        const sortModel = params.sortModel[0];
        const field = sortModel ? SORT_FIELDS[sortModel.colId] : undefined;
        ds.listRequestsPage({
          ...query,
          sort: field ? `${sortModel!.sort === 'desc' ? '-' : ''}${field}` : undefined,
          offset: params.startRow,
          limit: params.endRow - params.startRow,
        }).then(
          (page) => {
            if (activeSource.current !== source) return;
            if (page.total != null) totalRef.current = page.total;
            setTotal(totalRef.current);
            setLoadError(null);
            params.successCallback(page.items, totalRef.current ?? undefined);
            if (totalRef.current === 0) gridApi.current?.showNoRowsOverlay();
            else gridApi.current?.hideOverlay();
          },
          (e: unknown) => {
            if (activeSource.current !== source) return;
            setLoadError(errorMessage(e));
            params.failCallback();
          },
        );
      },
    };
    return source;
  }, [query]);
  useLayoutEffect(() => {
    activeSource.current = datasource;
  }, [datasource]);

  // заявку змінили (КП, статус, збереження) — інвалідується весь ['requests'], разом із цією позначкою
  const version = useQuery({ queryKey: qk.requestsVersion, queryFn: () => Date.now(), staleTime: Infinity });
  const seenVersion = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (version.data == null) return;
    if (seenVersion.current != null && seenVersion.current !== version.data) gridApi.current?.refreshInfiniteCache();
    seenVersion.current = version.data;
  }, [version.data]);
  // прострочені блокування (закрита без попередження вкладка) зникають і без подій
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') gridApi.current?.refreshInfiniteCache();
    }, 15_000);
    return () => clearInterval(timer);
  }, []);

  const runRowAction = useCallback(
    (row: RequestListItem, key: string) => {
      if (key === 'copy') setCopySource({ id: row.id, number: row.number, clientId: row.client?.id ?? null });
      else navigate(`/requests/${row.id}${key === 'open' ? '' : `/${key}`}`);
    },
    [navigate],
  );

  const columns = useMemo<ColDef<RequestListItem>[]>(
    () => [
      {
        headerName: 'Номер',
        field: 'number',
        width: 96,
        pinned: 'left',
        sortable: true,
        sort: 'desc',
        cellRenderer: ({ data }: Cell) =>
          data ? (
            <a
              href={`/requests/${data.id}`}
              className="po-num"
              onClick={(e) => {
                e.preventDefault();
                navigate(`/requests/${data.id}`);
              }}
            >
              {data.numberLabel}
            </a>
          ) : null,
      },
      { headerName: 'Дата', field: 'requestDate', width: 100, sortable: true, valueFormatter: (p) => formatDate(p.value) },
      {
        headerName: 'Клієнт',
        colId: 'client',
        valueGetter: (p) => p.data?.client?.name ?? '',
        flex: 1,
        minWidth: 130,
        tooltipValueGetter: (p) => p.data?.title ?? null,
      },
      { headerName: 'Контрагент', colId: 'counterparty', valueGetter: (p) => p.data?.counterparty?.nameShort ?? '', flex: 1.3, minWidth: 160 },
      { headerName: 'ЄДРПОУ', colId: 'edrpou', valueGetter: (p) => p.data?.counterparty?.edrpou ?? '', width: 104, cellClass: 'po-num' },
      {
        headerName: 'Сума з ПДВ',
        field: 'totalSaleGross',
        width: 122,
        sortable: true,
        type: 'rightAligned',
        cellClass: 'po-num',
        // цін продажу ще немає — порожньо, щоб не плутати з нульовою сумою (РЕЄ-3)
        valueFormatter: (p) => (p.value ? formatMoney(p.value) : ''),
        headerTooltip: 'Сума продажу з ПДВ (після націнки)',
      },
      {
        headerName: 'Погоджена сума',
        field: 'approvedSaleGross',
        width: 130,
        sortable: true,
        type: 'rightAligned',
        cellClass: 'po-num',
        valueFormatter: (p) => (p.value ? formatMoney(p.value) : ''),
      },
      { headerName: 'КП', colId: 'kp', width: 104, cellRenderer: KpCell, headerTooltip: 'Останнє сформоване КП («фін.» означає фінальне) і кількість версій' },
      { headerName: 'Статус', field: 'status', width: 190, cellRenderer: StatusCell },
      { headerName: 'Відповідальна особа', colId: 'manager', valueGetter: (p) => p.data?.manager.shortName ?? '', width: 150, headerTooltip: 'Відповідальна особа' },
      { headerName: 'Файли', field: 'attachmentsCount', width: 74, cellRenderer: FilesCell },
      { headerName: 'Редагує', colId: 'lock', valueGetter: (p) => p.data?.lock?.userShortName ?? '', width: 150, cellRenderer: LockCell, headerTooltip: 'Хто зараз редагує заявку' },
      {
        headerName: '',
        colId: 'actions',
        width: 48,
        pinned: 'right',
        sortable: false,
        resizable: false,
        suppressHeaderMenuButton: true,
        cellClass: 'po-reg-actions',
        cellStyle: { padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
        cellRenderer: ({ data }: Cell) => (data ? <RowMenuButton onAction={(key) => runRowAction(data, key)} /> : null),
      },
    ],
    [navigate, runRowAction],
  );

  const open = (id: string) => navigate(`/requests/${id}`);

  return (
    <div className="po-page">
      <PageHeader
        title="Заявки"
        subtitle="Подвійний клік по рядку відкриває заявку; «⋯» або правий клік показує інші дії"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            Створити заявку
          </Button>
        }
      />
      <div className="po-toolbar">
        <Input
          allowClear
          prefix={<SearchOutlined className="po-muted" />}
          placeholder="Пошук: номер заявки чи КП, клієнт, ЄДРПОУ, позиція, артикул"
          value={search}
          onChange={(e) => setFilters({ search: e.target.value })}
          style={{ width: 340 }}
        />
        <Segmented options={STATUS_OPTIONS} value={status} onChange={(v) => setFilters({ status: v as StatusFilter })} />
        <Select
          showSearch
          allowClear
          placeholder="Клієнт"
          optionFilterProp="label"
          loading={clients.isPending}
          options={clientOptions}
          value={clientId ?? undefined}
          onChange={(v: UUID | undefined) => setFilters({ clientId: v ?? null })}
          popupMatchSelectWidth={false}
          style={{ width: 200 }}
        />
        <Select
          showSearch
          allowClear
          placeholder="Відповідальний"
          optionFilterProp="label"
          loading={users.isPending}
          options={managerOptions}
          value={mine ? undefined : (managerId ?? undefined)}
          disabled={mine}
          onChange={(v: UUID | undefined) => setFilters({ managerId: v ?? null })}
          style={{ width: 160 }}
        />
        <Checkbox checked={mine} onChange={(e) => setFilters({ mine: e.target.checked })}>
          Мої
        </Checkbox>
        <DatePicker.RangePicker
          value={period}
          onChange={(range) =>
            setFilters({ dateFrom: range?.[0]?.format('YYYY-MM-DD') ?? null, dateTo: range?.[1]?.format('YYYY-MM-DD') ?? null })
          }
          format="DD.MM.YYYY"
          placeholder={['Від', 'До']}
          presets={periodPresets()}
          style={{ width: 240 }}
        />
        {hasFilters(filters) ? (
          <Button type="link" icon={<CloseOutlined />} onClick={resetFilters}>
            Скинути
          </Button>
        ) : null}
        <span className="po-muted" style={{ marginLeft: 'auto' }}>
          {total != null ? `Заявок: ${total}` : ''}
        </span>
      </div>
      {loadError ? (
        <Result
          status="error"
          title="Не вдалося завантажити заявки"
          subTitle={loadError}
          extra={<Button onClick={() => gridApi.current?.refreshInfiniteCache()}>Спробувати ще раз</Button>}
        />
      ) : null}
      <div className="po-grid-wrap" style={loadError ? { display: 'none' } : undefined}>
        <AgGridReact<RequestListItem>
          theme={gridTheme(density)}
          localeText={GRID_LOCALE}
          containerStyle={{ height: '100%' }}
          rowModelType="infinite"
          datasource={datasource}
          cacheBlockSize={PAGE_SIZE}
          maxBlocksInCache={20}
          columnDefs={columns}
          defaultColDef={{ sortable: false, resizable: true, suppressMovable: true }}
          getRowId={(p) => p.data.id}
          onGridReady={(e) => {
            gridApi.current = e.api;
          }}
          overlayNoRowsTemplate="<span>Заявок не знайдено</span>"
          onRowDoubleClicked={(e) => {
            // подвійний клік по «⋯» не відкриває заявку
            if ((e.event?.target as Element | null | undefined)?.closest('.po-reg-actions')) return;
            if (e.data) open(e.data.id);
          }}
          onCellKeyDown={(e) => {
            const ev = e.event as KeyboardEvent | undefined;
            if (ev?.key === 'Enter' && e.data) open(e.data.id);
          }}
          preventDefaultOnContextMenu
          onCellContextMenu={(e) => {
            const ev = e.event as MouseEvent | null | undefined;
            if (!e.data || !ev) return;
            setCtxMenu({ row: e.data, x: ev.clientX, y: ev.clientY });
            setCtxOpen(true);
          }}
          tooltipShowDelay={400}
        />
      </div>
      <Dropdown
        open={ctxOpen}
        onOpenChange={(o) => {
          if (!o) setCtxOpen(false);
        }}
        trigger={['click']}
        menu={{
          items: ROW_MENU_ITEMS,
          onClick: ({ key }) => {
            setCtxOpen(false);
            if (ctxMenu) runRowAction(ctxMenu.row, key);
          },
        }}
      >
        <span style={{ position: 'fixed', left: ctxMenu?.x ?? 0, top: ctxMenu?.y ?? 0, width: 1, height: 1, pointerEvents: 'none' }} />
      </Dropdown>
      <CreateRequestDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(id) => open(id)} />
      <CopyRequestDialog source={copySource} onClose={() => setCopySource(null)} />
    </div>
  );
}
