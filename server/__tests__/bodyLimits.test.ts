import { describe, expect, it } from 'vitest';
import { hasOwnJsonParser } from '../http/bodyLimits';

describe('власний JSON-парсер маршруту', () => {
  it('прайс файлом і збереження заявки розбирають тіло самі, після перевірки входу', () => {
    expect(hasOwnJsonParser('POST', '/price-updates/import')).toBe(true);
    expect(hasOwnJsonParser('PATCH', '/requests/7f0c7e3a-1111-4222-8333-944455556666')).toBe(true);
  });

  it('решта запитів — загальний парсер до 1 МБ', () => {
    expect(hasOwnJsonParser('GET', '/requests/abc')).toBe(false);
    expect(hasOwnJsonParser('POST', '/requests/abc/status')).toBe(false);
    expect(hasOwnJsonParser('PATCH', '/requests/abc/lock')).toBe(false);
    expect(hasOwnJsonParser('POST', '/price-updates/run')).toBe(false);
  });
});
