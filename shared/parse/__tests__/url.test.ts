import { describe, expect, it } from 'vitest';
import { isImageSrc, isSearchUrlTemplate, webUrl } from '../url';

describe('посилання з карток', () => {
  it('сайт: http(s) як є, без схеми — https://, інші схеми — ні', () => {
    expect(webUrl('https://sandi.ua/catalog')).toBe('https://sandi.ua/catalog');
    expect(webUrl('http://b2b.example.com')).toBe('http://b2b.example.com');
    expect(webUrl(' sandi.ua ')).toBe('https://sandi.ua');
    expect(webUrl('javascript:alert(1)')).toBeNull();
    expect(webUrl('JavaScript:fetch("/api")')).toBeNull();
    expect(webUrl('data:text/html,<script>')).toBeNull();
    expect(webUrl('просто текст')).toBeNull();
    expect(webUrl('')).toBeNull();
    expect(webUrl(null)).toBeNull();
  });

  it('шаблон пошуку: лише http(s)', () => {
    expect(isSearchUrlTemplate('https://sandi.ua/search?q={query}')).toBe(true);
    expect(isSearchUrlTemplate('javascript:alert("{query}")')).toBe(false);
  });

  it('картинка: data-URL зображення, http(s) або шлях застосунку', () => {
    expect(isImageSrc('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isImageSrc('data:image/svg+xml;base64,PHN2Zz4=')).toBe(true);
    expect(isImageSrc('/api/images/abc')).toBe(true);
    expect(isImageSrc('https://cdn.example.com/logo.png')).toBe(true);
    expect(isImageSrc('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
    expect(isImageSrc('javascript:alert(1)')).toBe(false);
    expect(isImageSrc('//evil.example.com/x.png')).toBe(false);
  });
});
