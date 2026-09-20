import type {
  DiscountFormula,
  FopPriceBasis,
  KpNameSource,
  KpVatMode,
  MarkupMethod,
  PriceRounding,
  UserRole,
} from '../enums';
import type { ISODateTime, UserRef, UUID } from './common';
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
  /** false — заблоковано: вхід закрито, заявки й історія лишаються. */
  isActive: boolean;
  blockedAt: ISODateTime | null;
  /** Перший вхід адміністратора з .env: спершу змінити пароль. */
  mustChangePassword: boolean;
  /** Хто запросив (коротке ім'я); null — перший адміністратор. */
  invitedBy: string | null;
  lastLoginAt: ISODateTime | null;
  createdAt: ISODateTime;
}

/** Адміністратор змінює дані користувача (роль і доступ — окремими діями). */
export interface UserUpdateInput {
  login: string;
  fullName: string;
  shortName: string;
  email?: string | null;
  phone?: string | null;
}

/** Мій профіль: логін і роль не змінюються. */
export interface ProfileInput {
  fullName: string;
  shortName: string;
  email?: string | null;
  phone?: string | null;
}

export interface PasswordChangeInput {
  currentPassword: string;
  newPassword: string;
}

// ── Разові посилання: запрошення й скидання пароля ──────────────────
export type AccessLinkKind = 'invite' | 'reset';
export type AccessLinkState = 'valid' | 'used' | 'revoked' | 'expired';

export interface InviteCreateInput {
  role: UserRole;
  /** Для кого (підказка адміну). */
  note?: string | null;
}

/** Токен показується лише один раз, при створенні (у базі — хеш). */
export interface AccessLinkCreated {
  id: UUID;
  token: string;
  expiresAt: ISODateTime;
}

export interface AccessLinkDto {
  id: UUID;
  kind: AccessLinkKind;
  role: UserRole | null;
  note: string | null;
  /** Скидання — чий пароль; запрошення — хто зареєструвався. */
  user: UserRef | null;
  createdBy: UserRef | null;
  createdAt: ISODateTime;
  expiresAt: ISODateTime;
  usedAt: ISODateTime | null;
  state: AccessLinkState;
}

/** Що бачить людина, яка відкрила посилання (без входу). */
export interface AccessLinkInfo {
  kind: AccessLinkKind;
  state: AccessLinkState;
  role: UserRole | null;
  expiresAt: ISODateTime;
  /** Скидання пароля — чий обліковий запис. */
  login: string | null;
  fullName: string | null;
}

export interface RegisterInput {
  login: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  password: string;
}

// ── Журнал дій ─────────────────────────────────────────────────────
export interface AuditEventDto {
  id: string;
  at: ISODateTime;
  user: UserRef | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string;
}

export interface AuditQuery {
  userId?: UUID;
  entityType?: string;
  entityId?: string;
  /** Записи, старші за цей id (гортання назад). */
  before?: string;
  limit?: number;
}

export interface AuditPage {
  items: AuditEventDto[];
  /** Для наступної порції; null — більше немає. */
  nextBefore: string | null;
}

export interface AppSettings {
  /** 20 */
  vatRatePct: number;
  /** 7 */
  priceStaleDays: number;
  /** 180 — блокування без сигналу вкладки знімається (витримує сон ноутбука й гальмування фонових вкладок) */
  lockTtlSeconds: number;
  /** 20 — як часто вкладка підтверджує блокування */
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
  /** Наступний номер заявки (наскрізний лічильник, старт 1). */
  nextRequestNumber: number;
  /** Номер КП — сталий, у бланку «2114 / номер заявки». */
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
  /** Версія картки: передається назад при збереженні, щоб не стерти чужі правки (ДОВ-6). */
  version: number;
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
  /** Бренд для шапки застосунку й КП; необов'язкове. */
  brandName?: string | null;
}
/** Версія — та, з якою відкрили картку (для нової не передається). */
export type OwnCompanyInput = Omit<OwnCompanyDto, 'id' | 'version'> & { version?: number };

export interface UnitDto {
  /** 'шт', 'м', 'м2' … */
  code: string;
  name: string;
  aliases: string[];
  sortOrder: number;
  isActive: boolean;
}
