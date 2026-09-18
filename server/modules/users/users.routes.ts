// /api/users — довідник користувачів (читають усі); дані, роль, доступ і посилання — лише адміністратор.
import { Router } from 'express';
import { asyncHandler } from '../../http/asyncHandler';
import { parseBody, parseParams } from '../../http/validate';
import { createInvite, createResetLink, listAccessLinks, revokeAccessLink } from '../access/access.service';
import { inviteCreateSchema, linkIdSchema } from '../access/access.schemas';
import { currentUser, requireAdmin, requireAuth } from '../auth/middleware';
import { blockUser, listUsers, setUserRole, unblockUser, updateUser } from './users.service';
import { roleSchema, userIdSchema, userUpdateSchema } from './users.schemas';

export const usersRouter = Router();

usersRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json(await listUsers());
  }),
);

// запрошення й посилання для зміни пароля (оголошуємо раніше за /:id)
usersRouter.get(
  '/links',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json(await listAccessLinks());
  }),
);

usersRouter.post(
  '/invites',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.status(201).json(await createInvite(currentUser(req), parseBody(inviteCreateSchema, req)));
  }),
);

usersRouter.delete(
  '/links/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await revokeAccessLink(currentUser(req), parseParams(linkIdSchema, req).id);
    res.status(204).end();
  }),
);

usersRouter.put(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await updateUser(currentUser(req), parseParams(userIdSchema, req).id, parseBody(userUpdateSchema, req)));
  }),
);

usersRouter.put(
  '/:id/role',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await setUserRole(currentUser(req), parseParams(userIdSchema, req).id, parseBody(roleSchema, req).role));
  }),
);

usersRouter.post(
  '/:id/block',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await blockUser(currentUser(req), parseParams(userIdSchema, req).id));
  }),
);

usersRouter.post(
  '/:id/unblock',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await unblockUser(currentUser(req), parseParams(userIdSchema, req).id));
  }),
);

usersRouter.post(
  '/:id/reset-link',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.status(201).json(await createResetLink(currentUser(req), parseParams(userIdSchema, req).id));
  }),
);
