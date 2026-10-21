// /api/reference-sheets — «Довідник» (правки замовника 21.10, п.11): спільні аркуші. Читають і правлять усі, хто увійшов.
import { Router } from 'express';
import { asyncHandler } from '../../http/asyncHandler';
import { parseBody, parseParams } from '../../http/validate';
import { currentUser, requireAuth } from '../auth/middleware';
import { referenceSheetIdSchema, referenceSheetInputSchema } from './reference.schemas';
import { createReferenceSheet, deleteReferenceSheet, getReferenceSheet, listReferenceSheets, updateReferenceSheet } from './reference.service';

export const referenceRouter = Router();

referenceRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json(await listReferenceSheets());
  }),
);

referenceRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(referenceSheetIdSchema, req);
    res.json(await getReferenceSheet(id));
  }),
);

referenceRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.status(201).json(await createReferenceSheet(parseBody(referenceSheetInputSchema, req), currentUser(req)));
  }),
);

referenceRouter.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(referenceSheetIdSchema, req);
    res.json(await updateReferenceSheet(id, parseBody(referenceSheetInputSchema, req), currentUser(req)));
  }),
);

referenceRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(referenceSheetIdSchema, req);
    await deleteReferenceSheet(id, currentUser(req));
    res.status(204).end();
  }),
);
