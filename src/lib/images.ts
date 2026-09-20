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
