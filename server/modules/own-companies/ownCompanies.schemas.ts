// Перевірка реквізитів власної юрособи. Реквізити потрапляють у КП, тож назви обов'язкові,
// а решта полів може лишатися порожньою.
import { z } from 'zod';
import { imageSrcField, optionalText, trimmed, webUrlField } from '../../lib/fields';

export const ownCompanyInputSchema = z.object({
  /** Версія картки, яку відкрив користувач (ДОВ-6). */
  version: z.number().int().min(1).optional(),
  code: trimmed(20, 'Вкажіть позначку юрособи'),
  nameShort: trimmed(160, 'Вкажіть коротку назву'),
  nameFull: trimmed(400, 'Вкажіть повну назву'),
  edrpou: optionalText(20),
  ipn: optionalText(20),
  isVatPayer: z.boolean().default(true),
  iban: optionalText(40),
  bankName: optionalText(160),
  addressLegal: optionalText(400),
  phone: optionalText(40),
  email: optionalText(160),
  website: webUrlField(200, 'Сайт'),
  slogan: optionalText(200),
  // логотип зберігаємо як посилання або data-URL зображення
  logoUrl: imageSrcField(300_000, 'Логотип'),
  kpFooter: optionalText(2000),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  brandName: optionalText(160),
});

export const ownCompanyIdSchema = z.object({ id: z.uuid('Невірний ідентифікатор юрособи') });

export type OwnCompanyInputBody = z.infer<typeof ownCompanyInputSchema>;
