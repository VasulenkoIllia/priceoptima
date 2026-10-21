// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compareImages, feedImageAttempts, nextMainId, type ImageOrderRow } from '../modules/images/images.rules';
import { imageUrlOf, servedImageUrl } from '../modules/images/images.mapper';

const at = (iso: string) => new Date(iso);

function image(id: string, part: Partial<ImageOrderRow> = {}): ImageOrderRow {
  return { id, isMain: false, sortOrder: 0, createdAt: at('2026-09-16T10:00:00.000Z'), ...part };
}

describe('порядок фото', () => {
  it('головне першим, далі за порядком і часом', () => {
    const list = [
      image('c', { sortOrder: 2 }),
      image('a', { sortOrder: 1, createdAt: at('2026-09-16T09:00:00.000Z') }),
      image('b', { sortOrder: 1, createdAt: at('2026-09-16T11:00:00.000Z') }),
      image('m', { sortOrder: 9, isMain: true }),
    ];
    expect([...list].sort(compareImages).map((i) => i.id)).toEqual(['m', 'a', 'b', 'c']);
  });
});

describe('головне фото', () => {
  it('фото немає — товар лишається без картинки', () => {
    expect(nextMainId([])).toBeNull();
  });

  it('перше фото товару одразу стає головним', () => {
    expect(nextMainId([image('a')])).toBe('a');
  });

  it('уже позначене лишається головним', () => {
    expect(nextMainId([image('a', { sortOrder: 0 }), image('b', { sortOrder: 5, isMain: true })])).toBe('b');
  });

  it('позначених випадково кілька — беремо перше за порядком', () => {
    expect(
      nextMainId([image('a', { sortOrder: 5, isMain: true }), image('b', { sortOrder: 1, isMain: true })]),
    ).toBe('b');
  });

  it('після видалення головного головним стає наступне за порядком', () => {
    const rest = [image('c', { sortOrder: 3 }), image('b', { sortOrder: 1 })];
    expect(nextMainId(rest)).toBe('b');
  });
});

describe('посилання на фото', () => {
  it('фото з прайсу віддаємо його власним посиланням, наше — через /api/images', () => {
    expect(imageUrlOf({ id: 'img-1', source: 'feed', url: 'https://supplier.example/p/1.jpg' })).toBe(
      'https://supplier.example/p/1.jpg',
    );
    expect(imageUrlOf({ id: 'img-2', source: 'upload', url: null })).toBe('/api/images/img-2');
    expect(servedImageUrl('img-3')).toBe('/api/images/img-3');
  });
});

describe('звідки беремо фото з прайсу (правки замовника 21.10, п.12)', () => {
  const attempts = (url: string) => feedImageAttempts(new URL(url)).map(String);

  it('http:// — як є, потім через https:// (у SANWELL за http фото вже 404)', () => {
    expect(attempts('http://media1.sanwell.biz/assets/2/A/img/B/1.jpg')).toEqual([
      'http://media1.sanwell.biz/assets/2/A/img/B/1.jpg',
      'https://media1.sanwell.biz/assets/2/A/img/B/1.jpg',
    ]);
  });

  it('https:// — лише як є; порт і запит зберігаються', () => {
    expect(attempts('https://supplier.example/p/1.jpg')).toEqual(['https://supplier.example/p/1.jpg']);
    expect(attempts('http://supplier.example:8080/p?id=1')).toEqual([
      'http://supplier.example:8080/p?id=1',
      'https://supplier.example:8080/p?id=1',
    ]);
  });
});
