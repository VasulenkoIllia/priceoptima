// Збірка маршрутів API. Усе під /api; невідомий шлях тут — помилка, а не сторінка застосунку.
import { Router } from 'express';
import { apiNotFound } from './http/errorHandler';
import { attachSession, passwordChangeGate } from './modules/auth/middleware';
import { auditRouter } from './modules/audit/audit.routes';
import { authRouter } from './modules/auth/auth.routes';
import { clientsRouter } from './modules/clients/clients.routes';
import { imagesRouter } from './modules/images/images.routes';
import { ownCompaniesRouter } from './modules/own-companies/ownCompanies.routes';
import { priceUpdatesRouter } from './modules/price-updates/priceUpdates.routes';
import { productsRouter } from './modules/products/products.routes';
import { ratesRouter } from './modules/rates/rates.routes';
import { requestsRouter } from './modules/requests/requests.routes';
import { settingsRouter } from './modules/settings/settings.routes';
import { suppliersRouter } from './modules/suppliers/suppliers.routes';
import { unitsRouter } from './modules/units/units.routes';
import { usersRouter } from './modules/users/users.routes';

export const apiRouter = Router();

apiRouter.use(attachSession);
apiRouter.use(passwordChangeGate);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/audit', auditRouter);
apiRouter.use('/settings', settingsRouter);
apiRouter.use('/own-companies', ownCompaniesRouter);
apiRouter.use('/suppliers', suppliersRouter);
apiRouter.use('/clients', clientsRouter);
apiRouter.use('/units', unitsRouter);
apiRouter.use('/rates', ratesRouter);
apiRouter.use('/products', productsRouter);
apiRouter.use('/price-updates', priceUpdatesRouter);
apiRouter.use('/images', imagesRouter);
apiRouter.use('/requests', requestsRouter);
apiRouter.use(apiNotFound);
