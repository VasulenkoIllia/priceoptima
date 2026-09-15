// Збереження in-memory БД: IndexedDB (idb-keyval, один ключ, debounce) + синхронізація вкладок через BroadcastChannel.
// Кожна зміна — функція-операція над БД. Якщо інша вкладка встигла записати свою версію, наші неперсистовані операції
// повторно застосовуються до її версії (а не перезаписують її) — так паралельна робота у двох вкладках не губить змін.
import { get as idbGet, set as idbSet } from 'idb-keyval';
import type { ChannelLike } from '../channel';
import { DB_KEY, type MockDb } from './db';

export interface DbPersistence {
  load(): Promise<MockDb | undefined>;
  save(db: MockDb): Promise<void>;
}

export const idbPersistence: DbPersistence = {
  load: () => idbGet<MockDb>(DB_KEY),
  save: (db) => idbSet(DB_KEY, db),
};

/** Для тестів і середовищ без IndexedDB. Спільний екземпляр = «спільна IndexedDB» кількох вкладок. */
export function memoryPersistence(): DbPersistence {
  let value: MockDb | undefined;
  return {
    load: async () => (value ? clone(value) : undefined),
    save: async (db) => {
      value = clone(db);
    },
  };
}

type Op = (db: MockDb) => void;
type DbMessage = { type: 'db-changed'; rev: number } | { type: 'reset'; rev: number };
export type DbStoreEvent = 'external' | 'reset';

export interface MockDbStoreOptions {
  persistence: DbPersistence;
  channel: ChannelLike | null;
  seed: () => MockDb;
  isCompatible: (db: MockDb) => boolean;
  debounceMs: number;
}

export class MockDbStore {
  private current: MockDb | null = null;
  private pending: Op[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<(e: DbStoreEvent) => void>();
  private unsubscribeChannel: (() => void) | null = null;

  constructor(private readonly opts: MockDbStoreOptions) {}

  get db(): MockDb {
    if (!this.current) throw new Error('DB is not initialized');
    return this.current;
  }

  async init(): Promise<void> {
    await this.serial(() =>
      withWebLock(async () => {
        const stored = await this.opts.persistence.load().catch(() => undefined);
        if (stored && this.opts.isCompatible(stored)) {
          this.current = stored;
          return;
        }
        const fresh = this.opts.seed();
        fresh.rev = (stored?.rev ?? 0) + 1;
        await this.opts.persistence.save(fresh).catch(() => undefined);
        this.current = fresh;
      }),
    );
    this.unsubscribeChannel = this.opts.channel?.subscribe((m) => this.onMessage(m as DbMessage)) ?? null;
  }

  /** Змінити БД; зміна піде в IndexedDB через debounce. */
  mutate<T>(op: (db: MockDb) => T): T {
    const result = op(this.db);
    this.pending.push(op as Op);
    this.schedule();
    return result;
  }

  /** Записати неперсистовані зміни зараз. */
  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    return this.serial(() => this.persistPending());
  }

  /** Замінити БД свіжим сідом (скидання демо-даних). */
  reset(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    return this.serial(async () => {
      let rev = 0;
      await withWebLock(async () => {
        const stored = await this.opts.persistence.load().catch(() => undefined);
        const fresh = this.opts.seed();
        fresh.rev = Math.max(stored?.rev ?? 0, this.current?.rev ?? 0) + 1;
        await this.opts.persistence.save(fresh);
        this.current = fresh;
        this.pending = [];
        rev = fresh.rev;
      });
      this.opts.channel?.post({ type: 'reset', rev } satisfies DbMessage);
    });
  }

  subscribe(listener: (e: DbStoreEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.unsubscribeChannel?.();
    this.listeners.clear();
  }

  // ── внутрішнє ───────────────────────────────────────────────────
  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.opts.debounceMs);
  }

  private serial(fn: () => Promise<void>): Promise<void> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async persistPending(): Promise<void> {
    if (!this.pending.length) return;
    const ops = this.pending;
    this.pending = [];
    let rev = 0;
    try {
      await withWebLock(async () => {
        const stored = await this.opts.persistence.load().catch(() => undefined);
        const storedRev = stored?.rev ?? 0;
        if (stored && this.opts.isCompatible(stored) && storedRev > this.db.rev) {
          // інша вкладка записала раніше — наші операції поверх її версії
          replay(stored, ops);
          replay(stored, this.pending);
          this.current = stored;
        }
        this.db.rev = Math.max(storedRev, this.db.rev) + 1;
        await this.opts.persistence.save(this.db);
        rev = this.db.rev;
      });
    } catch {
      // не вдалося записати — повторимо з наступною зміною
      this.pending = [...ops, ...this.pending];
      return;
    }
    this.opts.channel?.post({ type: 'db-changed', rev } satisfies DbMessage);
  }

  private onMessage(message: DbMessage | null): void {
    if (!message || (message.type !== 'db-changed' && message.type !== 'reset')) return;
    void this.serial(async () => {
      if (!this.current || message.rev <= this.current.rev) return;
      const stored = await this.opts.persistence.load().catch(() => undefined);
      if (!stored || stored.rev <= this.db.rev || !this.opts.isCompatible(stored)) return;
      if (message.type === 'reset') {
        this.pending = [];
      } else {
        replay(stored, this.pending);
      }
      this.current = stored;
      const kind: DbStoreEvent = message.type === 'reset' ? 'reset' : 'external';
      for (const l of this.listeners) l(kind);
    });
  }
}

function replay(db: MockDb, ops: readonly Op[]): void {
  for (const op of ops) {
    try {
      op(db);
    } catch {
      // операція неприйнятна для новішої версії даних — пропускаємо
    }
  }
}

async function withWebLock(fn: () => Promise<void>): Promise<void> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks && typeof locks.request === 'function') {
    await locks.request(DB_KEY, fn);
    return;
  }
  await fn();
}

export function clone<T>(v: T): T {
  return typeof structuredClone === 'function' ? structuredClone(v) : (JSON.parse(JSON.stringify(v)) as T);
}
