// Нова версія КП (незмінний знімок): звичайне — з поточних цін націнки; фінальне — погоджені позиції КП-основи.
import { KP_VAT_MODE_LABELS } from '../enums';
import { formatMoney } from '../format';
import {
  approvalBaseKp,
  buildFinalKpSnapshot,
  buildKpRows,
  buildKpSnapshot,
  computeRequest,
  kpBlockReason,
  kpChecks,
  resolveKpTerms,
  type KpBuyer,
  type KpSeller,
} from '../pricing';
import type { ISODate, KpDocumentDto, KpSettings, KpSnapshot, KpTerm, PricingContext, UUID } from '../types';
import type { RequestDocState } from './document';

export class KpBuildError extends Error {
  constructor(
    readonly code: 'VALIDATION_ERROR' | 'INVALID_STATE',
    message: string,
  ) {
    super(message);
  }
}

export interface KpParties {
  ownCompanyId: UUID;
  seller: KpSeller;
  buyer: KpBuyer;
  managerName: string;
}

export interface KpBuildInput {
  /** Пропозиції — з поточним станом каталогу (catalog), щоб «Назва 1С» бралася актуальна. */
  state: RequestDocState;
  kps: readonly KpDocumentDto[];
  settings: KpSettings;
  final: boolean;
  kpNumber: number;
  date: ISODate;
  ctx: PricingContext;
  parties: KpParties;
  defaultTerms: readonly KpTerm[] | null;
  /** Головні фото товарів для бланка (потрібні, лише коли settings.showImages). */
  images?: ReadonlyMap<UUID, string>;
}

export interface KpBuilt {
  snapshot: KpSnapshot;
  ownCompanyId: UUID;
  settings: KpSettings;
}

export function buildKpVersion(i: KpBuildInput): KpBuilt {
  if (i.final) {
    const base = approvalBaseKp(i.kps, i.state.header.approvalKpId);
    if (!base) throw new KpBuildError('INVALID_STATE', 'Спершу сформуйте КП для клієнта — фінальне КП будується з нього');
    const snapshot = buildFinalKpSnapshot(base.snapshot, i.state.lines, { kpNumber: i.kpNumber, date: i.date, validityDays: i.settings.validityDays });
    if (!snapshot.rows.length) throw new KpBuildError('VALIDATION_ERROR', 'Немає погоджених позицій — відмітьте їх на вкладці «Погодження»');
    return { snapshot, ownCompanyId: base.ownCompanyId, settings: { ...base.settings, onlyApproved: true } };
  }
  // рядок з обраним товаром, але без ціни продажу або з ціною ≤ 0 не дає сформувати КП (НАЦ-4); непідібрані лише не входять
  const computed = computeRequest(i.state, i.ctx);
  const blocked = kpBlockReason(kpChecks(i.state.lines, computed));
  if (blocked) throw new KpBuildError('VALIDATION_ERROR', blocked);
  const rows = buildKpRows(i.state, computed, { ...i.settings, onlyApproved: false }, i.ctx, i.images);
  if (!rows.length) throw new KpBuildError('VALIDATION_ERROR', 'Немає позицій з ціною продажу: підберіть товари й задайте націнку');
  const snapshot = buildKpSnapshot({
    kpNumber: i.kpNumber,
    requestNumber: i.state.header.number,
    date: i.date,
    settings: i.settings,
    vatRatePct: i.state.header.vatRatePct,
    rows,
    seller: i.parties.seller,
    buyer: i.parties.buyer,
    managerName: i.parties.managerName,
    terms: resolveKpTerms(i.settings.terms, i.defaultTerms),
  });
  return { snapshot, ownCompanyId: i.parties.ownCompanyId, settings: i.settings };
}

export function kpEventSummary(kp: Pick<KpDocumentDto, 'onlyApproved' | 'numberLabel' | 'vatMode' | 'snapshot'>, ownName: string): string {
  const total = `${formatMoney(kp.snapshot.totals.payable)} грн`;
  if (kp.onlyApproved) return `Сформовано фінальне КП № ${kp.numberLabel} · позицій: ${kp.snapshot.rows.length} · ${total}`;
  return `Сформовано КП № ${kp.numberLabel} · ${ownName}, ${KP_VAT_MODE_LABELS[kp.vatMode].toLowerCase()} · ${total}`;
}
