// Сесія в запиті: cookie → користувач. Далі маршрути вимагають входу або прав адміністратора.
import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import type { User } from '@prisma/client';
import { config } from '../../config';
import { forbidden, unauthorized } from '../../http/errors';
import { asyncHandler } from '../../http/asyncHandler';
import { resolveSession } from './auth.service';
import { SESSION_COOKIE } from './sessions';

declare module 'express-serve-static-core' {
  interface Request {
    /** Користувач поточної сесії; немає — ніхто не увійшов. */
    currentUser?: User;
  }
}

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    // на сервері працюємо лише через HTTPS (Traefik), локально — звичайний http (див. COOKIE_SECURE)
    secure: config.cookieSecure,
    path: '/',
    signed: true,
  };
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: config.sessionTtlMs });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

/** Токен сесії з підписаної cookie. */
export function sessionTokenOf(req: Request): string | null {
  const value = req.signedCookies?.[SESSION_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Знаходить користувача сесії (не вимагає входу) — ставиться на весь /api. */
export const attachSession: RequestHandler = asyncHandler(async (req, res, next) => {
  const token = sessionTokenOf(req);
  if (!token) return next();
  const found = await resolveSession(token);
  if (!found) {
    clearSessionCookie(res);
    return next();
  }
  req.currentUser = found.user;
  // ковзна сесія: у браузері оновлюємо строк життя cookie
  setSessionCookie(res, token);
  return next();
});

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.currentUser) return next(unauthorized());
  return next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.currentUser) return next(unauthorized());
  if (req.currentUser.role !== 'admin') return next(forbidden('Дія доступна лише адміністратору'));
  return next();
};

/** Користувач поточної сесії; викликається лише після requireAuth. */
export function currentUser(req: Request): User {
  if (!req.currentUser) throw unauthorized();
  return req.currentUser;
}
