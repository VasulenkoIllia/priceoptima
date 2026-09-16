// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createSecretBox, deriveKey, open, seal, SecretBoxError } from '../lib/secretBox';

const SECRET = 'ключ-підпису-сесій-для-тесту';
const OTHER = 'зовсім-інший-ключ-підпису';
const TOKEN = 'Bearer 9f3c-секретний-токен-вигрузки';

describe('сховище секретів', () => {
  it('зашифроване значення читається тим самим ключем', () => {
    const box = createSecretBox(SECRET);
    expect(box.open(box.seal(TOKEN))).toBe(TOKEN);
  });

  it('порожній рядок і довгий текст теж переживають шифрування', () => {
    const box = createSecretBox(SECRET);
    const long = 'я'.repeat(500);
    expect(box.open(box.seal(''))).toBe('');
    expect(box.open(box.seal(long))).toBe(long);
  });

  it('чужим ключем не розшифрувати', () => {
    const packed = createSecretBox(SECRET).seal(TOKEN);
    expect(() => createSecretBox(OTHER).open(packed)).toThrow(SecretBoxError);
    expect(createSecretBox(OTHER).tryOpen(packed)).toBeNull();
  });

  it('кожне шифрування дає інший результат (випадковий вектор)', () => {
    const box = createSecretBox(SECRET);
    const a = box.seal(TOKEN);
    const b = box.seal(TOKEN);
    expect(a).not.toBe(b);
    expect(a).not.toContain(TOKEN);
    expect(box.open(a)).toBe(box.open(b));
  });

  it('змінене значення в базі не проходить перевірку цілісності', () => {
    const box = createSecretBox(SECRET);
    const [version, iv, tag, data] = box.seal(TOKEN).split('.');
    const broken = [version, iv, tag, `${data.slice(0, -2)}AA`].join('.');
    expect(() => box.open(broken)).toThrow(SecretBoxError);
  });

  it('невідомий формат — зрозуміла помилка, а не виняток з надр crypto', () => {
    const box = createSecretBox(SECRET);
    expect(() => box.open('просто текст')).toThrow(/формат/u);
    expect(() => box.open('v2.a.b.c')).toThrow(SecretBoxError);
    expect(box.tryOpen(null)).toBeNull();
  });

  it('ключ виводиться однаково з того самого рядка й різний для різних', () => {
    expect(deriveKey(SECRET).equals(deriveKey(SECRET))).toBe(true);
    expect(deriveKey(SECRET).equals(deriveKey(OTHER))).toBe(false);
    expect(deriveKey(SECRET)).toHaveLength(32);
    expect(() => deriveKey('')).toThrow(SecretBoxError);
  });

  it('функції нижнього рівня працюють із готовим ключем', () => {
    const key = deriveKey(SECRET);
    expect(open(key, seal(key, TOKEN))).toBe(TOKEN);
  });
});
