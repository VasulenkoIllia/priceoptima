// Перевірка реквізитів власної юрособи. Реквізити потрапляють у КП, тож назви обов'язкові,
// а решта полів може лишатися порожньою.
import { z } from 'zod';
import { optionalText, trimmed } from '../../lib/fields';

export const ownCompanyInputSchema = z.object({
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
  website: optionalText(200),
  slogan: optionalText(200),
  // логотип зберігаємо як посилання або data-URL зображення
  logoUrl: optionalText(300_000),
  kpFooter: optionalText(2000),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  brandName: optionalText(160),
});

export const ownCompanyIdSchema = z.object({ id: z.uuid('Невірний ідентифікатор юрособи') });

export type OwnCompanyInputBody = z.infer<typeof ownCompanyInputSchema>;
