// Перевірка даних користувача. Пароль у UserInput не входить — його задає адміністратор окремим полем.
import { z } from 'zod';
import { USER_ROLES } from '@shared/enums';

const trimmed = (max: number, required: string) =>
  z.string({ message: required }).trim().min(1, required).max(max, `Задовге значення (до ${max} символів)`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Задовге значення (до ${max} символів)`)
    .nullish()
    .transform((v) => v || null);

export const passwordSchema = z
  .string({ message: 'Вкажіть пароль' })
  .min(8, 'Пароль — не менше 8 символів')
  .max(200, 'Пароль — не більше 200 символів');

export const userInputSchema = z.object({
  login: trimmed(60, 'Вкажіть логін'),
  fullName: trimmed(160, 'Вкажіть ПІБ'),
  shortName: trimmed(60, 'Вкажіть коротке ім’я'),
  email: optionalText(160),
  phone: optionalText(40),
  role: z.enum(USER_ROLES, { message: 'Невідома роль' }),
  isActive: z.boolean().optional(),
  /** Необов'язково: адміністратор задає або змінює пароль користувача. */
  password: passwordSchema.optional(),
});

/** Користувач редагує себе: змінити можна лише власні контактні дані. */
export const selfProfileSchema = z.object({
  fullName: trimmed(160, 'Вкажіть ПІБ'),
  shortName: trimmed(60, 'Вкажіть коротке ім’я'),
  email: optionalText(160),
  phone: optionalText(40),
});

export const userIdSchema = z.object({ id: z.uuid('Невірний ідентифікатор користувача') });

export type UserInputBody = z.infer<typeof userInputSchema>;
export type SelfProfileBody = z.infer<typeof selfProfileSchema>;
