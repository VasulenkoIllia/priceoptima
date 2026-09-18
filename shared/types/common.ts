// Базові типи. Гроші/кількості — number; дати — ISODate ('2026-09-11'); час — ISODateTime (ISO 8601 з 'Z').

export type UUID = string;
export type ISODate = string;
export type ISODateTime = string;

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'LOCKED'
  | 'LOCK_REQUIRED'
  | 'LOCK_LOST'
  | 'VERSION_CONFLICT'
  | 'DUPLICATE'
  | 'REFERENCED'
  | 'INVALID_STATE'
  | 'INVALID_TRANSITION'
  | 'READ_ONLY'
  | 'UNPROCESSABLE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'NOT_IMPLEMENTED'
  | 'INTERNAL';

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    /** Українською, для показу користувачу. */
    message: string;
    details?: unknown;
  };
}

/** Спільні параметри списків: сортування й пошук. */
export interface ListQuery {
  /** 'field' | '-field' */
  sort?: string;
  search?: string;
}

export interface UserRef {
  id: UUID;
  shortName: string;
}
