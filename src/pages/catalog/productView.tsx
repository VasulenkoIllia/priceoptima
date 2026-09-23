// Відображення товару: наявність, джерело ціни, ціна у валюті (сітка і картка).
import { useQuery } from '@tanstack/react-query';
import { Tag } from 'antd';
import { AVAILABILITY_LABELS, CURRENCY_LABELS, type AvailabilityStatus, type CurrencyCode, type PriceSource } from '@shared/enums';
import { formatMoney, formatQty } from '@shared/format';
import { DEFAULT_APP_SETTINGS, netToGross } from '@shared/pricing';
import { ds, qk } from '@/data';

/** '8,602 USD'; null → '—'. */
/** Ціна в каталозі — 2 знаки, як в Excel-вивантаженні. */
export function priceCur(v: number | null | undefined, currency: CurrencyCode): string {
  return v == null ? '' : `${formatMoney(v)} ${CURRENCY_LABELS[currency]}`;
}

/** Каталог показує вхід з ПДВ (п.7 правок клієнта); зберігається без ПДВ — для підбору, порівняння й КП. */
export function grossPrice(net: number | null | undefined, vatRatePct: number): number | null {
  return net == null ? null : netToGross(net, vatRatePct);
}

/** Ставка ПДВ з Налаштувань (для показу цін з ПДВ). */
export function useVatRate(): number {
  const settings = useQuery({ queryKey: qk.settings, queryFn: () => ds.getSettings() });
  return settings.data?.vatRatePct ?? DEFAULT_APP_SETTINGS.vatRatePct;
}

/** Джерело запису історії цін. */
export const HISTORY_SOURCE_LABELS: Record<PriceSource, string> = {
  import: 'Прайс постачальника',
  seed: 'Початкове завантаження',
  manual: 'Вручну',
  request: 'Заявка',
};

export function Availability({ status, qty }: { status: AvailabilityStatus; qty: number | null }) {
  return (
    <span className={`po-cat-avail po-cat-avail-${status}`}>
      <span className="po-cat-avail-dot" aria-hidden />
      {AVAILABILITY_LABELS[status]}
      {qty != null && qty > 0 ? <span className="po-num po-muted">{formatQty(qty)}</span> : null}
    </span>
  );
}

/** «Прайс» — ціна оновлюється з прайсу постачальника; «Вручну» — товар додано вручну. */
export function PriceSourceTag({ source }: { source: PriceSource | null }) {
  if (source === 'manual')
    return (
      <Tag className="po-cat-tag" color="gold" bordered={false}>
        Вручну
      </Tag>
    );
  if (source === 'request')
    return (
      <Tag className="po-cat-tag" bordered={false}>
        Із заявки
      </Tag>
    );
  return <span className="po-muted">Прайс</span>;
}
