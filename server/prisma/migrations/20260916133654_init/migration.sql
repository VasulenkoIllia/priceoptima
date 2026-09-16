-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'user');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('UAH', 'USD', 'EUR');

-- CreateEnum
CREATE TYPE "Availability" AS ENUM ('in_stock', 'low_stock', 'out_of_stock', 'on_order', 'unknown');

-- CreateEnum
CREATE TYPE "PriceOrigin" AS ENUM ('import', 'manual');

-- CreateEnum
CREATE TYPE "RatePolicy" AS ENUM ('price_list', 'manual', 'nbu');

-- CreateEnum
CREATE TYPE "RateSource" AS ENUM ('nbu', 'manual', 'price_list');

-- CreateEnum
CREATE TYPE "PriceFeedKind" AS ENUM ('auto', 'manual');

-- CreateEnum
CREATE TYPE "PriceFeedFormat" AS ENUM ('json', 'yml', 'xml', 'csv', 'xlsx');

-- CreateEnum
CREATE TYPE "FeedAuth" AS ENUM ('none', 'bearer', 'basic', 'query');

-- CreateEnum
CREATE TYPE "ImportRunSource" AS ENUM ('auto', 'file');

-- CreateEnum
CREATE TYPE "ImageSource" AS ENUM ('feed', 'upload');

-- CreateEnum
CREATE TYPE "ImportRunStatus" AS ENUM ('ok', 'error');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "passwordHash" TEXT,
    "fullName" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "email" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ip" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "vatRatePct" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "priceStaleDays" INTEGER NOT NULL DEFAULT 14,
    "lockTtlSeconds" INTEGER NOT NULL DEFAULT 180,
    "lockHeartbeatSeconds" INTEGER NOT NULL DEFAULT 20,
    "autosaveDebounceMs" INTEGER NOT NULL DEFAULT 800,
    "defaultMarkupMethod" TEXT NOT NULL DEFAULT 'rrp',
    "defaultMarkupValue" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "priceRounding" TEXT NOT NULL DEFAULT 'kopecks',
    "discountFormula" TEXT NOT NULL DEFAULT 'percent_off',
    "autoRoundMultiplicity" BOOLEAN NOT NULL DEFAULT true,
    "excludeUnavailableByDefault" BOOLEAN NOT NULL DEFAULT false,
    "kpDefaultVatMode" TEXT NOT NULL DEFAULT 'without_vat',
    "kpNameSource" TEXT NOT NULL DEFAULT 'work',
    "kpShowImages" BOOLEAN NOT NULL DEFAULT false,
    "kpValidityDays" INTEGER NOT NULL DEFAULT 14,
    "fopPriceBasis" TEXT NOT NULL DEFAULT 'net',
    "importMissingPolicy" TEXT NOT NULL DEFAULT 'keep',
    "nextRequestNumber" INTEGER NOT NULL DEFAULT 1,
    "nextKpNumber" INTEGER NOT NULL DEFAULT 2114,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnCompany" (
    "id" TEXT NOT NULL,
    "nameShort" TEXT NOT NULL,
    "nameFull" TEXT,
    "brandName" TEXT,
    "edrpou" TEXT,
    "ipn" TEXT,
    "isVatPayer" BOOLEAN NOT NULL DEFAULT true,
    "iban" TEXT,
    "bankName" TEXT,
    "addressLegal" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "slogan" TEXT,
    "logoUrl" TEXT,
    "kpFooter" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "logoUrl" TEXT,
    "defaultCurrency" "Currency" NOT NULL DEFAULT 'UAH',
    "pricesIncludeVat" BOOLEAN NOT NULL DEFAULT false,
    "rrpIncludesVat" BOOLEAN NOT NULL DEFAULT true,
    "supplierMarkupPct" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "ratePolicy" "RatePolicy" NOT NULL DEFAULT 'price_list',
    "rateAdjustPct" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "manualRateUsd" DECIMAL(12,4),
    "manualRateEur" DECIMAL(12,4),
    "manualRatesDate" DATE,
    "priceListRateUsd" DECIMAL(12,4),
    "priceListRateEur" DECIMAL(12,4),
    "priceListRateDate" DATE,
    "minOrderAmount" DECIMAL(14,2),
    "priceStaleDays" INTEGER,
    "searchUrlTemplate" TEXT,
    "website" TEXT,
    "b2bUrl" TEXT,
    "notes" TEXT,
    "deliveryInfo" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "lastImportAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPriceFeed" (
    "supplierId" TEXT NOT NULL,
    "kind" "PriceFeedKind" NOT NULL DEFAULT 'manual',
    "format" "PriceFeedFormat",
    "url" TEXT,
    "auth" "FeedAuth" NOT NULL DEFAULT 'none',
    "secret" TEXT,
    "scheduleHour" INTEGER,
    "hasPurchasePrice" BOOLEAN NOT NULL DEFAULT true,
    "columnMapping" JSONB,
    "note" TEXT,
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierPriceFeed_pkey" PRIMARY KEY ("supplierId")
);

-- CreateTable
CREATE TABLE "SupplierLegalEntity" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "nameShort" TEXT NOT NULL,
    "nameFull" TEXT,
    "edrpou" TEXT,
    "ipn" TEXT,
    "isVatPayer" BOOLEAN NOT NULL DEFAULT true,
    "iban" TEXT,
    "bankName" TEXT,
    "address" TEXT,
    "note" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SupplierLegalEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierContact" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "position" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "note" TEXT,

    CONSTRAINT "SupplierContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "responsibleUserId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counterparty" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "nameShort" TEXT NOT NULL,
    "nameFull" TEXT,
    "edrpou" TEXT,
    "ipn" TEXT,
    "isVatPayer" BOOLEAN NOT NULL DEFAULT true,
    "legalAddress" TEXT,
    "actualAddress" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Counterparty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientContact" (
    "id" TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "position" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "CurrencyRate" (
    "id" SERIAL NOT NULL,
    "currency" "Currency" NOT NULL,
    "rateDate" DATE NOT NULL,
    "rate" DECIMAL(12,4) NOT NULL,
    "source" "RateSource" NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "CurrencyRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "skuKey" TEXT NOT NULL,
    "nameWork" TEXT NOT NULL,
    "brand" TEXT,
    "unitCode" TEXT NOT NULL DEFAULT 'шт',
    "currency" "Currency" NOT NULL DEFAULT 'UAH',
    "purchasePrice" DECIMAL(14,4),
    "rrp" DECIMAL(14,4),
    "multiplicity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "minOrderQty" DECIMAL(12,3),
    "stockQty" DECIMAL(12,3),
    "availability" "Availability" NOT NULL DEFAULT 'unknown',
    "barcode" TEXT,
    "categoryPath" TEXT,
    "imageUrl" TEXT,
    "productUrl" TEXT,
    "notes" TEXT,
    "priceOrigin" "PriceOrigin" NOT NULL DEFAULT 'import',
    "priceUpdatedAt" TIMESTAMP(3),
    "missingSince" DATE,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "source" "ImageSource" NOT NULL,
    "url" TEXT,
    "storedPath" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" SERIAL NOT NULL,
    "productId" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currency" "Currency" NOT NULL,
    "purchasePrice" DECIMAL(14,4),
    "rrp" DECIMAL(14,4),
    "stockQty" DECIMAL(12,3),
    "availability" "Availability",
    "origin" "PriceOrigin" NOT NULL,
    "importRunId" INTEGER,
    "userId" TEXT,
    "note" TEXT,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceImportRun" (
    "id" SERIAL NOT NULL,
    "supplierId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "source" "ImportRunSource" NOT NULL,
    "status" "ImportRunStatus" NOT NULL DEFAULT 'ok',
    "fileId" TEXT,
    "productsTotal" INTEGER NOT NULL DEFAULT 0,
    "added" INTEGER NOT NULL DEFAULT 0,
    "changed" INTEGER NOT NULL DEFAULT 0,
    "priceUp" INTEGER NOT NULL DEFAULT 0,
    "priceDown" INTEGER NOT NULL DEFAULT 0,
    "stockChanged" INTEGER NOT NULL DEFAULT 0,
    "missing" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "rateUsd" DECIMAL(12,4),
    "rateEur" DECIMAL(12,4),
    "errorText" TEXT,
    "userId" TEXT,

    CONSTRAINT "PriceImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceImportFile" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "storedPath" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" TEXT,

    CONSTRAINT "PriceImportFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Supplier_isActive_sortOrder_idx" ON "Supplier"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "SupplierLegalEntity_supplierId_idx" ON "SupplierLegalEntity"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierContact_supplierId_idx" ON "SupplierContact"("supplierId");

-- CreateIndex
CREATE INDEX "Client_name_idx" ON "Client"("name");

-- CreateIndex
CREATE INDEX "Counterparty_clientId_idx" ON "Counterparty"("clientId");

-- CreateIndex
CREATE INDEX "Counterparty_edrpou_idx" ON "Counterparty"("edrpou");

-- CreateIndex
CREATE INDEX "ClientContact_counterpartyId_idx" ON "ClientContact"("counterpartyId");

-- CreateIndex
CREATE INDEX "CurrencyRate_rateDate_idx" ON "CurrencyRate"("rateDate");

-- CreateIndex
CREATE UNIQUE INDEX "CurrencyRate_currency_rateDate_source_key" ON "CurrencyRate"("currency", "rateDate", "source");

-- CreateIndex
CREATE INDEX "Product_supplierId_isArchived_idx" ON "Product"("supplierId", "isArchived");

-- CreateIndex
CREATE INDEX "Product_brand_idx" ON "Product"("brand");

-- CreateIndex
CREATE INDEX "Product_missingSince_idx" ON "Product"("missingSince");

-- CreateIndex
CREATE UNIQUE INDEX "Product_supplierId_skuKey_key" ON "Product"("supplierId", "skuKey");

-- CreateIndex
CREATE INDEX "ProductImage_productId_sortOrder_idx" ON "ProductImage"("productId", "sortOrder");

-- CreateIndex
CREATE INDEX "PriceHistory_productId_effectiveAt_idx" ON "PriceHistory"("productId", "effectiveAt");

-- CreateIndex
CREATE INDEX "PriceHistory_importRunId_idx" ON "PriceHistory"("importRunId");

-- CreateIndex
CREATE INDEX "PriceImportRun_supplierId_startedAt_idx" ON "PriceImportRun"("supplierId", "startedAt");

-- CreateIndex
CREATE INDEX "PriceImportFile_supplierId_uploadedAt_idx" ON "PriceImportFile"("supplierId", "uploadedAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPriceFeed" ADD CONSTRAINT "SupplierPriceFeed_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierLegalEntity" ADD CONSTRAINT "SupplierLegalEntity_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Counterparty" ADD CONSTRAINT "Counterparty_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "PriceImportRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceImportRun" ADD CONSTRAINT "PriceImportRun_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceImportRun" ADD CONSTRAINT "PriceImportRun_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "PriceImportFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceImportRun" ADD CONSTRAINT "PriceImportRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
