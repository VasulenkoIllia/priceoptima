// Перевірка даних клієнта разом із вкладеними контрагентами й контактами.
// Списки необов'язкові: якщо їх не передали, збережені лишаються без змін.
import { z } from 'zod';
import { optionalText, trimmed } from '../../lib/fields';

const optionalId = z
  .uuid('Невірний ідентифікатор')
  .nullish()
  .transform((v) => v ?? null);

export const counterpartyInputSchema = z.object({
  id: z.uuid('Невірний ідентифікатор контрагента').optional(),
  nameShort: trimmed(200, 'Вкажіть назву контрагента'),
  nameFull: optionalText(400),
  edrpou: optionalText(20),
  ipn: optionalText(20),
  isVatPayer: z.boolean().default(true),
  addressLegal: optionalText(400),
  addressActual: optionalText(400),
  note: optionalText(1000),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const contactInputSchema = z.object({
  id: z.uuid('Невірний ідентифікатор контакту').optional(),
  counterpartyId: optionalId,
  fullName: trimmed(160, 'Вкажіть ПІБ контакту'),
  position: optionalText(120),
  phone: optionalText(40),
  email: optionalText(160),
  note: optionalText(1000),
  isPrimary: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const clientInputSchema = z.object({
  name: trimmed(200, 'Вкажіть назву клієнта'),
  note: optionalText(2000),
  responsibleUserId: optionalId,
  isActive: z.boolean().default(true),
  counterparties: z.array(counterpartyInputSchema).max(50, 'Забагато контрагентів (до 50)').optional(),
  contacts: z.array(contactInputSchema).max(200, 'Забагато контактів (до 200)').optional(),
});

export const clientIdSchema = z.object({ id: z.uuid('Невірний ідентифікатор клієнта') });

export const clientSearchSchema = z.object({
  q: z.string().trim().max(200, 'Задовгий запит').optional().default(''),
});

export type CounterpartyInputBody = z.infer<typeof counterpartyInputSchema>;
export type ContactInputBody = z.infer<typeof contactInputSchema>;
export type ClientInputBody = z.infer<typeof clientInputSchema>;
