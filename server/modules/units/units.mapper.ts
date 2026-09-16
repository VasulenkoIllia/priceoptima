// Одиниця виміру з бази → UnitDto.
import type { Unit } from '@prisma/client';
import type { UnitDto } from '@shared/types';

export function toUnitDto(row: Unit): UnitDto {
  return {
    code: row.code,
    name: row.name,
    aliases: row.aliases,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}
