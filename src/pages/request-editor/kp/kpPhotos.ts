// Фото рядків КП для PDF і Excel: з нашого сховища (знімок КП зберігає саме такі посилання), стиснуті до JPEG.

/** Пікселі растру фото — щоб файл не важив зайвого. */
const PHOTO_PX = 96;

/**
 * Фото рядків КП як data URL (JPEG): pdfmake розуміє лише JPEG і PNG, а WebP — ні; Excel — так само.
 * Фото, яке не завантажилось, пропускаємо — у бланку лишиться місце під нього.
 */
export async function loadRowPhotos(paths: readonly string[]): Promise<Map<string, string>> {
  const photos = new Map<string, string>();
  const unique = [...new Set(paths)];
  await Promise.all(
    unique.map(async (path) => {
      try {
        const blob = await (await fetch(path, { credentials: 'include' })).blob();
        photos.set(path, await shrinkToJpeg(blob));
      } catch {
        // немає фото — у бланку лишиться місце під нього
      }
    }),
  );
  return photos;
}

async function shrinkToJpeg(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const side = Math.max(bitmap.width, bitmap.height) || 1;
  const scale = Math.min(1, PHOTO_PX / side);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Канвас недоступний');
  // прозорий фон у JPEG стає чорним — підкладаємо білий
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}
