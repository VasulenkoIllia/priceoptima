// «Націнка»: рядок сітки, клітинки, поле % заявки, підсумок і розбивка прибутку по постачальниках (винесено з MarkupTab.tsx).
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { InputNumber, Popover, Select, Table, Tooltip } from 'antd';
import type { ICellRendererParams, SuppressKeyboardEventParams } from 'ag-grid-community';
import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { MARKUP_METHOD_LABELS, MARKUP_METHODS, type MarkupMethod } from '@shared/enums';
import { formatMoney, formatPct } from '@shared/format';
import { offerDisplayName } from '@shared/pricing';
import type { MarkupRowComputed, Offer, RequestComputed, RequestDocument, RequestLine, SupplierProfit, SupplierRef, UUID } from '@shared/types';
import { SupplierLogo } from '@/components/SupplierLogo';
import { WarningBadge } from '@/components/WarningBadge';

export interface MarkupRow {
  id: UUID;
  line: RequestLine;
  mr: MarkupRowComputed;
  offer: Offer | null;
  supplier: SupplierRef | null;
}

export type MethodChoice = MarkupMethod | 'default';

export interface MarkupGridContext {
  readOnly(): boolean;
  defaultMethod(): MarkupMethod;
  setMethod(row: MarkupRow, value: MethodChoice): void;
  /** Куточок клітинки «Спосіб» / «%» — протягнути правило рядка в рядки нижче (вище), як в Excel. */
  onFillStart(e: ReactMouseEvent<HTMLElement>, row: MarkupRow, colId: string): void;
}

/** Колонки, які протягуються (правки замовника 23.09 п.9). */
export const FILL_COLS = new Set(['method', 'value']);
export const FILL_HINT = 'Потягніть за куточок униз, щоб застосувати спосіб і % цього рядка до рядків нижче (як в Excel). Ctrl+D: взяти з рядка вище';
/** Ctrl+D (на Mac і Cmd+D) — з рядка вище, як в Excel; розкладка неважлива (e.code). */
export const isFillKey = (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.code === 'KeyD' || e.key.toLowerCase() === 'd');
/** Ctrl+D не віддаємо браузеру (у Safari це «додати закладку»). */
export const suppressFillKey = (p: SuppressKeyboardEventParams<MarkupRow>) => {
  const hit = !p.editing && p.event.type === 'keydown' && isFillKey(p.event);
  if (hit) p.event.preventDefault();
  return hit;
};

/** Куточок для протягування (видно на клітинці з фокусом). */
function FillHandle({ row, colId, context }: { row: MarkupRow; colId: string; context: MarkupGridContext }) {
  if (context.readOnly() || !row.offer) return null;
  return <span className="po-fill-handle" title={FILL_HINT} onMouseDown={(e) => context.onFillStart(e, row, colId)} />;
}

/** «%» рядка + куточок для протягування. */
export function ValueCell(p: P) {
  const text = p.valueFormatted ?? '';
  if (!p.data) return <>{text}</>;
  return (
    <>
      {text}
      <FillHandle row={p.data} colId="value" context={p.context} />
    </>
  );
}

type P = ICellRendererParams<MarkupRow, unknown, MarkupGridContext>;

export const isPctMethod = (m: MarkupMethod) => m === 'markup_on_cost' || m === 'discount_from_rrp';
export const hasOverride = (l: RequestLine) =>
  l.markup.method != null || l.markup.value != null || l.markup.manualPriceNet != null || l.markup.manualPriceGross != null;
export const REQUEST_METHODS = MARKUP_METHODS.filter((m) => m !== 'manual');
export const money = (v: unknown) => formatMoney(v as number | null);
export const pct = (v: unknown) => formatPct(v as number | null, 1);

export function ProductCell({ data }: P) {
  if (!data) return null;
  if (!data.offer) return <span className="po-muted">не підібрано, у КП не увійде</span>;
  const name = offerDisplayName(data.offer) ?? '';
  return (
    <span className="po-mk-product po-wrap">
      {data.supplier ? <SupplierLogo name={data.supplier.name} logoUrl={data.supplier.logoUrl} color={data.supplier.color} size={16} /> : null}
      <span>
        <span className="po-num po-muted">{data.offer.sku}</span> {name}
      </span>
    </span>
  );
}

/** Постачальник обраної пропозиції — значок і назва: з самого логотипа не видно, чий товар (правки замовника 25.09 п.10). */
export function SupplierCell({ data }: P) {
  if (!data?.offer || !data.supplier) return null;
  return <SupplierLogo name={data.supplier.name} logoUrl={data.supplier.logoUrl} color={data.supplier.color} size={16} showName />;
}

export function MethodCell({ data, context }: P) {
  if (!data) return null;
  const m = data.line.markup;
  const value: MethodChoice = m.manualPriceNet != null || m.manualPriceGross != null ? 'manual' : (m.method ?? 'default');
  return (
    <>
      <Select<MethodChoice>
        size="small"
        variant="borderless"
        value={value}
        disabled={context.readOnly() || !data.offer}
        popupMatchSelectWidth={false}
        className={value === 'default' ? 'po-mk-method po-mk-method-default' : 'po-mk-method'}
        options={[
          { value: 'default', label: 'Як у заявці', title: `Як у заявці: ${MARKUP_METHOD_LABELS[context.defaultMethod()]}` },
          ...MARKUP_METHODS.map((x) => ({ value: x, label: MARKUP_METHOD_LABELS[x] })),
        ]}
        onChange={(v) => context.setMethod(data, v)}
      />
      <FillHandle row={data} colId="method" context={context} />
    </>
  );
}

export function WarnCell({ data }: P) {
  if (!data) return null;
  return (
    <span className="po-mk-warn">
      {data.mr.notApproved ? (
        <Tooltip title="Не затверджено ✔: ціна від рекомендованої (мінімальної) пропозиції">
          <ExclamationCircleOutlined style={{ color: 'var(--po-warning)' }} />
        </Tooltip>
      ) : null}
      <WarningBadge warnings={data.mr.warnings} />
    </span>
  );
}

/** Значення % для заявки: зберігається при втраті фокусу або Enter (одна дія для undo). */
export function PctInput({ value, max, disabled, onCommit }: { value: number; max: number; disabled: boolean; onCommit(v: number): void }) {
  const [draft, setDraft] = useState<number | null>(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft != null && draft !== value) onCommit(draft);
    else setDraft(value);
  };
  return (
    <InputNumber
      size="small"
      min={0}
      max={max}
      decimalSeparator=","
      value={draft}
      disabled={disabled}
      onChange={setDraft}
      onBlur={commit}
      onPressEnter={commit}
      suffix="%"
      style={{ width: 96 }}
    />
  );
}

export function Stat({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'good' }) {
  return (
    <div className="po-mk-stat">
      <span className="po-mk-stat-label">{label}</span>
      <span className={`po-num po-mk-stat-value${strong ? ' po-mk-stat-strong' : ''}${tone === 'good' ? ' po-mk-stat-good' : ''}`}>{value}</span>
    </div>
  );
}

interface ProfitRow extends SupplierProfit {
  supplier: SupplierRef | null;
}

/** Заробіток по постачальниках: за поточним вибором і «якщо все в цього постачальника». */
export function SupplierProfitBreakdown({ doc, computed }: { doc: RequestDocument; computed: RequestComputed }) {
  // ФОП: вхід з ПДВ (він його не повертає), продаж — за цінами КП ФОП
  const fop = doc.header.kpSettings.vatMode === 'no_vat';
  const rows = useMemo<ProfitRow[]>(
    () =>
      [...doc.blocks]
        .sort((a, b) => a.position - b.position)
        .flatMap((b) => {
          const p = computed.supplierProfit[b.id];
          return p ? [{ ...p, supplier: b.supplierId ? (doc.refs.suppliers[b.supplierId] ?? null) : null }] : [];
        }),
    [doc, computed],
  );
  if (!rows.length) return null;
  const used = rows.filter((r) => r.selected.lines > 0);
  const table = (
    <Table<ProfitRow>
      size="small"
      pagination={false}
      rowKey="blockId"
      dataSource={rows}
      columns={[
        {
          title: 'Постачальник',
          render: (_, r) => <SupplierLogo name={r.supplier?.name ?? 'Постачальник'} logoUrl={r.supplier?.logoUrl} color={r.supplier?.color} size={16} showName />,
        },
        { title: 'Обрано рядків', align: 'right', render: (_, r) => r.selected.lines },
        { title: 'Вхід з ПДВ', align: 'right', className: 'po-num', render: (_, r) => formatMoney(r.selected.costGross) },
        { title: fop ? 'Продаж як у КП' : 'Продаж з ПДВ', align: 'right', className: 'po-num', render: (_, r) => formatMoney(r.selected.saleGross) },
        {
          title: fop ? 'Прибуток' : 'Прибуток з ПДВ',
          align: 'right',
          className: 'po-num',
          render: (_, r) => <b className="po-mk-stat-good">{formatMoney(r.selected.profitGross)}</b>,
        },
        { title: 'Націнка', align: 'right', className: 'po-num', render: (_, r) => formatPct(r.selected.markupPct, 1) },
        {
          title: <Tooltip title="Якби всі рядки з ціною в цього постачальника брали в нього">Якщо все тут</Tooltip>,
          align: 'right',
          className: 'po-num',
          render: (_, r) => `${formatMoney(r.allIn.profitGross)} (${r.allIn.lines} рядк.)`,
        },
      ]}
    />
  );
  return (
    <Popover content={table} title={fop ? 'Прибуток по постачальниках (ФОП: продаж мінус вхід з ПДВ)' : 'Прибуток по постачальниках з ПДВ'} placement="topLeft">
      <div className="po-mk-stat po-mk-by-supplier">
        <span className="po-mk-stat-label">{fop ? 'По постачальниках' : 'По постачальниках з ПДВ'}</span>
        <span className="po-mk-sup-list">
          {used.length
            ? used.map((r) => (
                <span key={r.blockId} className="po-mk-sup">
                  <SupplierLogo name={r.supplier?.name ?? 'Постачальник'} logoUrl={r.supplier?.logoUrl} color={r.supplier?.color} size={14} />
                  <span className="po-num">{formatMoney(r.selected.profitGross)}</span>
                </span>
              ))
            : null}
        </span>
      </div>
    </Popover>
  );
}
