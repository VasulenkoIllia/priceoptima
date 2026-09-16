-- Довідники: коротка позначка юрособи, примітки контрагентів і контактів,
-- контакт клієнта без обов'язкової юрособи, політика курсу «НБУ ± %».

-- AlterEnum
ALTER TYPE "RatePolicy" ADD VALUE 'nbu_adjusted';

-- DropForeignKey
ALTER TABLE "ClientContact" DROP CONSTRAINT "ClientContact_counterpartyId_fkey";

-- AlterTable
ALTER TABLE "ClientContact" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "note" TEXT,
ALTER COLUMN "counterpartyId" DROP NOT NULL;

-- Наявні контакти лишаються в того самого клієнта, що й їхня юрособа.
UPDATE "ClientContact" AS ct
SET "clientId" = cp."clientId"
FROM "Counterparty" AS cp
WHERE cp."id" = ct."counterpartyId";

DELETE FROM "ClientContact" WHERE "clientId" IS NULL;

ALTER TABLE "ClientContact" ALTER COLUMN "clientId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Counterparty" ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "OwnCompany" ADD COLUMN     "code" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "ClientContact_clientId_idx" ON "ClientContact"("clientId");

-- AddForeignKey
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id") ON DELETE SET NULL ON UPDATE CASCADE;
