import { describe, expect, it } from 'vitest';
import { DRIVE_IMAGE_BASE, DRIVE_IMAGE_SIZE, directImageUrl, directImageUrlOrNull } from '../imageUrl';

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz_-12345';
const DIRECT = `${DRIVE_IMAGE_BASE}${ID}${DRIVE_IMAGE_SIZE}`;

describe('посилання Google Диска на фото (правки замовника 07.10)', () => {
  it('сторінка перегляду файлу → пряме посилання на зображення', () => {
    for (const url of [
      `https://drive.google.com/file/d/${ID}/view?usp=drive_link`,
      `https://drive.google.com/file/d/${ID}/view?usp=sharing`,
      `https://drive.google.com/file/d/${ID}/edit`,
      `https://drive.google.com/file/d/${ID}/preview`,
      `https://drive.google.com/file/d/${ID}`,
      `https://drive.google.com/open?id=${ID}`,
      `https://drive.google.com/uc?export=view&id=${ID}`,
      `https://drive.google.com/uc?id=${ID}&export=download`,
      `https://docs.google.com/uc?id=${ID}`,
      `https://drive.google.com/thumbnail?id=${ID}&sz=w1000`,
      `http://drive.google.com/file/d/${ID}/view`,
      `https://drive.google.com/file/u/0/d/${ID}/view`,
      `https://drive.usercontent.google.com/download?id=${ID}&export=view`,
      `https://drive.google.com/file/d/${ID}/view?usp=sharing&resourcekey=0-abc`,
    ]) {
      expect(directImageUrl(url)).toBe(DIRECT);
    }
  });

  it('інші посилання, папки Диска й уже прямі — як є', () => {
    for (const url of [
      'https://b2b.teploarmatura.com/storage/products/images/original/a.jpeg',
      `https://drive.google.com/drive/folders/${ID}`,
      `https://drive.google.com/drive/folders/${ID}?id=${ID}`,
      `https://docs.google.com/document/d/${ID}/edit`,
      `https://docs.google.com/presentation/d/${ID}/edit?id=${ID}`,
      `https://lh3.googleusercontent.com/d/${ID}`,
      `https://drive.google.com.evil.example/file/d/${ID}/view`,
      'https://example.com/file/d/abcdefghijkl/view',
      '/api/images/123',
    ]) {
      expect(directImageUrl(url)).toBe(url);
    }
    expect(directImageUrlOrNull(null)).toBeNull();
    expect(directImageUrlOrNull(`https://drive.google.com/file/d/${ID}/view`)).toBe(DIRECT);
    // уже перетворене — не змінюється (повторне перетворення безпечне)
    expect(directImageUrl(DIRECT)).toBe(DIRECT);
  });
});
