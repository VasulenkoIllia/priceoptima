-- Автооновлення прив'язане до постачальника: замість формату вигрузки — модуль постачальника.
ALTER TABLE "SupplierPriceFeed" ADD COLUMN "connector" TEXT;

-- json розбирав вигрузку САНДІ, xml — SANWELL, yml — стандартний YML
UPDATE "SupplierPriceFeed"
SET "connector" = CASE "format"
  WHEN 'json' THEN 'sandi'
  WHEN 'xml' THEN 'sanwell'
  WHEN 'yml' THEN 'yml'
  ELSE NULL
END;

ALTER TABLE "SupplierPriceFeed" DROP COLUMN "format";

DROP TYPE "PriceFeedFormat";
