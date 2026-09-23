// REST-клієнт сервера: сесія в cookie, помилки — DataSourceError з кодами API.
import type { ApiErrorBody, ApiErrorCode } from '@shared/types';
import { newId } from '@/lib/ids';
import { DataSourceError } from '../errors';

const BASE = '/api';

/** Ідентифікатор вкладки (одне завантаження сторінки): блокування заявки належить саме їй. */
export const SESSION_ID = newId();

/** Із запасом до ліміту браузера на тіло keepalive-запитів (64 КБ; кирилиця в UTF-8 — 2 байти на символ). */
const KEEPALIVE_MAX_CHARS = 30_000;

/** Сервер перезапускається або проксі не дочекався — такий запит варто повторити. */
const TRANSIENT_STATUSES = new Set([502, 503, 504]);

/** Код за статусом, якщо сервер не повернув свій. */
function codeOfStatus(status: number): ApiErrorCode {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'DUPLICATE';
  if (status === 415) return 'UNSUPPORTED_MEDIA_TYPE';
  if (status === 422) return 'UNPROCESSABLE';
  if (status === 400) return 'VALIDATION_ERROR';
  if (status === 501) return 'NOT_IMPLEMENTED';
  return 'INTERNAL';
}

export type QueryValue = string | number | boolean | null | undefined;

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  /** Надіслати як є (FormData для файлів) — Content-Type ставить браузер. */
  form?: FormData;
  /** Запит під час закриття сторінки (браузер доставить його й після закриття). */
  keepalive?: boolean;
}

function url(path: string, query?: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
  }
  const qs = search.toString();
  return `${BASE}${path}${qs ? `?${qs}` : ''}`;
}

/** Файл з API (вивантаження): помилку сервер повертає звичайним JSON. */
export async function apiFile(path: string, query?: Record<string, QueryValue>): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(url(path, query), { credentials: 'include', headers: { 'X-Session-Id': SESSION_ID } });
  } catch (e) {
    throw new DataSourceError('INTERNAL', 'Сервер недоступний, перевірте зʼєднання', e, true);
  }
  if (res.ok) return await res.blob();
  const data: unknown = safeJson(await res.text());
  const err = (data as ApiErrorBody | null)?.error;
  throw new DataSourceError(
    err?.code ?? codeOfStatus(res.status),
    err?.message ?? `Помилка сервера (${res.status})`,
    err?.details,
    !err && TRANSIENT_STATUSES.has(res.status),
  );
}

/** Запит до API; помилка — DataSourceError з кодом і повідомленням сервера. */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = options.body || options.form ? 'POST' : 'GET', body, form, query, signal } = options;
  const headers: Record<string, string> = { 'X-Session-Id': SESSION_ID };
  if (!form && body !== undefined) headers['Content-Type'] = 'application/json';
  const json = body === undefined ? undefined : JSON.stringify(body);
  // браузер приймає keepalive-запити лише до ~64 КБ — більший піде звичайним (закриття вкладки перепитує, поки є незбережене)
  const keepalive = options.keepalive && (json?.length ?? 0) < KEEPALIVE_MAX_CHARS;
  let res: Response;
  try {
    res = await fetch(url(path, query), {
      method,
      credentials: 'include',
      signal,
      keepalive,
      headers,
      body: form ?? json,
    });
  } catch (e) {
    throw new DataSourceError('INTERNAL', 'Сервер недоступний, перевірте зʼєднання', e, true);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data: unknown = text ? safeJson(text) : null;
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    throw new DataSourceError(
      err?.code ?? codeOfStatus(res.status),
      err?.message ?? `Помилка сервера (${res.status})`,
      err?.details,
      !err && TRANSIENT_STATUSES.has(res.status),
    );
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
