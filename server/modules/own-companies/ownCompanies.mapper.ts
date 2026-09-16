// Юрособа з бази → OwnCompanyDto. Повна назва в базі необов'язкова, у DTO — рядок,
// тож порожнє значення показуємо як коротку назву.
import type { OwnCompany } from '@prisma/client';
import type { OwnCompanyDto } from '@shared/types';

export function toOwnCompanyDto(row: OwnCompany): OwnCompanyDto {
  return {
    id: row.id,
    code: row.code,
    nameShort: row.nameShort,
    nameFull: row.nameFull ?? row.nameShort,
    edrpou: row.edrpou,
    ipn: row.ipn,
    isVatPayer: row.isVatPayer,
    iban: row.iban,
    bankName: row.bankName,
    addressLegal: row.addressLegal,
    phone: row.phone,
    email: row.email,
    website: row.website,
    slogan: row.slogan,
    logoUrl: row.logoUrl,
    kpFooter: row.kpFooter,
    isDefault: row.isDefault,
    isActive: row.isActive,
    brandName: row.brandName,
  };
}
