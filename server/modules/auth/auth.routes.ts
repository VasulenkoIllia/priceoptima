// /api/auth — вхід, поточний користувач, вихід, мій профіль, пароль і налаштування інтерфейсу, разові посилання (запрошення, скидання пароля).
import { Router } from 'express';
import type { Request } from 'express';
import type { User } from '@prisma/client';
import type { MeResponse } from '@shared/types';
import { ApiError } from '../../http/errors';
import { asyncHandler } from '../../http/asyncHandler';
import { parseBody, parseParams } from '../../http/validate';
import { logger } from '../../logger';
import { getSettings } from '../settings/settings.service';
import { getLinkInfo, registerByInvite, resetPasswordByLink } from '../access/access.service';
import { linkTokenSchema, registerSchema, resetSchema } from '../access/access.schemas';
import { audit } from '../audit/audit.service';
import { toUserDto } from '../users/users.mapper';
import { passwordChangeSchema, profileSchema, uiPrefsSchema } from '../users/users.schemas';
import { changePassword, getUiPrefs, saveUiPrefs, updateProfile } from '../users/users.service';
import { authenticate, endSession, startSession } from './auth.service';
import { loginSchema } from './auth.schemas';
import { clearSessionCookie, currentUser, requireAuth, sessionTokenOf, setSessionCookie } from './middleware';
import { LoginRateLimiter, rateLimitKey } from './rateLimit';
import { sessionIdOf } from './sessions';

/** Не більше 10 невдалих спроб на пару «адреса + логін» за 15 хвилин. */
export const loginLimiter = new LoginRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });
/** Підбір посилань: не більше 20 невдалих спроб з адреси за 15 хвилин. */
export const linkLimiter = new LoginRateLimiter({ limit: 20, windowMs: 15 * 60 * 1000 });

/** Спроба з разовим посиланням: невідомий токен рахується як невдала (захист від перебору). */
async function withLinkLimit<T>(req: Request, fn: () => Promise<T>): Promise<T> {
  const key = `link:${req.ip ?? ''}`;
  if (linkLimiter.isBlocked(key)) throw new ApiError('UNAUTHORIZED', 'Забагато спроб. Спробуйте пізніше');
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError && e.code === 'NOT_FOUND') linkLimiter.registerFailure(key);
    throw e;
  }
}

async function meResponse(user: User): Promise<MeResponse> {
  const [settings, uiPrefs] = await Promise.all([getSettings(), getUiPrefs(user.id)]);
  return {
    user: toUserDto(user),
    settings,
    serverTime: new Date().toISOString(),
    uiPrefs,
  };
}

function metaOf(req: Request) {
  return { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null };
}

export const authRouter = Router();

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = parseBody(loginSchema, req);
    const key = rateLimitKey(req.ip, body.login);
    if (loginLimiter.isBlocked(key)) {
      const seconds = loginLimiter.retryAfterSeconds(key);
      res.set('Retry-After', String(seconds));
      throw new ApiError('UNAUTHORIZED', `Забагато спроб входу. Спробуйте ще раз через ${Math.ceil(seconds / 60)} хв`);
    }
    let found: User;
    try {
      found = await authenticate(body.login, body.password);
    } catch (e) {
      loginLimiter.registerFailure(key);
      logger.warn({ login: body.login, ip: req.ip }, 'Невдала спроба входу');
      throw e;
    }
    loginLimiter.reset(key);
    const { token, user } = await startSession(found, metaOf(req));
    setSessionCookie(res, token);
    logger.info({ userId: user.id, login: user.login }, 'Вхід у систему');
    await audit({ userId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id, summary: 'Вхід у систему' });
    res.json(await meResponse(user));
  }),
);

// ── мій профіль і пароль ─────────────────────────────────────────────
authRouter.put(
  '/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await updateProfile(currentUser(req), parseBody(profileSchema, req)));
  }),
);

// налаштування інтерфейсу (ширина колонок тощо) — однакові на всіх комп'ютерах користувача
authRouter.put(
  '/ui-prefs',
  requireAuth,
  asyncHandler(async (req, res) => {
    await saveUiPrefs(currentUser(req), parseBody(uiPrefsSchema, req));
    res.status(204).end();
  }),
);

authRouter.post(
  '/password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parseBody(passwordChangeSchema, req);
    const token = sessionTokenOf(req);
    res.json(await changePassword(currentUser(req), body.currentPassword, body.newPassword, token ? sessionIdOf(token) : null));
  }),
);

// ── разові посилання (без входу) ─────────────────────────────────────
authRouter.get(
  '/links/:token',
  asyncHandler(async (req, res) => {
    const { token } = parseParams(linkTokenSchema, req);
    res.json(await withLinkLimit(req, () => getLinkInfo(token)));
  }),
);

authRouter.post(
  '/links/:token/register',
  asyncHandler(async (req, res) => {
    const { token } = parseParams(linkTokenSchema, req);
    const body = parseBody(registerSchema, req);
    const created = await withLinkLimit(req, () => registerByInvite(token, body));
    const session = await startSession(created, metaOf(req));
    setSessionCookie(res, session.token);
    res.status(201).json(await meResponse(session.user));
  }),
);

authRouter.post(
  '/links/:token/reset',
  asyncHandler(async (req, res) => {
    const { token } = parseParams(linkTokenSchema, req);
    const body = parseBody(resetSchema, req);
    const updated = await withLinkLimit(req, () => resetPasswordByLink(token, body.password));
    const session = await startSession(updated, metaOf(req));
    setSessionCookie(res, session.token);
    res.json(await meResponse(session.user));
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await meResponse(currentUser(req)));
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = sessionTokenOf(req);
    if (token) await endSession(token);
    clearSessionCookie(res);
    res.status(204).end();
  }),
);
