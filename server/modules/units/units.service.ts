// Одиниці виміру: читає кожен, змінює адміністратор. Код одиниці — незмінний ключ довідника.
import type { UnitDto } from '@shared/types';
import { prisma } from '../../db';
import { duplicate, notFound } from '../../http/errors';
import { toUnitDto } from './units.mapper';
import { aliasKey, normalizeAliases } from './units.rules';
import type { UnitPatchBody } from './units.schemas';

export async function listUnits(): Promise<UnitDto[]> {
  const rows = await prisma.unit.findMany({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] });
  return rows.map(toUnitDto);
}

export async function updateUnit(code: string, input: UnitPatchBody): Promise<UnitDto> {
  const current = await prisma.unit.findUnique({ where: { code } });
  if (!current) throw notFound('Одиницю виміру не знайдено');
  const aliases = normalizeAliases(code, input.aliases);
  await assertAliasesFree(code, aliases);
  const row = await prisma.unit.update({
    where: { code },
    data: { name: input.name, aliases, isActive: input.isActive },
  });
  return toUnitDto(row);
}

/** Один синонім не може вести до двох одиниць — інакше прайс розпізнається випадково. */
async function assertAliasesFree(code: string, aliases: readonly string[]): Promise<void> {
  if (aliases.length === 0) return;
  const others = await prisma.unit.findMany({ where: { NOT: { code } }, select: { code: true, aliases: true } });
  const taken = new Map<string, string>();
  for (const unit of others) {
    taken.set(aliasKey(unit.code), unit.code);
    for (const alias of unit.aliases) taken.set(aliasKey(alias), unit.code);
  }
  for (const alias of aliases) {
    const owner = taken.get(aliasKey(alias));
    if (owner) throw duplicate(`Синонім «${alias}» уже належить одиниці «${owner}»`);
  }
}
