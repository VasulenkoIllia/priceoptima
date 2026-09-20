import type { ISODate, ISODateTime, UUID, UserRef } from './common';

export interface CounterpartyDto {
  id: UUID;
  clientId: UUID;
  nameShort: string;
  nameFull: string | null;
  edrpou: string | null;
  ipn: string | null;
  isVatPayer: boolean;
  addressLegal: string | null;
  addressActual: string | null;
  note: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface ContactDto {
  id: UUID;
  clientId: UUID;
  counterpartyId: UUID | null;
  fullName: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
  isPrimary: boolean;
  isActive: boolean;
}

export interface ClientListItem {
  id: UUID;
  name: string;
  counterparties: Pick<CounterpartyDto, 'id' | 'nameShort' | 'edrpou'>[];
  contactsCount: number;
  responsible: UserRef | null;
  requestsCount: number;
  lastRequestDate: ISODate | null;
  isActive: boolean;
}

export interface ClientDetail {
  id: UUID;
  /** Версія картки: передається назад при збереженні, щоб не стерти чужі правки (ДОВ-6). */
  version: number;
  name: string;
  note: string | null;
  responsibleUserId: UUID | null;
  isActive: boolean;
  counterparties: CounterpartyDto[];
  contacts: ContactDto[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ClientLookupItem {
  clientId: UUID;
  clientName: string;
  counterpartyId: UUID | null;
  counterpartyName: string | null;
  edrpou: string | null;
  /** 'АВТОСТРАДА / ТОВ "ВК АВТОСТРАДА" (44305608)' */
  label: string;
}

export type CounterpartyInput = Omit<CounterpartyDto, 'id' | 'clientId'> & { id?: UUID };
export type ContactInput = Omit<ContactDto, 'id' | 'clientId'> & { id?: UUID };

export interface ClientInput {
  /** Версія відкритої картки; для нової — не передається. */
  version?: number;
  name: string;
  note?: string | null;
  responsibleUserId?: UUID | null;
  isActive?: boolean;
  counterparties?: CounterpartyInput[];
  contacts?: ContactInput[];
}

export interface ClientRef {
  id: UUID;
  name: string;
}

export interface CounterpartyRef {
  id: UUID;
  nameShort: string;
  nameFull: string | null;
  edrpou: string | null;
  isVatPayer: boolean;
}

export interface ContactRef {
  id: UUID;
  fullName: string;
  phone: string | null;
  email: string | null;
  position: string | null;
}
