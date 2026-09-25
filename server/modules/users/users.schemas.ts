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
  .min(8, 'Пароль: не менше 8 символів')
  .max(200, 'Пароль: не більше 200 символів');

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

// ── налаштування інтерфейсу (ширина колонок тощо), однакові на всіх комп'ютерах користувача ──
/** Межа розміру всього набору налаштувань (символів JSON). */
export const UI_PREFS_MAX_CHARS = 64_000;
const importColumn = z.number().int().min(0).max(1000).nullable();

/** Налаштування інтерфейсу: лише відомі поля з межами; невідомі поля відкидаються. */
export const uiPrefsSchema = z
  .object({
    columnWidths: z
      .record(z.string().min(1).max(160), z.number().min(20).max(4000).transform(Math.round))
      .refine((v) => Object.keys(v).length <= 500, 'Забагато збережених колонок')
      .optional(),
    columnOrder: z
      .record(z.string().min(1).max(160), z.array(z.string().min(1).max(160)).max(100))
      .refine((v) => Object.keys(v).length <= 50, 'Забагато збережених таблиць')
      .optional(),
    editorMode: z.enum(['sourcing', 'comparison']).optional(),
    siderCollapsed: z.boolean().optional(),
    scenariosPanelOpen: z.boolean().optional(),
    headerNotesOpen: z.boolean().optional(),
    importMaps: z
      .record(z.string().min(1).max(2000), z.object({ name: importColumn, unit: importColumn, qty: importColumn, note: importColumn }))
      .refine((v) => Object.keys(v).length <= 50, 'Забагато збережених виборів колонок імпорту')
      .optional(),
  })
  .refine((v) => JSON.stringify(v).length <= UI_PREFS_MAX_CHARS, 'Завеликі налаштування інтерфейсу');

