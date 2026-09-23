// Рендери клітинок сітки підбору (обидва режими). Лише показ — кліки й клавіші обробляє сітка (SourcingGrid).
import { CheckCircleFilled, CheckCircleOutlined, CloseOutlined, SearchOutlined, UndoOutlined } from '@ant-design/icons';
import { Dropdown, type MenuProps } from 'antd';
import type { ICellRendererParams } from 'ag-grid-community';
import { useState, type ReactNode } from 'react';
import { AVAILABILITY_LABELS } from '@shared/enums';
import { formatMoney, formatPct, formatQty, formatRate } from '@shared/format';
import { offerDisplayName, offerMultiplicity } from '@shared/pricing';
import type { Offer, OfferComputed, OfferPriceChange, UUID, Warning, WarningCode } from '@shared/types';
import { QtyCell } from '@/components/QtyCell';
import { SupplierLogo } from '@/components/SupplierLogo';
import { WarningBadge } from '@/components/WarningBadge';
import { COL, type BlockField } from './colIds';
import type { SourcingGridContext } from './gridContext';
import { isLineRow, isNotApproved, isSimilarMiss, type BlockCell, type LineRow, type SourcingRow } from './rows';

type P<Extra = object> = ICellRendererParams<SourcingRow, unknown, SourcingGridContext> & Extra;
export type BlockCellParams = { blockId: UUID; allWarnings?: boolean };

/** Попередження, що показуються в конкретній колонці блоку. */
export const FIELD_WARNINGS: Partial<Record<BlockField, readonly WarningCode[]>> = {
  unit: ['UNIT_MISMATCH'],
  qty: ['MULTIPLICITY_MISMATCH'],
  net: ['RATE_MISSING', 'PRICE_MISSING', 'NOT_IN_PRICE_LIST', 'PRICE_STALE', 'CATALOG_PRICE_CHANGED', 'INPUT_ABOVE_RRP'],
  stock: ['OUT_OF_STOCK', 'INSUFFICIENT_STOCK'],
};

/** «✕ / Не підходить»: пропозиція лишається видимою, але не бере участі в розрахунку. */
export const EXCLUDE_HINT = 'Не підходить (інший товар, аналог не влаштовує) — пропозиція не враховується в мінімумі, порівнянні й сценаріях';

export function cellWarnings(oc: OfferComputed | null | undefined, field: BlockField, all = false): Warning[] {
  if (!oc) return [];
  if (all) return oc.warnings.filter((w) => w.code !== 'QTY_ROUNDED');
  const codes = FIELD_WARNINGS[field];
  return codes ? oc.warnings.filter((w) => codes.includes(w.code)) : [];
}

/** Попередження рядка для колонки «Обрано» (без «немає пропозицій» — це видно з «—»). */
export function lineWarnings(row: LineRow): Warning[] {
  return row.cmp?.warnings.filter((w) => w.code !== 'NO_OFFERS') ?? [];
}

const cellOf = (row: LineRow, blockId: UUID): BlockCell | undefined => row.cells[blockId];

const EMPTY_MENU: MenuProps = { items: [] };

/** Контекстне меню клітинки (правий клік); пункти будуються лише при відкритті. */
function CellMenu({ getMenu, children }: { getMenu: () => MenuProps | null; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const menu = open ? getMenu() : null;
  return (
    <Dropdown trigger={['contextMenu']} open={open && !!menu} onOpenChange={setOpen} menu={menu ?? EMPTY_MENU}>
      <div className="po-cell-fill">{children}</div>
    </Dropdown>
  );
}

function Flex({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="po-cell-flex" title={title}>
      {children}
    </span>
  );
}

// ── колонки клієнта ─────────────────────────────────────────────────
/** «Найменування (як у клієнта)»: назва + кнопка «Підібрати в каталозі» (видно при наведенні на рядок). */
export function ClientNameCell(p: P) {
  const row = p.data;
  if (row?.kind === 'totals') return <span className="po-totals-label">Разом: {row.activeCount} поз.</span>;
  if (row?.kind === 'new') return <span className="po-placeholder">+ новий рядок — введіть назву</span>;
  if (!isLineRow(row)) return null;
  return (
    <span className="po-client-name">
      <span className="po-ellipsis">{row.line.clientName}</span>
      {p.context.isReadOnly() ? null : (
        <SearchOutlined
          className="po-client-pick"
          title="Підібрати в каталозі (F4)"
          aria-label="Підібрати в каталозі"
          onClick={(e) => {
            e.stopPropagation();
            p.context.onPickerKey(row, COL.line('clientName'));
          }}
        />
      )}
    </span>
  );
}

/** «Од.» / «К-сть» клієнта: значення + куточок для протягування (видно на клітинці з фокусом). */
export function FillCell(p: P) {
  const row = p.data;
  const text = p.valueFormatted ?? (p.value == null ? '' : String(p.value));
  if (!isLineRow(row) || p.context.isReadOnly()) return <>{text}</>;
  return (
    <>
      {text}
      <span
        className="po-fill-handle"
        title="Потягніть униз, щоб скопіювати в рядки нижче (як в Excel). Ctrl+D — взяти з рядка вище"
        onMouseDown={(e) => p.context.onFillStart(e, row, p.column?.getColId() ?? '')}
      />
    </>
  );
}

export function PosCell(p: P) {
  const row = p.data;
  if (!isLineRow(row)) return null;
  return (
    <CellMenu getMenu={() => p.context.rowMenu(row)}>
      <span className="po-num">{row.line.position}</span>
    </CellMenu>
  );
}

export function ChosenCell(p: P) {
  const row = p.data;
  if (row?.kind === 'totals') {
    return (
      <span className="po-num" title="Закупівля без ПДВ за ефективним вибором (затверджені + рекомендовані)">
        {formatMoney(row.totals.totalPurchaseNet)}
      </span>
    );
  }
  if (!isLineRow(row)) return null;
  const ch = row.chosen;
  if (!ch) return <span className="po-muted">—</span>;
  const supplier = p.context.supplierOfBlock(ch.blockId);
  const notApproved = isNotApproved(row.cmp);
  return (
    <Flex>
      {supplier ? <SupplierLogo name={supplier.name} logoUrl={supplier.logoUrl} color={supplier.color} size={16} width={supplier.logoUrl ? 28 : undefined} /> : null}
      <span className="po-num">{formatMoney(ch.oc.unitNetUah)}</span>
      {notApproved ? (
        <span className="po-mark-not-approved" title="Не затверджено — у націнку й КП піде мінімальна ціна">
          !
        </span>
      ) : (
        <CheckCircleFilled className="po-mark-approved" title="Затверджено вручну" />
      )}
      <WarningBadge warnings={lineWarnings(row)} size={12} />
    </Flex>
  );
}

// ── колонки блоку («Підбір») ────────────────────────────────────────
export function SkuCell(p: P<BlockCellParams>) {
  const row = p.data;
  if (row?.kind === 'totals') {
    const t = row.blocks[p.blockId];
    return t ? (
      <span className="po-num po-muted" title="Заповнено рядків / усього рядків">
        {t.filledCount}/{t.totalLines}
      </span>
    ) : null;
  }
  if (!isLineRow(row)) return null;
  const cell = cellOf(row, p.blockId);
  if (cell?.offer) return <span className="po-num">{cell.offer.sku ?? '—'}</span>;
  const readOnly = p.context.isReadOnly();
  if (cell?.miss) {
    const supplier = p.context.supplierOfBlock(p.blockId)?.name ?? 'постачальника';
    const similar = isSimilarMiss(cell.miss);
    const text =
      cell.miss.kind === 'not_found'
        ? `Артикул не знайдено у ${supplier} — Створити товар?`
        : similar
          ? `Артикул не знайдено у ${supplier} — є схожі артикули: оберіть або створіть товар`
          : `Кілька товарів з артикулом ${cell.miss.sku} у ${supplier} — оберіть потрібний`;
    return (
      <Flex title={text}>
        <span className="po-num po-sku-miss">{cell.miss.sku}</span>
        {readOnly ? null : (
          <a
            className="po-sku-miss-link"
            onClick={(e) => {
              e.stopPropagation();
              p.context.onMissClick(row, p.blockId);
            }}
          >
            {cell.miss.kind === 'not_found' ? 'створити?' : similar ? 'схожі…' : 'обрати…'}
          </a>
        )}
      </Flex>
    );
  }
  return readOnly ? null : <span className="po-placeholder">артикул…</span>;
}

export function OfferNameCell(p: P<BlockCellParams>) {
  const row = p.data;
  if (row?.kind === 'totals') {
    const t = row.blocks[p.blockId];
    return t ? (
      <span className="po-muted" title="Сума без ПДВ по рядках, де обрано цього постачальника">
        Обрано без ПДВ: <span className="po-num">{formatMoney(t.selectedNet)}</span> ({t.selectedCount})
      </span>
    ) : null;
  }
  if (!isLineRow(row)) return null;
  const offer = cellOf(row, p.blockId)?.offer;
  if (!offer) return null;
  const name = offerDisplayName(offer) ?? '—';
  return (
    <CellMenu getMenu={() => p.context.nameMenu(row, p.blockId)}>
      <span className="po-ellipsis" title={name}>
        {name}
      </span>
    </CellMenu>
  );
}

export function UnitCell(p: P<BlockCellParams>) {
  if (!isLineRow(p.data)) return null;
  const cell = cellOf(p.data, p.blockId);
  if (!cell?.offer) return null;
  return (
    <Flex>
      {cell.offer.unitCode ?? '—'}
      <WarningBadge warnings={cellWarnings(cell.oc, 'unit')} size={12} />
    </Flex>
  );
}

/** К-сть пропозиції: помаранчева підказка «округлено з 118, кратно 4»; некратна — попередження. */
export function BlockQtyCell(p: P<BlockCellParams>) {
  if (!isLineRow(p.data)) return null;
  const cell = cellOf(p.data, p.blockId);
  if (!cell?.offer || !cell.oc) return null;
  const rounded = cell.oc.warnings.find((w) => w.code === 'QTY_ROUNDED');
  return (
    <Flex>
      <QtyCell
        qty={cell.oc.qtyEffective}
        roundedFrom={rounded ? Number(rounded.params?.from) : null}
        multiplicity={offerMultiplicity(cell.offer)}
      />
      <WarningBadge warnings={cellWarnings(cell.oc, 'qty')} size={12} />
    </Flex>
  );
}

function priceTitle(offer: Offer, oc: OfferComputed, markupPct: number | null): string | undefined {
  if (offer.purchasePriceCur == null) return undefined;
  const parts = [`${formatMoney(offer.purchasePriceCur)} ${offer.currency}`];
  if (offer.currency !== 'UAH') parts.push(`× курс ${formatRate(oc.rate)}`);
  if (markupPct) parts.push(`+ ${formatPct(markupPct)} націнки постачальника`);
  return parts.length > 1 ? parts.join(' ') : undefined;
}

const CHANGE_REASON: Record<OfferPriceChange['reason'], string> = {
  copy_refresh: 'перераховано за каталогом під час копіювання',
  catalog_refresh: 'оновлено з прайсу постачальника',
  manual_edit: 'змінено вручну в заявці',
};

/** ▲ (дорожче, червоним) / ▼ (дешевше, зеленим) — ціна змінилась відносно попередньої (КОП-2). */
function PriceChangeMark({ offer, oc }: { offer: Offer; oc: OfferComputed | null | undefined }) {
  const ch = offer.priceChange;
  const now = oc?.unitNetUah;
  if (!ch || ch.prevUnitNetUah == null || now == null || now === ch.prevUnitNetUah) return null;
  const up = now > ch.prevUnitNetUah;
  const pct = ch.prevUnitNetUah ? Math.abs(((now - ch.prevUnitNetUah) / ch.prevUnitNetUah) * 100) : null;
  const title = `Ціну ${CHANGE_REASON[ch.reason]}: ${formatMoney(ch.prevUnitNetUah)} → ${formatMoney(now)} грн${pct != null ? ` (${up ? '▲' : '▼'} ${formatPct(pct)})` : ''}`;
  return (
    <span className={up ? 'po-price-change po-price-up' : 'po-price-change po-price-down'} title={title}>
      {up ? '▲' : '▼'}
    </span>
  );
}

/** «Ціна без ПДВ» — з прайсу постачальника (вручну не змінюється); ▲▼ — зміна після оновлення з прайсу. */
export function PriceCell(p: P<BlockCellParams>) {
  const row = p.data;
  if (row?.kind === 'totals') {
    // у згорнутому блоці — «Всього без ПДВ» блоку
    const t = row.blocks[p.blockId];
    return p.allWarnings && t ? (
      <span className="po-num" title="Всього без ПДВ по блоку">
        {formatMoney(t.totalNet)}
      </span>
    ) : null;
  }
  if (!isLineRow(row)) return null;
  const cell = cellOf(row, p.blockId);
  if (!cell?.offer || !cell.oc) return null;
  const title = priceTitle(cell.offer, cell.oc, p.context.blockOf(p.blockId)?.supplierMarkupPct ?? null);
  return (
    <Flex title={title}>
      <PriceChangeMark offer={cell.offer} oc={cell.oc} />
      <span className="po-num po-cell-grow">{formatMoney(cell.oc.unitNetUah)}</span>
      <WarningBadge warnings={cellWarnings(cell.oc, 'net', p.allWarnings)} size={12} />
    </Flex>
  );
}

function stockText(offer: Offer): string {
  if (offer.stockQty != null) return formatQty(offer.stockQty);
  switch (offer.availability) {
    case 'in_stock':
      return 'є';
    case 'low_stock':
      return 'мало';
    case 'out_of_stock':
      return 'немає';
    case 'on_order':
      return 'під замовл.';
    default:
      return '—';
  }
}

export function StockCell(p: P<BlockCellParams>) {
  if (!isLineRow(p.data)) return null;
  const cell = cellOf(p.data, p.blockId);
  if (!cell?.offer) return null;
  return (
    <Flex title={AVAILABILITY_LABELS[cell.offer.availability]}>
      <span className="po-num po-cell-grow">{stockText(cell.offer)}</span>
      <WarningBadge warnings={cellWarnings(cell.oc, 'stock')} size={12} />
    </Flex>
  );
}

export function ExcludeCell(p: P<BlockCellParams>) {
  if (!isLineRow(p.data)) return null;
  const offer = cellOf(p.data, p.blockId)?.offer;
  if (!offer) return null;
  if (offer.excluded) {
    const reason = offer.excludeReason ? `Не підходить: ${offer.excludeReason}.` : 'Не підходить — не враховується.';
    return <UndoOutlined className="po-icon-btn" title={`${reason} Клацніть, щоб повернути`} />;
  }
  return <CloseOutlined className="po-icon-btn po-muted" title={`${EXCLUDE_HINT}. Клацніть, щоб позначити`} />;
}

/** ✔ — радіо в межах рядка: затверджено (синя), рекомендовано (зелена), інший кандидат (порожнє коло). */
export function PickCell(p: P<BlockCellParams>) {
  const row = p.data;
  if (!isLineRow(row)) return null;
  const oc = cellOf(row, p.blockId)?.oc;
  if (!oc?.isCandidate) return null;
  const manual = row.line.selection.blockId === p.blockId && oc.isSelected;
  if (manual) return <CheckCircleFilled className="po-pick po-pick-approved" title="Затверджено. Клацніть, щоб зняти" />;
  if (oc.isRecommended && isNotApproved(row.cmp)) {
    return <CheckCircleOutlined className="po-pick po-pick-recommended" title="Рекомендовано (мінімальна ціна). Клацніть, щоб затвердити" />;
  }
  return <span className="po-pick po-pick-empty" title="Затвердити цього постачальника" />;
}

// ── режим «Порівняння» ──────────────────────────────────────────────
export function CompareCell(p: P<{ blockId: UUID }>) {
  const row = p.data;
  if (row?.kind === 'totals') {
    const t = row.blocks[p.blockId];
    return t ? (
      <div className="po-cmp-cell" title="Всього без ПДВ по блоку · заповнено рядків">
        <span className="po-num">{formatMoney(t.totalNet)}</span>
        <span className="po-cmp-sub po-num">
          {t.filledCount}/{t.totalLines}
        </span>
      </div>
    ) : null;
  }
  if (!isLineRow(row)) return null;
  const cell = cellOf(row, p.blockId);
  if (!cell?.offer) {
    if (p.context.isReadOnly()) return null;
    return <span className="po-placeholder">{cell?.miss ? `${cell.miss.sku}: не знайдено` : '+ підібрати'}</span>;
  }
  const oc = cell.oc;
  const manual = row.line.selection.blockId === p.blockId && !!oc?.isSelected;
  const diff = oc?.diffVsMinPct;
  return (
    <div className="po-cmp-cell">
      <span className="po-cell-flex">
        {manual ? <CheckCircleFilled className="po-mark-approved" /> : null}
        <PriceChangeMark offer={cell.offer} oc={oc} />
        <span className="po-num po-cmp-price">{formatMoney(oc?.unitNetUah)}</span>
        <WarningBadge warnings={cellWarnings(oc, 'net', true)} size={12} />
      </span>
      <span className="po-cmp-sub">
        <span className="po-num">{cell.offer.sku ?? '—'}</span>
        {diff ? <span className="po-cmp-diff po-num"> +{formatPct(diff, 1)}</span> : null}
      </span>
    </div>
  );
}

export function CompareChosenCell(p: P) {
  const row = p.data;
  if (row?.kind === 'totals') {
    return (
      <div className="po-cmp-cell" title="Закупівля без ПДВ за ефективним вибором · переплата без ПДВ відносно мінімальних цін">
        <span className="po-num">{formatMoney(row.totals.totalPurchaseNet)}</span>
        <span className="po-cmp-sub">
          затверджено {row.approvedCount} з {row.activeCount}
          {row.overpayNet > 0 ? <span className="po-cmp-overpay po-num"> · переплата {formatMoney(row.overpayNet)}</span> : null}
        </span>
      </div>
    );
  }
  if (!isLineRow(row)) return null;
  const ch = row.chosen;
  if (!ch) return <span className="po-muted">—</span>;
  const supplier = p.context.supplierOfBlock(ch.blockId);
  const notApproved = isNotApproved(row.cmp);
  const overpay = row.cmp?.overpayNet ?? 0;
  return (
    <div className="po-cmp-cell">
      <span className="po-cell-flex">
        {supplier ? <SupplierLogo name={supplier.name} logoUrl={supplier.logoUrl} color={supplier.color} size={16} showName /> : null}
        {notApproved ? (
          <span className="po-mark-not-approved" title="Не затверджено — у націнку й КП піде мінімальна ціна">
            !
          </span>
        ) : (
          <CheckCircleFilled className="po-mark-approved" title="Затверджено вручну" />
        )}
        <WarningBadge warnings={lineWarnings(row)} size={12} />
      </span>
      <span className="po-cmp-sub po-num">
        {formatMoney(ch.oc.unitNetUah)} · Σ {formatMoney(ch.oc.sumNetUah)}
        {overpay > 0 ? <span className="po-cmp-overpay"> · +{formatMoney(overpay)}</span> : <span className="po-cmp-min"> · мінімум</span>}
      </span>
    </div>
  );
}

/** Порожня сітка: рядків немає або всі сховані фільтром. */
export function NoRowsOverlay(p: { hasLines?: boolean }) {
  return (
    <span className="po-muted">
      {p.hasLines ? 'Немає рядків за фільтром або пошуком' : 'Рядків ще немає'}
    </span>
  );
}
