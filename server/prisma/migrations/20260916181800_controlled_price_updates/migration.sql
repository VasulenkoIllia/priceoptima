-- Кероване оновлення прайсів: змішане джерело (асортимент за посиланням, ціни файлом),
-- журнал із назвою файлу, попередженнями, звітом звірки й новими лічильниками,
-- позначка автоматичного архіву товару (щоб повертати з архіву лише такі товари).
-- Лише нові значення перелічення й необов'язкові колонки / колонки зі значенням за замовчуванням:
-- таблиці не переписуються, блокування короткі.

-- AlterEnum
ALTER TYPE "PriceFeedKind" ADD VALUE 'hybrid';

-- AlterTable
ALTER TABLE "PriceImportRun" ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "warnings" TEXT,
ADD COLUMN     "details" JSONB,
ADD COLUMN     "relinked" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "restored" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "detailsDiffer" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "autoArchivedAt" TIMESTAMP(3);
