// Вікно вибору товару (§6.7): рядки результатів (ціна в грн за курсом блоку/постачальника), групування однакових назв,
// правила вибору (1–3 товари різних постачальників), посилання на сайт постачальника. Ранжування — у DataSource.searchProducts.
import { computeOfferBase, createOfferFromProduct, createSupplierBlock } from '@shared/pricing';
import { isHttpUrl, searchTokens } from '@shared/parse';
import type { HeaderRates, PricingContext, ProductPickDto, RequestDocument, RequestLine, SupplierRef, UUID } from '@shared/types';

export const MAX_PICK = 3;

export interface PickerPricing {
  doc: Pick<RequestDocument, 'header' | 'blocks' | 'offers'>;
  ctx: PricingContext;
  line: RequestLine;
  supplierRef(supplierId: UUID): SupplierRef | null;
  /** Загальний курс, який візьме новий блок (на сьогодні); немає — курс шапки заявки. */
  ratesToday?: HeaderRates | null;
}

export interface PickerRow {
  key: UUID;
  product: ProductPickDto;
  supplier: SupplierRef | null;
  /** Блок цього постачальника в заявці (null — буде створено при додаванні). */
  blockId: UUID | null;
  /** Без ПДВ, грн за од. — за курсом і націнкою блоку (або постачальника, якщо блоку ще нема), як у сітці. */
  unitNetUah: number | null;
  /** РРЦ з ПДВ, грн. */
  rrpGrossUah: number | null;
  rate: number | null;
  supplierMarkupPct: number;
  /** Цей товар уже стоїть у рядку. */
  inLine: boolean;
  /** Найдешевший серед однакових назв (≥ 2 товари). */
  cheapestInGroup: boolean;
}

const PREVIEW_ID = '__picker';

/** Ціна товару так, ніби він уже в блоці заявки (той самий рушій, що й у сітці: Ф3/Ф7). */
function priceInRequest(product: ProductPickDto, blockId: UUID | null, supplier: SupplierRef | null, p: PickerPricing) {
  const block =
    (blockId ? p.doc.blocks.find((b) => b.id === blockId) : null) ??
    (supplier
      ? createSupplierBlock(supplier, p.ratesToday ?? p.doc.header.rates, { id: PREVIEW_ID, position: 0 }, { maxAgeDays: p.ctx.settings.priceListRateMaxAgeDays })
      : null);
  if (!block) return { unitNetUah: null, rrpGrossUah: null, rate: null, supplierMarkupPct: 0 };
  const offer = createOfferFromProduct(product, {
    id: PREVIEW_ID,
    lineId: p.line.id,
    blockId: block.id,
    lineQty: p.line.qty,
    autoRoundMultiplicity: false,
  });
  const oc = computeOfferBase(offer, p.line, block, p.doc.header, p.ctx);
  return { unitNetUah: oc.unitNetUah, rrpGrossUah: oc.rrpGrossUah, rate: oc.rate, supplierMarkupPct: block.supplierMarkupPct };
}

/** Однакові назви — з точністю до регістру, пунктуації й порядку слів («Unipak паста 360 г» = «Паста 360 г Unipak»). */
export function sameNameKey(name: string): string {
  return searchTokens(name).sort().join(' ');
}

const byPrice = (a: PickerRow, b: PickerRow) => (a.unitNetUah ?? Number.POSITIVE_INFINITY) - (b.unitNetUah ?? Number.POSITIVE_INFINITY);

/**
 * Порядок показу: ранжування пошуку, але товари з однаковою назвою стоять разом (на місці найрелевантнішого)
 * і всередині — за ціною, щоб одразу було видно, де дешевше.
 */
export function groupSameNames(rows: readonly PickerRow[]): PickerRow[] {
  const groups = new Map<string, PickerRow[]>();
  const keys = rows.map((r) => sameNameKey(r.product.nameWork));
  rows.forEach((r, i) => {
    const g = groups.get(keys[i]);
    if (g) g.push(r);
    else groups.set(keys[i], [r]);
  });
  const out: PickerRow[] = [];
  rows.forEach((r, i) => {
    const g = groups.get(keys[i])!;
    if (g[0] !== r) return;
    if (g.length === 1) {
      out.push(r);
      return;
    }
    const sorted = [...g].sort(byPrice);
    const min = sorted[0].unitNetUah;
    out.push(...sorted.map((x) => ({ ...x, cheapestInGroup: min != null && x.unitNetUah === min })));
  });
  return out;
}

export function buildPickerRows(hits: readonly ProductPickDto[], p: PickerPricing): PickerRow[] {
  const rows = hits.map((product): PickerRow => {
    const supplier = p.supplierRef(product.supplierId);
    const block = p.doc.blocks.find((b) => b.supplierId === product.supplierId) ?? null;
    const existing = block ? p.doc.offers.find((o) => o.lineId === p.line.id && o.blockId === block.id) : undefined;
    return {
      key: product.id,
      product,
      supplier,
      blockId: block?.id ?? null,
      ...priceInRequest(product, block?.id ?? null, supplier, p),
      inLine: !!existing && existing.productId === product.id,
      cheapestInGroup: false,
    };
  });
  return groupSameNames(rows);
}

/**
 * Клік по товару: вибір/зняття; товар того самого постачальника замінює попередній (один блок — одна пропозиція);
 * понад MAX_PICK — не додається (limited).
 */
export function toggleSelection(
  selected: readonly ProductPickDto[],
  product: ProductPickDto,
  max = MAX_PICK,
): { selected: ProductPickDto[]; limited: boolean } {
  if (selected.some((p) => p.id === product.id)) return { selected: selected.filter((p) => p.id !== product.id), limited: false };
  const sameSupplier = selected.findIndex((p) => p.supplierId === product.supplierId);
  if (sameSupplier >= 0) {
    const next = [...selected];
    next[sameSupplier] = product;
    return { selected: next, limited: false };
  }
  if (selected.length >= max) return { selected: [...selected], limited: true };
  return { selected: [...selected, product], limited: false };
}

/** Запит схожий на артикул (одне «слово» з цифрами) — для префілу «Створити товар». */
export function looksLikeSku(query: string): boolean {
  const q = query.trim();
  return q.length >= 3 && !/\s/u.test(q) && /\d/u.test(q);
}

/**
 * Пошук на сайті постачальника за шаблоном з картки: '{query}' — назва клієнта або артикул, '{sku}' — артикул
 * (якщо його нема — той самий запит). null — шаблону або запиту нема.
 */
export function siteSearchUrl(template: string | null | undefined, params: { query?: string | null; sku?: string | null }): string | null {
  if (!template) return null;
  const sku = (params.sku ?? '').trim();
  const query = (params.query ?? '').trim() || sku;
  if (!query) return null;
  const url = template.replaceAll('{query}', encodeURIComponent(query)).replaceAll('{sku}', encodeURIComponent(sku || query));
  // шаблон міг зберегтися до перевірки на сервері: відкриваємо лише http(s)
  return isHttpUrl(url) ? url : null;
}
