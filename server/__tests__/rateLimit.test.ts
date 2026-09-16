// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LoginRateLimiter, rateLimitKey } from '../modules/auth/rateLimit';

const WINDOW = 15 * 60 * 1000;

function limiter(now: () => number) {
  return new LoginRateLimiter({ limit: 10, windowMs: WINDOW, now });
}

describe('обмеження спроб входу', () => {
  it('блокує після десятої невдалої спроби', () => {
    const rl = limiter(() => 0);
    const key = rateLimitKey('10.0.0.1', 'admin');
    for (let i = 0; i < 9; i += 1) rl.registerFailure(key);
    expect(rl.isBlocked(key)).toBe(false);
    rl.registerFailure(key);
    expect(rl.isBlocked(key)).toBe(true);
  });

  it('після вікна лічильник обнуляється', () => {
    let now = 0;
    const rl = limiter(() => now);
    const key = rateLimitKey('10.0.0.1', 'admin');
    for (let i = 0; i < 10; i += 1) rl.registerFailure(key);
    expect(rl.isBlocked(key)).toBe(true);
    now += WINDOW;
    expect(rl.isBlocked(key)).toBe(false);
  });

  it('успішний вхід знімає блокування', () => {
    const rl = limiter(() => 0);
    const key = rateLimitKey('10.0.0.1', 'admin');
    for (let i = 0; i < 10; i += 1) rl.registerFailure(key);
    rl.reset(key);
    expect(rl.isBlocked(key)).toBe(false);
  });

  it('блокування не зачіпає інші логіни й адреси', () => {
    const rl = limiter(() => 0);
    const key = rateLimitKey('10.0.0.1', 'admin');
    for (let i = 0; i < 10; i += 1) rl.registerFailure(key);
    expect(rl.isBlocked(rateLimitKey('10.0.0.1', 'koval'))).toBe(false);
    expect(rl.isBlocked(rateLimitKey('10.0.0.2', 'admin'))).toBe(false);
  });

  it('ключ не залежить від регістру логіна', () => {
    expect(rateLimitKey('10.0.0.1', ' Admin ')).toBe(rateLimitKey('10.0.0.1', 'admin'));
  });

  it('підказує, скільки чекати', () => {
    let now = 0;
    const rl = limiter(() => now);
    const key = rateLimitKey('10.0.0.1', 'admin');
    rl.registerFailure(key);
    expect(rl.retryAfterSeconds(key)).toBe(WINDOW / 1000);
    now += WINDOW / 2;
    expect(rl.retryAfterSeconds(key)).toBe(WINDOW / 2000);
  });
});
