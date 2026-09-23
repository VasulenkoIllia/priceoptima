-- Випадкове видалення постачальника, клієнта чи заявки не повинно мовчки знести каталог з історією цін,
-- журнал оновлень прайсів, контрагентів або незмінні КП: тепер база таке видалення відхиляє (RESTRICT).
-- Застосунок ці записи не видаляє; міграція лише прибирає ризик. Відкат — повернути ON DELETE CASCADE.

-- DropForeignKey
ALTER TABLE "Counterparty" DROP CONSTRAINT "Counterparty_clientId_fkey";

-- DropForeignKey
ALTER TABLE "ClientContact" DROP CONSTRAINT "ClientContact_clientId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_supplierId_fkey";

-- DropForeignKey
ALTER TABLE "PriceImportRun" DROP CONSTRAINT "PriceImportRun_supplierId_fkey";

-- DropForeignKey
ALTER TABLE "KpDocument" DROP CONSTRAINT "KpDocument_requestId_fkey";

-- AddForeignKey
ALTER TABLE "Counterparty" ADD CONSTRAINT "Counterparty_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceImportRun" ADD CONSTRAINT "PriceImportRun_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpDocument" ADD CONSTRAINT "KpDocument_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

