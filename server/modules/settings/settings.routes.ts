// /api/settings — налаштування системи. Читають усі, змінює адміністратор.
import { Router } from 'express';
import { asyncHandler } from '../../http/asyncHandler';
import { parseBody } from '../../http/validate';
import { requireAdmin, requireAuth } from '../auth/middleware';
import { settingsPatchSchema } from './settings.schemas';
import { getSettings, updateSettings } from './settings.service';

export const settingsRouter = Router();

settingsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json(await getSettings());
  }),
);

settingsRouter.put(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await updateSettings(parseBody(settingsPatchSchema, req)));
  }),
);
