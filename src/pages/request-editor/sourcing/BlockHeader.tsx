// Шапка блоку постачальника: група колонок у «Підборі» і колонка в «Порівнянні».
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  DeleteOutlined,
  EllipsisOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  WarningFilled,
} from '@ant-design/icons';
import { App, Button, Dropdown, InputNumber, Popover, Space, Tooltip } from 'antd';
import type { IHeaderGroupParams, IHeaderParams } from 'ag-grid-community';
import { useState, type ReactNode } from 'react';
import { CURRENCY_LABELS, RATE_POLICY_LABELS } from '@shared/enums';
import { formatDate, formatMoney, formatPct, formatRate, formatWarning } from '@shared/format';
import type { BlockTotals, SupplierBlock, SupplierProfit, SupplierRef, UUID } from '@shared/types';
import { SupplierLogo } from '@/components/SupplierLogo';
import { useRequestComputed, useRequestDoc } from '@/stores/requestDocStore';
import { useUiPrefs } from '@/stores/uiPrefsStore';
import { SEMANTIC_COLORS } from '@/theme';

export interface BlockHeaderParams {
  blockId: UUID;
}

interface BlockInfo {
  block: SupplierBlock | null;
  supplier: SupplierRef | null;
  totals: BlockTotals | undefined;
  profit: SupplierProfit | undefined;
}

function useBlockInfo(blockId: UUID): BlockInfo {
  const block = useRequestDoc((s) => s.doc?.blocks.find((b) => b.id === blockId) ?? null);
  const supplier = useRequestDoc((s) => (block?.supplierId ? (s.doc?.refs.suppliers[block.supplierId] ?? null) : null));
  const computed = useRequestComputed();
  return { block, supplier, totals: computed?.blocks[blockId], profit: computed?.supplierProfit[blockId] };
}

function signedMoney(v: number): string {
  return `${v > 0 ? '+' : ''}${formatMoney(v)}`;
}

/** Джерело курсу блоку коротко (ТЗ РЕД-4): «прайс 01.09.2026», «картка», «загальний 11.09.2026» (ручний або НБУ), «вручну 12.09.2026». */
export function rateSourceLabel(block: Pick<SupplierBlock, 'rateSource' | 'ratesDate'>): string {
  const date = block.ratesDate ? formatDate(block.ratesDate) : null;
  switch (block.rateSource) {
    case 'price_list':
      return date ? `прайс ${date}` : 'картка';
    case 'manual':
      return date ? `вручну ${date}` : 'картка';
    case 'nbu':
      // загальний курс на дату: ручний із «Курси валют», якщо задано, інакше НБУ
      return date ? `загальний ${date}` : 'загальний';
    case 'nbu_adjusted':
      return 'НБУ ± %';
  }
}

/** Пояснення заробітку блоку (тултип). */
function profitHelp(p: SupplierProfit): ReactNode {
  return (
    <div style={{ fontSize: 12 }}>
      <div>
        <b>Заробіток по обраних</b> — прибуток без ПДВ на рядках, де обрано цього постачальника ({p.selected.lines}): {formatMoney(p.selected.profitNet)}
        {p.selected.markupPct != null ? `, націнка ${formatPct(p.selected.markupPct, 1)}` : ''}
      </div>
      <div>
        <b>Якщо все тут</b> — якби всі рядки з ціною в цього постачальника ({p.allIn.lines}) брали в нього: {formatMoney(p.allIn.profitNet)}
        {p.allIn.markupPct != null ? `, націнка ${formatPct(p.allIn.markupPct, 1)}` : ''}
      </div>
      <div>Ціни продажу — за способом націнки кожного рядка (вкладка «Націнка»).</div>
      {p.allIn.unpriced ? <div>Без ціни продажу (не враховано): {p.allIn.unpriced} рядк.</div> : null}
    </div>
  );
}

/**
 * Підпис дельти (п.5 правок клієнта): «Дорожче за найдешевші +1 016,05» або «найдешевший».
 * Дельта — переплата проти найдешевших цін по тих самих рядках; null — блок ще нічого не покриває.
 */
export function deltaLabel(t: Pick<BlockTotals, 'deltaGross' | 'filledCount'>, short = false): { text: string; cheapest: boolean } | null {
  if (!t.filledCount) return null;
  if (t.deltaGross <= 0) return { text: 'найдешевший', cheapest: true };
  return { text: `${short ? 'дорожче' : 'Дорожче за найдешевші'} +${formatMoney(t.deltaGross)}`, cheapest: false };
}

function DeltaText({ totals, short }: { totals: BlockTotals; short?: boolean }) {
  const d = deltaLabel(totals, short);
  if (!d) return null;
  return <span className={d.cheapest ? 'po-bh-cheapest' : 'po-bh-delta'}>· {d.text}</span>;
}

/** Пояснення міні-підсумків (тултип). */
function totalsHelp(t: BlockTotals): ReactNode {
  return (
    <div style={{ fontSize: 12 }}>
      <div>
        <b>Всього з ПДВ</b> — усі заповнені пропозиції блоку: {formatMoney(t.totalGross)}
      </div>
      <div>
        <b>По обраних</b> — рядки, де обрано цього постачальника ({t.selectedCount}): {formatMoney(t.selectedGross)}
      </div>
      {t.filledCount ? (
        t.deltaGross > 0 ? (
          <div>
            <b>Дорожче за найдешевші</b> — на скільки дорожче взяти в цього постачальника всі його рядки, ніж у найдешевших по тих
            самих рядках: {signedMoney(t.deltaGross)}
            {t.deltaPct != null ? ` (${formatPct(t.deltaPct)})` : ''}
          </div>
        ) : (
          <div>
            <b>Найдешевший</b> — у всіх своїх рядках цей постачальник має мінімальну ціну
          </div>
        )
      ) : null}
      <div>
        <b>Покриття</b> — заповнено {t.filledCount} з {t.totalLines} рядків
      </div>
      {t.minOrderAmount != null ? <div>Мінімальне замовлення: {formatMoney(t.minOrderAmount)} грн</div> : null}
    </div>
  );
}

function RatesEditor({ block, disabled, compact }: { block: SupplierBlock; disabled: boolean; compact?: boolean }) {
  const setBlockRates = useRequestDoc((s) => s.setBlockRates);
  const [open, setOpen] = useState(false);
  const [usd, setUsd] = useState<number | null>(block.rates.USD);
  const [eur, setEur] = useState<number | null>(block.rates.EUR);
  const onOpenChange = (next: boolean) => {
    if (next) {
      setUsd(block.rates.USD);
      setEur(block.rates.EUR);
    }
    setOpen(next && !disabled);
  };
  const apply = () => {
    setBlockRates(block.id, { USD: usd && usd > 0 ? usd : null, EUR: eur && eur > 0 ? eur : null });
    setOpen(false);
  };
  const rates = `USD ${formatRate(block.rates.USD)} · EUR ${formatRate(block.rates.EUR)}`;
  const label = compact ? rates : `${rates} · ${rateSourceLabel(block)}`;
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      trigger="click"
      title="Курс блоку"
      content={
        <div className="po-bh-pop">
          <div className="po-muted">
            {RATE_POLICY_LABELS[block.rateSource]}
            {block.ratesDate ? ` від ${formatDate(block.ratesDate)}` : ''} · валюта прайсу {CURRENCY_LABELS[block.defaultCurrency]}
          </div>
          <label className="po-bh-pop-row">
            <span>USD</span>
            <InputNumber value={usd} onChange={(v) => setUsd(v)} min={0} step={0.01} decimalSeparator="," style={{ width: 120 }} />
          </label>
          <label className="po-bh-pop-row">
            <span>EUR</span>
            <InputNumber value={eur} onChange={(v) => setEur(v)} min={0} step={0.01} decimalSeparator="," style={{ width: 120 }} />
          </label>
          <Space>
            <Button size="small" type="primary" onClick={apply}>
              Застосувати
            </Button>
            <Button size="small" onClick={() => setOpen(false)}>
              Скасувати
            </Button>
          </Space>
        </div>
      }
    >
      <button
        type="button"
        className="po-bh-link po-num"
        disabled={disabled}
        title={`${rates} · ${rateSourceLabel(block)}${disabled ? '' : ' — змінити курс блоку'}`}
      >
        {label}
      </button>
    </Popover>
  );
}

function MarkupEditor({ block, disabled }: { block: SupplierBlock; disabled: boolean }) {
  const setMarkup = useRequestDoc((s) => s.setBlockSupplierMarkup);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<number | null>(block.supplierMarkupPct);
  const onOpenChange = (next: boolean) => {
    if (next) setValue(block.supplierMarkupPct);
    setOpen(next && !disabled);
  };
  const apply = () => {
    setMarkup(block.id, value ?? 0);
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      trigger="click"
      title="Націнка постачальника"
      content={
        <div className="po-bh-pop">
          <div className="po-muted">Додається до вхідної ціни всіх позицій блоку (на РРЦ не діє)</div>
          <InputNumber value={value} onChange={(v) => setValue(v)} step={0.5} decimalSeparator="," addonAfter="%" style={{ width: 140 }} />
          <Space>
            <Button size="small" type="primary" onClick={apply}>
              Застосувати
            </Button>
            <Button size="small" onClick={() => setOpen(false)}>
              Скасувати
            </Button>
          </Space>
        </div>
      }
    >
      <button type="button" className="po-bh-link po-num" disabled={disabled} title="Націнка постачальника на вхідну ціну">
        націнка {formatPct(block.supplierMarkupPct, block.supplierMarkupPct % 1 ? 1 : 0)}
      </button>
    </Popover>
  );
}

function BlockMenu({ block, name, disabled }: { block: SupplierBlock; name: string; disabled: boolean }) {
  const { modal } = App.useApp();
  const count = useRequestDoc((s) => s.doc?.blocks.length ?? 0);
  const index = useRequestDoc((s) => s.doc?.blocks.findIndex((b) => b.id === block.id) ?? -1);
  const offers = useRequestDoc((s) => s.doc?.offers.filter((o) => o.blockId === block.id).length ?? 0);
  const moveBlock = useRequestDoc((s) => s.moveBlock);
  const removeBlock = useRequestDoc((s) => s.removeBlock);
  return (
    <Dropdown
      trigger={['click']}
      disabled={disabled}
      menu={{
        items: [
          { key: 'left', icon: <ArrowLeftOutlined />, label: 'Перемістити ліворуч', disabled: index <= 0 },
          { key: 'right', icon: <ArrowRightOutlined />, label: 'Перемістити праворуч', disabled: index < 0 || index >= count - 1 },
          { type: 'divider' },
          { key: 'remove', icon: <DeleteOutlined />, label: 'Видалити блок', danger: true },
        ],
        onClick: ({ key }) => {
          if (key === 'left') moveBlock(block.id, index - 1);
          else if (key === 'right') moveBlock(block.id, index + 1);
          else if (key === 'remove') {
            modal.confirm({
              title: `Видалити блок ${name}?`,
              content: offers ? `Пропозиції блоку (${offers}) буде видалено. Скасувати — Ctrl+Z.` : 'Блок порожній.',
              okText: 'Видалити',
              okButtonProps: { danger: true },
              cancelText: 'Скасувати',
              onOk: () => removeBlock(block.id),
            });
          }
        },
      }}
    >
      <Button size="small" type="text" className="po-bh-btn" icon={<EllipsisOutlined />} title="Дії з блоком" />
    </Dropdown>
  );
}

function MinOrderWarning({ totals }: { totals: BlockTotals | undefined }) {
  const w = totals?.warnings.find((x) => x.code === 'BELOW_MIN_ORDER');
  if (!w) return null;
  return (
    <Tooltip title={formatWarning(w)}>
      <WarningFilled style={{ color: SEMANTIC_COLORS.warning, fontSize: 12 }} />
    </Tooltip>
  );
}

/** Шапка групи колонок блоку («Підбір»): логотип, курс, націнка, міні-підсумки, згорнути, меню. */
export function BlockGroupHeader(p: IHeaderGroupParams & BlockHeaderParams) {
  const { block, supplier, totals, profit } = useBlockInfo(p.blockId);
  const readOnly = useRequestDoc((s) => s.readOnly);
  const collapsed = useUiPrefs((s) => !!s.collapsedBlocks[p.blockId]);
  const toggleCollapsed = useUiPrefs((s) => s.toggleBlockCollapsed);
  if (!block) return null;
  const name = supplier?.name ?? 'Постачальник';
  return (
    <div className="po-bh">
      <div className="po-bh-row">
        <SupplierLogo name={name} logoUrl={supplier?.logoUrl} color={supplier?.color} size={18} width={supplier?.logoUrl ? 36 : undefined} />
        <span className="po-bh-name" title={name}>
          {name}
        </span>
        <MinOrderWarning totals={totals} />
        <Button
          size="small"
          type="text"
          className="po-bh-btn"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          title={collapsed ? 'Розгорнути блок' : 'Згорнути блок (лишити Артикул · Без ПДВ · ✔)'}
          onClick={() => toggleCollapsed(p.blockId)}
        />
        <BlockMenu block={block} name={name} disabled={readOnly} />
      </div>
      <div className="po-bh-row po-bh-meta">
        <RatesEditor block={block} disabled={readOnly} compact={collapsed} />
        <MarkupEditor block={block} disabled={readOnly} />
      </div>
      {totals ? (
        <Tooltip title={totalsHelp(totals)} placement="bottomLeft">
          <div className="po-bh-row po-bh-totals po-num">
            {collapsed ? (
              <>
                <span>Σ {formatMoney(totals.totalGross)}</span>
                <DeltaText totals={totals} short />
              </>
            ) : (
              <>
                <span>Всього з ПДВ {formatMoney(totals.totalGross)}</span>
                <span>· По обраних {formatMoney(totals.selectedGross)}</span>
                <DeltaText totals={totals} />
              </>
            )}
            <span>
              · {totals.filledCount}/{totals.totalLines}
            </span>
          </div>
        </Tooltip>
      ) : null}
      {profit ? (
        <Tooltip title={profitHelp(profit)} placement="bottomLeft">
          <div className="po-bh-row po-bh-totals po-bh-profit po-num">
            {collapsed ? (
              <span>Заробіток {formatMoney(profit.selected.profitNet)}</span>
            ) : (
              <>
                <span>Заробіток по обраних {formatMoney(profit.selected.profitNet)}</span>
                <span>· якщо все тут {formatMoney(profit.allIn.profitNet)}</span>
              </>
            )}
          </div>
        </Tooltip>
      ) : null}
    </div>
  );
}

/** Шапка колонки блоку в «Порівнянні»: логотип і назва, під ними покриття й дельта. */
export function CompareColumnHeader(p: IHeaderParams & BlockHeaderParams) {
  const { block, supplier, totals } = useBlockInfo(p.blockId);
  if (!block) return null;
  const name = supplier?.name ?? 'Постачальник';
  const content = (
    <div className="po-bh po-bh-compact">
      <div className="po-bh-row">
        <SupplierLogo name={name} logoUrl={supplier?.logoUrl} color={supplier?.color} size={16} width={supplier?.logoUrl ? 30 : undefined} />
        <span className="po-bh-name" title={name}>
          {name}
        </span>
        <MinOrderWarning totals={totals} />
      </div>
      {totals ? (
        <div className="po-bh-row po-bh-totals po-num">
          {totals.filledCount}/{totals.totalLines} <DeltaText totals={totals} short />
        </div>
      ) : null}
    </div>
  );
  return totals ? (
    <Tooltip title={totalsHelp(totals)} placement="bottom">
      {content}
    </Tooltip>
  ) : (
    content
  );
}
