// Незбережені зміни людською мовою: коли редагування втрачено (адмін забрав, строк вийшов) або заявку змінили
// в іншій вкладці, документ відкривається заново з сервера, а людина бачить, що саме треба внести ще раз.
import { formatMoney, formatQty } from '@shared/format';
import { stableJson } from '@shared/requests';
import type { Offer, RequestDocument, RequestHeader, RequestLine, SupplierBlock, UUID } from '@shared/types';

/** Більше пунктів у вікні не читають — решту підсумовуємо одним рядком. */
const MAX_ITEMS = 100;

const HEADER_LABELS: Partial<Record<keyof RequestHeader, string>> = {
  title: 'Тема',
  requestDate: 'Дата',
  clientId: 'Клієнт',
  counterpartyId: 'Контрагент',
  contactId: 'Контакт',
  ownCompanyId: 'Наша юрособа',
  managerId: 'Відповідальний',
  notes: 'Нотатки',
  purchaseNote: 'Примітка до закупівлі',
  rates: 'Курс заявки',
  discountFormula: 'Формула знижки',
  kpSettings: 'Бланк КП',
  approvalKpId: 'КП для погодження',
};

const byPosition = <T extends { position: number }>(list: readonly T[]) => [...list].sort((a, b) => a.position - b.position);

function differs<T>(a: T, b: T): boolean {
  return a !== b && stableJson(a) !== stableJson(b);
}

export function describeUnsavedChanges(prev: RequestDocument, next: RequestDocument): string[] {
  const items: string[] = [];
  const push = (s: string) => items.push(s);

  const ordinal = new Map<UUID, number>();
  byPosition(next.lines).forEach((l, i) => ordinal.set(l.id, i + 1));
  byPosition(prev.lines).forEach((l, i) => ordinal.has(l.id) || ordinal.set(l.id, i + 1));
  const lineById = new Map<UUID, RequestLine>([...prev.lines, ...next.lines].map((l) => [l.id, l]));
  const lineLabel = (id: UUID) => {
    const l = lineById.get(id);
    return `Рядок ${ordinal.get(id) ?? '?'}${l?.clientName ? ` «${l.clientName}»` : ''}`;
  };
  const blockById = new Map<UUID, SupplierBlock>([...prev.blocks, ...next.blocks].map((b) => [b.id, b]));
  const supplierName = (blockId: UUID | null | undefined) => {
    const b = blockId ? blockById.get(blockId) : undefined;
    const id = b?.supplierId;
    return (id ? (next.refs.suppliers[id]?.name ?? prev.refs.suppliers[id]?.name) : null) ?? 'постачальник';
  };

  // шапка й націнка заявки
  const header = (Object.keys(HEADER_LABELS) as (keyof RequestHeader)[]).filter((k) => differs(prev.header[k], next.header[k]));
  if (header.length) push(`Шапка: змінено ${header.map((k) => `«${HEADER_LABELS[k]}»`).join(', ')}`);
  if (differs(prev.markup, next.markup)) push('Націнка заявки: змінено спосіб або відсоток');

  // постачальники
  const prevBlocks = new Map(prev.blocks.map((b) => [b.id, b]));
  const nextBlocks = new Map(next.blocks.map((b) => [b.id, b]));
  for (const b of byPosition(next.blocks)) {
    const was = prevBlocks.get(b.id);
    if (!was) push(`Додано постачальника: ${supplierName(b.id)}`);
    else if (was !== b && differs(was, b)) push(`${supplierName(b.id)}: змінено курс, націнку або примітку блоку`);
  }
  for (const b of prev.blocks) if (!nextBlocks.has(b.id)) push(`Прибрано постачальника: ${supplierName(b.id)}`);

  // позиції
  const prevLines = new Map(prev.lines.map((l) => [l.id, l]));
  const nextLines = new Map(next.lines.map((l) => [l.id, l]));
  for (const l of byPosition(next.lines)) {
    const was = prevLines.get(l.id);
    if (!was) {
      if (l.clientName.trim() || l.qty) push(`Новий рядок ${ordinal.get(l.id)}: «${l.clientName}», ${formatQty(l.qty)} ${l.clientUnit ?? ''}`.trim());
      continue;
    }
    if (was === l) continue;
    const parts: string[] = [];
    if (was.clientName !== l.clientName) parts.push(`назва «${was.clientName}» → «${l.clientName}»`);
    if (was.qty !== l.qty) parts.push(`к-сть ${formatQty(was.qty)} → ${formatQty(l.qty)}`);
    if (was.clientUnit !== l.clientUnit) parts.push(`од. ${was.clientUnit || 'без од.'} → ${l.clientUnit || 'без од.'}`);
    if (was.clientNote !== l.clientNote) parts.push('примітка');
    if (was.kpName !== l.kpName) parts.push('назва в КП');
    if (was.selection.blockId !== l.selection.blockId) {
      parts.push(l.selection.blockId ? `✔ ${supplierName(l.selection.blockId)}` : '✔ знято');
    }
    if (differs(was.markup, l.markup)) parts.push('націнка рядка');
    if (differs(was.approval, l.approval)) {
      parts.push(l.approval.approved ? `погоджено ${formatQty(l.approval.approvedQty ?? l.qty)}` : 'погодження знято');
    }
    if (parts.length) push(`${lineLabel(l.id)}: ${parts.join('; ')}`);
  }
  for (const l of byPosition(prev.lines)) if (!nextLines.has(l.id)) push(`Видалено ${lineLabel(l.id).replace(/^Рядок/u, 'рядок')}`);

  // пропозиції
  const prevOffers = new Map(prev.offers.map((o) => [o.id, o]));
  const nextOffers = new Map(next.offers.map((o) => [o.id, o]));
  const where = (o: Offer) => `${lineLabel(o.lineId)}, ${supplierName(o.blockId)}`;
  for (const o of next.offers) {
    const was = prevOffers.get(o.id);
    if (!was) {
      push(`${where(o)}: ${o.sku ? `артикул ${o.sku}` : 'нова пропозиція'}`);
      continue;
    }
    if (was === o) continue;
    const parts: string[] = [];
    if (was.sku !== o.sku) parts.push(`артикул ${was.sku || 'без артикула'} → ${o.sku || 'без артикула'}`);
    if (was.purchasePriceCur !== o.purchasePriceCur) {
      parts.push(`ціна ${formatMoney(was.purchasePriceCur) || 'немає'} → ${formatMoney(o.purchasePriceCur) || 'немає'}`);
    }
    if (was.qty !== o.qty) parts.push(`к-сть ${formatQty(was.qty) || 'немає'} → ${formatQty(o.qty) || 'немає'}`);
    if (was.excluded !== o.excluded) parts.push(o.excluded ? '«не підходить»' : 'повернуто');
    if (was.note !== o.note) parts.push('примітка');
    if (!!was.noRounding !== !!o.noRounding) parts.push(o.noRounding ? 'без округлення до кратності' : 'з округленням до кратності');
    if (parts.length) push(`${where(o)}: ${parts.join('; ')}`);
  }
  for (const o of prev.offers) if (!nextOffers.has(o.id)) push(`${where(o)}: пропозицію прибрано`);

  if (items.length <= MAX_ITEMS) return items;
  return [...items.slice(0, MAX_ITEMS), `…і ще змін: ${items.length - MAX_ITEMS}`];
}
