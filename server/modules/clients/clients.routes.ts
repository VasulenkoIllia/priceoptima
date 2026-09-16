// /api/clients — довідник клієнтів із контрагентами й контактами. Читають і редагують усі, хто увійшов.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/asyncHandler';
import { parseBody, parseParams, parseQuery } from '../../http/validate';
import { requireAuth } from '../auth/middleware';
import { clientIdSchema, clientInputSchema, clientSearchSchema } from './clients.schemas';
import { createClient, getClient, listClients, searchClients, updateClient } from './clients.service';

const listQuerySchema = z.object({ search: z.string().trim().max(200, 'Задовгий запит').optional().default('') });

export const clientsRouter = Router();

clientsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { search } = parseQuery(listQuerySchema, req);
    res.json(await listClients(search));
  }),
);

// окремим маршрутом до '/:id', інакше 'search' сприймається як ідентифікатор
clientsRouter.get(
  '/search',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { q } = parseQuery(clientSearchSchema, req);
    res.json(await searchClients(q));
  }),
);

clientsRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(clientIdSchema, req);
    res.json(await getClient(id));
  }),
);

clientsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.status(201).json(await createClient(parseBody(clientInputSchema, req)));
  }),
);

clientsRouter.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(clientIdSchema, req);
    res.json(await updateClient(id, parseBody(clientInputSchema, req)));
  }),
);
