-- Ручний загальний курс можна скасувати: позначка часу, запис лишається в історії.
ALTER TABLE "CurrencyRate" ADD COLUMN "cancelledAt" TIMESTAMP(3);
