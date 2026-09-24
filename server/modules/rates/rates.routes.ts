// /api/rates — курси валют: історія, ручний курс і діючі курси на дату.
// Автоматично курси НБУ приносить щоденне завдання (server/jobs).
import { Router } from 'express';
import { asyncHandler } from '../../http/asyncHandler';
import { parseBody, parseQuery } from '../../http/validate';
import { currentUser, requireAuth } from '../auth/middleware';
import { cancelManualRateSchema, effectiveRatesQuerySchema, manualRateSchema, ratesQuerySchema } from './rates.schemas';
import { addManualRate, cancelManualRates, getEffectiveRates, listRates } from './rates.service';

export const ratesRouter = Router();

ratesRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await listRates(parseQuery(ratesQuerySchema, req)));
  }),
);

ratesRouter.get(
  '/effective',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { date } = parseQuery(effectiveRatesQuerySchema, req);
    res.json(await getEffectiveRates(date));
  }),
);

ratesRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.status(201).json(await addManualRate(parseBody(manualRateSchema, req), currentUser(req)));
  }),
);

ratesRouter.post(
  '/manual/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await cancelManualRates(parseBody(cancelManualRateSchema, req), currentUser(req)));
  }),
);
