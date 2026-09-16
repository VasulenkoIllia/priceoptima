// Власні юрособи: реквізити, від яких виставляються КП. Основна — рівно одна.
import type { OwnCompanyDto } from '@shared/types';
import { prisma } from '../../db';
import { notFound } from '../../http/errors';
import { toOwnCompanyDto } from './ownCompanies.mapper';
import { assertDefaultStaysActive, resolveDefaultFlag } from './ownCompanies.rules';
import type { OwnCompanyInputBody } from './ownCompanies.schemas';

const ORDER = [{ isActive: 'desc' as const }, { isDefault: 'desc' as const }, { nameShort: 'asc' as const }];

export async function listOwnCompanies(): Promise<OwnCompanyDto[]> {
  const rows = await prisma.ownCompany.findMany({ orderBy: ORDER });
  return rows.map(toOwnCompanyDto);
}

export async function createOwnCompany(input: OwnCompanyInputBody): Promise<OwnCompanyDto> {
  const others = await prisma.ownCompany.count();
  const isDefault = resolveDefaultFlag(input.isDefault, { hasOthers: others > 0, wasDefault: false });
  assertDefaultStaysActive(isDefault, input.isActive);
  const row = await prisma.$transaction(async (tx) => {
    if (isDefault) await tx.ownCompany.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    return tx.ownCompany.create({ data: { ...toRow(input), isDefault } });
  });
  return toOwnCompanyDto(row);
}

export async function updateOwnCompany(id: string, input: OwnCompanyInputBody): Promise<OwnCompanyDto> {
  const current = await prisma.ownCompany.findUnique({ where: { id }, select: { isDefault: true } });
  if (!current) throw notFound('Юрособу не знайдено');
  const others = await prisma.ownCompany.count({ where: { NOT: { id } } });
  const isDefault = resolveDefaultFlag(input.isDefault, { hasOthers: others > 0, wasDefault: current.isDefault });
  assertDefaultStaysActive(isDefault, input.isActive);
  const row = await prisma.$transaction(async (tx) => {
    // нову основну ставимо разом зі зняттям попередньої, щоб основна не подвоїлась
    if (isDefault) await tx.ownCompany.updateMany({ where: { isDefault: true, NOT: { id } }, data: { isDefault: false } });
    return tx.ownCompany.update({ where: { id }, data: { ...toRow(input), isDefault } });
  });
  // раніше сформовані КП не змінюються — у них знімок реквізитів
  return toOwnCompanyDto(row);
}

function toRow(input: OwnCompanyInputBody) {
  return {
    code: input.code,
    nameShort: input.nameShort,
    nameFull: input.nameFull,
    brandName: input.brandName,
    edrpou: input.edrpou,
    ipn: input.ipn,
    isVatPayer: input.isVatPayer,
    iban: input.iban,
    bankName: input.bankName,
    addressLegal: input.addressLegal,
    phone: input.phone,
    email: input.email,
    website: input.website,
    slogan: input.slogan,
    logoUrl: input.logoUrl,
    kpFooter: input.kpFooter,
    isActive: input.isActive,
  };
}
