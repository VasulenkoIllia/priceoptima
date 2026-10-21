// Правила показу фото: головне у товару рівно одне, решта — за порядком показу; звідки брати фото з прайсу.
// Product.imageUrl — це копія посилання на головне фото, щоб списки й КП брали одне поле.

export interface ImageOrderRow {
  id: string;
  isMain: boolean;
  sortOrder: number;
  createdAt: Date;
}

/** Порядок показу: головне першим, далі за sortOrder і часом додавання. */
export function compareImages(a: ImageOrderRow, b: ImageOrderRow): number {
  return (
    Number(b.isMain) - Number(a.isMain) ||
    a.sortOrder - b.sortOrder ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Яке фото має стати головним серед наявних: уже позначене або перше за порядком.
 * Фото не лишилось — null (тоді товар лишається без картинки).
 */
export function nextMainId(images: readonly ImageOrderRow[]): string | null {
  if (images.length === 0) return null;
  const marked = images.filter((i) => i.isMain).sort(compareImages);
  if (marked.length) return marked[0].id;
  return [...images].sort(compareImages)[0].id;
}

/**
 * Звідки пробуємо взяти фото з прайсу: за посиланням як є, а http:// — ще й через https://.
 * Браузер на нашому https-сайті сам переводить фото на https, тож у перегляді КП воно видно; сервер мусить так само:
 * у SANWELL за http фото вже віддають 404 (правки замовника 21.10, п.12).
 */
export function feedImageAttempts(url: URL): URL[] {
  if (url.protocol !== 'http:') return [url];
  const secure = new URL(url);
  secure.protocol = 'https:';
  return [url, secure];
}
