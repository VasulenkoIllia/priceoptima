// /api/products — каталог. Читає й веде його будь-який користувач, що увійшов:
// прав тут не розділяємо, ціни з прайсів захищені окремим правилом (products.rules).
import { Router } from 'express';
import { asyncHandler } from '../../http/asyncHandler';
import { parseBody, parseParams, parseQuery } from '../../http/validate';
import { currentUser, requireAuth } from '../auth/middleware';
import { productImagesRouter } from '../images/images.routes';
import {
  name1cImportSchema,
  productIdSchema,
  productInputSchema,
  productListQuerySchema,
  productPatchSchema,
  productPriceUpdateSchema,
  productSearchQuerySchema,
  skuLookupSchema,
} from './products.schemas';
import {
  createProduct,
  getPriceHistory,
  getProduct,
  importName1c,
  listProductsPage,
  lookupSkus,
  searchProducts,
  updateProduct,
  updateProductPrice,
} from './products.service';

export const productsRouter = Router();

productsRouter.use(requireAuth);

// пошук і звірку артикулів оголошуємо раніше за /:id — інакше вони потраплять у нього як ідентифікатор
productsRouter.get(
  '/search',
  asyncHandler(async (req, res) => {
    res.json(await searchProducts(parseQuery(productSearchQuerySchema, req)));
  }),
);

productsRouter.get(
  '/page',
  asyncHandler(async (req, res) => {
    res.json(await listProductsPage(parseQuery(productListQuerySchema, req)));
  }),
);

productsRouter.post(
  '/lookup',
  asyncHandler(async (req, res) => {
    res.json(await lookupSkus(parseBody(skuLookupSchema, req)));
  }),
);

// назви 1С з Excel: «артикул → назва 1С» (частинами; dryRun — лише порахувати)
productsRouter.post(
  '/name1c',
  asyncHandler(async (req, res) => {
    res.json(await importName1c(parseBody(name1cImportSchema, req), currentUser(req)));
  }),
);

productsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    res.status(201).json(await createProduct(parseBody(productInputSchema, req), currentUser(req)));
  }),
);

productsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseParams(productIdSchema, req);
    res.json(await getProduct(id));
  }),
);

productsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseParams(productIdSchema, req);
    res.json(await updateProduct(id, parseBody(productPatchSchema, req), currentUser(req)));
  }),
);

productsRouter.post(
  '/:id/price',
  asyncHandler(async (req, res) => {
    const { id } = parseParams(productIdSchema, req);
    res.json(await updateProductPrice(id, parseBody(productPriceUpdateSchema, req), currentUser(req)));
  }),
);

productsRouter.get(
  '/:id/price-history',
  asyncHandler(async (req, res) => {
    const { id } = parseParams(productIdSchema, req);
    res.json(await getPriceHistory(id));
  }),
);

productsRouter.use('/:id/images', productImagesRouter);
