-- CreateIndex
CREATE INDEX "Product_skuKey_trgm_idx" ON "Product" USING GIN ("skuKey" gin_trgm_ops);
