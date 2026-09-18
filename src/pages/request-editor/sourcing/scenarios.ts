// Панель «Сценарії закупівлі» (§6.10): модель показу. Усі суми — з computeRequest (scenarios, blocks, lines).
import type { RequestComputed, RequestLine, SupplierBlock, SupplierRef, UUID, Warning } from '@shared/types';

export interface SingleScenarioView {
  blockId: UUID;
  supplier: SupplierRef | null;
  totalGross: number;
  covered: number;
  total: number;
  missing: number;
  /** Різниця з міксом на покритих рядках (null — нічого не покрито). */
  diffVsMixGross: number | null;
  diffVsMixPct: number | null;
  /** Сума «все у цього постачальника» менша за мін. замовлення. */
  belowMinOrder: boolean;
  /** Скільки рядків змінить «Затвердити все у цього постачальника» (є кандидат, затверджено інше або нічого). */
  approvable: number;
  /** Заробіток (прибуток без ПДВ) на покритих рядках за правилами націнки рядків. */
  profitNet: number;
}

export interface ScenarioView {
  mix: { totalGross: number; suppliersUsed: number; covered: number; missing: number; total: number };
  current: { approved: number; total: number; totalGross: number; overpayGross: number; overpayPct: number | null; profitNet: number };
  singles: SingleScenarioView[];
  /** «Постачальник A: сума обраних 464,51 < мін. замовлення 1 000,00 — нерентабельно» (за поточним вибором). */
  minOrder: { blockId: UUID; supplierName: string; warning: Warning }[];
}

export interface ScenarioInput {
  lines: readonly RequestLine[];
  blocks: readonly SupplierBlock[];
  suppliers: Readonly<Record<UUID, SupplierRef>>;
}

const isManual = (state: string | undefined) => state === 'manual_optimal' || state === 'manual_non_optimal';

export function buildScenarioView({ lines, blocks, suppliers }: ScenarioInput, computed: RequestComputed): ScenarioView {
  const active = lines.filter((l) => computed.lines[l.id]?.isActive);
  const total = active.length;
  const mix = computed.scenarios.find((s) => s.kind === 'optimal_mix');
  const current = computed.scenarios.find((s) => s.kind === 'current_selection');
  const ordered = [...blocks].sort((a, b) => a.position - b.position);
  const supplierOf = (b: SupplierBlock) => (b.supplierId ? (suppliers[b.supplierId] ?? null) : null);

  const singles = ordered.flatMap((b): SingleScenarioView[] => {
    const s = computed.scenarios.find((x) => x.kind === 'single_supplier' && x.blockId === b.id);
    if (!s) return [];
    const approvable = active.filter((l) => {
      const offerId = computed.offerIndex[l.id]?.[b.id];
      return !!offerId && !!computed.offers[offerId]?.isCandidate && l.selection.blockId !== b.id;
    }).length;
    return [
      {
        blockId: b.id,
        supplier: supplierOf(b),
        totalGross: s.totalGross,
        covered: s.coveredLines,
        total,
        missing: s.missingLines,
        diffVsMixGross: s.coveredLines ? s.diffVsMixGross : null,
        diffVsMixPct: s.coveredLines ? s.diffVsMixPct : null,
        belowMinOrder: s.belowMinOrderBlockIds.includes(b.id),
        approvable,
        profitNet: computed.supplierProfit[b.id]?.allIn.profitNet ?? 0,
      },
    ];
  });

  const minOrder = ordered.flatMap((b) => {
    const t = computed.blocks[b.id];
    if (!t?.belowMinOrder) return [];
    const warning: Warning = t.warnings.find((w) => w.code === 'BELOW_MIN_ORDER') ?? {
      code: 'BELOW_MIN_ORDER',
      severity: 'warning',
      blockId: b.id,
      params: { selectedGross: t.selectedGross, minOrderAmount: t.minOrderAmount },
    };
    return [{ blockId: b.id, supplierName: supplierOf(b)?.name ?? 'Постачальник', warning }];
  });

  return {
    mix: {
      totalGross: mix?.totalGross ?? 0,
      suppliersUsed: mix?.suppliersUsed ?? 0,
      covered: mix?.coveredLines ?? 0,
      missing: mix?.missingLines ?? total,
      total,
    },
    current: {
      approved: active.filter((l) => isManual(computed.lines[l.id]?.selectionState)).length,
      total,
      totalGross: current?.totalGross ?? 0,
      overpayGross: current?.diffVsMixGross ?? 0,
      overpayPct: current?.diffVsMixPct ?? null,
      profitNet: computed.markup.totals.profitNet,
    },
    singles,
    minOrder,
  };
}
