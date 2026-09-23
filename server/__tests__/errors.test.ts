// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiError, statusOf, toApiError } from '../http/errors';

describe('помилки API', () => {
  it('коди відображаються в статуси, які вміє фронт', () => {
    expect(statusOf('UNAUTHORIZED')).toBe(401);
    expect(statusOf('FORBIDDEN')).toBe(403);
    expect(statusOf('NOT_FOUND')).toBe(404);
    expect(statusOf('VALIDATION_ERROR')).toBe(400);
    expect(statusOf('DUPLICATE')).toBe(409);
    expect(statusOf('READ_ONLY')).toBe(403);
    expect(statusOf('INVALID_STATE')).toBe(409);
    expect(statusOf('NOT_IMPLEMENTED')).toBe(501);
    expect(statusOf('INTERNAL')).toBe(500);
  });

  it('ApiError віддається як є', () => {
    const mapped = toApiError(new ApiError('DUPLICATE', 'Логін «koval» уже зайнятий'));
    expect(mapped).toEqual({
      status: 409,
      body: { error: { code: 'DUPLICATE', message: 'Логін «koval» уже зайнятий' } },
      internal: false,
    });
  });

  it('помилка zod — це VALIDATION_ERROR з переліком полів', () => {
    const schema = z.object({ login: z.string().min(1, 'Вкажіть логін') });
    const result = schema.safeParse({ login: '' });
    const mapped = toApiError(result.success ? null : result.error);
    expect(mapped.status).toBe(400);
    expect(mapped.body.error.code).toBe('VALIDATION_ERROR');
    expect(mapped.body.error.details).toEqual([{ path: 'login', message: 'Вкажіть логін' }]);
    expect(mapped.internal).toBe(false);
  });

  it('унікальність у базі — DUPLICATE, відсутній запис — NOT_FOUND', () => {
    expect(toApiError(Object.assign(new Error('unique'), { code: 'P2002' })).body.error.code).toBe('DUPLICATE');
    expect(toApiError(Object.assign(new Error('missing'), { code: 'P2025' })).body.error.code).toBe('NOT_FOUND');
    expect(toApiError(Object.assign(new Error('fk'), { code: 'P2003' })).body.error.code).toBe('REFERENCED');
  });

  it('некоректний JSON у тілі запиту — VALIDATION_ERROR', () => {
    const mapped = toApiError(Object.assign(new SyntaxError('Unexpected token'), { status: 400 }));
    expect(mapped.status).toBe(400);
    expect(mapped.body.error.message).toBe('Некоректний JSON у запиті');
  });

  it('невідома помилка — INTERNAL без подробиць назовні', () => {
    const mapped = toApiError(new Error('connect ECONNREFUSED 10.0.0.1:5432'));
    expect(mapped.status).toBe(500);
    expect(mapped.body.error.code).toBe('INTERNAL');
    expect(mapped.body.error.message).not.toContain('ECONNREFUSED');
    expect(mapped.internal).toBe(true);
  });
});

describe('завелике тіло запиту', () => {
  it('body-parser entity.too.large → 413 з поясненням, не 500', () => {
    const mapped = toApiError(Object.assign(new Error('request entity too large'), { type: 'entity.too.large', status: 413 }));
    expect(mapped.status).toBe(413);
    expect(mapped.internal).toBe(false);
    expect(mapped.body.error.message).toMatch(/Завеликий/u);
  });
});
