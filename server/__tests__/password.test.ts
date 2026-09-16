// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../modules/auth/password';

describe('паролі', () => {
  it('хеш не містить самого пароля і це argon2id', async () => {
    const hash = await hashPassword('Дуже-Складний-Пароль-1');
    expect(hash).toMatch(/^\$argon2id\$/u);
    expect(hash).not.toContain('Дуже-Складний-Пароль-1');
  });

  it('той самий пароль щоразу дає інший хеш (різна сіль)', async () => {
    const [a, b] = await Promise.all([hashPassword('однаковий'), hashPassword('однаковий')]);
    expect(a).not.toBe(b);
  });

  it('перевіряє правильний пароль і відхиляє неправильний', async () => {
    const hash = await hashPassword('StrongPass123');
    expect(await verifyPassword(hash, 'StrongPass123')).toBe(true);
    expect(await verifyPassword(hash, 'strongpass123')).toBe(false);
    expect(await verifyPassword(hash, '')).toBe(false);
  });

  it('користувач без пароля увійти не може', async () => {
    expect(await verifyPassword(null, 'будь-що')).toBe(false);
    expect(await verifyPassword(undefined, 'будь-що')).toBe(false);
    expect(await verifyPassword('', 'будь-що')).toBe(false);
  });

  it('пошкоджений хеш не ламає перевірку', async () => {
    expect(await verifyPassword('не-хеш', 'пароль')).toBe(false);
  });
});
