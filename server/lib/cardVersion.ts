// Одночасне редагування довідників (ДОВ-6): картка зберігається лише з тією версією, яку відкрив користувач.
// Інакше кажемо, хто й коли її змінив, — щоб чужі правки не зникали мовчки.
import { formatTime } from '@shared/format';
import { ApiError, notFound } from '../http/errors';
import { userRefs } from '../modules/audit/audit.service';

export interface CardState {
  version: number;
  updatedById: string | null;
  updatedAt: Date;
}

/**
 * Версію не передали (старий клієнт) — зберігаємо як є; передали іншу — це чужа зміна.
 * Повертає версію для where, або null, якщо перевіряти нічого.
 */
export function expectedVersion(input: { version?: number }): number | null {
  return typeof input.version === 'number' ? input.version : null;
}

/** Помилка «картку вже змінили»: у повідомленні — хто і коли. */
export async function staleCardError(what: string, current: CardState | null): Promise<ApiError> {
  if (!current) return notFound(`${what} не знайдено`);
  const by = current.updatedById ? (await userRefs([current.updatedById])).get(current.updatedById)?.shortName : null;
  const who = by ? `${by} о ${formatTime(current.updatedAt.toISOString(), false)}` : `хтось інший о ${formatTime(current.updatedAt.toISOString(), false)}`;
  return new ApiError('VERSION_CONFLICT', `Картку змінив ${who} — відкрийте її заново, щоб не стерти чужі правки`);
}
