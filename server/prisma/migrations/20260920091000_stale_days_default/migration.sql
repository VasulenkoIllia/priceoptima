-- Застарілість ціни за замовчуванням — 7 днів, як у налаштуваннях застосунку.
ALTER TABLE "AppSettings" ALTER COLUMN "priceStaleDays" SET DEFAULT 7;
