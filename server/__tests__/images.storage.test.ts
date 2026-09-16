// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ApiError } from '../http/errors';
import {
  assertUploadedImage,
  MAX_IMAGE_BYTES,
  resolveStoredPath,
  safeFileName,
  sniffImageType,
  storedPathFor,
} from '../modules/images/images.storage';

const UPLOADS = '/srv/priceoptima/data/uploads';

function errorOf(fn: () => unknown): ApiError {
  try {
    fn();
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error('очікували помилку');
}

const jpeg = (size = 32) => {
  const b = Buffer.alloc(size);
  b.set([0xff, 0xd8, 0xff, 0xe0], 0);
  return b;
};
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const webp = () => Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(16)]);

describe('тип файлу за вмістом', () => {
  it('розпізнає jpeg, png і webp', () => {
    expect(sniffImageType(jpeg())).toBe('image/jpeg');
    expect(sniffImageType(png())).toBe('image/png');
    expect(sniffImageType(webp())).toBe('image/webp');
  });

  it('решта форматів — не наш випадок', () => {
    expect(sniffImageType(Buffer.from('GIF89a________'))).toBeNull();
    expect(sniffImageType(Buffer.from('%PDF-1.7 ......'))).toBeNull();
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
    // 'RIFF' без 'WEBP' — це, наприклад, звук
    expect(sniffImageType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]))).toBeNull();
  });

  it('назва файлу нічого не вирішує: .jpg із вмістом скрипта не проходить', () => {
    expect(errorOf(() => assertUploadedImage(Buffer.from('#!/bin/sh\nrm -rf /'))).code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });
});

describe('перевірка завантаження', () => {
  it('порожній і завеликий файли відхиляються', () => {
    expect(errorOf(() => assertUploadedImage(Buffer.alloc(0))).code).toBe('VALIDATION_ERROR');
    const tooBig = jpeg(MAX_IMAGE_BYTES + 1);
    const e = errorOf(() => assertUploadedImage(tooBig));
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(e.message).toContain('10 МБ');
  });

  it('файл рівно на межі проходить', () => {
    expect(assertUploadedImage(jpeg(MAX_IMAGE_BYTES))).toBe('image/jpeg');
  });
});

describe('шлях у сховищі', () => {
  it('нове фото лягає в теку товару', () => {
    const stored = storedPathFor('prd-1', 'image/webp');
    expect(stored).toMatch(/^products\/prd-1\/[0-9a-f-]{36}\.webp$/u);
    expect(resolveStoredPath(UPLOADS, stored)).toBe(`${UPLOADS}/${stored}`);
  });

  it('усе, що виводить за теку сховища, — помилка', () => {
    for (const bad of [
      '../../../etc/passwd',
      '/etc/passwd',
      'products/../../secrets.txt',
      '..',
      '',
      'products/\0/x.jpg',
    ]) {
      expect(errorOf(() => resolveStoredPath(UPLOADS, bad)).code).toBe('INTERNAL');
    }
  });

  it('нормалізація всередині теки дозволена', () => {
    expect(resolveStoredPath(UPLOADS, 'products/prd-1/../prd-1/a.jpg')).toBe(`${UPLOADS}/products/prd-1/a.jpg`);
  });
});

describe('назва файлу', () => {
  it('лишається лише саме імʼя без шляху', () => {
    expect(safeFileName('фото.jpg')).toBe('фото.jpg');
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('C:\\Users\\me\\photo.png')).toBe('photo.png');
    expect(safeFileName('  ')).toBeNull();
    expect(safeFileName(undefined)).toBeNull();
  });
});
