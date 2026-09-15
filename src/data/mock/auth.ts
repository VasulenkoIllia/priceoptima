// Вхід у прототип: один обліковий запис із сіду; пароль зберігається лише як SHA-256 (hex).
import { DataSourceError } from '../errors';
import type { OverrideAuth } from './overrides';

export interface SeedAuth {
  login: string;
  /** hex SHA-256 пароля. */
  passwordSha256: string;
}

/** Типові облікові дані демо (вигадані): admin / admin. Змінюються через seed-local/overrides.json → auth. */
export const DEMO_AUTH: SeedAuth = {
  login: 'admin',
  passwordSha256: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
};

export async function sha256Hex(text: string): Promise<string> {
  // crypto.subtle є лише в безпечному контексті (HTTPS або localhost)
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new DataSourceError('NOT_IMPLEMENTED', 'Вхід працює лише через HTTPS');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Облікові дані для сіду: з оверрайду або демо. */
export async function seedAuthOf(o: OverrideAuth | undefined): Promise<SeedAuth> {
  const login = o?.login?.trim() || DEMO_AUTH.login;
  const fromHash = o?.passwordSha256?.trim().toLowerCase();
  const passwordSha256 = fromHash || (o?.password ? await sha256Hex(o.password) : DEMO_AUTH.passwordSha256);
  return { login, passwordSha256 };
}
