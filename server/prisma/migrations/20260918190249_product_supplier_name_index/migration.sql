-- DropIndex
DROP INDEX "Product_supplierId_isArchived_idx";

-- CreateIndex
CREATE INDEX "Product_supplierId_isArchived_nameWork_id_idx" ON "Product"("supplierId", "isArchived", "nameWork", "id");
