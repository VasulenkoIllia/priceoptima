// Дії вкладки «Позиції і підбір» поверх стору документа (стор — єдине джерело правди; тут — повідомлення й UI-стан).
import { App, Button } from 'antd';
import { useMemo } from 'react';
import { formatQty, formatWarning } from '@shared/format';
import { catalogChangeParams, checkMultiplicity, offerMultiplicity } from '@shared/pricing';
import { normalizeSku, parseLocaleNumber } from '@shared/parse';
import type { SupplierBlock, SupplierRef, UUID } from '@shared/types';
import { openPicker } from '@/components/ProductPicker';
import { errorMessage } from '@/data/errors';
import { getRequestDocStore, type AddLinesMode, type NewLineInput } from '@/stores/requestDocStore';
import { COL, LINE_FIELDS, type LineField } from './colIds';
import { planFill, type FillField } from './fill';
import { pasteSkusSummary, type PastePlan } from './paste';
import { NEW_ROW_ID } from './rows';
import { useSourcingUi } from './sourcingUiStore';

export type SourcingActions = ReturnType<typeof createSourcingActions>;
type AppApi = ReturnType<typeof App.useApp>;

const doc = () => getRequestDocStore().getState();
const ui = () => useSourcingUi.getState();

export function blockOf(blockId: UUID): SupplierBlock | null {
  return doc().doc?.blocks.find((b) => b.id === blockId) ?? null;
}

export function supplierOfBlock(blockId: UUID): SupplierRef | null {
  const s = doc();
  const b = s.doc?.blocks.find((x) => x.id === blockId);
  return b?.supplierId ? (s.doc?.refs.suppliers[b.supplierId] ?? null) : null;
}

function lineOf(lineId: UUID) {
  return doc().doc?.lines.find((l) => l.id === lineId) ?? null;
}

export function createSourcingActions(app: AppApi) {
  const { message, notification, modal } = app;

  const guard = (): boolean => {
    if (doc().readOnly) {
      message.warning('Заявка відкрита лише для перегляду');
      return false;
    }
    return true;
  };

  /** Після підстановки товару: підказка, якщо к-сть округлено до кратної (118 → 120). */
  function notifyRounded(lineId: UUID, blockId: UUID): void {
    const offer = doc().findOffer(lineId, blockId);
    const line = lineOf(lineId);
    if (!offer || !line || offer.qty == null || offer.qty === line.qty) return;
    message.info(
      `${offer.sku ?? 'Товар'}: ${formatWarning({ code: 'QTY_ROUNDED', params: { from: line.qty, to: offer.qty, multiplicity: offer.multiplicity ?? 1 } }).toLowerCase()} → ${formatQty(offer.qty)}`,
    );
  }

  /** Вікно вибору товару (§6.7): з клітинки блоку — фільтр на постачальника; запит — набраний текст або назва клієнта. */
  function openPickerFor(lineId: UUID, blockId: UUID | null, mode: 'add' | 'replace' = 'add', query?: string): void {
    const line = lineOf(lineId);
    if (!line || !guard()) return;
    openPicker({
      lineId,
      blockId,
      supplierId: blockId ? (supplierOfBlock(blockId)?.id ?? null) : null,
      query: query?.trim() || line.clientName,
      mode,
    });
  }

  function openCreateProduct(lineId: UUID, blockId: UUID, sku: string): void {
    notification.destroy(`miss:${lineId}:${blockId}`);
    ui().openCreateProduct({ lineId, blockId, sku });
  }

  /** Введення артикула в клітинку блоку: lookup у каталозі постачальника. */
  async function enterSku(lineId: UUID, blockId: UUID, raw: string): Promise<void> {
    const s = doc();
    if (s.readOnly) return;
    const sku = raw.trim();
    const current = s.findOffer(lineId, blockId);
    if (!sku) {
      if (current) s.clearOffer(current.id);
      ui().setMiss(lineId, blockId, null);
      return;
    }
    if (current?.sku && normalizeSku(current.sku) === normalizeSku(sku)) {
      ui().setMiss(lineId, blockId, null);
      return;
    }
    try {
      const res = await s.setOfferBySku(lineId, blockId, sku);
      const supplier = supplierOfBlock(blockId)?.name ?? 'постачальника';
      if (res.status === 'ok') {
        ui().setMiss(lineId, blockId, null);
        notifyRounded(lineId, blockId);
      } else if (res.status === 'not_found') {
        ui().setMiss(lineId, blockId, { sku, kind: 'not_found' });
        const key = `miss:${lineId}:${blockId}`;
        notification.warning({
          key,
          message: `Артикул не знайдено у ${supplier} — Створити товар?`,
          description: `Артикул «${sku}» відсутній у каталозі постачальника.`,
          duration: 8,
          actions: (
            <Button size="small" type="primary" onClick={() => openCreateProduct(lineId, blockId, sku)}>
              Створити товар
            </Button>
          ),
        });
      } else if (res.status === 'ambiguous') {
        const miss = { sku, kind: 'ambiguous' as const, candidates: res.candidates };
        ui().setMiss(lineId, blockId, miss);
        ui().openAmbiguous({ lineId, blockId, miss });
      }
    } catch (e) {
      message.error(errorMessage(e));
    }
  }

  /** Клік по підказці невдалого артикула в клітинці. */
  function resolveMiss(lineId: UUID, blockId: UUID): void {
    const miss = ui().skuMisses[`${lineId}:${blockId}`];
    if (!miss || !guard()) return;
    if (miss.kind === 'not_found') openCreateProduct(lineId, blockId, miss.sku);
    else if (miss.candidates?.length) ui().openAmbiguous({ lineId, blockId, miss });
    else void enterSku(lineId, blockId, miss.sku);
  }

  /** К-сть рядка клієнта з клітинки («1,5», «120»; порожньо → 0). */
  function setLineQtyFromInput(lineId: UUID, raw: unknown): void {
    const n = parseLocaleNumber(raw == null ? '' : String(raw));
    if (!n.valid || (n.value ?? 0) < 0) {
      message.error('Кількість — невід’ємне число');
      return;
    }
    doc().updateLine(lineId, { qty: n.value ?? 0 });
  }

  /** К-сть пропозиції з клітинки: кратність — автоокруглення вгору з підказкою. */
  function setOfferQtyFromInput(lineId: UUID, offerId: UUID, raw: unknown): void {
    const s = doc();
    const offer = s.doc?.offers.find((o) => o.id === offerId);
    const line = lineOf(lineId);
    if (!offer || !line || s.readOnly) return;
    const text = raw == null ? '' : String(raw).trim();
    if (text === '') {
      s.setOfferQty(offerId, null);
      return;
    }
    const n = parseLocaleNumber(text);
    if (!n.valid || n.value == null || n.value < 0) {
      message.error('Кількість — невід’ємне число');
      return;
    }
    let qty = n.value;
    if (s.settings?.autoRoundMultiplicity ?? true) {
      const check = checkMultiplicity(qty, offerMultiplicity(offer));
      if (!check.isMultiple && check.suggestedQty != null) {
        message.info(`Округлено з ${formatQty(qty)} до ${formatQty(check.suggestedQty)}, кратно ${formatQty(offerMultiplicity(offer))}`);
        qty = check.suggestedQty;
      }
    }
    s.setOfferQty(offerId, qty === line.qty ? null : qty);
  }

  /** ✔ — радіо в межах рядка: повторний клік знімає затвердження. */
  function togglePick(lineId: UUID, blockId: UUID): void {
    const s = doc();
    if (!guard()) return;
    const line = lineOf(lineId);
    const oc = s.getComputed()?.offers[s.getComputed()?.offerIndex[lineId]?.[blockId] ?? ''];
    if (!line || !oc?.isCandidate) return;
    const manual = line.selection.blockId === blockId && oc.isSelected;
    s.selectOffer(lineId, manual ? null : blockId);
  }

  function toggleExclude(lineId: UUID, blockId: UUID): void {
    if (!guard()) return;
    const offer = doc().findOffer(lineId, blockId);
    if (offer) doc().toggleExclude(offer.id);
  }

  function clearOffer(lineId: UUID, blockId: UUID): void {
    if (!guard()) return;
    const offer = doc().findOffer(lineId, blockId);
    if (offer) doc().clearOffer(offer.id);
    ui().setMiss(lineId, blockId, null);
  }

  /** Ціна змінилась у каталозі — взяти актуальну з прайсу постачальника; спершу показуємо, що саме зміниться. */
  function refreshOfferPrice(lineId: UUID, blockId: UUID): void {
    if (!guard()) return;
    const offer = doc().findOffer(lineId, blockId);
    const params = offer ? catalogChangeParams(offer) : null;
    if (!offer || !params) return;
    modal.confirm({
      title: 'Оновити ціну з прайсу?',
      content: (
        <>
          {formatWarning({ code: 'CATALOG_PRICE_CHANGED', params })}.
          <br />
          {params.manual ? 'Ручну ціну входу буде замінено ціною з прайсу. ' : ''}Скасувати — Ctrl+Z.
        </>
      ),
      okText: 'Оновити',
      cancelText: 'Ні',
      onOk: () => {
        if (doc().refreshOfferPrice(offer.id)) message.success('Ціну оновлено з прайсу постачальника');
      },
    });
  }

  /**
   * Введення в порожній рядок унизу таблиці — новий рядок заявки.
   * Enter — одразу введення наступної позиції в порожньому рядку, Tab / Shift+Tab — сусідня клітинка нового рядка.
   */
  function addLineFromNewRow(field: LineField, raw: string, key: 'enter' | 'next' | 'back' | null): void {
    const text = raw.trim();
    if (!text || !guard()) return;
    const input: NewLineInput = { clientName: '' };
    if (field === 'clientName') input.clientName = text;
    else if (field === 'clientUnit') input.clientUnit = text;
    else {
      const n = parseLocaleNumber(text);
      if (!n.valid || (n.value ?? 0) < 0) {
        message.error('Кількість — невід’ємне число');
        return;
      }
      input.qty = n.value ?? 0;
    }
    const [id] = doc().addLines([input], 'append');
    if (!id) return;
    if (key === 'enter') {
      ui().requestFocus({ lineId: NEW_ROW_ID, colId: COL.line('clientName'), edit: true });
    } else if (key) {
      const next = LINE_FIELDS[LINE_FIELDS.indexOf(field) + (key === 'next' ? 1 : -1)];
      if (next) ui().requestFocus({ lineId: id, colId: COL.line(next), edit: true });
    }
  }

  /** Новий порожній рядок і одразу введення назви. */
  function addLine(mode: AddLinesMode = 'append'): void {
    if (!guard()) return;
    const [id] = doc().addLines([{ clientName: '' }], mode);
    if (!id) return;
    ui().setFilter('all');
    ui().setSearch('');
    ui().requestFocus({ lineId: id, colId: COL.line('clientName'), edit: true });
  }

  function removeLines(ids: UUID[]): void {
    if (!ids.length || !guard()) return;
    doc().removeLines(ids);
    message.success(`Видалено рядків: ${ids.length}. Скасувати — Ctrl+Z`);
  }

  /** Протягування / Ctrl+D: значення одиниці або кількості рядка-джерела в цільові рядки одним кроком (Ctrl+Z скасовує). */
  function fillLines(field: FillField, sourceId: UUID, targetIds: readonly UUID[]): void {
    const source = lineOf(sourceId);
    if (!source || !targetIds.length || !guard()) return;
    const targets = targetIds.map(lineOf).filter((l): l is NonNullable<typeof l> => l != null);
    const patches = planFill(field, source, targets);
    if (!patches.length) return;
    doc().updateLines(patches);
    if (patches.length > 1) message.success(`Заповнено рядків: ${patches.length}. Скасувати — Ctrl+Z`);
  }

  async function applyPastePlan(plan: PastePlan): Promise<void> {
    if (plan.kind === 'empty') return;
    if (plan.kind === 'unsupported') {
      message.info('Вставка з буфера працює в колонці «Артикул» блоку і в колонках клієнта (найменування, од., к-сть)');
      return;
    }
    if (!guard()) return;
    if (plan.kind === 'skus') {
      if (!plan.targets.length) {
        message.warning('Немає рядків для вставки — додайте рядки клієнта');
        return;
      }
      const hide = message.loading('Шукаю артикули в каталозі…', 0);
      try {
        const res = await doc().pasteSkusToLines(plan.blockId, plan.targets);
        const notFound = new Set(res.notFound);
        const ambiguous = new Set(res.ambiguous);
        ui().setMisses(
          plan.targets.map((t) => ({
            lineId: t.lineId,
            blockId: plan.blockId,
            miss: notFound.has(t.sku) ? { sku: t.sku, kind: 'not_found' } : ambiguous.has(t.sku) ? { sku: t.sku, kind: 'ambiguous' } : null,
          })),
        );
        const summary = pasteSkusSummary({ ...res, skipped: res.skipped + plan.overflow });
        if (res.notFound.length || res.ambiguous.length || plan.overflow) message.warning(summary, 6);
        else message.success(summary);
      } catch (e) {
        message.error(errorMessage(e));
      } finally {
        hide();
      }
      return;
    }
    const s = doc();
    s.updateLines(plan.updates);
    if (plan.newRows.length) s.addLines(plan.newRows, 'append');
    const parts = [`оновлено рядків: ${plan.updates.length}`];
    if (plan.newRows.length) parts.push(`додано: ${plan.newRows.length}`);
    if (plan.invalid) parts.push(`пропущено некоректних чисел: ${plan.invalid}`);
    message.success(`Вставлено — ${parts.join(', ')}`);
  }

  return {
    openPickerFor,
    openCreateProduct,
    enterSku,
    resolveMiss,
    setLineQtyFromInput,
    setOfferQtyFromInput,
    togglePick,
    toggleExclude,
    clearOffer,
    refreshOfferPrice,
    addLineFromNewRow,
    addLine,
    removeLines,
    applyPastePlan,
    fillLines,
  };
}

export function useSourcingActions(): SourcingActions {
  const app = App.useApp();
  return useMemo(() => createSourcingActions(app), [app]);
}
