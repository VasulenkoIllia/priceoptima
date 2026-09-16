// Правила показу фото: головне у товару рівно одне, решта — за порядком показу.
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
