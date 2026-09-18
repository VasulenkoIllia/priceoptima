// Перевірка даних користувача. Нових користувачів додають запрошенням (модуль access), роль і доступ — окремими діями.
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

const contactFields = {
  fullName: trimmed(160, 'Вкажіть ПІБ'),
  shortName: trimmed(60, 'Вкажіть коротке ім’я'),
  email: optionalText(160),
  phone: optionalText(40),
};

/** Адміністратор змінює дані користувача. */
export const userUpdateSchema = z.object({ login: trimmed(60, 'Вкажіть логін').toLowerCase(), ...contactFields });

/** Мій профіль: лише контактні дані. */
export const profileSchema = z.object(contactFields);

export const roleSchema = z.object({ role: z.enum(USER_ROLES, { message: 'Невідома роль' }) });

export const passwordChangeSchema = z.object({
  currentPassword: z.string({ message: 'Вкажіть поточний пароль' }).min(1, 'Вкажіть поточний пароль'),
  newPassword: passwordSchema,
});

export const userIdSchema = z.object({ id: z.uuid('Невірний ідентифікатор користувача') });

export type UserUpdateBody = z.infer<typeof userUpdateSchema>;
export type ProfileBody = z.infer<typeof profileSchema>;
