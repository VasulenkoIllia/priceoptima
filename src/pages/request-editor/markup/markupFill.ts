// Протягування способу націнки й % у «Націнці», як в Excel (правки замовника 23.09 п.9): правило рядка-джерела — в інші рядки.
import type { LineMarkupOverride, RequestLine } from '@shared/types';

/**
 * Що протягнути з рядка-джерела: спосіб і % (або «Як у заявці», якщо власного немає).
 * Ручну ціну не протягуємо: це ціна конкретного товару — null.
 */
export function markupFillPatch(source: Pick<RequestLine, 'markup'>): Partial<LineMarkupOverride> | null {
  const m = source.markup;
  if (m.method === 'manual' || m.manualPriceNet != null || m.manualPriceGross != null) return null;
  return { method: m.method, value: m.method ? m.value : null, manualPriceNet: null, manualPriceGross: null };
}
