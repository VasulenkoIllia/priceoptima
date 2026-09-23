import type { Warning, WarningCode } from '../types';
import { formatDate } from './date';
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

/** «Змінилось у каталозі»: лише те, що справді змінилось; ціну входу, змінену вручну в заявці, так і називаємо. */
function catalogChangeText(p: Params): string {
  const cur = str(p, 'catalogCurrency');
  const prevCur = str(p, 'snapshotCurrency') || cur;
  const priceChanged = num(p, 'snapshotPrice') !== num(p, 'catalogPrice');
  const others: string[] = [];
  if (prevCur !== cur) others.push(`валюта ${prevCur} → ${cur}`);
  if ('catalogRrp' in p && num(p, 'snapshotRrp') !== num(p, 'catalogRrp')) {
    others.push(`РРЦ ${formatMoney(num(p, 'snapshotRrp'))} → ${formatMoney(num(p, 'catalogRrp'))} ${cur}`);
  }
  if (num(p, 'manual') === 1) {
    const text = `Ціну входу змінено вручну в заявці: ${formatMoney(num(p, 'snapshotPrice'))} ${prevCur}, у прайсі ${formatMoney(num(p, 'catalogPrice'))} ${cur}`;
    return others.length ? `${text}; у каталозі також змінились: ${others.join(', ')}` : text;
  }
  const parts = priceChanged ? [`вхід без ПДВ ${formatMoney(num(p, 'snapshotPrice'))} → ${formatMoney(num(p, 'catalogPrice'))} ${cur}`, ...others] : others;
  return `У каталозі змінились: ${parts.join(', ')}`;
}

const MESSAGES: Record<WarningCode, (p: Params) => string> = {
  RATE_MISSING: (p) => `Немає курсу ${str(p, 'currency')} — вкажіть курс у блоці постачальника`,
  PRICE_MISSING: () => 'Товар без вхідної ціни',
  MULTIPLICITY_MISMATCH: (p) =>
    `Кількість ${formatQty(num(p, 'qty'))} не кратна ${formatQty(num(p, 'multiplicity'))} — рекомендовано ${formatQty(num(p, 'suggestedQty'))}`,
  QTY_ROUNDED: (p) => `Округлено з ${formatQty(num(p, 'from'))}, кратно ${formatQty(num(p, 'multiplicity'))}`,
  INSUFFICIENT_STOCK: (p) => `Замовлено ${formatQty(num(p, 'qty'))}, у наявності ${formatQty(num(p, 'stock'))}`,
  OUT_OF_STOCK: () => 'Немає в наявності',
  NOT_IN_PRICE_LIST: (p) => `Немає у прайсі постачальника з ${formatDate(str(p, 'since'))} — ціна остання відома, уточніть у постачальника`,
  PRICE_STALE: (p) => `Ціна застаріла: ${formatQty(num(p, 'ageDays'))} дн. (норма ${formatQty(num(p, 'staleDays'))}) — перевірте на сайті постачальника`,
  CATALOG_PRICE_CHANGED: catalogChangeText,
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
