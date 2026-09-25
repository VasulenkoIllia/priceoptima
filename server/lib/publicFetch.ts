// Запити сервера на адреси, які задали люди або прийшли з прайсів (вигрузки, фото з вигрузок).
// Ходимо лише на публічні адреси — перед кожним переходом, і після переадресації теж: інакше посилання
// «http://db:5432» чи «169.254.169.254» читало б внутрішні сервіси. Авторизацію на чужий сервер не передаємо.
import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

/** Адреси хоста; у тестах підставляється. */
export type HostLookup = (host: string) => Promise<string[]>;
const defaultLookup: HostLookup = async (host) => (await dnsLookup(host, { all: true, verbatim: true })).map((a) => a.address);

const MAX_REDIRECTS = 5;

const PRIVATE_NETS = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  PRIVATE_NETS.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  PRIVATE_NETS.addSubnet(net, prefix, 'ipv6');
}

const LINK_LOCAL_V6 = new BlockList();
LINK_LOCAL_V6.addSubnet('fe80::', 10, 'ipv6');

/**
 * IPv6 link-local (fe80::…) з DNS: без зони інтерфейсу до неї не під'єднатися, тож вона нікуди не веде.
 * Буває помилкою в DNS постачальника поруч зі звичайною адресою (sigma.ua, 25.09.2026) — таку адресу пропускаємо.
 */
function isLinkLocalV6(address: string): boolean {
  return isIP(address) === 6 && LINK_LOCAL_V6.check(address, 'ipv6');
}

/** Локальна, приватна чи службова адреса. Не IP — теж «так». */
export function isPrivateAddress(address: string): boolean {
  const mappedV4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/iu.exec(address)?.[1];
  if (mappedV4) return PRIVATE_NETS.check(mappedV4, 'ipv4');
  const family = isIP(address);
  if (family === 4) return PRIVATE_NETS.check(address, 'ipv4');
  if (family === 6) return PRIVATE_NETS.check(address, 'ipv6');
  return true;
}

export type PublicFetchErrorKind = 'blocked' | 'not_found' | 'redirects' | 'scheme' | 'network';

/** Чому запит не відбувся; host — адреса того переходу, на якому зупинились. */
export class PublicFetchError extends Error {
  constructor(
    readonly kind: PublicFetchErrorKind,
    readonly host: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'PublicFetchError';
  }
}

async function assertPublicHost(url: URL, lookup: HostLookup): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/gu, '');
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await lookup(host)).filter((address) => !isLinkLocalV6(address));
    } catch (e) {
      throw new PublicFetchError('not_found', url.host, `Сервер ${url.host} не знайдено`, { cause: e });
    }
  }
  if (!addresses.length || addresses.some(isPrivateAddress)) {
    throw new PublicFetchError('blocked', url.host, `Посилання веде на внутрішню адресу (${url.host})`);
  }
}

function withoutAuthorization(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([k]) => k.toLowerCase() !== 'authorization'));
}

export interface PublicFetchOptions {
  fetch?: typeof fetch;
  lookup?: HostLookup;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/** GET на публічну адресу з ручним проходом переадресацій. Повертає відповідь і кінцеву адресу. */
export async function fetchPublic(start: URL, options: PublicFetchOptions = {}): Promise<{ response: Response; url: URL }> {
  const fetchImpl = options.fetch ?? fetch;
  const lookup = options.lookup ?? defaultLookup;
  let url = start;
  let headers = options.headers ?? {};
  for (let hop = 0; ; hop++) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new PublicFetchError('scheme', url.host, 'Посилання має починатися з http:// або https://');
    }
    await assertPublicHost(url, lookup);
    let response: Response;
    try {
      response = await fetchImpl(url.toString(), { headers, signal: options.signal, redirect: 'manual' });
    } catch (e) {
      throw new PublicFetchError('network', url.host, `Не вдалося з'єднатися з ${url.host}`, { cause: e });
    }
    const location = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null;
    if (!location) return { response, url };
    await response.body?.cancel().catch(() => undefined);
    if (hop >= MAX_REDIRECTS) throw new PublicFetchError('redirects', url.host, `Забагато переадресацій на ${url.host}`);
    const next = new URL(location, url);
    if (next.origin !== url.origin) headers = withoutAuthorization(headers);
    url = next;
  }
}
