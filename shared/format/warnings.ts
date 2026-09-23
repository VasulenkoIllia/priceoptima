import type { Warning, WarningCode } from '../types';
import { formatMoney, formatQty } from './number';

type Params = NonNullable<Warning['params']>;

const num = (p: Params, key: string): number | null => {
  const v = p[key];
  return typeof v === 'number' ? v : null;
};
const str = (p: Params, key: string): string => {
  const v = p[key];
  return v == null ? '' : String(v);
};

const MESSAGES: Record<WarningCode, (p: Params) => string> = {
  RATE_MISSING: (p) => `Немає курсу ${str(p, 'currency')} — вкажіть курс у блоці постачальника`,
  PRICE_MISSING: () => 'Товар без вхідної ціни',
  MULTIPLICITY_MISMATCH: (p) =>
    `Кількість ${formatQty(num(p, 'qty'))} не кратна ${formatQty(num(p, 'multiplicity'))} — рекомендовано ${formatQty(num(p, 'suggestedQty'))}`,
  QTY_ROUNDED: (p) => `Округлено з ${formatQty(num(p, 'from'))}, кратно ${formatQty(num(p, 'multiplicity'))}`,
  INSUFFICIENT_STOCK: (p) => `Замовлено ${formatQty(num(p, 'qty'))}, у наявності ${formatQty(num(p, 'stock'))}`,
  OUT_OF_STOCK: () => 'Немає в наявності',
  PRICE_STALE: (p) => `Ціна застаріла: ${formatQty(num(p, 'ageDays'))} дн. (норма ${formatQty(num(p, 'staleDays'))}) — перевірте на сайті постачальника`,
  CATALOG_PRICE_CHANGED: (p) =>
    `Ціна в каталозі змінилась: ${formatMoney(num(p, 'snapshotPrice'))} → ${formatMoney(num(p, 'catalogPrice'))} ${str(p, 'catalogCurrency')}`.trim(),
  INPUT_ABOVE_RRP: () => 'Вхідна ціна вища за РРЦ',
  UNIT_MISMATCH: (p) => `Одиниця постачальника «${str(p, 'offerUnit')}» ≠ одиниця клієнта «${str(p, 'clientUnit')}»`,
  SELECTED_EXCLUDED: () => 'Затверджена пропозиція виключена або порожня — діє рекомендація',
  SELECTION_NOT_OPTIMAL: (p) =>
    num(p, 'overpayNet') != null
      ? `Обрано не мінімальну ціну: переплата ${formatMoney(num(p, 'overpayNet'))} грн без ПДВ`
      : `Обрано не мінімальну ціну: переплата ${formatMoney(num(p, 'overpayGross'))} грн з ПДВ`,
  NO_OFFERS: () => 'Немає жодної пропозиції',
  QTY_ZERO: () => 'Не вказано кількість',
  BELOW_MIN_ORDER: (p) =>
    `Сума обраних з ПДВ ${formatMoney(num(p, 'selectedGross'))} < мін. замовлення з ПДВ ${formatMoney(num(p, 'minOrderAmount'))} — нерентабельно`,
  NO_RRP: () => 'Немає РРЦ для обраного способу націнки',
  BELOW_COST: () => 'Ціна продажу нижча за вхідну',
  ABOVE_RRP: () => 'Ціна продажу вища за РРЦ',
  NO_CLIENT: () => 'Не обрано клієнта',
};

/** Текст попередження українською (для тултипів і списків). */
export function formatWarning(w: Pick<Warning, 'code' | 'params'>): string {
  return MESSAGES[w.code](w.params ?? {});
}
