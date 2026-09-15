import type { ApiErrorCode } from '@shared/types';

/** Помилка джерела даних з кодом REST-контракту; message — українською, для показу користувачу. */
export class DataSourceError extends Error {
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'DataSourceError';
    this.code = code;
    this.details = details;
  }
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
