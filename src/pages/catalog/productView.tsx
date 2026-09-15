// Відображення товару: наявність, джерело ціни, ціна у валюті (сітка і картка).
import { Tag } from 'antd';
import { AVAILABILITY_LABELS, CURRENCY_LABELS, type AvailabilityStatus, type CurrencyCode, type PriceSource } from '@shared/enums';
import { formatQty, formatRate } from '@shared/format';

/** '8,602 USD'; null → '—'. */
export function priceCur(v: number | null | undefined, currency: CurrencyCode): string {
  return v == null ? '—' : `${formatRate(v)} ${CURRENCY_LABELS[currency]}`;
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
