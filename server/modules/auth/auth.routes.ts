// /api/auth — вхід, поточний користувач, вихід.
import { Router } from 'express';
import type { Request } from 'express';
import type { User } from '@prisma/client';
import type { MeResponse } from '@shared/types';
import { ApiError } from '../../http/errors';
import { asyncHandler } from '../../http/asyncHandler';
import { parseBody } from '../../http/validate';
import { logger } from '../../logger';
import { getSettings } from '../settings/settings.service';
import { toUserDto } from '../users/users.mapper';
import { authenticate, endSession, startSession } from './auth.service';
import { loginSchema } from './auth.schemas';
import { clearSessionCookie, currentUser, requireAuth, sessionTokenOf, setSessionCookie } from './middleware';
import { LoginRateLimiter, rateLimitKey } from './rateLimit';

/** Не більше 10 невдалих спроб на пару «адреса + логін» за 15 хвилин. */
export const loginLimiter = new LoginRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });

async function meResponse(user: User): Promise<MeResponse> {
  return {
    user: toUserDto(user),
    settings: await getSettings(),
    serverTime: new Date().toISOString(),
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
    res.json(await meResponse(user));
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
