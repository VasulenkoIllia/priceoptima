// Вкладка «Націнка» (НАЦ-1…НАЦ-5): ціна продажу кожного рядка від обраної пропозиції — спосіб для заявки й для рядка,
// ручна ціна (без ПДВ або з ПДВ), попередження й підсумки в режимі цін КП. Коригувати ціни для клієнта можна лише тут, у заявці.
import { ArrowRightOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { App, Button, InputNumber, Popover, Segmented, Select, Table, Tag, Tooltip } from 'antd';
import type { CellEditRequestEvent, ColDef, ICellRendererParams, RowClassParams } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { DISCOUNT_FORMULAS, DISCOUNT_FORMULA_LABELS, MARKUP_METHOD_LABELS, MARKUP_METHODS, type DiscountFormula, type KpVatMode, type MarkupMethod } from '@shared/enums';
import { formatMoney, formatPct, formatQty } from '@shared/format';
import { parseLocaleNumber } from '@shared/parse';
import { isActiveLine, kpChecks, markupValueMax, offerDisplayName } from '@shared/pricing';
import type { MarkupRowComputed, Offer, RequestComputed, RequestDocument, RequestLine, SupplierProfit, SupplierRef, UUID } from '@shared/types';
import { SupplierLogo } from '@/components/SupplierLogo';
import { WarningBadge } from '@/components/WarningBadge';
import { GRID_LOCALE, gridTheme } from '@/lib/agGrid';
import { getRequestDocStore, useRequestComputed, useRequestDoc } from '@/stores/requestDocStore';
import { useUiPrefs } from '@/stores/uiPrefsStore';

interface MarkupRow {
  id: UUID;
  line: RequestLine;
  mr: MarkupRowComputed;
  offer: Offer | null;
  supplier: SupplierRef | null;
}

type MethodChoice = MarkupMethod | 'default';

interface MarkupGridContext {
  readOnly(): boolean;
  defaultMethod(): MarkupMethod;
  setMethod(row: MarkupRow, value: MethodChoice): void;
}

type P = ICellRendererParams<MarkupRow, unknown, MarkupGridContext>;

const isPctMethod = (m: MarkupMethod) => m === 'markup_on_cost' || m === 'discount_from_rrp';
const hasOverride = (l: RequestLine) =>
  l.markup.method != null || l.markup.value != null || l.markup.manualPriceNet != null || l.markup.manualPriceGross != null;
const REQUEST_METHODS = MARKUP_METHODS.filter((m) => m !== 'manual');
const money = (v: unknown) => formatMoney(v as number | null);
const pct = (v: unknown) => formatPct(v as number | null, 1);

function ProductCell({ data }: P) {
  if (!data) return null;
  if (!data.offer) return <span className="po-muted">не підібрано, у КП не увійде</span>;
  const name = offerDisplayName(data.offer) ?? '';
  return (
    <span className="po-mk-product" title={`${data.offer.sku ?? ''} ${name}`}>
      {data.supplier ? <SupplierLogo name={data.supplier.name} logoUrl={data.supplier.logoUrl} color={data.supplier.color} size={16} /> : null}
      <span className="po-num po-muted">{data.offer.sku}</span>
      <span className="po-mk-ellipsis">{name}</span>
    </span>
  );
}

/** Вхід обраної пропозиції з логотипом постачальника. */
function CostCell({ data }: P) {
  if (!data?.offer) return null;
  return (
    <span className="po-mk-cost">
      {data.supplier ? <SupplierLogo name={data.supplier.name} logoUrl={data.supplier.logoUrl} color={data.supplier.color} size={14} /> : null}
      <span className="po-num">{formatMoney(data.mr.costNet)}</span>
    </span>
  );
}

function MethodCell({ data, context }: P) {
  if (!data) return null;
  const m = data.line.markup;
  const value: MethodChoice = m.manualPriceNet != null || m.manualPriceGross != null ? 'manual' : (m.method ?? 'default');
  return (
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
  );
}

function WarnCell({ data }: P) {
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
function PctInput({ value, max, disabled, onCommit }: { value: number; max: number; disabled: boolean; onCommit(v: number): void }) {
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

function Stat({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'good' }) {
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
function SupplierProfitBreakdown({ doc, computed }: { doc: RequestDocument; computed: RequestComputed }) {
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
        { title: fop ? 'Вхід з ПДВ' : 'Вхід без ПДВ', align: 'right', className: 'po-num', render: (_, r) => formatMoney(r.selected.costNet) },
        { title: fop ? 'Продаж як у КП' : 'Продаж без ПДВ', align: 'right', className: 'po-num', render: (_, r) => formatMoney(r.selected.saleNet) },
        {
          title: 'Прибуток',
          align: 'right',
          className: 'po-num',
          render: (_, r) => <b className="po-mk-stat-good">{formatMoney(r.selected.profitNet)}</b>,
        },
        { title: 'Націнка', align: 'right', className: 'po-num', render: (_, r) => formatPct(r.selected.markupPct, 1) },
        {
          title: <Tooltip title="Якби всі рядки з ціною в цього постачальника брали в нього">Якщо все тут</Tooltip>,
          align: 'right',
          className: 'po-num',
          render: (_, r) => `${formatMoney(r.allIn.profitNet)} (${r.allIn.lines} рядк.)`,
        },
      ]}
    />
  );
  return (
    <Popover content={table} title={fop ? 'Прибуток по постачальниках (ФОП: продаж мінус вхід з ПДВ)' : 'Прибуток по постачальниках (без ПДВ)'} placement="topLeft">
      <div className="po-mk-stat po-mk-by-supplier">
        <span className="po-mk-stat-label">По постачальниках</span>
        <span className="po-mk-sup-list">
          {used.length
            ? used.map((r) => (
                <span key={r.blockId} className="po-mk-sup">
                  <SupplierLogo name={r.supplier?.name ?? 'Постачальник'} logoUrl={r.supplier?.logoUrl} color={r.supplier?.color} size={14} />
                  <span className="po-num">{formatMoney(r.selected.profitNet)}</span>
                </span>
              ))
            : null}
        </span>
      </div>
    </Popover>
  );
}

export default function MarkupTab() {
  const { modal, message } = App.useApp();
  const navigate = useNavigate();
  const density = useUiPrefs((s) => s.density);
  const requestId = useRequestDoc((s) => s.requestId);
  const doc = useRequestDoc((s) => s.doc);
  const readOnly = useRequestDoc((s) => s.readOnly);
  const pricing = useRequestDoc((s) => s.ctx?.settings);
  const computed = useRequestComputed();

  const rows = useMemo<MarkupRow[]>(() => {
    if (!doc || !computed) return [];
    const offers = new Map(doc.offers.map((o) => [o.id, o]));
    const blocks = new Map(doc.blocks.map((b) => [b.id, b]));
    return doc.lines.filter(isActiveLine).map((line) => {
      const mr = computed.markup.rows[line.id];
      const offer = mr.effectiveOfferId ? (offers.get(mr.effectiveOfferId) ?? null) : null;
      const supplierId = mr.blockId ? blocks.get(mr.blockId)?.supplierId : null;
      return { id: line.id, line, mr, offer, supplier: supplierId ? (doc.refs.suppliers[supplierId] ?? null) : null };
    });
  }, [doc, computed]);

  // рендери клітинок читають актуальний стан через контекст (стабільний об'єкт)
  const latest = useRef({ readOnly, method: doc?.markup.method ?? 'rrp' });
  latest.current = { readOnly, method: doc?.markup.method ?? 'rrp' };
  const context = useMemo<MarkupGridContext>(
    () => ({
      readOnly: () => latest.current.readOnly,
      defaultMethod: () => latest.current.method,
      setMethod: (row, v) => {
        const s = getRequestDocStore().getState();
        if (v === 'default') s.setLineMarkup(row.id, { method: null, value: null, manualPriceNet: null, manualPriceGross: null });
        else if (v === 'manual') s.setLineMarkup(row.id, { method: 'manual', value: null, manualPriceNet: row.mr.saleNet ?? row.mr.costNet, manualPriceGross: null });
        else s.setLineMarkup(row.id, { method: v, value: v === 'rrp' ? null : (row.mr.value ?? s.doc?.markup.value ?? 0), manualPriceNet: null, manualPriceGross: null });
      },
    }),
    [],
  );

  const vatMode: KpVatMode = doc?.header.kpSettings.vatMode ?? 'without_vat';
  const fopBasis = pricing?.fopPriceBasis ?? 'gross';
  const columns = useMemo<ColDef<MarkupRow>[]>(() => {
    const canEdit = (p: { data?: MarkupRow }) => !latest.current.readOnly && !!p.data?.offer;
    // сума — як у КП: ТОВ з ПДВ і ФОП «на рівні цін з ПДВ» — з ПДВ
    const sumGross = vatMode === 'with_vat' || (vatMode === 'no_vat' && fopBasis === 'gross');
    // найважливіше (вхід → спосіб → ціна продажу → сума → прибуток) — без прокрутки на 1366–1440 px; довідкове — праворуч
    const defs: ColDef<MarkupRow>[] = [
      { headerName: '№', colId: 'n', valueGetter: (p) => p.data?.line.position, width: 48, pinned: 'left', cellClass: 'po-num' },
      {
        headerName: 'Найменування клієнта',
        colId: 'client',
        valueGetter: (p) => p.data?.line.clientName,
        flex: 1,
        minWidth: 170,
        pinned: 'left',
        tooltipValueGetter: (p) => p.value as string,
      },
      {
        headerName: 'К-сть',
        colId: 'qty',
        width: 76,
        type: 'rightAligned',
        cellClass: 'po-num',
        valueGetter: (p) => (p.data ? `${formatQty(p.data.mr.qty)} ${p.data.mr.unit ?? ''}`.trim() : ''),
      },
      {
        headerName: 'Вхід без ПДВ',
        colId: 'cost',
        width: 116,
        cellRenderer: CostCell,
        headerTooltip: 'Ціна обраної пропозиції без ПДВ, грн за од. (C); логотип показує постачальника',
        cellClassRules: { 'po-cell-not-approved': (p) => !!p.data?.mr.notApproved },
      },
      {
        headerName: 'РРЦ з ПДВ',
        colId: 'rrp',
        width: 92,
        type: 'rightAligned',
        cellClass: 'po-num',
        valueGetter: (p) => p.data?.mr.rrpGross,
        valueFormatter: (p) => money(p.value),
      },
      {
        headerName: 'Спосіб',
        colId: 'method',
        width: 150,
        cellRenderer: MethodCell,
        cellClass: 'po-mk-method-cell',
        tooltipValueGetter: (p) =>
          p.data && !hasOverride(p.data.line) ? `Як у заявці: ${MARKUP_METHOD_LABELS[latest.current.method]}` : null,
      },
      {
        headerName: '%',
        colId: 'value',
        width: 64,
        type: 'rightAligned',
        cellClass: 'po-num',
        headerTooltip: 'Націнка на вхід або знижка від РРЦ, % (Enter: змінити)',
        editable: (p) => canEdit(p) && !!p.data && isPctMethod(p.data.mr.method),
        cellEditor: 'agTextCellEditor',
        valueGetter: (p) => (p.data && isPctMethod(p.data.mr.method) ? p.data.mr.value : null),
        valueFormatter: (p) => (p.value == null ? '' : formatPct(p.value as number, 2)),
      },
      {
        headerName: 'Ціна без ПДВ',
        colId: 'saleNet',
        width: 104,
        type: 'rightAligned',
        cellClass: 'po-num po-mk-editable',
        headerTooltip: 'Ціна продажу без ПДВ (N). Введіть ціну, і рядок перейде на «Вручну». Змінюється лише в цій заявці',
        editable: canEdit,
        cellEditor: 'agTextCellEditor',
        valueGetter: (p) => p.data?.mr.saleNet,
        valueFormatter: (p) => money(p.value),
        cellClassRules: { 'po-mk-anchor': (p) => p.data?.mr.priceBasis === 'net' && p.data.mr.saleNet != null },
      },
      {
        headerName: 'Ціна з ПДВ',
        colId: 'saleGross',
        width: 104,
        type: 'rightAligned',
        cellClass: 'po-num po-mk-editable',
        headerTooltip: 'Ціна продажу з ПДВ (G). Введіть ціну, і рядок перейде на «Вручну»',
        editable: canEdit,
        cellEditor: 'agTextCellEditor',
        valueGetter: (p) => p.data?.mr.saleGross,
        valueFormatter: (p) => money(p.value),
        cellClassRules: { 'po-mk-anchor': (p) => p.data?.mr.priceBasis === 'gross' && p.data.mr.saleGross != null },
      },
      {
        headerName: vatMode === 'no_vat' ? 'Сума' : sumGross ? 'Сума з ПДВ' : 'Сума без ПДВ',
        colId: 'sum',
        width: 112,
        type: 'rightAligned',
        cellClass: 'po-num po-mk-sum',
        valueGetter: (p) => (sumGross ? p.data?.mr.sumGross : p.data?.mr.sumNet),
        valueFormatter: (p) => money(p.value),
      },
      {
        headerName: 'Прибуток',
        colId: 'profit',
        width: 100,
        type: 'rightAligned',
        cellClass: 'po-num',
        headerTooltip: vatMode === 'no_vat' ? 'Прибуток по рядку: продаж як у КП мінус вхід з ПДВ (ФОП ПДВ не повертає)' : 'Прибуток без ПДВ по рядку',
        valueGetter: (p) => p.data?.mr.profitNet,
        valueFormatter: (p) => money(p.value),
        cellClassRules: { 'po-cell-error': (p) => (p.data?.mr.profitNet ?? 0) < 0 },
      },
      {
        headerName: 'Націнка',
        colId: 'markupPct',
        width: 80,
        type: 'rightAligned',
        cellClass: 'po-num',
        valueGetter: (p) => p.data?.mr.markupPct,
        valueFormatter: (p) => pct(p.value),
      },
      {
        headerName: 'Маржа',
        colId: 'marginPct',
        width: 76,
        type: 'rightAligned',
        cellClass: 'po-num',
        valueGetter: (p) => p.data?.mr.marginPct,
        valueFormatter: (p) => pct(p.value),
      },
      {
        headerName: 'РРЦ / вхід',
        colId: 'rrpPct',
        width: 84,
        type: 'rightAligned',
        cellClass: 'po-num po-muted',
        headerTooltip: 'На скільки РРЦ без ПДВ вища за вхідну ціну',
        valueGetter: (p) => p.data?.mr.rrpVsCostPct,
        valueFormatter: (p) => pct(p.value),
      },
      { headerName: 'Товар постачальника', colId: 'product', width: 280, cellRenderer: ProductCell },
      { headerName: '', colId: 'warn', width: 48, cellRenderer: WarnCell, pinned: 'right' },
    ];
    return defs;
  }, [vatMode, fopBasis]);

  const onCellEditRequest = (e: CellEditRequestEvent<MarkupRow>) => {
    const row = e.data;
    if (!row || latest.current.readOnly) return;
    const parsed = parseLocaleNumber(e.newValue == null ? '' : String(e.newValue));
    if (!parsed.valid || (parsed.value != null && parsed.value < 0)) {
      message.warning('Введіть невід’ємне число');
      return;
    }
    const v = parsed.value;
    const s = getRequestDocStore().getState();
    const col = e.column.getColId();
    if (col === 'value') {
      if (v != null && v > markupValueMax(row.mr.method)) {
        message.warning(`Не більше ${markupValueMax(row.mr.method)} %`);
        return;
      }
      s.setLineMarkup(row.id, v == null ? { value: null } : { method: row.mr.method, value: v, manualPriceNet: null, manualPriceGross: null });
    } else if (col === 'saleNet' || col === 'saleGross') {
      if (v == null) s.setLineMarkup(row.id, { method: null, value: null, manualPriceNet: null, manualPriceGross: null });
      else if (col === 'saleNet') s.setLineMarkup(row.id, { method: 'manual', value: null, manualPriceNet: v, manualPriceGross: null });
      else s.setLineMarkup(row.id, { method: 'manual', value: null, manualPriceNet: null, manualPriceGross: v });
    }
  };

  if (!doc || !computed || !requestId) return null;
  const { markup, header, refs } = doc;
  const store = getRequestDocStore().getState();
  const totals = computed.markup.totals;
  const checks = kpChecks(doc.lines, computed);
  const overrides = doc.lines.filter(hasOverride).length;
  const isFop = !refs.ownCompany.isVatPayer;

  const applyToAll = () =>
    modal.confirm({
      title: 'Застосувати спосіб заявки до всіх рядків?',
      content: `Власний спосіб і ручні ціни ${overrides} рядк. буде скинуто, усі рядки рахуватимуться як «${MARKUP_METHOD_LABELS[markup.method]}».`,
      okText: 'Застосувати',
      cancelText: 'Скасувати',
      onOk: () => store.resetLineMarkups(),
    });

  return (
    <div className="po-tab">
      <div className="po-tab-toolbar">
        <span className="po-muted">Спосіб для заявки:</span>
        <Select<MarkupMethod>
          size="small"
          value={markup.method}
          disabled={readOnly}
          style={{ width: 180 }}
          options={REQUEST_METHODS.map((m) => ({ value: m, label: MARKUP_METHOD_LABELS[m] }))}
          onChange={(m) => store.setMarkupDefaults({ method: m })}
        />
        {isPctMethod(markup.method) ? (
          <PctInput
            value={markup.value}
            max={markupValueMax(markup.method)}
            disabled={readOnly}
            onCommit={(v) => store.setMarkupDefaults({ value: v })}
          />
        ) : null}
        {markup.method === 'discount_from_rrp' ? (
          <Tooltip title="Формула цієї заявки. Нові заявки беруть формулу з налаштувань; тут її можна змінити під особливі умови">
            <Select<DiscountFormula>
              size="small"
              value={header.discountFormula}
              disabled={readOnly}
              style={{ width: 150 }}
              options={DISCOUNT_FORMULAS.map((f) => ({ value: f, label: DISCOUNT_FORMULA_LABELS[f] }))}
              onChange={(f) => store.setHeader({ discountFormula: f })}
            />
          </Tooltip>
        ) : null}
        {overrides ? (
          <Tooltip title={`Рядків із власним способом або ручною ціною: ${overrides}. Скинути: усі рахуватимуться за способом заявки`}>
            <Button size="small" disabled={readOnly} onClick={applyToAll}>
              Застосувати до всіх ({overrides})
            </Button>
          </Tooltip>
        ) : null}
        <span className="po-mk-divider" />
        <span className="po-muted">Ціни в КП:</span>
        {isFop ? (
          <Tooltip title="ФОП не платник ПДВ: у КП ПДВ не виділяється. Рівень цін задається в Налаштуваннях">
            <Tag bordered={false}>{pricing?.fopPriceBasis === 'net' ? 'ФОП, без ПДВ' : 'ФОП, на рівні цін з ПДВ'}</Tag>
          </Tooltip>
        ) : (
          <Segmented<KpVatMode>
            size="small"
            value={header.kpSettings.vatMode}
            disabled={readOnly}
            options={[
              { value: 'without_vat', label: 'без ПДВ' },
              { value: 'with_vat', label: 'з ПДВ' },
            ]}
            onChange={(v) => store.setHeader({ kpSettings: { ...header.kpSettings, vatMode: v } })}
          />
        )}
        <span className="po-tab-spacer" />
        {checks.notApproved ? (
          <Tooltip title="Рядки без ✔ ідуть у націнку і КП з мінімальною ціною">
            <Tag color="gold" bordered={false}>
              не затверджено: {checks.notApproved}
            </Tag>
          </Tooltip>
        ) : null}
        {checks.notPicked ? <Tag bordered={false}>не підібрано: {checks.notPicked}</Tag> : null}
        {checks.belowCost ? (
          <Tag color="red" bordered={false}>
            нижче входу: {checks.belowCost}
          </Tag>
        ) : null}
        {checks.noPrice ? (
          <Tooltip title="Немає ціни продажу (напр., «по РРЦ», а РРЦ немає): поки такі рядки є, КП не сформується. Задайте рядку інший спосіб або ціну вручну">
            <Tag color="red" bordered={false}>
              без ціни: {checks.noPrice}
            </Tag>
          </Tooltip>
        ) : null}
        {checks.nonPositive ? (
          <Tooltip title="Ціна продажу 0 або менше: поки такі рядки є, КП не сформується">
            <Tag color="red" bordered={false}>
              ціна ≤ 0: {checks.nonPositive}
            </Tag>
          </Tooltip>
        ) : null}
        <Button size="small" type="primary" onClick={() => navigate(`/requests/${requestId}/kp`)}>
          До КП <ArrowRightOutlined />
        </Button>
      </div>

      <div className="po-tab-body">
        <div className="po-mk-grid">
          <AgGridReact<MarkupRow>
            theme={gridTheme(density)}
            localeText={GRID_LOCALE}
            containerStyle={{ height: '100%' }}
            rowData={rows}
            columnDefs={columns}
            context={context}
            defaultColDef={{ sortable: false, resizable: true, suppressMovable: true }}
            getRowId={(p) => p.data.id}
            readOnlyEdit
            onCellEditRequest={onCellEditRequest}
            singleClickEdit={false}
            stopEditingWhenCellsLoseFocus
            rowClass="po-mk-row"
            getRowClass={(p: RowClassParams<MarkupRow>) => (p.data && !p.data.offer ? 'po-mk-row-empty' : undefined)}
            tooltipShowDelay={400}
            overlayNoRowsTemplate="<span>Додайте позиції на вкладці «Позиції і підбір»</span>"
          />
        </div>
        <div className="po-mk-totals">
          {isFop ? (
            <Stat label="Вхід з ПДВ" value={formatMoney(totals.costGross)} />
          ) : (
            <Stat label="Вхід без ПДВ" value={formatMoney(totals.costNet)} />
          )}
          {vatMode === 'no_vat' ? (
            <Stat label="Разом" value={formatMoney(totals.saleNet)} strong />
          ) : (
            <>
              <Stat label="Разом без ПДВ" value={formatMoney(totals.saleNet)} />
              <Stat label={vatMode === 'with_vat' ? `у т.ч. ПДВ ${header.vatRatePct} %` : `ПДВ ${header.vatRatePct} %`} value={formatMoney(totals.vat)} />
              <Stat label="Разом з ПДВ" value={formatMoney(totals.saleGross)} strong />
            </>
          )}
          <Stat label="Прибуток" value={formatMoney(totals.profitNet)} tone="good" />
          <SupplierProfitBreakdown doc={doc} computed={computed} />
          <Stat label="Націнка" value={formatPct(totals.markupPct, 1)} />
          <Stat label="Маржа" value={formatPct(totals.marginPct, 1)} />
          <span className="po-muted po-mk-count">
            з ціною: {totals.linesPriced}
            {totals.linesUnpriced ? ` · без ціни: ${totals.linesUnpriced}` : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
