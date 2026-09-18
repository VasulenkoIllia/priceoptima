-- Модуль заявок на сервері: заявка, рядки, блоки постачальників, пропозиції (знімки товарів), версії КП,
-- історія, файли, блокування редагування. Лише нові таблиці — наявні дані не змінюються.

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('in_progress', 'done', 'cancelled');

-- CreateTable
CREATE TABLE "Request" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "requestDate" DATE NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'in_progress',
    "title" TEXT,
    "clientId" TEXT,
    "counterpartyId" TEXT,
    "contactId" TEXT,
    "ownCompanyId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "notes" TEXT,
    "purchaseNote" TEXT,
    "rateUsd" DOUBLE PRECISION,
    "rateEur" DOUBLE PRECISION,
    "ratesDate" DATE,
    "vatRatePct" DOUBLE PRECISION NOT NULL,
    "kpSettings" JSONB NOT NULL,
    "approvalKpId" TEXT,
    "cancelReason" TEXT,
    "markup" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "linesCount" INTEGER NOT NULL DEFAULT 0,
    "suppliersCount" INTEGER NOT NULL DEFAULT 0,
    "totalPurchaseGross" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalSaleNet" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalSaleGross" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "profitNet" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "approvedSaleGross" DOUBLE PRECISION,
    "kpCount" INTEGER NOT NULL DEFAULT 0,
    "lastKpNumber" INTEGER,
    "lastKpFinal" BOOLEAN,
    "filesCount" INTEGER NOT NULL DEFAULT 0,
    "sourceRequestId" TEXT,
    "copyInfo" JSONB,
    "searchText" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestLine" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientUnit" TEXT,
    "qty" DOUBLE PRECISION NOT NULL,
    "clientNote" TEXT,
    "selectionBlockId" TEXT,
    "markup" JSONB NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approvedQty" DOUBLE PRECISION,
    "kpName" TEXT,

    CONSTRAINT "RequestLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestBlock" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "supplierId" TEXT,
    "legalEntityId" TEXT,
    "defaultCurrency" "Currency" NOT NULL,
    "rateUsd" DOUBLE PRECISION,
    "rateEur" DOUBLE PRECISION,
    "rateSource" "RatePolicy" NOT NULL,
    "ratesDate" DATE,
    "supplierMarkupPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pricesIncludeVat" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,

    CONSTRAINT "RequestBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestOffer" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "productId" TEXT,
    "sku" TEXT,
    "nameWork" TEXT,
    "name1c" TEXT,
    "nameKind" TEXT NOT NULL DEFAULT 'work',
    "unitCode" TEXT,
    "currency" "Currency" NOT NULL,
    "purchasePriceCur" DOUBLE PRECISION,
    "rrpCur" DOUBLE PRECISION,
    "qty" DOUBLE PRECISION,
    "multiplicity" DOUBLE PRECISION,
    "noRounding" BOOLEAN NOT NULL DEFAULT false,
    "stockQty" DOUBLE PRECISION,
    "availability" "Availability" NOT NULL,
    "priceDate" TIMESTAMP(3),
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "excludeReason" TEXT,
    "note" TEXT,
    "priceChange" JSONB,

    CONSTRAINT "RequestOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpDocument" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "kpNumber" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "vatMode" TEXT NOT NULL,
    "ownCompanyId" TEXT NOT NULL,
    "onlyApproved" BOOLEAN NOT NULL,
    "settings" JSONB NOT NULL,
    "totalNet" DOUBLE PRECISION NOT NULL,
    "totalVat" DOUBLE PRECISION NOT NULL,
    "totalGross" DOUBLE PRECISION NOT NULL,
    "snapshot" JSONB NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "KpDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestEvent" (
    "id" SERIAL NOT NULL,
    "requestId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "group" TEXT,
    "counts" JSONB,

    CONSTRAINT "RequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestAttachment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'client_request',
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "note" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestLock" (
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestLock_pkey" PRIMARY KEY ("requestId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Request_number_key" ON "Request"("number");

-- CreateIndex
CREATE INDEX "Request_status_number_idx" ON "Request"("status", "number");

-- CreateIndex
CREATE INDEX "Request_managerId_idx" ON "Request"("managerId");

-- CreateIndex
CREATE INDEX "Request_clientId_idx" ON "Request"("clientId");

-- CreateIndex
CREATE INDEX "Request_requestDate_idx" ON "Request"("requestDate");

-- CreateIndex
CREATE INDEX "Request_searchText_trgm_idx" ON "Request" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "RequestLine_requestId_idx" ON "RequestLine"("requestId");

-- CreateIndex
CREATE INDEX "RequestBlock_requestId_idx" ON "RequestBlock"("requestId");

-- CreateIndex
CREATE INDEX "RequestOffer_requestId_idx" ON "RequestOffer"("requestId");

-- CreateIndex
CREATE INDEX "RequestOffer_productId_idx" ON "RequestOffer"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "KpDocument_requestId_version_key" ON "KpDocument"("requestId", "version");

-- CreateIndex
CREATE INDEX "RequestEvent_requestId_id_idx" ON "RequestEvent"("requestId", "id");

-- CreateIndex
CREATE INDEX "RequestAttachment_requestId_idx" ON "RequestAttachment"("requestId");

-- CreateIndex
CREATE INDEX "RequestLock_userId_idx" ON "RequestLock"("userId");


-- AddForeignKey
ALTER TABLE "RequestLine" ADD CONSTRAINT "RequestLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestBlock" ADD CONSTRAINT "RequestBlock_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestOffer" ADD CONSTRAINT "RequestOffer_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpDocument" ADD CONSTRAINT "KpDocument_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestAttachment" ADD CONSTRAINT "RequestAttachment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestLock" ADD CONSTRAINT "RequestLock_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
