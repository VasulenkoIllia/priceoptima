// Правила довідника власних юросіб, які не залежать від бази.
import { ApiError } from '../../http/errors';

export interface DefaultFlagContext {
  /** Чи є в довіднику інші юрособи, окрім тієї, що зберігається. */
  hasOthers: boolean;
  /** Чи була ця юрособа основною до змін (для нової — false). */
  wasDefault: boolean;
}

/**
 * Основна юрособа рівно одна: перша в довіднику стає основною сама,
 * а зняти позначку можна лише, призначивши основною іншу.
 */
export function resolveDefaultFlag(requested: boolean, ctx: DefaultFlagContext): boolean {
  if (!ctx.hasOthers) return true;
  if (requested) return true;
  if (ctx.wasDefault) {
    throw new ApiError('VALIDATION_ERROR', 'Щоб змінити основну юрособу, позначте основною іншу');
  }
  return false;
}

/** Основну юрособу не вимикаємо — від неї формуються КП. */
export function assertDefaultStaysActive(isDefault: boolean, isActive: boolean): void {
  if (isDefault && !isActive) {
    throw new ApiError('VALIDATION_ERROR', 'Основну юрособу не можна зробити неактивною');
  }
}
