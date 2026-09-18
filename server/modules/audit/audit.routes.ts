// /api/audit — журнал дій (лише адміністратор).
import { Router } from 'express';
import { asyncHandler } from '../../http/asyncHandler';
import { parseQuery } from '../../http/validate';
import { requireAdmin } from '../auth/middleware';
import { auditQuerySchema } from './audit.schemas';
import { listAudit } from './audit.service';

export const auditRouter = Router();

auditRouter.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await listAudit(parseQuery(auditQuerySchema, req)));
  }),
);
