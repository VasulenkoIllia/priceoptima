// Заголовки безпеки для всіх відповідей (без helmet: їх небагато й вони прості).
// CSP: скрипти лише з нашого сервера — навіть якщо в дані потрапить «javascript:…» чи <script>, браузер їх не виконає.
// Стилі inline потрібні antd і AG Grid; картинки — ще й data:/blob: (логотипи, фото в PDF) та https: (фото з прайсів).
import type { RequestHandler } from 'express';

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function securityHeaders(options: { hsts: boolean }): RequestHandler {
  return (_req, res, next) => {
    res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    // HSTS має сенс лише там, де сайт відкривають через HTTPS (на сервері за Traefik)
    if (options.hsts) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    next();
  };
}
