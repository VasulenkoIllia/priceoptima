-- Пошук по каталогу: назва «як у клієнта», нормалізований текст пошуку та індекси під нього.
-- searchText заповнює сервер (buildSearchText) при кожному записі товару.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "name1c" TEXT,
ADD COLUMN     "searchText" TEXT NOT NULL DEFAULT '';

-- Триграми для LIKE '%…%' по назві (20–50 тис. позицій без цього читаються повністю).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "Product_skuKey_idx" ON "Product"("skuKey");

-- CreateIndex
CREATE INDEX "Product_skuKey_prefix_idx" ON "Product"("skuKey" text_pattern_ops);

-- CreateIndex
CREATE INDEX "Product_searchText_idx" ON "Product" USING GIN ("searchText" gin_trgm_ops);
