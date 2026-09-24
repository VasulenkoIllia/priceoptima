// Ціна входу й РРЦ пропозиції, введені прямо в клітинці («Підбір», «Порівняння», «Націнка») — лише в цій заявці:
// у каталозі ціну веде прайс постачальника, наступне оновлення переписало б ручну (правки замовника 23.09 п.8).
// Число — як його показує клітинка (грн); у пропозицію йде значення у валюті прайсу, тож клітинка покаже саме введене.
import type { App } from 'antd';
import { formatMoney, formatPct } from '@shared/format';
import { normalizeInputPrice, purchasePriceFromCell, round6 } from '@shared/pricing';
import { parseLocaleNumber } from '@shared/parse';
import type { UUID } from '@shared/types';
import { getRequestDocStore } from '@/stores/requestDocStore';

type Ui = Pick<ReturnType<typeof App.useApp>, 'message' | 'modal'>;

/** Зміна ціни понад стільки відсотків — перепитуємо (помилка на порядок: 1200 замість 120). */
export const BIG_CHANGE_PCT = 30;

/** Пропозиція, її розрахунок і курс для введення в клітинці; null — змінювати нічого (перегляд, немає товару чи курсу). */
function target(ui: Ui, lineId: UUID, blockId: UUID) {
  const s = getRequestDocStore().getState();
  if (s.readOnly) {
    ui.message.warning('Заявка відкрита лише для перегляду');
    return null;
  }
  const offer = s.findOffer(lineId, blockId);
  const oc = offer ? s.getComputed()?.offers[offer.id] : undefined;
  const block = s.doc?.blocks.find((b) => b.id === blockId);
  if (!offer || !oc || !block || !s.doc) return null;
  const rate = offer.currency === 'UAH' ? 1 : oc.rate;
  if (!rate) {
    ui.message.error('У блоці немає курсу: задайте курс, щоб змінити ціну');
    return null;
  }
  return { s, offer, oc, block, rate, vatRatePct: s.doc.header.vatRatePct };
}

/** Введене число: undefined — порожньо (Delete), нічого не міняємо; null — не число. */
function parsed(ui: Ui, raw: unknown): number | null | undefined {
  const text = raw == null ? '' : String(raw).trim();
  if (text === '') return undefined;
  const n = parseLocaleNumber(text);
  if (!n.valid || n.value == null || n.value <= 0) {
    ui.message.error('Введіть число, більше за нуль');
    return null;
  }
  return n.value;
}

/** Перепитати, якщо зміна велика; інакше — одразу. */
function confirmBig(ui: Ui, before: number | null, after: number, shownBefore: number | null, typed: number, unit: string, apply: () => void): void {
  const pct = before ? ((after - before) / before) * 100 : null;
  if (pct == null || Math.abs(pct) <= BIG_CHANGE_PCT) {
    apply();
    return;
  }
  ui.modal.confirm({
    title: `Ціна змінюється на ${pct > 0 ? '+' : '−'}${formatPct(Math.abs(pct), 0)}`,
    content: `Було ${formatMoney(shownBefore)} грн, стане ${formatMoney(typed)} грн ${unit}. Перевірте, чи немає зайвого нуля чи коми.`,
    okText: 'Так, змінити',
    cancelText: 'Виправити',
    onOk: apply,
  });
}

/** Нова ціна входу з клітинки: «Без ПДВ» / «Порівняння» (withVat = false) чи «З ПДВ» / «Вхід з ПДВ» (withVat = true). */
export function setOfferPriceFromInput(ui: Ui, lineId: UUID, blockId: UUID, raw: unknown, withVat: boolean): void {
  const value = parsed(ui, raw);
  if (value == null) return;
  const t = target(ui, lineId, blockId);
  if (!t) return;
  const unitNet = withVat ? normalizeInputPrice(value, true, t.vatRatePct) : value;
  const before = t.oc.unitNetUah;
  if (before != null && Math.abs(unitNet - before) < 0.005) return;
  const price = purchasePriceFromCell(value, withVat, t.vatRatePct, t.rate, t.block.supplierMarkupPct);
  confirmBig(ui, before, unitNet, withVat ? t.oc.unitGrossUah : before, value, withVat ? 'з ПДВ' : 'без ПДВ', () => {
    if (t.s.setOfferPurchasePrice(t.offer.id, price)) ui.message.success('Ціну змінено в цій заявці. Скасувати: Ctrl+Z');
  });
}

/** Нова РРЦ з клітинки (з ПДВ, грн); націнка постачальника на РРЦ не діє (Ф7). */
export function setOfferRrpFromInput(ui: Ui, lineId: UUID, blockId: UUID, raw: unknown): void {
  const value = parsed(ui, raw);
  if (value == null) return;
  const t = target(ui, lineId, blockId);
  if (!t) return;
  const before = t.oc.rrpGrossUah;
  if (before != null && Math.abs(value - before) < 0.005) return;
  confirmBig(ui, before, value, before, value, 'з ПДВ', () => {
    t.s.setOfferRrp(t.offer.id, round6(value / t.rate));
    ui.message.success('РРЦ змінено в цій заявці. Скасувати: Ctrl+Z');
  });
}
