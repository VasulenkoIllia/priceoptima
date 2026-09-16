// /api/suppliers — довідник постачальників. Читають і редагують усі, хто увійшов.
import { Router } from 'express';
import { asyncHandler } from '../../http/asyncHandler';
import { parseBody, parseParams } from '../../http/validate';
import { requireAuth } from '../auth/middleware';
import { priceSourceSchema, supplierIdSchema, supplierInputSchema } from './suppliers.schemas';
import { createSupplier, getPriceSource, getSupplier, listSuppliers, updatePriceSource, updateSupplier } from './suppliers.service';

export const suppliersRouter = Router();

suppliersRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json(await listSuppliers());
  }),
);

suppliersRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(supplierIdSchema, req);
    res.json(await getSupplier(id));
  }),
);

suppliersRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.status(201).json(await createSupplier(parseBody(supplierInputSchema, req)));
  }),
);

suppliersRouter.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(supplierIdSchema, req);
    res.json(await updateSupplier(id, parseBody(supplierInputSchema, req)));
  }),
);

suppliersRouter.get(
  '/:id/price-source',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(supplierIdSchema, req);
    res.json(await getPriceSource(id));
  }),
);

suppliersRouter.put(
  '/:id/price-source',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(supplierIdSchema, req);
    res.json(await updatePriceSource(id, parseBody(priceSourceSchema, req)));
  }),
);
