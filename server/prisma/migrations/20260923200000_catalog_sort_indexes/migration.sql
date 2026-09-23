-- Сортування всієї номенклатури (1 млн+) за артикулом, назвою й ціною входу — з індексу, а не сортуванням усього каталогу.
-- Індекс за брендом не використовував жоден запит, але оновлювався кожним імпортом прайсу — прибираємо.
-- Відкат: DROP трьох індексів і CREATE INDEX "Product_brand_idx" ON "Product"("brand").

-- DropIndex
DROP INDEX "Product_brand_idx";

-- CreateIndex
CREATE INDEX "Product_sku_id_idx" ON "Product"("sku", "id");

-- CreateIndex
CREATE INDEX "Product_nameWork_id_idx" ON "Product"("nameWork", "id");

-- CreateIndex
CREATE INDEX "Product_purchasePrice_idx" ON "Product"("purchasePrice");

