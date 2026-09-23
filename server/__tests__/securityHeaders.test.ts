import { describe, expect, it } from 'vitest';
import { CONTENT_SECURITY_POLICY, securityHeaders } from '../http/securityHeaders';

function headersOf(hsts: boolean): Record<string, string> {
  const set: Record<string, string> = {};
  const res = { setHeader: (k: string, v: string) => (set[k] = v) } as never;
  securityHeaders({ hsts })({} as never, res, () => undefined);
  return set;
}

describe('заголовки безпеки', () => {
  it('скрипти лише з нашого сервера, без вбудовування в чужі сайти', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/script-src[^;]*unsafe/u);
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    const h = headersOf(false);
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
  });

  it('HSTS лише коли сайт працює через HTTPS', () => {
    expect(headersOf(false)['Strict-Transport-Security']).toBeUndefined();
    expect(headersOf(true)['Strict-Transport-Security']).toMatch(/max-age=/u);
  });
});
