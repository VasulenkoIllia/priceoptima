import type { ApiErrorCode } from '@shared/types';

/** Помилка джерела даних з кодом REST-контракту; message — українською, для показу користувачу. */
export class DataSourceError extends Error {
  readonly code: ApiErrorCode;
  readonly details?: unknown;
  /** Короткий збій (немає зʼєднання, сервер перезапускається: 502/503/504) — запит можна повторити. */
  readonly transient: boolean;

  constructor(code: ApiErrorCode, message: string, details?: unknown, transient = false) {
    super(message);
    this.name = 'DataSourceError';
    this.code = code;
    this.details = details;
    this.transient = transient;
  }
}

/** Помилку варто повторити: короткий збій мережі чи сервера (не відповідь API на кшталт NOT_FOUND). */
export function isTransientError(e: unknown): boolean {
  return e instanceof DataSourceError ? e.transient : true;
}

export function isDataSourceError(e: unknown, code?: ApiErrorCode): e is DataSourceError {
  return e instanceof DataSourceError && (code === undefined || e.code === code);
}

/** Текст помилки для UI. */
export function errorMessage(e: unknown): string {
  if (e instanceof DataSourceError) return e.message;
  if (e instanceof Error && e.message) return `Непередбачена помилка: ${e.message}`;
  return 'Непередбачена помилка';
}
