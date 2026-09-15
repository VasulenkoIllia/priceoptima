import type { UnitDto } from '../types';

export type UnitAliasSource = Pick<UnitDto, 'code' | 'aliases'>;

/** Базовий довідник одиниць (код + синоніми з прайсів і листів клієнтів). */
export const DEFAULT_UNITS: UnitDto[] = [
  { code: 'шт', name: 'Штука', aliases: ['шт.', 'штука', 'штуки', 'штук', 'pcs', 'pc', 'од', 'од.', 'ед', 'ед.'], sortOrder: 1, isActive: true },
  { code: 'м', name: 'Метр', aliases: ['м.', 'метр', 'метри', 'метрів', 'пог.м', 'пог. м', 'м.п.', 'мп', 'п.м.', 'm'], sortOrder: 2, isActive: true },
  { code: 'м2', name: 'Квадратний метр', aliases: ['м²', 'кв.м', 'кв. м', 'м кв', 'м.кв.', 'm2'], sortOrder: 3, isActive: true },
  { code: 'м3', name: 'Кубічний метр', aliases: ['м³', 'куб.м', 'куб. м', 'м куб', 'm3'], sortOrder: 4, isActive: true },
  { code: 'кг', name: 'Кілограм', aliases: ['кг.', 'кілограм', 'kg'], sortOrder: 5, isActive: true },
  { code: 'л', name: 'Літр', aliases: ['л.', 'літр', 'літри', 'l'], sortOrder: 6, isActive: true },
  { code: 'компл', name: 'Комплект', aliases: ['компл.', 'комплект', 'комплекти', 'к-т', 'кт', 'set'], sortOrder: 7, isActive: true },
  { code: 'уп', name: 'Упаковка', aliases: ['уп.', 'упак', 'упак.', 'упаковка', 'пач', 'пач.'], sortOrder: 8, isActive: true },
  { code: 'пара', name: 'Пара', aliases: ['пар', 'пари', 'пар.'], sortOrder: 9, isActive: true },
  { code: 'рул', name: 'Рулон', aliases: ['рул.', 'рулон', 'рулони'], sortOrder: 10, isActive: true },
];

function unitKey(raw: string): string {
  return raw
    .toLocaleLowerCase('uk')
    .replace(/\s+/gu, '')
    .replace(/\.+$/u, '');
}

/** Код одиниці за кодом або синонімом; невідома → null. */
export function normalizeUnit(raw: string | null | undefined, units: readonly UnitAliasSource[] = DEFAULT_UNITS): string | null {
  if (raw == null) return null;
  const key = unitKey(raw.trim());
  if (key === '') return null;
  for (const u of units) {
    if (unitKey(u.code) === key) return u.code;
    if (u.aliases.some((a) => unitKey(a) === key)) return u.code;
  }
  return null;
}
