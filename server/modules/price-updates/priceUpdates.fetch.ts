// Завантаження вигрузки постачальника за посиланням із налаштувань (SupplierPriceFeed).
// Доступ: bearer — токен у заголовку Authorization; basic — секрет «логін:пароль»;
// query — токен параметром посилання (порожній параметр у посиланні, інакше token).
// Посилання й токен у повідомлення про помилки не потрапляють — лише хост.
// Сервер ходить лише на публічні адреси (lib/publicFetch).
import type { SupplierPriceFeed } from '@prisma/client';
import { fetchPublic, PublicFetchError, type HostLookup } from '../../lib/publicFetch';
import type { SecretBox } from '../../lib/secretBox';

export const FEED_TIMEOUT_MS = 5 * 60 * 1000;
export const FEED_MAX_BYTES = 200 * 1024 * 1024;

/** Параметр посилання для токена, якщо в самому посиланні порожнього параметра немає. */
export const DEFAULT_TOKEN_PARAM = 'token';

/** Помилка завантаження з повідомленням для користувача. */
export class FeedFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeedFetchError';
  }
}

export type FeedAccess = Pick<SupplierPriceFeed, 'url' | 'auth' | 'secret'>;

export interface FeedRequest {
  url: string;
  headers: Record<string, string>;
}

export interface DownloadOptions {
  fetch?: typeof fetch;
  lookup?: HostLookup;
  timeoutMs?: number;
  maxBytes?: number;
}

/** Запит до вигрузки; secret — уже розшифрований. */
export function buildFeedRequest(rawUrl: string, auth: SupplierPriceFeed['auth'], secret: string | null): FeedRequest {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new FeedFetchError('Посилання на вигрузку некоректне — перевірте налаштування постачальника');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FeedFetchError('Посилання на вигрузку має починатися з http:// або https://');
  }
  if (url.username || url.password) {
    throw new FeedFetchError('Логін і пароль не пишуть у посиланні — оберіть доступ «basic» і збережіть їх як «логін:пароль»');
  }

  const headers: Record<string, string> = { accept: '*/*' };
  if (auth === 'none') return { url: url.toString(), headers };
  if (!secret) throw new FeedFetchError('Для цього способу доступу не збережено токен або пароль');

  if (auth === 'bearer') {
    headers.authorization = `Bearer ${secret}`;
  } else if (auth === 'basic') {
    const at = secret.indexOf(':');
    if (at < 0) throw new FeedFetchError('Для доступу «basic» збережіть секрет у вигляді «логін:пароль»');
    const pair = `${secret.slice(0, at)}:${secret.slice(at + 1)}`;
    headers.authorization = `Basic ${Buffer.from(pair, 'utf8').toString('base64')}`;
  } else {
    const empty = [...url.searchParams].find(([, value]) => value === '')?.[0];
    url.searchParams.set(empty ?? DEFAULT_TOKEN_PARAM, secret);
  }
  return { url: url.toString(), headers };
}

/** Завантажує вигрузку й повертає її текстом. Будь-яка невдача — FeedFetchError з поясненням. */
export async function downloadFeed(feed: FeedAccess, secrets: SecretBox, options: DownloadOptions = {}): Promise<string> {
  const timeoutMs = options.timeoutMs ?? FEED_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? FEED_MAX_BYTES;

  if (!feed.url) throw new FeedFetchError('У постачальника не налаштоване посилання на вигрузку');
  const request = buildFeedRequest(feed.url, feed.auth, openSecret(feed, secrets));
  const signal = AbortSignal.timeout(timeoutMs);

  let response: Response;
  let host: string;
  try {
    const got = await fetchPublic(new URL(request.url), { fetch: options.fetch, lookup: options.lookup, headers: request.headers, signal });
    response = got.response;
    host = got.url.host;
  } catch (e) {
    throw feedErrorOf(e, timeoutMs);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new FeedFetchError(httpErrorMessage(response.status));
  }
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new FeedFetchError(tooLargeMessage(maxBytes));
  }

  let bytes: Uint8Array;
  try {
    bytes = await readLimited(response, maxBytes);
  } catch (e) {
    throw e instanceof FeedFetchError ? e : connectionError(e, host, timeoutMs);
  }
  const text = bytes.length ? decodeFeed(bytes, response.headers.get('content-type')) : '';
  if (!text.trim()) throw new FeedFetchError('Постачальник віддав порожню вигрузку');
  return text;
}

// ── дрібниці ────────────────────────────────────────────────────────

function feedErrorOf(e: unknown, timeoutMs: number): FeedFetchError {
  if (!(e instanceof PublicFetchError)) return connectionError(e, '', timeoutMs);
  if (e.kind === 'network') return connectionError(e.cause, e.host, timeoutMs);
  if (e.kind === 'not_found') return new FeedFetchError(`Сервер постачальника (${e.host}) не знайдено — перевірте посилання`);
  if (e.kind === 'blocked') return new FeedFetchError(`Посилання веде на внутрішню адресу (${e.host}) — вигрузку беремо лише з інтернету`);
  if (e.kind === 'redirects') return new FeedFetchError(`Забагато переадресацій на ${e.host} — перевірте посилання`);
  return new FeedFetchError('Постачальник переадресував на посилання не http(s)');
}

function openSecret(feed: FeedAccess, secrets: SecretBox): string | null {
  if (feed.auth === 'none' || !feed.secret) return null;
  try {
    return secrets.open(feed.secret);
  } catch {
    throw new FeedFetchError('Збережений токен не вдалося розшифрувати — введіть його заново в налаштуваннях постачальника');
  }
}

export function httpErrorMessage(status: number): string {
  if (status === 401 || status === 403) {
    return `Постачальник відмовив у доступі (HTTP ${status}) — перевірте токен або пароль`;
  }
  if (status === 404) return 'Вигрузку не знайдено за посиланням (HTTP 404) — перевірте посилання';
  if (status === 429) return 'Постачальник тимчасово обмежив запити (HTTP 429) — спробуємо пізніше';
  if (status >= 500) return `Сервер постачальника повернув помилку (HTTP ${status})`;
  return `Сервер постачальника відповів HTTP ${status}`;
}

function tooLargeMessage(maxBytes: number): string {
  return `Вигрузка завелика — понад ${Math.round(maxBytes / (1024 * 1024))} МБ`;
}

/** Помилки мережі й таймаут → зрозуміле повідомлення. */
export function connectionError(e: unknown, host: string, timeoutMs: number): FeedFetchError {
  const name = (e as { name?: unknown } | null)?.name;
  if (name === 'TimeoutError' || name === 'AbortError') {
    return new FeedFetchError(`Сервер постачальника (${host}) не віддав вигрузку за ${Math.round(timeoutMs / 60_000) || 1} хв`);
  }
  const cause = (e as { cause?: { code?: unknown } } | null)?.cause;
  const code = typeof cause?.code === 'string' ? cause.code : '';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return new FeedFetchError(`Сервер постачальника (${host}) не знайдено — перевірте посилання`);
  }
  if (code === 'ECONNREFUSED') return new FeedFetchError(`Сервер постачальника (${host}) не приймає з'єднання`);
  if (/CERT|SSL|TLS/u.test(code)) {
    return new FeedFetchError(`Не вдалося встановити захищене з'єднання з ${host} — проблема із сертифікатом`);
  }
  return new FeedFetchError(`Не вдалося завантажити вигрузку з ${host} — з'єднання перервалось`);
}

/** Читає тіло частинами й зупиняється, щойно перевищено межу розміру. */
async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new FeedFetchError(tooLargeMessage(maxBytes));
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Кодування: з заголовка відповіді або з XML-декларації (YML-вигрузки бувають у windows-1251). */
export function decodeFeed(bytes: Uint8Array, contentType: string | null): string {
  const fromHeader = /charset=["']?([\w-]+)/iu.exec(contentType ?? '')?.[1];
  const head = Buffer.from(bytes.subarray(0, 200)).toString('latin1');
  const fromXml = /^\s*<\?xml[^>]*encoding=["']([\w-]+)["']/iu.exec(head)?.[1];
  const label = fromHeader ?? fromXml ?? 'utf-8';
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}
