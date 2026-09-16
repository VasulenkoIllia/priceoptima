// Перевірка вхідних даних через zod: помилка перетворюється на VALIDATION_ERROR (див. http/errors).
import type { Request } from 'express';
import type { ZodType } from 'zod';
import { ApiError } from './errors';

/** Тіло запиту за схемою; порожнє тіло — теж об'єкт, щоб схема сама сказала, чого бракує. */
export function parseBody<T>(schema: ZodType<T>, req: Request): T {
  return parse(schema, req.body ?? {});
}

export function parseQuery<T>(schema: ZodType<T>, req: Request): T {
  return parse(schema, req.query ?? {});
}

export function parseParams<T>(schema: ZodType<T>, req: Request): T {
  return parse(schema, req.params ?? {});
}

/** Перевіряє значення й кидає ApiError з переліком полів. */
export function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  // повідомлення бачить користувач, тому беремо перше — у схемах вони написані українською
  const message = details[0]?.message ?? 'Перевірте заповнені поля';
  throw new ApiError('VALIDATION_ERROR', message, details);
}
