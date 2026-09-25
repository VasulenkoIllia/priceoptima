// /api/suppliers — довідник постачальників. Читають і редагують усі, хто увійшов.
import { Router } from 'express';
import { asyncHandler } from '../../http/asyncHandler';
import { parseBody, parseParams } from '../../http/validate';
import { currentUser, requireAdmin, requireAuth } from '../auth/middleware';
import { priceMappingSchema, priceSourceSchema, supplierIdSchema, supplierInputSchema, supplierOrderSchema } from './suppliers.schemas';
import {
  createSupplier,
  getPriceMapping,
  getPriceSource,
  getSupplier,
  listSuppliers,
  reorderSuppliers,
  savePriceMapping,
  updatePriceSource,
  updateSupplier,
} from './suppliers.service';

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
    res.status(201).json(await createSupplier(parseBody(supplierInputSchema, req), currentUser(req)));
  }),
);

// порядок постачальників — до '/:id', інакше «order» сприйметься як id
suppliersRouter.put(
  '/order',
  requireAuth,
  asyncHandler(async (req, res) => {
    await reorderSuppliers(parseBody(supplierOrderSchema, req).ids, currentUser(req));
    res.status(204).end();
  }),
);

suppliersRouter.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(supplierIdSchema, req);
    res.json(await updateSupplier(id, parseBody(supplierInputSchema, req), currentUser(req)));
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

// посилання й токени вигрузок — доступи до чужих систем: змінює лише адміністратор (рішення 18.09)
suppliersRouter.put(
  '/:id/price-source',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(supplierIdSchema, req);
    res.json(await updatePriceSource(id, parseBody(priceSourceSchema, req), currentUser(req)));
  }),
);

suppliersRouter.get(
  '/:id/price-mapping',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(supplierIdSchema, req);
    res.json(await getPriceMapping(id));
  }),
);

suppliersRouter.put(
  '/:id/price-mapping',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(supplierIdSchema, req);
    res.json(await savePriceMapping(id, parseBody(priceMappingSchema, req)));
  }),
);
