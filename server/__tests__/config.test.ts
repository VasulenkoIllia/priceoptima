import { describe, expect, it, vi } from 'vitest';

// модуль конфігу читає середовище при імпорті — задаємо мінімум до нього
vi.hoisted(() => {
  process.env.DATABASE_URL ||= 'postgresql://u:p@localhost:5432/test';
  process.env.SESSION_SECRET ||= '0123456789abcdef0123';
});

import { loadConfig } from '../config';

const BASE = { DATABASE_URL: 'postgresql://u:p@db:5432/x', SESSION_SECRET: '0123456789abcdef0123' };

describe('змінні середовища', () => {
  it('порожнє значення в .env — як не задане (ADMIN_PASSWORD= не валить старт)', () => {
    const c = loadConfig({ ...BASE, ADMIN_LOGIN: 'admin', ADMIN_PASSWORD: '', NODE_ENV: 'production' });
    expect(c.ADMIN_PASSWORD).toBeUndefined();
    expect(c.isProduction).toBe(true);
    expect(c.cookieSecure).toBe(true);
  });

  it('без бази чи ключа — зрозуміла помилка зі списком змінних', () => {
    expect(() => loadConfig({ SESSION_SECRET: '' })).toThrow(/DATABASE_URL.*\n.*SESSION_SECRET|SESSION_SECRET.*\n.*DATABASE_URL/su);
    expect(() => loadConfig({ ...BASE, ADMIN_PASSWORD: 'short' })).toThrow(/ADMIN_PASSWORD/u);
  });
});
