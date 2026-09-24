// Вікно вибору товару (§6.7): пошук по всьому каталогу (артикул/назви), фільтр постачальника, вибір 1–3 товарів
// різних постачальників → пропозиції в блоках їх постачальників (блоки створюються автоматично).
import { GlobalOutlined, LoadingOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert, App, Button, Dropdown, Empty, Input, Modal, Select, Space, Table, Tag, Tooltip, Typography, type TableColumnsType } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AVAILABILITY_LABELS, CURRENCY_LABELS, type AvailabilityStatus } from '@shared/enums';
import { formatDate, formatMoney, formatPct, formatQty, formatRate } from '@shared/format';
import { normalizeUnit } from '@shared/parse';
import { offerDisplayName } from '@shared/pricing';
import type { Offer, ProductPickDto, SupplierRef, UUID } from '@shared/types';
import { SupplierLogo } from '@/components/SupplierLogo';
import { ds } from '@/data';
import { errorMessage } from '@/data/errors';
import { toSupplierRef } from '@/lib/supplierRef';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { getRequestDocStore, useRequestDoc } from '@/stores/requestDocStore';
import { CreateProductDialog } from './CreateProductDialog';
import { usePickerStore, type PickerRequest } from './pickerStore';
import { buildPickerRows, looksLikeSku, MAX_PICK, siteSearchUrl, toggleSelection, type PickerRow } from './results';
import './ProductPicker.css';

export interface ProductPickerHostProps {
  /** Після додавання товарів у рядок (наприклад, прибрати підказки невдалих артикулів у цих блоках). */
  onAdded?(info: { lineId: UUID; blockIds: UUID[] }): void;
}

/** Скільки найкращих збігів показує вікно; мінімальна довжина запиту. */
const SEARCH_LIMIT = 50;
const MIN_QUERY = 2;

const STOCK_SHORT: Record<AvailabilityStatus, string> = {
  in_stock: 'є',
  low_stock: 'мало',
  out_of_stock: 'немає',
  on_order: 'під замовл.',
  unknown: '',
};

function priceTitle(r: PickerRow): string {
  const p = r.product;
  if (p.purchasePrice == null) return 'Немає вхідної ціни';
  const parts = [`${formatMoney(p.purchasePrice)} ${CURRENCY_LABELS[p.currency]} без ПДВ`];
  if (p.currency !== 'UAH') parts.push(`× ${r.blockId ? 'курс блоку' : 'курс постачальника'} ${formatRate(r.rate) || 'немає'}`);
  if (r.supplierMarkupPct) parts.push(`+ ${formatPct(r.supplierMarkupPct)} націнки постачальника`);
  if (r.cheapestInGroup) parts.push('(найдешевший серед однакових назв)');
  return parts.join(' ');
}

function PickerBody({ request, onClose, onAdded }: { request: PickerRequest; onClose(): void; onAdded?: ProductPickerHostProps['onAdded'] }) {
  const { message, modal } = App.useApp();
  const doc = useRequestDoc((s) => s.doc);
  const ctx = useRequestDoc((s) => s.ctx);
  const suppliers = useRequestDoc((s) => s.suppliers);
  const readOnly = useRequestDoc((s) => s.readOnly);
  const line = doc?.lines.find((l) => l.id === request.lineId) ?? null;

  const [query, setQuery] = useState(request.query);
  const q = useDebouncedValue(query.trim(), 150);
  const [supplierId, setSupplierId] = useState<UUID | 'all'>(request.supplierId ?? 'all');
  const [selected, setSelected] = useState<ProductPickDto[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  // шукаємо від 2 символів: одна літера дає випадковий список і пропозицію «Створити товар» не до місця
  const searchable = q.length >= MIN_QUERY;
  const search = useQuery({
    queryKey: ['product-search', q, supplierId],
    queryFn: () => ds.searchProducts({ q, supplierId: supplierId === 'all' ? null : supplierId, limit: SEARCH_LIMIT }),
    enabled: searchable,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const results = searchable ? search.data : undefined;

  const supplierRef = useCallback(
    (id: UUID): SupplierRef | null => {
      const inDoc = doc?.refs.suppliers[id];
      if (inDoc) return inDoc;
      const s = suppliers.find((x) => x.id === id);
      return s ? toSupplierRef(s) : null;
    },
    [doc, suppliers],
  );

  const rows = useMemo(
    () => (doc && ctx && line && results ? buildPickerRows(results, { doc, ctx, line, supplierRef }) : []),
    [doc, ctx, line, results, supplierRef],
  );

  const toggle = (p: ProductPickDto) => {
    const res = toggleSelection(selected, p);
    if (res.limited) message.info(`Можна обрати до ${MAX_PICK} товарів різних постачальників`);
    setSelected(res.selected);
  };

  const add = (products: ProductPickDto[]) => {
    const s = getRequestDocStore().getState();
    if (s.readOnly || !s.doc) {
      message.warning('Заявка відкрита лише для перегляду');
      return;
    }
    const ln = s.doc.lines.find((l) => l.id === request.lineId);
    if (!ln) {
      message.error('Рядок заявки видалено');
      return;
    }
    if (!products.length) return;
    // заміна наявної пропозиції в блоці — з підтвердженням (крім явної «Замінити товар» у цьому блоці)
    const conflicts = products.flatMap((p) => {
      const block = s.doc!.blocks.find((b) => b.supplierId === p.supplierId);
      const offer = block ? s.findOffer(ln.id, block.id) : undefined;
      if (!block || !offer || offer.productId === p.id) return [];
      if (request.mode === 'replace' && block.id === request.blockId) return [];
      return [{ supplier: supplierRef(p.supplierId)?.name ?? p.supplierName, from: [offer.sku, offerDisplayName(offer)].filter(Boolean).join(' '), to: `${p.sku} ${p.nameWork}` }];
    });
    const run = () => {
      const res = getRequestDocStore().getState().addProductsToLine(ln.id, products);
      if (!res.offerIds.length) {
        message.error('Не вдалося додати товари: заявка відкрита лише для перегляду');
        return;
      }
      const after = getRequestDocStore().getState().doc;
      const qty = after?.lines.find((l) => l.id === ln.id)?.qty ?? ln.qty;
      const offers = res.offerIds.map((id) => after?.offers.find((o) => o.id === id)).filter((o): o is Offer => !!o);
      const parts = [`Додано в рядок № ${ln.position}: ${res.offerIds.length}`];
      if (res.createdBlockIds.length) parts.push(`нових блоків: ${res.createdBlockIds.length}`);
      if (res.replaced) parts.push(`замінено: ${res.replaced}`);
      message.success(parts.join(', '));
      for (const o of offers) {
        if (o.qty != null && o.qty !== qty) {
          message.info(`${o.sku ?? 'Товар'}: к-сть округлено з ${formatQty(qty)} до ${formatQty(o.qty)}, кратно ${formatQty(o.multiplicity)}`);
        }
      }
      onAdded?.({ lineId: ln.id, blockIds: offers.map((o) => o.blockId) });
      onClose();
    };
    if (!conflicts.length) {
      run();
      return;
    }
    modal.confirm({
      title: conflicts.length === 1 ? 'Замінити наявну пропозицію?' : `Замінити наявні пропозиції (${conflicts.length})?`,
      content: (
        <div className="po-picker-conflicts">
          {conflicts.map((c) => (
            <div key={c.supplier}>
              <b>{c.supplier}:</b> {c.from} → {c.to}
            </div>
          ))}
        </div>
      ),
      okText: 'Замінити',
      cancelText: 'Скасувати',
      onOk: run,
    });
  };

  if (!doc || !line) {
    return (
      <Empty description="Рядок заявки видалено">
        <Button onClick={onClose}>Закрити</Button>
      </Empty>
    );
  }

  // ── створити товар / сайт постачальника ─────────────────────────
  const targetSupplierId = supplierId !== 'all' ? supplierId : request.supplierId;
  const targetBlockId = targetSupplierId ? (doc.blocks.find((b) => b.supplierId === targetSupplierId)?.id ?? null) : null;
  const skuLike = looksLikeSku(query);
  const siteQuery = query.trim() || line.clientName;
  const siteSuppliers = (supplierId !== 'all' ? [supplierRef(supplierId)] : suppliers.filter((s) => s.isActive).map(toSupplierRef))
    .filter((s): s is SupplierRef => !!s)
    .flatMap((s) => {
      const url = siteSearchUrl(s.searchUrlTemplate, {
        query: siteQuery,
        sku: selected.find((p) => p.supplierId === s.id)?.sku ?? (skuLike ? siteQuery : null),
      });
      return url ? [{ supplier: s, url }] : [];
    });
  const openSite = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');
  const siteButton =
    siteSuppliers.length === 1 ? (
      <Button icon={<GlobalOutlined />} onClick={() => openSite(siteSuppliers[0].url)}>
        Знайти на сайті {siteSuppliers[0].supplier.name}
      </Button>
    ) : siteSuppliers.length ? (
      <Dropdown
        trigger={['click']}
        menu={{
          items: siteSuppliers.map((x) => ({
            key: x.supplier.id,
            label: <SupplierLogo name={x.supplier.name} logoUrl={x.supplier.logoUrl} color={x.supplier.color} size={16} showName />,
          })),
          onClick: ({ key }) => {
            const x = siteSuppliers.find((y) => y.supplier.id === key);
            if (x) openSite(x.url);
          },
        }}
      >
        <Button icon={<GlobalOutlined />}>Знайти на сайті постачальника</Button>
      </Dropdown>
    ) : null;

  const replaceTarget = request.mode === 'replace' && request.blockId ? doc.blocks.find((b) => b.id === request.blockId) : undefined;
  const replacing = !!replaceTarget && selected.length === 1 && selected[0].supplierId === replaceTarget.supplierId;
  const fuzzy = rows.some((r) => r.product.matchKind === 'fuzzy');

  const columns: TableColumnsType<PickerRow> = [
    {
      key: 'supplier',
      title: <span title="Постачальник">Пост.</span>,
      width: 48,
      render: (_, r) =>
        r.supplier ? (
          <Tooltip title={r.supplier.name}>
            <span>
              <SupplierLogo name={r.supplier.name} logoUrl={r.supplier.logoUrl} color={r.supplier.color} size={20} />
            </span>
          </Tooltip>
        ) : null,
    },
    {
      key: 'sku',
      title: 'Артикул',
      width: 104,
      render: (_, r) => <span className={r.product.matchKind === 'sku_exact' ? 'po-num po-picker-sku-hit' : 'po-num'}>{r.product.sku}</span>,
    },
    {
      key: 'name',
      title: 'Назва',
      ellipsis: { showTitle: false },
      render: (_, r) => (
        <Tooltip title={r.product.matchKind === 'fuzzy' ? `${r.product.nameWork} (частковий збіг)` : r.product.nameWork} placement="topLeft" mouseEnterDelay={0.5}>
          <span>
            {r.inLine ? <Tag color="blue">уже в рядку</Tag> : null}
            {r.product.missingSince ? (
              <Tag color="red" bordered={false} title="Товару немає в останньому прайсі постачальника: ціна остання відома">
                немає у прайсі з {formatDate(r.product.missingSince)}
              </Tag>
            ) : null}
            {r.product.nameWork}
          </span>
        </Tooltip>
      ),
    },
    { key: 'unit', title: 'Од.', width: 46, render: (_, r) => r.product.unitCode },
    {
      key: 'mult',
      title: 'Кратн.',
      width: 58,
      align: 'right',
      render: (_, r) => (
        <span className={r.product.multiplicity !== 1 ? 'po-num po-picker-mult' : 'po-num po-muted'}>{formatQty(r.product.multiplicity)}</span>
      ),
    },
    {
      key: 'net',
      title: 'Вхід без ПДВ, грн',
      width: 104,
      align: 'right',
      sorter: (a, b) => (a.unitNetUah ?? Number.POSITIVE_INFINITY) - (b.unitNetUah ?? Number.POSITIVE_INFINITY),
      render: (_, r) => (
        <span className={r.cheapestInGroup ? 'po-num po-picker-min' : 'po-num'} title={priceTitle(r)}>
          {formatMoney(r.unitNetUah)}
        </span>
      ),
    },
    { key: 'rrp', title: 'РРЦ з ПДВ, грн', width: 96, align: 'right', render: (_, r) => <span className="po-num po-rrp">{formatMoney(r.rrpGrossUah)}</span> },
    {
      key: 'stock',
      title: 'Наявність',
      width: 88,
      render: (_, r) => {
        const p = r.product;
        const low = p.availability === 'out_of_stock' || (p.stockQty != null && p.stockQty < line.qty);
        return (
          <span className={low ? 'po-num po-picker-warn' : 'po-num'} title={AVAILABILITY_LABELS[p.availability]}>
            {p.stockQty != null ? formatQty(p.stockQty) : STOCK_SHORT[p.availability]}
          </span>
        );
      },
    },
    {
      key: 'date',
      title: 'Дата ціни',
      width: 88,
      render: (_, r) => (
        <span className={r.product.isStale ? 'po-num po-picker-warn' : 'po-num'} title={r.product.isStale ? 'Ціна застаріла: перевірте на сайті постачальника' : undefined}>
          {formatDate(r.product.priceUpdatedAt)}
        </span>
      ),
    },
  ];

  const emptyText =
    searchable && search.isFetching ? (
      'Шукаю…'
    ) : q.length > 0 && !searchable ? (
      'Введіть щонайменше 2 символи'
    ) : (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={q ? `Нічого не знайдено за «${q}»` : 'Введіть артикул або назву'}>
        {q && !readOnly ? (
          <Button icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            Створити товар
          </Button>
        ) : null}
      </Empty>
    );

  return (
    <div className="po-picker">
      <div className="po-picker-line">
        Рядок № {line.position}: <b>{line.clientName || 'без назви'}</b>
        <span className="po-muted po-num">
          {' '}
          · {formatQty(line.qty)} {line.clientUnit ?? ''}
        </span>
        {replaceTarget ? <Tag style={{ marginLeft: 8 }}>заміна товару в блоці {supplierRef(replaceTarget.supplierId ?? '')?.name ?? ''}</Tag> : null}
      </div>
      <div className="po-picker-controls">
        <Input
          autoFocus
          allowClear
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={(e) => e.target.select()}
          prefix={<SearchOutlined className="po-muted" />}
          // новий пошук іде — спінер, попередні результати лишаються видимими до відповіді
          suffix={searchable && search.isFetching && search.data ? <LoadingOutlined className="po-muted" /> : <span />}
          placeholder="Артикул або назва (усі слова)"
        />
        <Select<UUID | 'all'>
          value={supplierId}
          onChange={setSupplierId}
          style={{ width: 240, flex: 'none' }}
          options={[
            { value: 'all', label: 'Усі постачальники' },
            ...suppliers
              .filter((s) => s.isActive || doc.blocks.some((b) => b.supplierId === s.id))
              .map((s) => ({ value: s.id, label: <SupplierLogo name={s.name} logoUrl={s.logoUrl} color={s.color} size={16} showName /> })),
          ]}
        />
      </div>
      {search.isError ? <Alert type="error" showIcon message={errorMessage(search.error)} style={{ marginBottom: 8 }} /> : null}
      {fuzzy ? (
        <Typography.Text type="secondary" className="po-picker-hint">
          Сірим позначено частковий збіг: знайдено не всі слова запиту. Однакові назви стоять поруч, найдешевша позначена зеленим.
        </Typography.Text>
      ) : null}
      <Table<PickerRow>
        size="small"
        rowKey="key"
        tableLayout="fixed"
        pagination={false}
        dataSource={rows}
        columns={columns}
        loading={searchable && search.isFetching && !search.data}
        scroll={{ y: 380 }}
        locale={{ emptyText }}
        rowClassName={(r) => (r.product.matchKind === 'fuzzy' ? 'po-picker-fuzzy' : '')}
        rowSelection={{
          type: 'checkbox',
          columnWidth: 36,
          hideSelectAll: true,
          preserveSelectedRowKeys: true,
          selectedRowKeys: selected.map((p) => p.id),
          onSelect: (r) => toggle(r.product),
          getCheckboxProps: () => ({ disabled: readOnly }),
        }}
        onRow={(r) => ({
          onClick: (e) => {
            if (readOnly || (e.target as HTMLElement).closest('.ant-checkbox-wrapper, .ant-table-selection-column')) return;
            toggle(r.product);
          },
          onDoubleClick: () => {
            if (!readOnly) add([r.product]);
          },
        })}
      />
      {results && results.length >= SEARCH_LIMIT ? (
        <Typography.Text type="secondary" className="po-picker-hint">
          Показано {SEARCH_LIMIT} найкращих збігів. Уточніть запит, щоб знайти інший товар.
        </Typography.Text>
      ) : null}
      <div className="po-picker-selected">
        {selected.length ? (
          <>
            <span className="po-muted">
              Обрано ({selected.length}/{MAX_PICK}):
            </span>
            {selected.map((p) => {
              const s = supplierRef(p.supplierId);
              return (
                <Tag
                  key={p.id}
                  closable
                  onClose={(e) => {
                    e.preventDefault();
                    toggle(p);
                  }}
                >
                  {s ? <SupplierLogo name={s.name} logoUrl={s.logoUrl} color={s.color} size={14} /> : null} <span className="po-num">{p.sku}</span>
                </Tag>
              );
            })}
          </>
        ) : (
          <span className="po-muted">Оберіть 1–3 товари різних постачальників (клік по рядку; подвійний клік додає один товар одразу)</span>
        )}
      </div>
      <div className="po-dialog-footer">
        <Button icon={<PlusOutlined />} disabled={readOnly} onClick={() => setCreateOpen(true)}>
          Створити товар
        </Button>
        {siteButton}
        <span className="po-picker-spacer" />
        <Space>
          <Button onClick={onClose}>Скасувати</Button>
          <Button type="primary" disabled={readOnly || !selected.length} onClick={() => add(selected)}>
            {replacing ? 'Замінити товар' : `Додати в заявку${selected.length ? ` (${selected.length})` : ''}`}
          </Button>
        </Space>
      </div>
      <CreateProductDialog
        open={createOpen}
        lineId={line.id}
        blockId={targetBlockId}
        supplierId={targetSupplierId ?? null}
        initial={{
          sku: skuLike ? query.trim() : '',
          nameWork: skuLike ? line.clientName : query.trim() || line.clientName,
          unitCode: normalizeUnit(line.clientUnit),
        }}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          onAdded?.({ lineId: line.id, blockIds: targetBlockId ? [targetBlockId] : [] });
          onClose();
        }}
      />
    </div>
  );
}

export function ProductPickerHost({ onAdded }: ProductPickerHostProps) {
  const request = usePickerStore((s) => s.request);
  const close = usePickerStore((s) => s.close);
  // під час анімації закриття показуємо останній запит
  const [last, setLast] = useState<PickerRequest | null>(null);
  useEffect(() => {
    if (request) setLast(request);
  }, [request]);
  const shown = request ?? last;
  return (
    <Modal
      open={!!request}
      width={1120}
      footer={null}
      destroyOnHidden
      onCancel={close}
      afterClose={() => setLast(null)}
      title={
        <span>
          <SearchOutlined /> Вибір товару в каталозі
        </span>
      }
    >
      {shown ? <PickerBody key={`${shown.lineId}:${shown.blockId ?? ''}:${shown.mode}`} request={shown} onClose={close} onAdded={onAdded} /> : null}
    </Modal>
  );
}
