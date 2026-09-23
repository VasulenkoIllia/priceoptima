// Бічна панель режиму «Порівняння» (§6.6): деталі пропозиції клітинки і дії з нею. Не модальна — сітка лишається активною.
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  GlobalOutlined,
  SearchOutlined,
  StopOutlined,
  SwapOutlined,
  SyncOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { Button, Descriptions, Drawer, Empty, Input, Space, Switch, Tag, Tooltip, Typography } from 'antd';
import { useState, type ReactNode } from 'react';
import { AVAILABILITY_LABELS, CURRENCY_LABELS } from '@shared/enums';
import { formatDate, formatMoney, formatMoneyUah, formatPct, formatQty, formatRate, formatWarning } from '@shared/format';
import { offerDisplayName } from '@shared/pricing';
import type { Offer, UUID } from '@shared/types';
import { SupplierLogo } from '@/components/SupplierLogo';
import { WarningBadge } from '@/components/WarningBadge';
import { siteSearchUrl } from '@/components/ProductPicker';
import { useRequestComputed, useRequestDoc } from '@/stores/requestDocStore';
import { useUiPrefs } from '@/stores/uiPrefsStore';
import { SEMANTIC_COLORS } from '@/theme';
import { rateSourceLabel } from './BlockHeader';
import { EXCLUDE_HINT } from './cells';
import { OfferPriceDialog } from './OfferPriceDialog';
import { useSourcingUi } from './sourcingUiStore';
import { useSourcingActions } from './useSourcingActions';

function Warn({ codes, warnings }: { codes: string[]; warnings: Parameters<typeof WarningBadge>[0]['warnings'] }) {
  const list = warnings.filter((w) => codes.includes(w.code));
  return list.length ? <WarningBadge warnings={list} /> : null;
}

function OfferDetails({ lineId, blockId }: { lineId: UUID; blockId: UUID }) {
  const actions = useSourcingActions();
  const line = useRequestDoc((s) => s.doc?.lines.find((l) => l.id === lineId));
  const block = useRequestDoc((s) => s.doc?.blocks.find((b) => b.id === blockId));
  const offer = useRequestDoc((s) => s.doc?.offers.find((o) => o.lineId === lineId && o.blockId === blockId));
  const supplier = useRequestDoc((s) => (block?.supplierId ? s.doc?.refs.suppliers[block.supplierId] : undefined));
  const readOnly = useRequestDoc((s) => s.readOnly);
  const setOfferNote = useRequestDoc((s) => s.setOfferNote);
  const setOfferNoRounding = useRequestDoc((s) => s.setOfferNoRounding);
  const computed = useRequestComputed();
  const [priceOffer, setPriceOffer] = useState<Offer | null>(null);

  if (!line || !block) return <Empty description="Рядок або блок видалено" />;
  const oc = offer ? computed?.offers[offer.id] : undefined;
  const cmp = computed?.lines[lineId];
  const webUrl = supplier ? siteSearchUrl(supplier.searchUrlTemplate, { query: offer?.sku || line.clientName, sku: offer?.sku }) : null;
  const webLink = webUrl ? (
    <Typography.Link href={webUrl} target="_blank" rel="noopener noreferrer">
      <GlobalOutlined /> Знайти на сайті постачальника
    </Typography.Link>
  ) : null;

  if (!offer) {
    return (
      <Empty description={`У ${supplier?.name ?? 'постачальника'} ще немає пропозиції для цього рядка`}>
        <Space direction="vertical">
          <Button type="primary" icon={<SearchOutlined />} disabled={readOnly} onClick={() => actions.openPickerFor(lineId, blockId, 'add')}>
            Підібрати товар (F4)
          </Button>
          {webLink}
        </Space>
      </Empty>
    );
  }

  const manual = line.selection.blockId === blockId && !!oc?.isSelected;
  const warnings = oc?.warnings ?? [];
  const rounded = warnings.find((w) => w.code === 'QTY_ROUNDED');
  // вхідні ціни — лише з прайсу постачальника; змінилась у каталозі — можна взяти актуальну
  const catalogChanged = warnings.some((w) => w.code === 'CATALOG_PRICE_CHANGED');
  const items: { key: string; label: string; children: ReactNode }[] = [
    {
      key: 'sku',
      label: 'Артикул',
      children: (
        <Typography.Text className="po-num" copyable={offer.sku ? { text: offer.sku, tooltips: ['Копіювати', 'Скопійовано'] } : false}>
          {offer.sku ?? '—'}
        </Typography.Text>
      ),
    },
    { key: 'name', label: 'Назва', children: offerDisplayName(offer) ?? '—' },
    {
      key: 'unit',
      label: 'Од.',
      children: (
        <Space size={6}>
          {offer.unitCode ?? '—'}
          <Warn codes={['UNIT_MISMATCH']} warnings={warnings} />
        </Space>
      ),
    },
    {
      key: 'qty',
      label: 'Кількість',
      children: (
        <Space size={6} wrap>
          <span className="po-num">{formatQty(oc?.qtyEffective)}</span>
          <span className="po-muted">(у заявці {formatQty(line.qty)}{offer.multiplicity && offer.multiplicity !== 1 ? `, кратність ${formatQty(offer.multiplicity)}` : ''})</span>
          {rounded ? <Tag color="orange">{formatWarning(rounded)}</Tag> : null}
          <Warn codes={['MULTIPLICITY_MISMATCH']} warnings={warnings} />
          {offer.multiplicity && offer.multiplicity !== 1 ? (
            <Tooltip title="Вимкніть, якщо цього разу постачальник продасть без кратності: к-сть буде як у клієнта. У каталозі кратність товару не зміниться.">
              <span className="po-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Switch size="small" checked={!offer.noRounding} disabled={readOnly} onChange={(on) => setOfferNoRounding(offer.id, !on)} />
                округлювати до кратності
              </span>
            </Tooltip>
          ) : null}
        </Space>
      ),
    },
    {
      key: 'input',
      label: 'Ціна вх. без ПДВ',
      children: (
        <Space size={6} wrap>
          <span className="po-num">
            {formatMoney(offer.purchasePriceCur)} {CURRENCY_LABELS[offer.currency]}
          </span>
          {catalogChanged && !readOnly ? (
            <Typography.Link onClick={() => actions.refreshOfferPrice(lineId, blockId)} title="Взяти актуальну ціну з прайсу постачальника">
              <SyncOutlined /> Оновити з прайсу
            </Typography.Link>
          ) : null}
          {!readOnly ? (
            <Typography.Link onClick={() => setPriceOffer(offer)} title="Постачальник дав іншу ціну на цей запит">
              <EditOutlined /> Змінити ціну
            </Typography.Link>
          ) : null}
        </Space>
      ),
    },
    {
      key: 'rate',
      label: 'Курс',
      children:
        offer.currency === 'UAH' ? (
          <span className="po-muted">гривня</span>
        ) : (
          <span className="po-num">
            {formatRate(oc?.rate)} <span className="po-muted">({rateSourceLabel(block)})</span>
          </span>
        ),
    },
    { key: 'markup', label: 'Націнка постачальника', children: <span className="po-num">{formatPct(block.supplierMarkupPct)}</span> },
    {
      key: 'net',
      label: 'Без ПДВ / з ПДВ',
      children: (
        <Space size={6}>
          <b className="po-num" style={oc?.isMin ? { color: SEMANTIC_COLORS.min } : undefined}>
            {formatMoneyUah(oc?.unitNetUah)}
          </b>
          <span className="po-num po-muted">/ {formatMoneyUah(oc?.unitGrossUah)}</span>
          {oc?.isMin ? <Tag color="green">мінімум</Tag> : oc?.diffVsMinPct ? <Tag color="orange">+{formatPct(oc.diffVsMinPct, 1)} до мінімуму</Tag> : null}
        </Space>
      ),
    },
    { key: 'sum', label: 'Сума без ПДВ', children: <b className="po-num">{formatMoneyUah(oc?.sumNetUah)}</b> },
    { key: 'rrp', label: 'РРЦ з ПДВ', children: <span className="po-num">{formatMoneyUah(oc?.rrpGrossUah)}</span> },
    {
      key: 'stock',
      label: 'Наявність',
      children: (
        <Space size={6}>
          {AVAILABILITY_LABELS[offer.availability]}
          {offer.stockQty != null ? <span className="po-num po-muted">({formatQty(offer.stockQty)})</span> : null}
          <Warn codes={['OUT_OF_STOCK', 'INSUFFICIENT_STOCK']} warnings={warnings} />
        </Space>
      ),
    },
    {
      key: 'date',
      label: 'Дата ціни',
      children: (
        <Space size={6} wrap>
          <span className="po-num">{formatDate(offer.priceDate)}</span>
          {oc?.stale.isStale ? <Tag color="orange">застаріла</Tag> : null}
          {webLink}
        </Space>
      ),
    },
    {
      key: 'note',
      label: 'Примітка',
      children: (
        <Input.TextArea
          key={`${offer.id}:${offer.note ?? ''}`}
          defaultValue={offer.note ?? ''}
          disabled={readOnly}
          autoSize={{ minRows: 1, maxRows: 4 }}
          placeholder="Примітка до пропозиції"
          onBlur={(e) => {
            const next = e.target.value.trim() || null;
            if (next !== offer.note) setOfferNote(offer.id, next);
          }}
        />
      ),
    },
  ];

  const otherWarnings = warnings.filter((w) => w.code !== 'QTY_ROUNDED');
  return (
    <div className="po-drawer-body">
      {offer.excluded ? (
        <Tag color="default" icon={<StopOutlined />} style={{ marginBottom: 8 }}>
          Не підходить — не враховується в порівнянні{offer.excludeReason ? `: ${offer.excludeReason}` : ''}
        </Tag>
      ) : manual ? (
        <Tag color="blue" icon={<CheckCircleOutlined />} style={{ marginBottom: 8 }}>
          Затверджено для рядка
        </Tag>
      ) : oc?.isSelected ? (
        <Tag color="gold" style={{ marginBottom: 8 }}>
          Рекомендовано (не затверджено) — піде в націнку як мінімальна ціна
        </Tag>
      ) : null}
      <Descriptions column={1} size="small" items={items} styles={{ label: { width: 150 } }} />
      {otherWarnings.length ? (
        <div className="po-drawer-warnings">
          {otherWarnings.map((w, i) => (
            <div key={`${w.code}-${i}`} style={{ color: w.severity === 'error' ? SEMANTIC_COLORS.error : w.severity === 'warning' ? SEMANTIC_COLORS.warning : undefined }}>
              • {formatWarning(w)}
            </div>
          ))}
        </div>
      ) : null}
      {cmp?.selectionState === 'manual_non_optimal' && manual ? (
        <Typography.Text type="warning">Обрано не мінімальну ціну: переплата {formatMoneyUah(cmp.overpayNet)} без ПДВ</Typography.Text>
      ) : null}
      <div className="po-drawer-actions">
        {manual ? (
          <Button icon={<CloseCircleOutlined />} disabled={readOnly} onClick={() => actions.togglePick(lineId, blockId)}>
            Зняти затвердження
          </Button>
        ) : (
          <Button type="primary" icon={<CheckCircleOutlined />} disabled={readOnly || !oc?.isCandidate} onClick={() => actions.togglePick(lineId, blockId)}>
            Затвердити
          </Button>
        )}
        <Button
          icon={offer.excluded ? <UndoOutlined /> : <StopOutlined />}
          disabled={readOnly}
          title={offer.excluded ? 'Знову враховувати в порівнянні' : EXCLUDE_HINT}
          onClick={() => actions.toggleExclude(lineId, blockId)}
        >
          {offer.excluded ? 'Підходить' : 'Не підходить'}
        </Button>
        <Button icon={<SwapOutlined />} disabled={readOnly} onClick={() => actions.openPickerFor(lineId, blockId, 'replace')}>
          Замінити товар
        </Button>
        <Button danger disabled={readOnly} onClick={() => actions.clearOffer(lineId, blockId)}>
          Очистити
        </Button>
      </div>
      <OfferPriceDialog offer={priceOffer} onClose={() => setPriceOffer(null)} />
    </div>
  );
}

export function OfferDrawer() {
  const target = useSourcingUi((s) => s.drawer);
  const openDrawer = useSourcingUi((s) => s.openDrawer);
  const mode = useUiPrefs((s) => s.editorMode);
  const line = useRequestDoc((s) => (target ? s.doc?.lines.find((l) => l.id === target.lineId) : undefined));
  const block = useRequestDoc((s) => (target ? s.doc?.blocks.find((b) => b.id === target.blockId) : undefined));
  const supplier = useRequestDoc((s) => (block?.supplierId ? s.doc?.refs.suppliers[block.supplierId] : undefined));
  const open = !!target && mode === 'comparison';
  return (
    <Drawer
      open={open}
      mask={false}
      width={420}
      placement="right"
      getContainer={false}
      rootClassName="po-offer-drawer"
      onClose={() => openDrawer(null)}
      title={
        supplier ? (
          <div className="po-drawer-title">
            <SupplierLogo name={supplier.name} logoUrl={supplier.logoUrl} color={supplier.color} size={22} showName />
            {line ? (
              <Typography.Text type="secondary" ellipsis style={{ fontSize: 12, fontWeight: 400 }}>
                Рядок № {line.position}: {line.clientName || 'без назви'}
              </Typography.Text>
            ) : null}
          </div>
        ) : (
          'Пропозиція'
        )
      }
    >
      {target ? <OfferDetails lineId={target.lineId} blockId={target.blockId} /> : null}
    </Drawer>
  );
}
