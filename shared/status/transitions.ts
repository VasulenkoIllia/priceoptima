import { EDITABLE_STATUSES, REQUEST_STATUS_LABELS, USER_ROLES } from '../enums';
import type { RequestStatus, UserRole } from '../enums';
import type { AllowedTransition, ApiErrorCode, RequestHeader } from '../types';

export interface StatusTransitionRule {
  to: RequestStatus;
  roles: readonly UserRole[];
  requiresReason: boolean;
  label: string;
}

const ALL_ROLES = USER_ROLES;

/** Переходи 3 статусів. Проміжні етапи (КП, погодження) — індикатори, не статуси. */
export const STATUS_TRANSITIONS: Record<RequestStatus, readonly StatusTransitionRule[]> = {
  in_progress: [
    { to: 'done', roles: ALL_ROLES, requiresReason: false, label: 'Позначити виконаною' },
    { to: 'cancelled', roles: ALL_ROLES, requiresReason: true, label: 'Скасувати' },
  ],
  done: [{ to: 'in_progress', roles: ALL_ROLES, requiresReason: false, label: 'Перевідкрити' }],
  cancelled: [{ to: 'in_progress', roles: ALL_ROLES, requiresReason: false, label: 'Перевідкрити' }],
};

export { EDITABLE_STATUSES };

/** Редагувати можна лише заявку «В роботі». */
export function isEditableStatus(status: RequestStatus): boolean {
  return (EDITABLE_STATUSES as readonly RequestStatus[]).includes(status);
}

export function allowedTransitions(from: RequestStatus, role: UserRole): AllowedTransition[] {
  return STATUS_TRANSITIONS[from]
    .filter((t) => t.roles.includes(role))
    .map((t) => ({ to: t.to, requiresReason: t.requiresReason, label: t.label }));
}

export function canTransition(from: RequestStatus, to: RequestStatus, role: UserRole): boolean {
  return allowedTransitions(from, role).some((t) => t.to === to);
}

export type TransitionCheck =
  | { ok: true }
  | { ok: false; code: Extract<ApiErrorCode, 'INVALID_TRANSITION' | 'FORBIDDEN' | 'VALIDATION_ERROR'>; message: string };

/** Перевірка переходу з причиною (скасування — лише з непорожньою причиною). */
export function validateTransition(
  from: RequestStatus,
  to: RequestStatus,
  role: UserRole,
  reason?: string | null,
): TransitionCheck {
  const rule = STATUS_TRANSITIONS[from].find((t) => t.to === to);
  if (!rule) {
    return {
      ok: false,
      code: 'INVALID_TRANSITION',
      message: `Перехід «${REQUEST_STATUS_LABELS[from]}» → «${REQUEST_STATUS_LABELS[to]}» неможливий`,
    };
  }
  if (!rule.roles.includes(role)) {
    return { ok: false, code: 'FORBIDDEN', message: 'Недостатньо прав для зміни статусу' };
  }
  if (rule.requiresReason && !(reason ?? '').trim()) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'Вкажіть причину скасування' };
  }
  return { ok: true };
}

/** Зміни шапки при переході: причина зберігається лише для «Скасовано». */
export function applyStatusChange(
  to: RequestStatus,
  reason?: string | null,
): Pick<RequestHeader, 'status' | 'cancelReason'> {
  return { status: to, cancelReason: to === 'cancelled' ? (reason ?? '').trim() || null : null };
}

/** Індикатори проміжних етапів у реєстрі/заявці. */
export function requestStageIndicators(input: { kpCount: number; approvedSaleGross: number | null }): {
  hasKp: boolean;
  isApproved: boolean;
} {
  return { hasKp: input.kpCount > 0, isApproved: input.approvedSaleGross != null };
}
