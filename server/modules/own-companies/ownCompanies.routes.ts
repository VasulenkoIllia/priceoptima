// /api/own-companies — довідник власних юросіб. Читають і редагують усі, хто увійшов.
import { Router } from 'express';
import { asyncHandler } from '../../http/asyncHandler';
import { parseBody, parseParams } from '../../http/validate';
import { requireAuth } from '../auth/middleware';
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
  requireAuth,
  asyncHandler(async (req, res) => {
    res.status(201).json(await createOwnCompany(parseBody(ownCompanyInputSchema, req)));
  }),
);

ownCompaniesRouter.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(ownCompanyIdSchema, req);
    res.json(await updateOwnCompany(id, parseBody(ownCompanyInputSchema, req)));
  }),
);
