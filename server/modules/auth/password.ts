// Паролі зберігаємо лише як argon2id-хеш (це алгоритм за замовчуванням @node-rs/argon2:
// 19 МіБ пам'яті, 2 проходи — достатньо для входу в систему). Сам пароль не логуємо й назовні не віддаємо.
import { hash, verify } from '@node-rs/argon2';

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

/** false — пароль не підходить або хеш пошкоджений (подробиці назовні не показуємо). */
export async function verifyPassword(passwordHash: string | null | undefined, password: string): Promise<boolean> {
  if (!passwordHash) return false;
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
