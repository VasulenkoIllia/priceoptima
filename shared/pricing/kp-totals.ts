import type { FopPriceBasis, KpNameSource, KpVatMode } from '../enums';
import type {
  KpRow,
  KpSettings,
  KpTotals,
  MarkupRowComputed,
  Offer,
  PricingContext,
  RequestComputed,
  RequestDocument,
  RequestLine,
  UUID,
} from '../types';
import { isActiveLine } from './lines';
import { round2, sumMoney } from './money';

/** Режим цін заявки / КП для підсумків за Ф16. */
export interface TotalsMode {
  vatMode: KpVatMode;
  vatRatePct: number;
  fopPriceBasis: FopPriceBasis;
}

/** Режим ПДВ КП за замовчуванням: ФОП (неплатник) — завжди 'no_vat'. */
export function defaultKpVatMode(ownCompanyIsVatPayer: boolean, settingsDefault: KpVatMode): KpVatMode {
  if (!ownCompanyIsVatPayer) return 'no_vat';
  return settingsDefault === 'no_vat' ? 'without_vat' : settingsDefault;
}

/** F30: ціна і сума рядка КП за режимом ПДВ; null — рядок не потрапляє в КП. */
export function kpRowAmounts(
  row: MarkupRowComputed,
  vatMode: KpVatMode,
  fopPriceBasis: FopPriceBasis,
  useApprovedQty: boolean,
): { price: number; sum: number; qty: number } | null {
  if (row.saleNet == null || row.saleGross == null || row.sumNet == null || row.sumGross == null) return null;
  const useGross = vatMode === 'with_vat' || (vatMode === 'no_vat' && fopPriceBasis === 'gross');
  if (useApprovedQty) {
    if (row.approvedQty == null || row.approvedSumNet == null || row.approvedSumGross == null) return null;
    return {
      price: useGross ? row.saleGross : row.saleNet,
      sum: useGross ? row.approvedSumGross : row.approvedSumNet,
      qty: row.approvedQty,
    };
  }
  return { price: useGross ? row.saleGross : row.saleNet, sum: useGross ? row.sumGross : row.sumNet, qty: row.qty };
}

/** Ф16: підсумки КП (ПДВ — від підсумку документа). */
export function computeKpTotals(sums: readonly number[], vatMode: KpVatMode, vatRatePct: number): KpTotals {
  const total = sumMoney(sums);
  let totalNet: number;
  let vat: number;
  let totalGross: number;
  if (vatMode === 'without_vat') {
    totalNet = total;
    vat = round2((totalNet * vatRatePct) / 100);
    totalGross = round2(totalNet + vat);
  } else if (vatMode === 'with_vat') {
    totalGross = total;
    vat = round2((totalGross * vatRatePct) / (100 + vatRatePct));
    totalNet = round2(totalGross - vat);
  } else {
    totalNet = total;
    totalGross = total;
    vat = 0;
  }
  return { vatMode, vatRatePct, totalNet, vat, totalGross, payable: totalGross };
}

/**
 * Ф18: рядки фінального КП / погодження — погоджені рядки КП-основи з погодженими к-стями;
 * ціни — з КП-основи (зміни націнки не впливають). Підсумки — computeKpTotals у режимі КП-основи.
 */
export function approvedKpRows(baseRows: readonly KpRow[], lines: readonly Pick<RequestLine, 'id' | 'approval'>[]): KpRow[] {
  const approval = new Map(lines.map((l) => [l.id, l.approval]));
  const rows: KpRow[] = [];
  for (const row of baseRows) {
    const a = approval.get(row.lineId);
    if (!a?.approved) continue;
    const qty = a.approvedQty ?? row.qty;
    rows.push({ ...row, n: rows.length + 1, qty, sum: round2(row.price * qty) });
  }
  return rows;
}

/** Назва рядка КП за джерелом; власна kpName рядка перекриває назву товару. */
export function kpRowNames(
  line: Pick<RequestLine, 'clientName' | 'kpName'>,
  offer: (Pick<Offer, 'nameWork' | 'name1c'> & { catalog?: { name1c?: string | null } | null }) | null,
  source: KpNameSource,
): { name: string; nameSecondary: string | null } {
  const client = line.clientName.trim();
  if (source === 'client') return { name: line.kpName ?? client, nameSecondary: null };
  // назва 1С — актуальна з каталогу (могли завантажити або виправити вже після підбору товару), інакше зі знімка
  if (source === 'name1c') {
    return { name: line.kpName ?? offer?.catalog?.name1c ?? offer?.name1c ?? offer?.nameWork ?? client, nameSecondary: null };
  }
  const own = line.kpName ?? offer?.nameWork ?? offer?.name1c ?? client;
  if (source === 'work_with_client') {
    return { name: own, nameSecondary: client !== '' && client !== own ? client : null };
  }
  return { name: own, nameSecondary: null };
}

/** Рядки КП: активні рядки з ціною продажу; при onlyApproved — лише погоджені з погодженою к-стю. */
export function buildKpRows(
  doc: Pick<RequestDocument, 'lines' | 'offers'>,
  computed: Pick<RequestComputed, 'markup'>,
  settings: KpSettings,
  ctx: Pick<PricingContext, 'settings'>,
  /** Головні фото товарів (лише коли в КП додають фото). */
  images?: ReadonlyMap<UUID, string>,
): KpRow[] {
  const offersById = new Map<UUID, Offer>(doc.offers.map((o) => [o.id, o]));
  const lines = [...doc.lines].sort((a, b) => a.position - b.position);
  const rows: KpRow[] = [];
  for (const line of lines) {
    if (!isActiveLine(line)) continue;
    const mr = computed.markup.rows[line.id];
    if (!mr) continue;
    const amounts = kpRowAmounts(mr, settings.vatMode, ctx.settings.fopPriceBasis, settings.onlyApproved);
    if (!amounts) continue;
    const offer = mr.effectiveOfferId ? (offersById.get(mr.effectiveOfferId) ?? null) : null;
    const names = kpRowNames(line, offer, settings.nameSource);
    rows.push({
      n: rows.length + 1,
      lineId: line.id,
      code: offer?.sku ?? null,
      imagePath: (settings.showImages && offer?.productId ? images?.get(offer.productId) : null) ?? null,
      name: names.name,
      nameSecondary: names.nameSecondary,
      unit: offer?.unitCode ?? line.clientUnit ?? 'шт',
      qty: amounts.qty,
      price: amounts.price,
      sum: amounts.sum,
    });
  }
  return rows;
}
