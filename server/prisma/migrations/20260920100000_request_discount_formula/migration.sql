-- Формула знижки від РРЦ фіксується в заявці: зміна глобального пресета не переписує відкриті заявки.
ALTER TABLE "Request" ADD COLUMN "discountFormula" TEXT NOT NULL DEFAULT 'percent_off';
