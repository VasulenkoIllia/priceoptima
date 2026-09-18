-- КП від ФОП — на рівні цін з ПДВ, як у ТОВ (рішення клієнта 16.09). Значення можна змінити в Налаштуваннях.

-- AlterTable
ALTER TABLE "AppSettings" ALTER COLUMN "fopPriceBasis" SET DEFAULT 'gross';

-- Раніше вибору в інтерфейсі не було — стояло значення за замовчуванням 'net'
UPDATE "AppSettings" SET "fopPriceBasis" = 'gross' WHERE "fopPriceBasis" = 'net';
