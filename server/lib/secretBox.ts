// Шифрування невеликих секретів, які мусять лежати в базі (токени вигрузок постачальників).
// AES-256-GCM: разом із шифротекстом зберігається тег цілісності, тож підміна значення в базі
// не пройде непоміченою. Ключ виводимо з SESSION_SECRET — окремої змінної середовища не заводимо.
// Зміна SESSION_SECRET робить збережені секрети нечитаними: їх треба ввести заново.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** Позначка формату: якщо колись зміниться спосіб шифрування, старі значення лишаться впізнаваними. */
const VERSION = 'v1';
const INFO = 'priceoptima.secretbox';

export class SecretBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretBoxError';
  }
}

/** Ключ шифрування з довільного рядка (HKDF-SHA256). */
export function deriveKey(secret: string, salt = INFO): Buffer {
  if (!secret) throw new SecretBoxError('Порожній ключ шифрування');
  const bits = hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.from(salt, 'utf8'), Buffer.from(INFO, 'utf8'), KEY_BYTES);
  return Buffer.from(bits);
}

/** Шифрує рядок; результат — 'v1.<iv>.<tag>.<дані>' у base64url, придатний для текстової колонки. */
export function seal(key: Buffer, plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), data.toString('base64url')].join('.');
}

/** Розшифровує значення; чужий ключ або зіпсовані дані — SecretBoxError. */
export function open(key: Buffer, packed: string): string {
  const parts = packed.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) throw new SecretBoxError('Невідомий формат збереженого секрету');
  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const data = Buffer.from(parts[3], 'base64url');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new SecretBoxError('Пошкоджений збережений секрет');
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    throw new SecretBoxError('Не вдалося розшифрувати секрет — змінився ключ підпису');
  }
}

export interface SecretBox {
  seal(plain: string): string;
  open(packed: string): string;
  /** Те саме, але без винятку: нечитане значення — це просто «секрету немає». */
  tryOpen(packed: string | null | undefined): string | null;
}

/** Сховище секретів на одному ключі. */
export function createSecretBox(secret: string): SecretBox {
  const key = deriveKey(secret);
  return {
    seal: (plain) => seal(key, plain),
    open: (packed) => open(key, packed),
    tryOpen: (packed) => {
      if (!packed) return null;
      try {
        return open(key, packed);
      } catch {
        return null;
      }
    },
  };
}
