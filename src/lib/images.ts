// Зображення в браузері: зменшення до розумного розміру перед збереженням у картці (логотипи).
const PNG = 'image/png';

/** Файл → зображення в самому рядку картки (data URL), зменшене до maxSide. SVG лишаємо як є. */
export async function shrinkImageToDataUrl(file: Blob, maxSide: number): Promise<string> {
  if (file.type === 'image/svg+xml') return await readAsDataUrl(file);
  const bitmap = await createImageBitmap(file);
  const side = Math.max(bitmap.width, bitmap.height) || 1;
  const scale = Math.min(1, maxSide / side);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Канвас недоступний');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // прозорість логотипа зберігаємо, тому PNG
  return canvas.toDataURL(PNG);
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Зображення без порожніх полів: data URL (PNG) і розміри в пікселях. */
export interface TrimmedImage {
  dataUrl: string;
  width: number;
  height: number;
}

/** Піксель тла: прозорий або майже білий. */
const isBackground = (data: Uint8ClampedArray, i: number) => data[i + 3] < 16 || (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245);

/**
 * Растровий логотип без прозорих і білих полів навколо малюнка (правки замовника 06.10: поля зсували текст шапки КП).
 * Порожнього малюнка чи SVG не чіпаємо (null — беремо як є); полів немає — повертаємо те саме зображення.
 */
export async function trimImageMargins(url: string): Promise<TrimmedImage | null> {
  if (url.startsWith('data:image/svg+xml')) return null;
  const img = new Image();
  img.src = url;
  await img.decode();
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!width || !height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isBackground(data, (y * width + x) * 4)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  if (minX === 0 && minY === 0 && maxX === width - 1 && maxY === height - 1) return { dataUrl: url, width, height };
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d');
  if (!octx) return null;
  octx.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
  return { dataUrl: out.toDataURL(PNG), width: w, height: h };
}
