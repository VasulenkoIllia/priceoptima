// Вкладка «Націнка» (НАЦ-1…НАЦ-5): ціна продажу кожного рядка від обраної пропозиції — спосіб для заявки й для рядка,
// ручна ціна (без ПДВ або з ПДВ), попередження й підсумки з ПДВ. Клітинки й підсумок — у markupCells.tsx.
import { ArrowRightOutlined } from '@ant-design/icons';
import { App, Button, Select, Tag, Tooltip } from 'antd';
import type {
  CellEditRequestEvent,
  CellKeyDownEvent,
  ColDef,
  FullWidthCellKeyDownEvent,
  GridApi,
  ICellRendererParams,
  RowClassParams,
} from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';
import { DISCOUNT_FORMULAS, DISCOUNT_FORMULA_LABELS, MARKUP_METHOD_LABELS, MARKUP_METHOD_SHORT_LABELS, type DiscountFormula, type KpVatMode, type MarkupMethod } from '@shared/enums';
import { formatMoney, formatPct, formatQty } from '@shared/format';
import { parseLocaleNumber } from '@shared/parse';
import { isActiveLine, kpChecks, markupValueMax } from '@shared/pricing';
import type { UUID } from '@shared/types';
import { GRID_LOCALE, gridTheme } from '@/lib/agGrid';
import { columnLayoutHandlers, withSavedLayout } from '@/lib/gridColumnLayout';
import { startFillDrag } from '@/lib/gridFillDrag';
import { getRequestDocStore, useRequestComputed, useRequestDoc } from '@/stores/requestDocStore';
import { setOfferPriceFromInput, setOfferRrpFromInput } from '../offerCellInput';
import { markupFillPatch } from './markupFill';
import { useUiPrefs } from '@/stores/uiPrefsStore';
import {
  FILL_COLS,
  FILL_HINT,
  hasOverride,
  isFillKey,
  isPctMethod,
  type MarkupGridContext,
  type MarkupRow,
  MethodCell,
  money,
  pct,
  PctInput,
  ProductCell,
  REQUEST_METHODS,
  Stat,
  SupplierCell,
  SupplierProfitBreakdown,
  suppressFillKey,
  ValueCell,
  WarnCell,
} from './markupCells';

const MARKUP_LAYOUT = columnLayoutHandlers<MarkupRow>('markup');

export default function MarkupTab() {
  const { modal, message } = App.useApp();
  const navigate = useNavigate();
  const density = useUiPrefs((s) => s.density);
  const layoutEpoch = useUiPrefs((s) => s.layoutEpoch);
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

  // ── протягування способу й % (як в Excel) і Ctrl+D ──────────────
  const apiRef = useRef<GridApi<MarkupRow> | null>(null);
  const fillCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => fillCleanup.current?.(), []);
  const displayedIds = (): UUID[] => {
    const ids: UUID[] = [];
    apiRef.current?.forEachNodeAfterFilterAndSort((n) => {
      if (n.data) ids.push(n.data.id);
    });
    return ids;
  };
  /** Правило рядка-джерела — у цільові рядки з підібраним товаром, одним кроком. */
  const applyFill = (sourceId: UUID, targetIds: UUID[]) => {
    const s = getRequestDocStore().getState();
    const source = s.doc?.lines.find((l) => l.id === sourceId);
    if (!source || !targetIds.length || latest.current.readOnly) return;
    const patch = markupFillPatch(source);
    if (!patch) {
      message.info('Ручну ціну не протягують: це ціна конкретного товару');
      return;
    }
    const computedNow = s.getComputed();
    const ids = targetIds.filter((id) => computedNow?.markup.rows[id]?.effectiveOfferId);
    if (!ids.length) return;
    s.setLinesMarkup(ids, patch);
    const what = patch.method
      ? isPctMethod(patch.method) && patch.value != null
        ? `${MARKUP_METHOD_SHORT_LABELS[patch.method]} ${formatPct(patch.value, 1)}`
        : MARKUP_METHOD_LABELS[patch.method]
      : `Спосіб заявки (${MARKUP_METHOD_LABELS[latest.current.method]})`;
    message.success(`${what}: ${ids.length} рядк. Скасувати: Ctrl+Z`);
  };
  const applyFillRef = useRef(applyFill);
  applyFillRef.current = applyFill;
  const onCellKeyDown = (e: CellKeyDownEvent<MarkupRow> | FullWidthCellKeyDownEvent<MarkupRow>) => {
    const ev = e.event as KeyboardEvent | null | undefined;
    if (!ev || !('column' in e) || !e.data || !FILL_COLS.has(e.column.getColId()) || !isFillKey(ev)) return;
    const ids = displayedIds();
    const i = ids.indexOf(e.data.id);
    if (i > 0) applyFill(ids[i - 1], [e.data.id]);
  };
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
      onFillStart: (e, row, colId) => {
        const api = apiRef.current;
        if (!api || latest.current.readOnly) return;
        fillCleanup.current?.();
        fillCleanup.current = startFillDrag({
          event: e,
          api,
          colId,
          displayed: displayedIds(),
          sourceId: row.id,
          onApply: (targetIds) => {
            fillCleanup.current = null;
            applyFillRef.current(row.id, targetIds);
          },
        });
      },
    }),
    [],
  );

  const vatMode: KpVatMode = doc?.header.kpSettings.vatMode ?? 'without_vat';
  const fopBasis = pricing?.fopPriceBasis ?? 'gross';
  const columns = useMemo<ColDef<MarkupRow>[]>(() => {
    const canEdit = (p: { data?: MarkupRow }) => !latest.current.readOnly && !!p.data?.offer;
    // сума — як у КП: ТОВ з ПДВ і ФОП «на рівні цін з ПДВ» — з ПДВ
    // сума — з ПДВ (правки замовника 23.09 п.10); ФОП ПДВ не нараховує — як у його КП («на рівні цін з ПДВ» чи без ПДВ)
    const sumGross = vatMode !== 'no_vat' || fopBasis === 'gross';
    // найважливіше (вхід → спосіб → ціна продажу → сума → прибуток) — без прокрутки на 1366–1440 px; довідкове — праворуч
    const defs: ColDef<MarkupRow>[] = [
      { headerName: '№', colId: 'n', valueGetter: (p) => p.data?.line.position, width: 48, pinned: 'left', cellClass: 'po-num' },
      {
        headerName: 'Найменування (згідно заявки)',
        colId: 'client',
        valueGetter: (p) => p.data?.line.clientName,
        flex: 1,
        minWidth: 170,
        pinned: 'left',
        cellClass: 'po-cell-text',
        // перенос по словах, як у «Підборі»: довга назва видна повністю
        cellRenderer: (p: ICellRendererParams<MarkupRow>) => <span className="po-wrap">{p.value as string}</span>,
        autoHeight: true,
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
        headerName: 'Постачальник',
        colId: 'supplier',
        width: 170,
        valueGetter: (p) => p.data?.supplier?.name ?? '',
        cellRenderer: SupplierCell,
        tooltipValueGetter: (p) => (p.value as string) || null,
      },
      {
        headerName: 'Вхід з ПДВ',
        colId: 'cost',
        width: 116,
        cellClass: 'po-num',
        headerTooltip: 'Ціна входу обраної пропозиції з ПДВ, грн за од. Введіть нову, щоб змінити її лише в цій заявці',
        // нова ціна входу — прямо тут, як у «Підборі» (правки замовника 23.09 п.8)
        editable: canEdit,
        cellEditor: 'agTextCellEditor',
        cellEditorParams: { useFormatter: true },
        valueGetter: (p) => p.data?.mr.costGross,
        valueFormatter: (p) => money(p.value),
        cellClassRules: { 'po-cell-not-approved': (p) => !!p.data?.mr.notApproved },
      },
      {
        headerName: 'РРЦ з ПДВ',
        colId: 'rrp',
        width: 92,
        type: 'rightAligned',
        cellClass: 'po-num po-rrp',
        headerTooltip: 'Рекомендована роздрібна ціна з ПДВ, грн за од. Введіть нову, щоб змінити її лише в цій заявці',
        editable: canEdit,
        cellEditor: 'agTextCellEditor',
        cellEditorParams: { useFormatter: true },
        valueGetter: (p) => p.data?.mr.rrpGross,
        valueFormatter: (p) => money(p.value),
      },
      {
        headerName: 'Спосіб',
        colId: 'method',
        width: 178,
        cellRenderer: MethodCell,
        cellClass: 'po-mk-method-cell',
        headerTooltip: FILL_HINT,
        suppressKeyboardEvent: suppressFillKey,
        tooltipValueGetter: (p) =>
          p.data && !hasOverride(p.data.line) ? `Як у заявці: ${MARKUP_METHOD_LABELS[latest.current.method]}` : null,
      },
      {
        headerName: '%',
        colId: 'value',
        width: 80,
        type: 'rightAligned',
        cellClass: 'po-num',
        headerTooltip: `Націнка на вхід або знижка від РРЦ, % (Enter: змінити). ${FILL_HINT}`,
        editable: (p) => canEdit(p) && !!p.data && isPctMethod(p.data.mr.method),
        cellEditor: 'agTextCellEditor',
        suppressKeyboardEvent: suppressFillKey,
        valueGetter: (p) => (p.data && isPctMethod(p.data.mr.method) ? p.data.mr.value : null),
        valueFormatter: (p) => (p.value == null ? '' : formatPct(p.value as number, 2)),
        cellRenderer: ValueCell,
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
      },
      {
        headerName: vatMode === 'no_vat' ? 'Сума' : 'Сума з ПДВ',
        colId: 'sum',
        width: 112,
        type: 'rightAligned',
        cellClass: 'po-num po-mk-sum',
        valueGetter: (p) => (sumGross ? p.data?.mr.sumGross : p.data?.mr.sumNet),
        valueFormatter: (p) => money(p.value),
      },
      {
        headerName: vatMode === 'no_vat' ? 'Прибуток' : 'Прибуток з ПДВ',
        colId: 'profit',
        width: 100,
        type: 'rightAligned',
        cellClass: 'po-num',
        headerTooltip:
          vatMode === 'no_vat' ? 'Прибуток по рядку: продаж як у КП мінус вхід з ПДВ (ФОП ПДВ не повертає)' : 'Прибуток по рядку: сума продажу з ПДВ мінус вхід з ПДВ',
        valueGetter: (p) => p.data?.mr.profitGross,
        valueFormatter: (p) => money(p.value),
        cellClassRules: { 'po-cell-error': (p) => (p.data?.mr.profitGross ?? 0) < 0 },
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
      { headerName: 'Товар постачальника', colId: 'product', width: 280, cellClass: 'po-cell-text', cellRenderer: ProductCell, autoHeight: true },
      { headerName: '', colId: 'warn', width: 48, cellRenderer: WarnCell, pinned: 'right' },
    ];
    return withSavedLayout(defs, 'markup');
  }, [vatMode, fopBasis, layoutEpoch]);

  const onCellEditRequest = (e: CellEditRequestEvent<MarkupRow>) => {
    const row = e.data;
    if (!row || latest.current.readOnly) return;
    // вхід і РРЦ — ціни пропозиції, лише в цій заявці (спільно з «Підбором»)
    if (e.column.getColId() === 'cost' || e.column.getColId() === 'rrp') {
      if (!row.mr.blockId) return;
      if (e.column.getColId() === 'cost') setOfferPriceFromInput({ message, modal }, row.id, row.mr.blockId, e.newValue, true);
      else setOfferRrpFromInput({ message, modal }, row.id, row.mr.blockId, e.newValue);
      return;
    }
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
  const { markup, header } = doc;
  const store = getRequestDocStore().getState();
  const totals = computed.markup.totals;
  const checks = kpChecks(doc.lines, computed);
  const overrides = doc.lines.filter(hasOverride).length;

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
        <span className="po-muted">Спосіб націнки:</span>
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
        {/* «Ціни в КП: без/з ПДВ» — лише на вкладці «КП»: тут ціни без і з ПДВ поруч, суми з ПДВ (правки замовника 23.09 п.10) */}
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
            defaultColDef={{ sortable: false, resizable: true, lockPinned: true, wrapHeaderText: true, autoHeaderHeight: true }}
            getRowId={(p) => p.data.id}
            readOnlyEdit
            onCellEditRequest={onCellEditRequest}
            onCellKeyDown={onCellKeyDown}
            onGridReady={(e) => {
              apiRef.current = e.api;
            }}
            onColumnResized={MARKUP_LAYOUT.onColumnResized}
            onColumnMoved={MARKUP_LAYOUT.onColumnMoved}
            singleClickEdit={false}
            stopEditingWhenCellsLoseFocus
            rowClass="po-mk-row"
            getRowClass={(p: RowClassParams<MarkupRow>) => (p.data && !p.data.offer ? 'po-mk-row-empty' : undefined)}
            tooltipShowDelay={400}
            overlayNoRowsTemplate="<span>Додайте позиції на вкладці «Позиції і підбір»</span>"
          />
        </div>
        <div className="po-mk-totals">
          {/* лише суми з ПДВ (правки замовника 23.09 п.7); ФОП ПДВ не нараховує — продаж як у КП */}
          <Stat label="Собівартість з ПДВ" value={formatMoney(totals.costGross)} />
          <Stat label={vatMode === 'no_vat' ? 'Продаж' : 'Продаж з ПДВ'} value={formatMoney(totals.saleGross)} strong />
          <Stat label={vatMode === 'no_vat' ? 'Прибуток' : 'Прибуток з ПДВ'} value={formatMoney(totals.profitGross)} tone="good" />
          <SupplierProfitBreakdown doc={doc} computed={computed} />
          <span className="po-muted po-mk-count">
            з ціною: {totals.linesPriced}
            {totals.linesUnpriced ? ` · без ціни: ${totals.linesUnpriced}` : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
