import { describe, expect, it } from 'vitest';
import {
  allowedTransitions,
  applyStatusChange,
  canTransition,
  EDITABLE_STATUSES,
  isEditableStatus,
  requestStageIndicators,
  STATUS_TRANSITIONS,
  validateTransition,
} from '..';

describe('переходи 3 статусів', () => {
  it('таблиця переходів', () => {
    expect(STATUS_TRANSITIONS.in_progress.map((t) => [t.to, t.requiresReason])).toEqual([
      ['done', false],
      ['cancelled', true],
    ]);
    expect(STATUS_TRANSITIONS.done.map((t) => t.to)).toEqual(['in_progress']);
    expect(STATUS_TRANSITIONS.cancelled.map((t) => t.to)).toEqual(['in_progress']);
  });

  it('обидві ролі можуть змінювати статус і перевідкривати', () => {
    for (const role of ['admin', 'user'] as const) {
      expect(allowedTransitions('in_progress', role)).toEqual([
        { to: 'done', requiresReason: false, label: 'Позначити виконаною' },
        { to: 'cancelled', requiresReason: true, label: 'Скасувати' },
      ]);
      expect(allowedTransitions('done', role)).toEqual([{ to: 'in_progress', requiresReason: false, label: 'Перевідкрити' }]);
      expect(canTransition('cancelled', 'in_progress', role)).toBe(true);
    }
  });

  it('недопустимі переходи', () => {
    expect(canTransition('done', 'cancelled', 'admin')).toBe(false);
    expect(canTransition('in_progress', 'in_progress', 'user')).toBe(false);
    const r = validateTransition('cancelled', 'done', 'admin');
    expect(r).toEqual({ ok: false, code: 'INVALID_TRANSITION', message: 'Перехід «Скасовано» → «Виконано» неможливий' });
  });

  it('скасування — лише з причиною', () => {
    expect(validateTransition('in_progress', 'cancelled', 'user')).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
    expect(validateTransition('in_progress', 'cancelled', 'user', '   ')).toMatchObject({ ok: false });
    expect(validateTransition('in_progress', 'cancelled', 'user', 'Клієнт відмовився')).toEqual({ ok: true });
    expect(validateTransition('in_progress', 'done', 'user')).toEqual({ ok: true });
    expect(validateTransition('done', 'in_progress', 'user')).toEqual({ ok: true });
  });

  it('зміни шапки: причина лише для «Скасовано»', () => {
    expect(applyStatusChange('cancelled', ' Клієнт відмовився ')).toEqual({ status: 'cancelled', cancelReason: 'Клієнт відмовився' });
    expect(applyStatusChange('in_progress', 'будь-що')).toEqual({ status: 'in_progress', cancelReason: null });
    expect(applyStatusChange('done')).toEqual({ status: 'done', cancelReason: null });
  });

  it('редагується лише «В роботі»; індикатори етапів', () => {
    expect(EDITABLE_STATUSES).toEqual(['in_progress']);
    expect(isEditableStatus('in_progress')).toBe(true);
    expect(isEditableStatus('done')).toBe(false);
    expect(isEditableStatus('cancelled')).toBe(false);
    expect(requestStageIndicators({ kpCount: 1, approvedSaleGross: null })).toEqual({ hasKp: true, isApproved: false });
    expect(requestStageIndicators({ kpCount: 0, approvedSaleGross: 0 })).toEqual({ hasKp: false, isApproved: true });
  });
});
