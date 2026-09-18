// /api/own-companies — довідник власних юросіб. Читають усі, хто увійшов; змінює адміністратор (ТЗ §2).
import { Router } from 'express';
import { asyncHandler } from '../../http/asyncHandler';
import { parseBody, parseParams } from '../../http/validate';
import { currentUser, requireAdmin, requireAuth } from '../auth/middleware';
import { ownCompanyIdSchema, ownCompanyInputSchema } from './ownCompanies.schemas';
import { createOwnCompany, listOwnCompanies, updateOwnCompany } from './ownCompanies.service';

export const ownCompaniesRouter = Router();

ownCompaniesRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json(await listOwnCompanies());
  }),
);

ownCompaniesRouter.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.status(201).json(await createOwnCompany(parseBody(ownCompanyInputSchema, req), currentUser(req)));
  }),
);

ownCompaniesRouter.put(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(ownCompanyIdSchema, req);
    res.json(await updateOwnCompany(id, parseBody(ownCompanyInputSchema, req), currentUser(req)));
  }),
);
