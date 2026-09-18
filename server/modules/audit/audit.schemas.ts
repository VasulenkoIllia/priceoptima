// Параметри журналу дій (рядки з адреси запиту).
import { z } from 'zod';

const optionalText = z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().max(100).optional());

export const auditQuerySchema = z.object({
  userId: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.uuid('Невірний ідентифікатор користувача').optional()),
  entityType: optionalText,
  entityId: optionalText,
  before: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().regex(/^\d+$/u, 'Невірна позиція журналу').optional()),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export type AuditQueryInput = z.infer<typeof auditQuerySchema>;
