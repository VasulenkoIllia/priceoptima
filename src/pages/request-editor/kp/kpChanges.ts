// Що змінилось у КП після останньої сформованої версії: перегляд за поточними цінами й налаштуваннями проти збереженої
// версії. Сформована версія — документ, його не змінюють; щоб зміни (ціни, галочка «менеджер», умови…) увійшли в КП,
// потрібна нова версія (правки замовника 28.09 п.5: зняли галочку після формування, а у відкритій версії менеджер лишився).
import { KP_FOOTNOTE } from '@shared/pricing';
import type { KpDocumentDto, KpSnapshot } from '@shared/types';

/**
 * Те саме значення незалежно від порядку полів (збережена версія приходить з бази, JSONB, з іншим порядком ключів);
 * поле без значення й відсутнє поле (у старіших знімках) — однаково.
 */
function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x != null)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, x]) => [k, stable(x)]),
    );
  }
  return v ?? null;
}
const same = (a: unknown, b: unknown) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

/**
 * Назви змін для підказки, у порядку бланка; порожньо — перегляд такий самий, як версія.
 * validityDays — поточний строк дії в налаштуваннях (дата «дійсна до» в перегляді рахується від сьогодні, тож порівнюємо дні).
 */
export function kpChangesSince(
  base: Pick<KpDocumentDto, 'snapshot' | 'settings'>,
  preview: KpSnapshot,
  validityDays: number,
): string[] {
  const was = base.snapshot;
  const changes: string[] = [];
  // логотип — спільний з Налаштувань (29.09); реквізити, слоган і контакти шапки — з картки нашої юрособи
  const { logoPath: wasLogo, ...wasHead } = was.header;
  const { logoPath: nowLogo, ...nowHead } = preview.header;
  if (!same(wasLogo, nowLogo)) changes.push('логотип');
  if (!same(was.seller, preview.seller) || !same(wasHead, nowHead)) changes.push('наша юрособа');
  if (!same(was.buyer, preview.buyer)) changes.push('покупець');
  if (was.totals.vatMode !== preview.totals.vatMode) changes.push('ціни з ПДВ чи без');
  if (was.rows.length !== preview.rows.length) changes.push('кількість позицій');
  else if (
    was.totals.payable !== preview.totals.payable ||
    was.rows.some((r, i) => r.lineId !== preview.rows[i]?.lineId || r.qty !== preview.rows[i]?.qty || r.price !== preview.rows[i]?.price)
  ) {
    changes.push('ціни чи кількості');
  }
  if (was.rows.length === preview.rows.length && was.rows.some((r, i) => r.name !== preview.rows[i]?.name || r.nameSecondary !== preview.rows[i]?.nameSecondary)) {
    changes.push('назви товарів');
  }
  if (was.columns.showImages !== preview.columns.showImages) changes.push('фото');
  if (base.settings.validityDays !== validityDays) changes.push('строк дії');
  if (!same(was.terms, preview.terms)) changes.push('умови');
  if ((was.extraInfo ?? null) !== (preview.extraInfo ?? null)) changes.push('дод. інформація');
  if (was.managerName !== preview.managerName) changes.push('менеджер');
  // КП до 29.09 без примітки: типова примітка в новому бланку — не зміна, яку треба повідомляти
  const wasFooter = was.footer ?? KP_FOOTNOTE;
  if (wasFooter !== preview.footer) changes.push('примітка');
  return changes;
}
