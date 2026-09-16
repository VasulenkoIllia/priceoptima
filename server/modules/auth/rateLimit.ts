// Захист від перебору пароля: рахуємо невдалі спроби в пам'яті процесу.
// Одного контейнера вистачає; спільне сховище знадобиться лише якщо колись буде кілька копій застосунку.

export interface RateLimitOptions {
  /** Скільки невдалих спроб дозволено у вікні. */
  limit: number;
  /** Довжина вікна, мс. */
  windowMs: number;
  now?: () => number;
}

interface Attempt {
  count: number;
  /** Коли вікно спроб почалося. */
  startedAt: number;
}

export class LoginRateLimiter {
  private readonly attempts = new Map<string, Attempt>();
  private readonly now: () => number;

  constructor(private readonly options: RateLimitOptions) {
    this.now = options.now ?? Date.now;
  }

  /** true — спроб забагато, вхід поки заборонено. */
  isBlocked(key: string): boolean {
    const attempt = this.current(key);
    return attempt !== null && attempt.count >= this.options.limit;
  }

  /** Скільки секунд лишилося до зняття блокування. */
  retryAfterSeconds(key: string): number {
    const attempt = this.current(key);
    if (!attempt) return 0;
    const left = attempt.startedAt + this.options.windowMs - this.now();
    return Math.max(1, Math.ceil(left / 1000));
  }

  registerFailure(key: string): void {
    const attempt = this.current(key);
    if (attempt) attempt.count += 1;
    else this.attempts.set(key, { count: 1, startedAt: this.now() });
  }

  /** Успішний вхід обнуляє лічильник. */
  reset(key: string): void {
    this.attempts.delete(key);
  }

  /** Прибрати вікна, що вже минули (викликається періодично). */
  sweep(): void {
    for (const key of [...this.attempts.keys()]) this.current(key);
  }

  /** Поточне вікно; протерміноване — прибираємо. */
  private current(key: string): Attempt | null {
    const attempt = this.attempts.get(key);
    if (!attempt) return null;
    if (this.now() - attempt.startedAt >= this.options.windowMs) {
      this.attempts.delete(key);
      return null;
    }
    return attempt;
  }
}

/** Ключ обмеження — IP і логін разом: одна адреса не блокує чужі облікові записи. */
export function rateLimitKey(ip: string | undefined, login: string): string {
  return `${ip ?? 'unknown'}|${login.trim().toLocaleLowerCase('uk')}`;
}
