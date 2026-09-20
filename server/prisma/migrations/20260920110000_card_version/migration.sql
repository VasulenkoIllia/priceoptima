-- Захист від одночасного редагування карток довідників: зберігаємо лише з тією версією, яку відкрив користувач.
ALTER TABLE "Client" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Supplier" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Product" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "OwnCompany" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
