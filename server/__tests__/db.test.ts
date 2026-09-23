import { describe, expect, it } from 'vitest';
import { withPoolParams } from '../db';

describe('пул з\'єднань', () => {
  it('додає межу пулу, якщо її не задано; задане явно не чіпає', () => {
    const u = new URL(withPoolParams('postgresql://u:p@db:5432/priceoptima?schema=public')!);
    expect(u.searchParams.get('connection_limit')).toBe('15');
    expect(u.searchParams.get('pool_timeout')).toBe('20');
    expect(u.searchParams.get('schema')).toBe('public');
    const own = new URL(withPoolParams('postgresql://u:p@db:5432/x?connection_limit=5')!);
    expect(own.searchParams.get('connection_limit')).toBe('5');
    expect(withPoolParams(undefined)).toBeUndefined();
  });
});
