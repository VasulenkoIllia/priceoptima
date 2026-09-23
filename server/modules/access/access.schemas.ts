// Перевірка даних запрошень, реєстрації за посиланням і скидання пароля.
import { z } from 'zod';
import { USER_ROLES } from '@shared/enums';
import { passwordSchema } from '../users/users.schemas';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Задовге значення (до ${max} символів)`)
    .nullish()
    .transform((v) => v || null);

export const inviteCreateSchema = z.object({
  role: z.enum(USER_ROLES, { message: 'Невідома роль' }),
  note: optionalText(120),
});

/** Логін: латиниця, цифри, крапка, дефіс, підкреслення — щоб не плутати схожі літери. */
export const loginFieldSchema = z
  .string({ message: 'Вкажіть логін' })
  .trim()
  .toLowerCase()
  .min(3, 'Логін: не менше 3 символів')
  .max(60, 'Логін: не довше 60 символів')
  .regex(/^[a-z0-9._-]+$/u, 'Логін: латинські літери, цифри, крапка, дефіс або підкреслення');

export const registerSchema = z.object({
  login: loginFieldSchema,
  fullName: z.string({ message: 'Вкажіть ПІБ' }).trim().min(3, 'Вкажіть ПІБ').max(160, 'ПІБ: до 160 символів'),
  phone: optionalText(40),
  email: z
    .string()
    .trim()
    .max(160)
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v == null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(v), 'Невірний e-mail'),
  password: passwordSchema,
});

export const resetSchema = z.object({ password: passwordSchema });

export const linkTokenSchema = z.object({ token: z.string().min(20, 'Невірне посилання').max(200, 'Невірне посилання') });
export const linkIdSchema = z.object({ id: z.uuid('Невірний ідентифікатор посилання') });

export type InviteCreateBody = z.infer<typeof inviteCreateSchema>;
export type RegisterBody = z.infer<typeof registerSchema>;
