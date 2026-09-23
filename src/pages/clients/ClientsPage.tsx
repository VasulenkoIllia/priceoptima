import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Input } from 'antd';
import type { ColDef } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { useMemo, useState } from 'react';
import { formatDate } from '@shared/format';
import type { ClientDetail, ClientListItem, UUID } from '@shared/types';
import { LoadError, PageHeader } from '@/components';
import { ds, qk } from '@/data';
import { GRID_LOCALE, gridTheme } from '@/lib/agGrid';
import { useUiPrefs } from '@/stores/uiPrefsStore';
import { ClientDrawer } from './ClientDrawer';
import { ClientFormDialog } from './ClientFormDialog';
import './clients.css';

const counterpartiesLabel = (c: ClientListItem) =>
  c.counterparties.map((cp) => (cp.edrpou ? `${cp.nameShort} (${cp.edrpou})` : cp.nameShort)).join(', ');

const COLUMNS: ColDef<ClientListItem>[] = [
  { headerName: 'Клієнт', field: 'name', width: 200, cellStyle: { fontWeight: 600 } },
  { headerName: 'Контрагенти', colId: 'counterparties', valueGetter: (p) => (p.data ? counterpartiesLabel(p.data) : ''), flex: 1, minWidth: 260, tooltipValueGetter: (p) => p.value },
  { headerName: 'Контакти', field: 'contactsCount', width: 100, type: 'rightAligned', cellClass: 'po-num' },
  { headerName: 'Відповідальний', colId: 'responsible', valueGetter: (p) => p.data?.responsible?.shortName ?? '', width: 150 },
  { headerName: 'Заявок', field: 'requestsCount', width: 90, type: 'rightAligned', cellClass: 'po-num' },
  { headerName: 'Остання заявка', field: 'lastRequestDate', width: 132, cellClass: 'po-num', valueFormatter: (p) => formatDate(p.value) },
];

/** Клієнти: пошук, картка з контрагентами, контактами й заявками; створення і редагування. */
export default function ClientsPage() {
  const density = useUiPrefs((s) => s.density);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<{ id: UUID; name?: string } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<{ open: boolean; client: ClientDetail | null }>({ open: false, client: null });

  const clients = useQuery({ queryKey: qk.clients, queryFn: () => ds.listClients() });

  const rows = useMemo(() => {
    const tokens = search.toLocaleLowerCase('uk').split(/\s+/u).filter(Boolean);
    const list = clients.data ?? [];
    if (!tokens.length) return list;
    return list.filter((c) => {
      const text = [c.name, ...c.counterparties.flatMap((cp) => [cp.nameShort, cp.edrpou ?? ''])].join(' ').toLocaleLowerCase('uk');
      return tokens.every((t) => text.includes(t));
    });
  }, [clients.data, search]);

  const openClient = (id: UUID, name?: string) => {
    setSelected({ id, name });
    setDrawerOpen(true);
  };

  return (
    <div className="po-page">
      <PageHeader
        title="Клієнти"
        subtitle="Клієнт → контрагенти (юрособи) → контактні особи"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setForm({ open: true, client: null })}>
            Новий клієнт
          </Button>
        }
      />
      <div className="po-toolbar">
        <Input
          allowClear
          prefix={<SearchOutlined className="po-muted" />}
          placeholder="Пошук: клієнт, контрагент, ЄДРПОУ"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 320 }}
        />
        <span className="po-muted" style={{ marginLeft: 'auto' }}>
          {clients.data ? `Клієнтів: ${rows.length}` : ''}
        </span>
      </div>
      {clients.isError ? (
        <LoadError title="Не вдалося завантажити клієнтів" error={clients.error} onRetry={clients.refetch} />
      ) : (
        <div className="po-grid-wrap">
          <AgGridReact<ClientListItem>
            theme={gridTheme(density)}
            localeText={GRID_LOCALE}
            containerStyle={{ height: '100%' }}
            rowData={rows}
            columnDefs={COLUMNS}
            defaultColDef={{ sortable: true, resizable: true, suppressMovable: true }}
            getRowId={(p) => p.data.id}
            rowClass="po-cli-row"
            loading={clients.isPending}
            overlayNoRowsTemplate="<span>Клієнтів не знайдено</span>"
            onRowClicked={(e) => e.data && openClient(e.data.id, e.data.name)}
            onCellKeyDown={(e) => {
              const ev = e.event as KeyboardEvent | undefined;
              if (ev?.key === 'Enter' && e.data) openClient(e.data.id, e.data.name);
            }}
            tooltipShowDelay={400}
          />
        </div>
      )}
      <ClientDrawer
        open={drawerOpen}
        clientId={selected?.id ?? null}
        fallbackTitle={selected?.name}
        onClose={() => setDrawerOpen(false)}
        onEdit={(client) => setForm({ open: true, client })}
      />
      <ClientFormDialog
        open={form.open}
        client={form.client}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
        onSaved={(id) => openClient(id)}
      />
    </div>
  );
}
