// Локальні оверрайди реальних даних (seed-local/ поза git). У публічному репо файлів немає — глоби порожні, дані вигадані.

export interface OverrideContact {
  fullName: string;
  position?: string;
  phone?: string;
  email?: string;
}

export interface OverrideCounterparty {
  nameShort: string;
  nameFull?: string;
  edrpou?: string;
  legalAddress?: string;
  actualAddress?: string;
  contacts?: OverrideContact[];
}

export interface OverrideSupplier {
  name?: string;
  logoFile?: string;
  skuPrefix?: string;
  notes?: string;
  rates?: { USD?: number; EUR?: number };
  legalEntities?: { name: string }[];
  contacts?: OverrideContact[];
}

export interface OverrideOwnCompany {
  seedKey?: string;
  nameShort?: string;
  nameFull?: string;
  edrpou?: string;
  ipn?: string;
  iban?: string;
  bankName?: string;
  legalAddress?: string;
  phone?: string;
  email?: string;
  website?: string;
  slogan?: string;
  brandName?: string;
  logoFile?: string;
  isVatPayer?: boolean;
}

/**
 * Обліковий запис для входу (адміністратор із сіду). Без оверрайду — admin / admin. У БД — лише SHA-256 пароля.
 * Приклад: "auth": { "login": "manager", "password": "пароль" }.
 * overrides.json вбудовується у збірку, тож для сервера замість "password" краще "passwordSha256" — hex SHA-256 пароля
 * (printf '%s' 'пароль' | shasum -a 256); він має перевагу над "password".
 */
export interface OverrideAuth {
  login?: string;
  password?: string;
  passwordSha256?: string;
}

export interface SeedOverrides {
  ownCompany?: OverrideOwnCompany;
  suppliers?: Partial<Record<'s1' | 's2' | 's3' | 's4', OverrideSupplier>>;
  clients?: Record<string, { name?: string; counterparties?: OverrideCounterparty[] }>;
  auth?: OverrideAuth;
}

const overrideFiles = import.meta.glob<unknown>('/seed-local/overrides.json', { eager: true, import: 'default' });
const logoFiles = import.meta.glob<string>('/seed-local/*.png', { eager: true, query: '?url', import: 'default' });

function asOverrides(raw: unknown): SeedOverrides | null {
  return raw && typeof raw === 'object' ? (raw as SeedOverrides) : null;
}

/**
 * Вхід зі змінних збірки (сервер: .env → docker compose → VITE_AUTH_LOGIN / VITE_AUTH_PASSWORD_SHA256).
 * Має перевагу над overrides.json і входить у відбиток, тож новий пароль пересіює демо-дані в браузерах.
 */
export function withEnvAuth(
  o: SeedOverrides | null,
  env: { VITE_AUTH_LOGIN?: string; VITE_AUTH_PASSWORD_SHA256?: string },
): SeedOverrides | null {
  const login = env.VITE_AUTH_LOGIN?.trim();
  const passwordSha256 = env.VITE_AUTH_PASSWORD_SHA256?.trim().toLowerCase();
  if (!login && !passwordSha256) return o;
  const auth: OverrideAuth = { ...o?.auth };
  if (login) auth.login = login;
  if (passwordSha256) auth.passwordSha256 = passwordSha256;
  return { ...o, auth };
}

/** Оверрайди з seed-local/overrides.json (і вхід зі змінних збірки) або null. */
export const localOverrides: SeedOverrides | null = withEnvAuth(asOverrides(Object.values(overrideFiles)[0]), import.meta.env);

/** Логотипи з seed-local: ім'я файлу → URL. */
export const localLogos: Record<string, string> = Object.fromEntries(
  Object.entries(logoFiles).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1), url]),
);

/** Короткий відбиток оверрайдів (зміна файлу → пересів БД). */
export function overridesFingerprint(o: SeedOverrides | null): string {
  if (!o) return 'none';
  const text = JSON.stringify(o);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
