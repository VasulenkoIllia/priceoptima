// Вихід рушія ціноутворення (computeRequest).
import type { MarkupMethod } from '../enums';
import type { UUID } from './common';
import type { PricingSettings, RequestComputedTotals } from './requests';
import type { SupplierRef } from './suppliers';

export type WarningSeverity = 'error' | 'warning' | 'info';

export type WarningCode =
  | 'RATE_MISSING' // немає курсу для валюти пропозиції
  | 'PRICE_MISSING' // товар без вхідної ціни
  | 'MULTIPLICITY_MISMATCH' // к-сть не кратна (params: qty, multiplicity, suggestedQty)
  | 'QTY_ROUNDED' // к-сть округлено автоматично (params: from, to, multiplicity)
  | 'INSUFFICIENT_STOCK' // к-сть > залишку (params: qty, stock)
  | 'OUT_OF_STOCK'
  | 'PRICE_STALE' // params: ageDays, staleDays
  | 'CATALOG_PRICE_CHANGED' // знімок ≠ каталог (params: catalogPrice, snapshotPrice, catalogCurrency)
  | 'NOT_IN_PRICE_LIST' // товару немає в останньому прайсі постачальника (params: since — дата)
  | 'INPUT_ABOVE_RRP' // вхід без ПДВ > РРЦ без ПДВ
  | 'UNIT_MISMATCH' // од. пропозиції ≠ од. клієнта (params: offerUnit, clientUnit)
  | 'SELECTED_EXCLUDED' // обрано виключену/порожню пропозицію
  | 'SELECTION_NOT_OPTIMAL' // обрано не мінімум (params: overpayGross)
  | 'NO_OFFERS' // рядок без жодного кандидата
  | 'QTY_ZERO'
  | 'BELOW_MIN_ORDER' // блок: сума обраних < мін. замовлення (params: selectedGross, minOrderAmount)
  | 'NO_RRP' // метод rrp/discount, але РРЦ нема
  | 'BELOW_COST' // продаж < вхід
  | 'ABOVE_RRP' // продаж з ПДВ > РРЦ
  | 'NO_CLIENT'; // шапка без клієнта

export interface Warning {
  code: WarningCode;
  severity: WarningSeverity;
  lineId?: UUID;
  blockId?: UUID;
  offerId?: UUID;
  params?: Record<string, string | number | null>;
}

export interface OfferComputed {
  offerId: UUID;
  lineId: UUID;
  blockId: UUID;
  /** 1 для UAH */
  rate: number | null;
  /** offer.qty ?? line.qty */
  qtyEffective: number;
  /** C, Ф3: round2 */
  unitNetUah: number | null;
  /** Cg, Ф4: round2(C × 1,2) */
  unitGrossUah: number | null;
  /** round2(C × q′) */
  sumNetUah: number | null;
  /** Ф6: round2(Cg × q′) */
  sumGrossUah: number | null;
  /** R, Ф7: round2 */
  rrpGrossUah: number | null;
  /** Rn, Ф7: round2(R ÷ 1,2) */
  rrpNetUah: number | null;
  /** unitNetUah > 0 */
  isFilled: boolean;
  /** Виключено з розрахунку вручну (offer.excluded). */
  isExcluded: boolean;
  /** filled && !excluded && (!excludeUnavailable || !outOfStock) */
  isCandidate: boolean;
  /** Кандидат з мінімальною ціною без ПДВ (нічия → усі з мінімумом). */
  isMin: boolean;
  /** Один на рядок: мінімум, при нічиї — найменша позиція блоку. */
  isRecommended: boolean;
  /** Є ефективним вибором рядка. */
  isSelected: boolean;
  /** (unitNet − min)/min × 100, round2 */
  diffVsMinPct: number | null;
  multiplicity: { isMultiple: boolean; suggestedQty: number | null };
  stock: { insufficient: boolean; outOfStock: boolean };
  stale: { isStale: boolean; ageDays: number | null };
  catalogChanged: boolean;
  warnings: Warning[];
}

export type OfferComparisonFlags = Pick<OfferComputed, 'isCandidate' | 'isMin' | 'isRecommended' | 'isSelected' | 'diffVsMinPct'>;
export type OfferComputedBase = Omit<OfferComputed, keyof OfferComparisonFlags>;

export type SelectionState = 'none' | 'recommended' | 'manual_optimal' | 'manual_non_optimal' | 'manual_invalid';

export interface LineComparison {
  lineId: UUID;
  isActive: boolean;
  filledCount: number;
  candidateCount: number;
  minUnitNet: number | null;
  maxUnitNet: number | null;
  spreadPct: number | null;
  recommendedBlockId: UUID | null;
  recommendedOfferId: UUID | null;
  /** Ручний вибір (як у документі). */
  selectedBlockId: UUID | null;
  /** Ручний (якщо валідний) ?? рекомендований. */
  effectiveBlockId: UUID | null;
  effectiveOfferId: UUID | null;
  selectionState: SelectionState;
  /** Ефективна сума − сума рекомендованої (≥ 0). */
  overpayGross: number;
  /** Те саме без ПДВ (підбір показує все без ПДВ). */
  overpayNet: number;
  warnings: Warning[];
}

export interface BlockTotals {
  blockId: UUID;
  totalLines: number;
  /** Покриття N (Ф10): рядки із заповненою невиключеною пропозицією. */
  filledCount: number;
  coveragePct: number;
  /** «Всього з ПДВ» (Ф10): Σ sumGross заповнених невиключених пропозицій блоку. */
  totalGross: number;
  /** = totalGross (сумісність). */
  totalGrossIncluded: number;
  /** Σ sumGross разом із виключеними (довідково). */
  totalGrossWithExcluded: number;
  /** «Всього без ПДВ» — те саме, що totalGross, без ПДВ (підбір показує суми без ПДВ). */
  totalNet: number;
  /** «Всього по обраних». */
  selectedCount: number;
  selectedNet: number;
  selectedGross: number;
  /** «Дельта» — переплата vs найменші суми по тих самих рядках. */
  deltaGross: number;
  deltaPct: number | null;
  /** Дельта без ПДВ. */
  deltaNet: number;
  /** «Найдешевший» — лише в одного блоку заявки (markCheapestBlock). */
  cheapest: boolean;
  minOrderAmount: number | null;
  belowMinOrder: boolean;
  warnings: Warning[];
}

export interface PurchaseScenario {
  kind: 'optimal_mix' | 'single_supplier' | 'current_selection';
  /** Для single_supplier. */
  blockId: UUID | null;
  totalNet: number;
  totalGross: number;
  coveredLines: number;
  missingLines: number;
  missingLineIds: UUID[];
  suppliersUsed: number;
  blockIds: UUID[];
  /** На покритих рядках (null для самого міксу). */
  diffVsMixGross: number | null;
  diffVsMixPct: number | null;
  /** Різниця з міксом без ПДВ. */
  diffVsMixNet: number | null;
  belowMinOrderBlockIds: UUID[];
}

export interface MarkupRowComputed {
  lineId: UUID;
  effectiveOfferId: UUID | null;
  blockId: UUID | null;
  name: string;
  unit: string | null;
  /** qtyEffective ефективної пропозиції (або line.qty). */
  qty: number;
  /** Вхід за од., грн. */
  costNet: number | null;
  costGross: number | null;
  rrpGross: number | null;
  rrpNet: number | null;
  rrpVsCostPct: number | null;
  method: MarkupMethod;
  value: number | null;
  isOverride: boolean;
  priceBasis: 'net' | 'gross';
  saleNet: number | null;
  saleGross: number | null;
  sumNet: number | null;
  sumGross: number | null;
  markupPct: number | null;
  marginPct: number | null;
  profitNet: number | null;
  approvedQty: number | null;
  approvedSumNet: number | null;
  approvedSumGross: number | null;
  /** Ціна від рекомендації, а не від ручного затвердження (позначка «не затверджено»). */
  notApproved: boolean;
  warnings: Warning[];
}

/** Разом без ПДВ / ПДВ / Разом з ПДВ — за Ф16 у режимі цін заявки (для ФОП Разом з ПДВ = «Разом»). */
export interface MarkupTotals {
  costNet: number;
  costGross: number;
  saleNet: number;
  /** ПДВ за Ф16 (ТОВ без ПДВ — від підсумку; ТОВ з ПДВ — «у т.ч.»; ФОП — 0). */
  vat: number;
  saleGross: number;
  profitNet: number;
  markupPct: number | null;
  marginPct: number | null;
  /** Ф18: погоджені рядки з погодженими к-стями. */
  approvedSaleNet: number;
  approvedVat: number;
  approvedSaleGross: number;
  linesPriced: number;
  linesUnpriced: number;
}

/** Заробіток (прибуток без ПДВ) на наборі рядків. */
export interface ProfitSummary {
  /** Рядків з ціною продажу й входом. */
  lines: number;
  /** Рядків без ціни продажу (напр., «по РРЦ», а РРЦ немає): у заробіток не входять. */
  unpriced: number;
  costNet: number;
  saleNet: number;
  profitNet: number;
  markupPct: number | null;
}

/** Заробіток по постачальнику (блоку). */
export interface SupplierProfit {
  blockId: UUID;
  /** Рядки, де ефективний вибір — цей постачальник (як у націнці й КП). Σ по блоках = прибуток заявки. */
  selected: ProfitSummary;
  /** «Якщо все в цього постачальника»: рядки, які він покриває (Ф13), ціни продажу — за правилами націнки рядків. */
  allIn: ProfitSummary;
}

export interface RequestComputed {
  offers: Record<UUID, OfferComputed>;
  /** lineId → blockId → offerId */
  offerIndex: Record<UUID, Record<UUID, UUID>>;
  lines: Record<UUID, LineComparison>;
  blocks: Record<UUID, BlockTotals>;
  /** [optimal_mix, current_selection, ...single_supplier за порядком блоків] */
  scenarios: PurchaseScenario[];
  markup: { rows: Record<UUID, MarkupRowComputed>; totals: MarkupTotals };
  /** blockId → заробіток по постачальнику. */
  supplierProfit: Record<UUID, SupplierProfit>;
  totals: RequestComputedTotals;
  /** Плаский список усіх попереджень. */
  warnings: Warning[];
}

export interface PricingContext {
  /** Час розрахунку (застарілість цін). */
  now: Date;
  settings: PricingSettings;
  suppliers: Record<UUID, SupplierRef>;
}
