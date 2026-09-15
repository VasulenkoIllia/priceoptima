// Таксономія демо-каталогу: реєстр категорій (шаблони назв, атрибути, бренди, цінові моделі — у модулях taxonomy-*.ts).
// Бренди використовуються лише як частина назви товару; моделі/коди/ціни — вигадані.

export * from './taxonomy-core';
import type { CategoryDef } from './taxonomy-core';
import { PLUMBING_CATEGORIES } from './taxonomy-plumbing';
import { PIPE_CATEGORIES } from './taxonomy-pipes';
import { CERAMICS_CATEGORIES } from './taxonomy-ceramics';
import { HEATING_CATEGORIES } from './taxonomy-heating';

export const CATEGORIES: readonly CategoryDef[] = [
  ...PLUMBING_CATEGORIES,
  ...PIPE_CATEGORIES,
  ...CERAMICS_CATEGORIES,
  ...HEATING_CATEGORIES,
];
