// Правила налаштувань, які не залежать від бази.
import type { AppSettings, AppSettingsPatch } from '@shared/types';
import { ApiError } from '../../http/errors';

/**
 * Наскрізні лічильники номерів можна лише збільшувати (ДОВ-4):
 * зменшення дало б другу заявку чи КП з тим самим номером.
 */
export function assertCountersOnlyGrow(current: AppSettings, patch: AppSettingsPatch): void {
  if (patch.nextRequestNumber != null && patch.nextRequestNumber < current.nextRequestNumber) {
    throw new ApiError('VALIDATION_ERROR', `Наступний номер заявки: не менше ${current.nextRequestNumber}`);
  }
}

/** Налаштування після застосування змін (порожні поля лишаються як були). */
export function applySettingsPatch(current: AppSettings, patch: AppSettingsPatch): AppSettings {
  const next = { ...current };
  for (const [key, value] of Object.entries(patch) as Array<[keyof AppSettings, AppSettings[keyof AppSettings]]>) {
    if (value !== undefined) Object.assign(next, { [key]: value });
  }
  return next;
}
