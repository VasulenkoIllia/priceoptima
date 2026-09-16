// /api/units — довідник одиниць виміру. Читають усі, змінює адміністратор:
// від синонімів залежить розпізнавання одиниць у прайсах і заявках клієнтів.
import { Router } from 'express';
import { asyncHandler } from '../../http/asyncHandler';
import { parseBody, parseParams } from '../../http/validate';
import { requireAdmin, requireAuth } from '../auth/middleware';
import { unitCodeSchema, unitPatchSchema } from './units.schemas';
import { listUnits, updateUnit } from './units.service';

export const unitsRouter = Router();

unitsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json(await listUnits());
  }),
);

unitsRouter.put(
  '/:code',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { code } = parseParams(unitCodeSchema, req);
    res.json(await updateUnit(code, parseBody(unitPatchSchema, req)));
  }),
);
