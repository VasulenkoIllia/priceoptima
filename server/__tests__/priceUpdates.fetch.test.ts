// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createSecretBox } from '../lib/secretBox';
import {
  buildFeedRequest,
  decodeFeed,
  downloadFeed,
  FeedFetchError,
  type FeedAccess,
} from '../modules/price-updates/priceUpdates.fetch';
import { isPrivateAddress } from '../lib/publicFetch';

const secrets = createSecretBox('тестовий-ключ-підпису-cookie');
/** Хост вигрузки — публічна адреса (DNS у тестах не чіпаємо). */
const publicHost = async () => ['93.184.215.14'];

function feed(overrides: Partial<FeedAccess> = {}): FeedAccess {
  return { url: 'https://b2b.example.com/export/price.xml', auth: 'none', secret: null, ...overrides };
}

/** Підставний fetch, що віддає готову відповідь і запам'ятовує запит. */
function fakeFetch(response: Response | (() => Promise<Response>)) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    typeof response === 'function' ? response() : response,
  );
}

async function errorOf(promise: Promise<unknown>): Promise<FeedFetchError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(FeedFetchError);
    return e as FeedFetchError;
  }
  throw new Error('очікували помилку завантаження');
}

describe('запит до вигрузки', () => {
  it('без доступу — посилання як є, без заголовка авторизації', () => {
    const request = buildFeedRequest('https://b2b.example.com/price.json?lang=uk', 'none', null);
    expect(request.url).toBe('https://b2b.example.com/price.json?lang=uk');
    expect(request.headers.authorization).toBeUndefined();
  });

  it('bearer — токен у заголовку Authorization', () => {
    expect(buildFeedRequest('https://b2b.example.com/x', 'bearer', 'abc.def').headers.authorization).toBe('Bearer abc.def');
  });

  it('basic — «логін:пароль», ділимо за першою двокрапкою', () => {
    const header = buildFeedRequest('https://b2b.example.com/x', 'basic', 'менеджер:па:роль').headers.authorization;
    expect(header.startsWith('Basic ')).toBe(true);
    expect(Buffer.from(header.slice(6), 'base64').toString('utf8')).toBe('менеджер:па:роль');
  });

  it('basic без двокрапки — зрозуміла помилка', () => {
    expect(() => buildFeedRequest('https://b2b.example.com/x', 'basic', 'лише-пароль')).toThrow(/логін:пароль/u);
  });

  it('query — токен параметром token, інші параметри лишаються', () => {
    const url = new URL(buildFeedRequest('https://b2b.example.com/export?format=xml', 'query', 's3cr3t').url);
    expect(url.searchParams.get('format')).toBe('xml');
    expect(url.searchParams.get('token')).toBe('s3cr3t');
  });

  it('query — порожній параметр у посиланні заповнюється токеном', () => {
    const url = new URL(buildFeedRequest('https://b2b.example.com/export?format=xml&key=', 'query', 's3cr3t').url);
    expect(url.searchParams.get('key')).toBe('s3cr3t');
    expect(url.searchParams.has('token')).toBe(false);
  });

  it('спосіб доступу без збереженого секрету — помилка', () => {
    expect(() => buildFeedRequest('https://b2b.example.com/x', 'bearer', null)).toThrow(/не збережено токен/u);
  });

  it('некоректне посилання, не http(s) або з логіном у посиланні — помилка', () => {
    expect(() => buildFeedRequest('не посилання', 'none', null)).toThrow(FeedFetchError);
    expect(() => buildFeedRequest('file:///etc/passwd', 'none', null)).toThrow(/http:\/\/ або https:\/\//u);
    expect(() => buildFeedRequest('https://user:pass@b2b.example.com/x', 'none', null)).toThrow(/не пишуть у посиланні/u);
  });
});

describe('завантаження вигрузки', () => {
  it('секрет розшифровується й іде в заголовок; тіло повертається текстом', async () => {
    const fetchMock = fakeFetch(new Response('{"products":{}}', { status: 200 }));
    const body = await downloadFeed(feed({ auth: 'bearer', secret: secrets.seal('токен-SANWELL') }), secrets, {
      lookup: publicHost, fetch: fetchMock });
    expect(body).toBe('{"products":{}}');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer токен-SANWELL');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('секрет не розшифровується (змінився ключ) — просимо ввести заново', async () => {
    const foreign = createSecretBox('інший-ключ-підпису-cookie-сервера').seal('токен');
    const error = await errorOf(downloadFeed(feed({ auth: 'bearer', secret: foreign }), secrets, {
      lookup: publicHost, fetch: fakeFetch(new Response('x')) }));
    expect(error.message).toMatch(/введіть його заново/u);
  });

  it('без посилання — помилка без запиту', async () => {
    const fetchMock = fakeFetch(new Response('x'));
    const error = await errorOf(downloadFeed(feed({ url: null }), secrets, {
      lookup: publicHost, fetch: fetchMock }));
    expect(error.message).toMatch(/не налаштоване посилання/u);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, /відмовив у доступі \(HTTP 401\)/u],
    [403, /відмовив у доступі \(HTTP 403\)/u],
    [404, /не знайдено за посиланням/u],
    [429, /обмежив запити/u],
    [502, /повернув помилку \(HTTP 502\)/u],
    [418, /відповів HTTP 418/u],
  ])('HTTP %i — зрозуміле повідомлення', async (status, message) => {
    const error = await errorOf(downloadFeed(feed(), secrets, {
      lookup: publicHost, fetch: fakeFetch(new Response('nope', { status })) }));
    expect(error.message).toMatch(message);
  });

  it('повідомлення не містить токена з посилання', async () => {
    const error = await errorOf(
      downloadFeed(feed({ auth: 'query', secret: secrets.seal('дуже-секретний') }), secrets, {
      lookup: publicHost,
        fetch: fakeFetch(new Response('nope', { status: 500 })),
      }),
    );
    expect(error.message).not.toContain('дуже-секретний');
  });

  it('таймаут — сервер не віддав вигрузку за відведений час', async () => {
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    const error = await errorOf(
      downloadFeed(feed(), secrets, {
      lookup: publicHost, fetch: vi.fn().mockRejectedValue(timeout), timeoutMs: 5 * 60_000 }),
    );
    expect(error.message).toBe('Сервер постачальника (b2b.example.com) не віддав вигрузку за 5 хв');
  });

  it('таймаут справжнього сигналу під час запиту', async () => {
    const hanging = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const error = await errorOf(downloadFeed(feed(), secrets, {
      lookup: publicHost, fetch: hanging, timeoutMs: 20 }));
    expect(error.message).toMatch(/не віддав вигрузку/u);
  });

  it('хост не знайдено чи з\'єднання відхилено — помилка з хостом', async () => {
    const notFound = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    expect((await errorOf(downloadFeed(feed(), secrets, {
      lookup: publicHost, fetch: vi.fn().mockRejectedValue(notFound) }))).message).toMatch(
      /b2b\.example\.com\) не знайдено/u,
    );
    const refused = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    expect((await errorOf(downloadFeed(feed(), secrets, {
      lookup: publicHost, fetch: vi.fn().mockRejectedValue(refused) }))).message).toMatch(
      /не приймає з'єднання/u,
    );
    const reset = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
    expect((await errorOf(downloadFeed(feed(), secrets, {
      lookup: publicHost, fetch: vi.fn().mockRejectedValue(reset) }))).message).toMatch(
      /з'єднання перервалось/u,
    );
  });

  it('порожня відповідь — помилка', async () => {
    expect((await errorOf(downloadFeed(feed(), secrets, {
      lookup: publicHost, fetch: fakeFetch(new Response('')) }))).message).toMatch(/порожню вигрузку/u);
    expect((await errorOf(downloadFeed(feed(), secrets, {
      lookup: publicHost, fetch: fakeFetch(new Response('  \n ')) }))).message).toMatch(
      /порожню вигрузку/u,
    );
  });

  it('завелика вигрузка: за заголовком і за фактично прочитаним', async () => {
    const declared = new Response('x', { headers: { 'content-length': '5000' } });
    expect((await errorOf(downloadFeed(feed(), secrets, {
      lookup: publicHost, fetch: fakeFetch(declared), maxBytes: 1024 }))).message).toMatch(
      /завелика/u,
    );
    const streamed = new Response('x'.repeat(4096));
    expect((await errorOf(downloadFeed(feed(), secrets, {
      lookup: publicHost, fetch: fakeFetch(streamed), maxBytes: 1024 }))).message).toMatch(
      /завелика/u,
    );
  });
});

describe('кодування вигрузки', () => {
  const cp1251 = (text: string) =>
    Uint8Array.from([...text].map((ch) => (ch === 'П' ? 0xcf : ch === 'р' ? 0xf0 : ch === 'а' ? 0xe0 : ch === 'й' ? 0xe9 : ch === 'с' ? 0xf1 : ch.charCodeAt(0))));

  it('UTF-8 за замовчуванням', () => {
    expect(decodeFeed(new TextEncoder().encode('Прайс'), null)).toBe('Прайс');
  });

  it('windows-1251 із заголовка відповіді або з XML-декларації', () => {
    expect(decodeFeed(cp1251('Прайс'), 'text/xml; charset=windows-1251')).toBe('Прайс');
    expect(decodeFeed(cp1251('<?xml version="1.0" encoding="windows-1251"?><a>Прайс</a>'), 'application/xml')).toBe(
      '<?xml version="1.0" encoding="windows-1251"?><a>Прайс</a>',
    );
  });

  it('невідоме кодування — читаємо як UTF-8', () => {
    expect(decodeFeed(new TextEncoder().encode('Прайс'), 'text/plain; charset=x-невідоме')).toBe('Прайс');
  });
});

describe('лише публічні адреси', () => {
  it('локальні, приватні й службові адреси — ні; публічні — так', () => {
    for (const a of ['127.0.0.1', '10.1.2.3', '172.20.0.5', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(a), a).toBe(true);
    }
    for (const a of ['93.184.215.14', '8.8.8.8', '2606:4700:4700::1111']) expect(isPrivateAddress(a), a).toBe(false);
  });

  it('посилання на внутрішню адресу або ім\'я, що веде в приватну мережу, — без запиту', async () => {
    const fetchMock = fakeFetch(new Response('x'));
    const direct = await errorOf(downloadFeed(feed({ url: 'http://169.254.169.254/latest/meta-data' }), secrets, { fetch: fetchMock, lookup: publicHost }));
    expect(direct.message).toMatch(/внутрішню адресу/u);
    const viaDns = await errorOf(downloadFeed(feed({ url: 'http://db:5432/' }), secrets, { fetch: fetchMock, lookup: async () => ['172.18.0.2'] }));
    expect(viaDns.message).toMatch(/внутрішню адресу \(db:5432\)/u);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('IPv6 link-local у DNS поруч із публічною адресою пропускаємо; інші приватні — ні', async () => {
    // так відповідав DNS sigma.ua 25.09.2026: A 65.109.72.223 і AAAA fe80::…
    const sigma = async () => ['fe80::31da:f79f:b653:26b5', '65.109.72.223'];
    expect(await downloadFeed(feed(), secrets, { fetch: fakeFetch(new Response('<yml/>')), lookup: sigma })).toBe('<yml/>');

    const fetchMock = fakeFetch(new Response('x'));
    const onlyLinkLocal = await errorOf(downloadFeed(feed(), secrets, { fetch: fetchMock, lookup: async () => ['fe80::1'] }));
    expect(onlyLinkLocal.message).toMatch(/внутрішню адресу/u);
    const literal = await errorOf(downloadFeed(feed({ url: 'http://[fe80::1]/price.xml' }), secrets, { fetch: fetchMock, lookup: publicHost }));
    expect(literal.message).toMatch(/внутрішню адресу/u);
    const mixedPrivate = await errorOf(downloadFeed(feed(), secrets, { fetch: fetchMock, lookup: async () => ['fe80::1', '10.0.0.5', '65.109.72.223'] }));
    expect(mixedPrivate.message).toMatch(/внутрішню адресу/u);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('переадресація на внутрішню адресу — помилка; на інший сервер — без токена', async () => {
    const redirectTo = (location: string) => new Response(null, { status: 302, headers: { location } });
    const toLocal = vi.fn().mockResolvedValueOnce(redirectTo('http://127.0.0.1:3000/api/users'));
    const local = await errorOf(downloadFeed(feed(), secrets, { fetch: toLocal, lookup: publicHost }));
    expect(local.message).toMatch(/внутрішню адресу/u);
    expect(toLocal).toHaveBeenCalledTimes(1);

    const crossHost = vi.fn().mockResolvedValueOnce(redirectTo('https://cdn.example.net/price.xml')).mockResolvedValueOnce(new Response('<yml/>'));
    const body = await downloadFeed(feed({ auth: 'bearer', secret: secrets.seal('токен') }), secrets, { fetch: crossHost, lookup: publicHost });
    expect(body).toBe('<yml/>');
    expect((crossHost.mock.calls[0][1] as RequestInit).headers).toMatchObject({ authorization: 'Bearer токен' });
    expect((crossHost.mock.calls[1][1] as RequestInit).headers).not.toHaveProperty('authorization');
  });
});
