// Перевірка запитів до довідника курсів.
import { z } from 'zod';
import { FOREIGN_CURRENCIES } from '@shared/enums';
import { isoDateString, optionalIsoDateString, optionalText } from '../../lib/fields';

const currency = z.enum(FOREIGN_CURRENCIES, { message: 'Курс ведеться лише для USD і EUR' });

export const ratesQuerySchema = z.object({
  currency: currency.optional(),
  from: optionalIsoDateString('Дата «з»'),
  to: optionalIsoDateString('Дата «по»'),
});

export const effectiveRatesQuerySchema = z.object({
  date: optionalIsoDateString('Дата'),
});

export const manualRateSchema = z.object({
  currency,
  rateDate: isoDateString('Дата курсу'),
  // курс не буває нульовим; верхня межа — запобіжник від зайвого нуля
  rate: z.number({ message: 'Вкажіть курс' }).gt(0, 'Курс має бути більшим за нуль').max(10_000, 'Курс: не більше 10000'),
  note: optionalText(200),
});

export const cancelManualRateSchema = z.object({ currency });

export type RatesQuery = z.infer<typeof ratesQuerySchema>;
export type EffectiveRatesQuery = z.infer<typeof effectiveRatesQuerySchema>;
export type ManualRateBody = z.infer<typeof manualRateSchema>;
export type CancelManualRateBody = z.infer<typeof cancelManualRateSchema>;
