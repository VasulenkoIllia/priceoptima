// Перевірка змін одиниці виміру. Сам код одиниці не змінюється: на нього посилаються товари.
import { z } from 'zod';

export const unitCodeSchema = z.object({
  code: z
    .string({ message: 'Вкажіть код одиниці' })
    .trim()
    .min(1, 'Вкажіть код одиниці')
    .max(20, 'Задовгий код одиниці'),
});

export const unitPatchSchema = z.object({
  name: z.string({ message: 'Вкажіть назву' }).trim().min(1, 'Вкажіть назву').max(80, 'Задовга назва'),
  aliases: z
    .array(z.string().max(40, 'Задовгий синонім (до 40 символів)'), { message: 'Синоніми: список рядків' })
    .max(50, 'Забагато синонімів (до 50)')
    .default([]),
  isActive: z.boolean().default(true),
});

export type UnitPatchBody = z.infer<typeof unitPatchSchema>;
