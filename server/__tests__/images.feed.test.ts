// @vitest-environment node
// Фото з прайсу для КП (правки замовника 21.10, п.12): за http:// у SANWELL 404, тоді беремо те саме через https://.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  uploadsDir: '',
  fetchPublic: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../config', () => ({
  config: {
    get uploadsDir() {
      return h.uploadsDir;
    },
  },
}));
vi.mock('../db', () => ({ prisma: { productImage: { findMany: h.findMany, update: h.update } } }));
vi.mock('../logger', () => ({ logger: { warn: h.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../modules/products/products.service', () => ({ productOrFail: vi.fn() }));
vi.mock('../lib/publicFetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/publicFetch')>()),
  fetchPublic: h.fetchPublic,
}));

import { PublicFetchError } from '../lib/publicFetch';
import { mainImagesFor } from '../modules/images/images.service';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const HTTP_URL = 'http://media1.sanwell.biz/assets/2/A/img/B/1.jpg';
const HTTPS_URL = 'https://media1.sanwell.biz/assets/2/A/img/B/1.jpg';

/** Що віддає «сайт» на кожну адресу: код відповіді (200 — фото) або помилка запиту. */
function site(byUrl: Record<string, number | Error>) {
  h.fetchPublic.mockImplementation(async (url: URL) => {
    const answer = byUrl[url.toString()];
    if (answer instanceof Error) throw answer;
    const response = answer === 200 ? new Response(JPEG) : new Response('Not Found', { status: answer ?? 404 });
    return { response, url };
  });
}

function feedImage(url: string) {
  const row = { id: 'img-1', productId: 'p-1', url, storedPath: null, isMain: true, source: 'feed' };
  h.findMany.mockResolvedValue([row]);
  h.update.mockImplementation(async ({ data }: { data: object }) => ({ ...row, ...data }));
}

const requested = () => h.fetchPublic.mock.calls.map(([url]) => String(url));
const warned = () => h.warn.mock.calls.map(([fields, msg]) => [msg, (fields as { err: Error }).err.message]);

beforeAll(async () => {
  h.uploadsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'po-feed-images-'));
});
afterAll(async () => {
  await fs.rm(h.uploadsDir, { recursive: true, force: true });
});
beforeEach(() => {
  vi.clearAllMocks();
});

describe('фото з прайсу для КП', () => {
  it('http:// дає 404 — беремо через https:// і зберігаємо в сховище', async () => {
    feedImage(HTTP_URL);
    site({ [HTTP_URL]: 404, [HTTPS_URL]: 200 });
    const images = await mainImagesFor(['p-1']);
    expect(images.get('p-1')).toBe('/api/images/img-1');
    expect(requested()).toEqual([HTTP_URL, HTTPS_URL]);
    const storedPath = h.update.mock.calls[0][0].data.storedPath as string;
    expect(storedPath).toMatch(/^products\/p-1\/.+\.jpg$/);
    expect(await fs.readFile(path.join(h.uploadsDir, storedPath))).toEqual(JPEG);
    expect(h.warn).not.toHaveBeenCalled();
  });

  it('http:// працює — https:// не пробуємо', async () => {
    feedImage(HTTP_URL);
    site({ [HTTP_URL]: 200 });
    expect((await mainImagesFor(['p-1'])).get('p-1')).toBe('/api/images/img-1');
    expect(requested()).toEqual([HTTP_URL]);
  });

  it('https:// у прайсі — одна спроба; не вийшло — без фото, у журналі причина', async () => {
    feedImage(HTTPS_URL);
    site({ [HTTPS_URL]: 404 });
    expect((await mainImagesFor(['p-1'])).size).toBe(0);
    expect(requested()).toEqual([HTTPS_URL]);
    expect(warned()).toEqual([['Не вдалося зберегти фото з прайсу', 'Фото недоступне (HTTP 404)']]);
  });

  it('не вийшло й через https — у журналі обидві причини, назовні — за посиланням із прайсу', async () => {
    feedImage(HTTP_URL);
    site({ [HTTP_URL]: 404, [HTTPS_URL]: 403 });
    expect((await mainImagesFor(['p-1'])).size).toBe(0);
    expect(warned()).toEqual([
      ['Фото з прайсу не вдалося взяти й через https', 'Фото недоступне (HTTP 403)'],
      ['Не вдалося зберегти фото з прайсу', 'Фото недоступне (HTTP 404)'],
    ]);
  });

  it('хоста немає — https:// не пробуємо', async () => {
    feedImage(HTTP_URL);
    site({ [HTTP_URL]: new PublicFetchError('not_found', 'media1.sanwell.biz', 'Сервер media1.sanwell.biz не знайдено') });
    expect((await mainImagesFor(['p-1'])).size).toBe(0);
    expect(requested()).toEqual([HTTP_URL]);
  });
});
