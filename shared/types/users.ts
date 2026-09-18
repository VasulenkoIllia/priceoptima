import type {
  DiscountFormula,
  FopPriceBasis,
  ImportMissingPolicy,
  KpNameSource,
  KpVatMode,
  MarkupMethod,
  PriceRounding,
  UserRole,
} from '../enums';
import type { ISODateTime, UUID } from './common';
import type { KpTerm } from './kp';

export interface UserDto {
  id: UUID;
  login: string;
  fullName: string;
  /** 'Коваль О.В.' */
  shortName: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export interface UserInput {
  login: string;
  fullName: string;
  shortName: string;
  email?: string | null;
  phone?: string | null;
  role: UserRole;
  isActive?: boolean;
}

export interface AppSettings {
  /** 20 */
  vatRatePct: number;
  /** 7 */
  priceStaleDays: number;
  /** 30 (прискорено для демо) */
  lockTtlSeconds: number;
  /** 10 */
  lockHeartbeatSeconds: number;
  /** 800 */
  autosaveDebounceMs: number;
  /** 'rrp' */
  defaultMarkupMethod: MarkupMethod;
  /** 0 */
  defaultMarkupValue: number;
  /** 'kopecks' */
  priceRounding: PriceRounding;
  /** 'percent_off' */
  discountFormula: DiscountFormula;
  /** true — к-сть у блоці округлюється вгору до кратної */
  autoRoundMultiplicity: boolean;
  /** false */
  excludeUnavailableByDefault: boolean;
  /** 'without_vat' */
  kpDefaultVatMode: KpVatMode;
  /** 'work' */
  kpNameSource: KpNameSource;
  /** false */
  kpShowImages: boolean;
  /** 3 */
  kpValidityDays: number;
  /** Типові умови в КП (у бланку можна змінити під клієнта). */
  kpTerms: KpTerm[];
  /** 'net' — базова ціна КП від ФОП */
  fopPriceBasis: FopPriceBasis;
  /** 'keep' */
  importMissingPolicy: ImportMissingPolicy;
  /** Наступний номер заявки (наскрізний лічильник, старт 1). */
  nextRequestNumber: number;
  /** Наступний номер КП (наскрізний лічильник, старт 2114 для демо). */
  nextKpNumber: number;
}
export type AppSettingsPatch = Partial<AppSettings>;

export interface MeResponse {
  user: UserDto;
  settings: AppSettings;
  serverTime: ISODateTime;
}

export interface OwnCompanyDto {
  id: UUID;
  code: string;
  nameShort: string;
  nameFull: string;
  edrpou: string | null;
  ipn: string | null;
  isVatPayer: boolean;
  iban: string | null;
  bankName: string | null;
  addressLegal: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  slogan: string | null;
  logoUrl: string | null;
  kpFooter: string | null;
  isDefault: boolean;
  isActive: boolean;
  /** Бренд для шапки застосунку й КП ('ДЕМО ТРЕЙД'); необов'язкове. */
  brandName?: string | null;
}
export type OwnCompanyInput = Omit<OwnCompanyDto, 'id'>;

export interface UnitDto {
  /** 'шт', 'м', 'м2' … */
  code: string;
  name: string;
  aliases: string[];
  sortOrder: number;
  isActive: boolean;
}
