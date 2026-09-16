// /api/users — довідник користувачів. Створює й редагує адміністратор; свій профіль правит кожен.
import { Router } from 'express';
import { asyncHandler } from '../../http/asyncHandler';
import { parseBody, parseParams } from '../../http/validate';
import { forbidden } from '../../http/errors';
import { currentUser, requireAdmin, requireAuth } from '../auth/middleware';
import { createUser, listUsers, updateOwnProfile, updateUser } from './users.service';
import { selfProfileSchema, userIdSchema, userInputSchema } from './users.schemas';

export const usersRouter = Router();

usersRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json(await listUsers());
  }),
);

usersRouter.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.status(201).json(await createUser(parseBody(userInputSchema, req)));
  }),
);

usersRouter.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(userIdSchema, req);
    const actor = currentUser(req);
    if (actor.role === 'admin') {
      res.json(await updateUser(id, parseBody(userInputSchema, req)));
      return;
    }
    // не адміністратор змінює лише власні контактні дані
    if (actor.id !== id) throw forbidden('Дія доступна лише адміністратору');
    res.json(await updateOwnProfile(id, parseBody(selfProfileSchema, req)));
  }),
);
