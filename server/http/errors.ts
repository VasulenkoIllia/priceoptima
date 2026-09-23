// Помилки API в тому ж форматі, що вже розуміє фронт: { error: { code, message, details? } }.
// Коди — з shared/types (ApiErrorCode), повідомлення — українською, для показу користувачу.
// Файл навмисно без залежностей від express і налаштувань — його легко перевірити тестами.
import { ZodError } from 'zod';
import type { ApiErrorBody, ApiErrorCode } from '@shared/types';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

export const unauthorized = (message = 'Потрібно увійти') => new ApiError('UNAUTHORIZED', message);
export const forbidden = (message = 'Недостатньо прав') => new ApiError('FORBIDDEN', message);
export const notFound = (message = 'Не знайдено') => new ApiError('NOT_FOUND', message);
export const validationError = (message: string, details?: unknown) => new ApiError('VALIDATION_ERROR', message, details);
export const duplicate = (message: string) => new ApiError('DUPLICATE', message);

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  LOCKED: 423,
  LOCK_REQUIRED: 423,
  LOCK_LOST: 409,
  VERSION_CONFLICT: 409,
  DUPLICATE: 409,
  REFERENCED: 409,
  INVALID_STATE: 409,
  INVALID_TRANSITION: 409,
  READ_ONLY: 403,
  UNPROCESSABLE: 422,
  UNSUPPORTED_MEDIA_TYPE: 415,
  NOT_IMPLEMENTED: 501,
  INTERNAL: 500,
};

export function statusOf(code: ApiErrorCode): number {
  return STATUS_BY_CODE[code] ?? 500;
}

/** Помилки Prisma розпізнаємо за кодом P####, щоб не тягнути сюди згенерований клієнт. */
function prismaErrorCode(e: unknown): string | null {
  if (typeof e !== 'object' || e === null) return null;
  const code = (e as { code?: unknown }).code;
  return typeof code === 'string' && /^P\d{4}$/u.test(code) ? code : null;
}

const PRISMA_ERRORS: Record<string, { code: ApiErrorCode; message: string }> = {
  P2002: { code: 'DUPLICATE', message: 'Такий запис уже існує' },
  P2025: { code: 'NOT_FOUND', message: 'Запис не знайдено' },
  P2003: { code: 'REFERENCED', message: 'Запис використовується в інших даних' },
};

function zodDetails(e: ZodError): Array<{ path: string; message: string }> {
  return e.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

export interface MappedError {
  status: number;
  body: ApiErrorBody;
  /** true — це наша поломка, її треба записати в лог повністю. */
  internal: boolean;
}

/** Будь-яка помилка → статус і тіло відповіді API. */
export function toApiError(e: unknown): MappedError {
  if (e instanceof ApiError) {
    const error: ApiErrorBody['error'] = { code: e.code, message: e.message };
    if (e.details !== undefined) error.details = e.details;
    return { status: statusOf(e.code), body: { error }, internal: false };
  }
  if (e instanceof ZodError) {
    return {
      status: statusOf('VALIDATION_ERROR'),
      body: { error: { code: 'VALIDATION_ERROR', message: 'Перевірте заповнені поля', details: zodDetails(e) } },
      internal: false,
    };
  }
  const prisma = prismaErrorCode(e);
  if (prisma && PRISMA_ERRORS[prisma]) {
    const { code, message } = PRISMA_ERRORS[prisma];
    return { status: statusOf(code), body: { error: { code, message } }, internal: false };
  }
  // тіло більше за межу маршруту (body-parser: type 'entity.too.large') — зрозуміла відмова замість 500
  if (typeof e === 'object' && e !== null && (e as { type?: unknown }).type === 'entity.too.large') {
    return {
      status: 413,
      body: { error: { code: 'VALIDATION_ERROR', message: 'Завеликий обсяг даних за один раз. Внесіть зміни частинами' } },
      internal: false,
    };
  }
  // некоректний JSON у тілі запиту — express.json кидає SyntaxError зі статусом 400
  if (e instanceof SyntaxError && (e as { status?: number }).status === 400) {
    return {
      status: 400,
      body: { error: { code: 'VALIDATION_ERROR', message: 'Некоректний JSON у запиті' } },
      internal: false,
    };
  }
  return {
    status: 500,
    body: { error: { code: 'INTERNAL', message: 'Непередбачена помилка сервера' } },
    internal: true,
  };
}
