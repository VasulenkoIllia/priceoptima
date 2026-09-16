// Вхід: логін і пароль. Пароль тут не обрізаємо й не приводимо — як ввели, так і перевіряємо.
import { z } from 'zod';

export const loginSchema = z.object({
  login: z.string({ message: 'Вкажіть логін' }).trim().min(1, 'Вкажіть логін').max(60, 'Задовгий логін'),
  password: z.string({ message: 'Вкажіть пароль' }).min(1, 'Вкажіть пароль').max(200, 'Задовгий пароль'),
});

export type LoginBody = z.infer<typeof loginSchema>;
