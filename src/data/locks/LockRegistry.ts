// Симуляція блокувань між вкладками (§6.11): запис у localStorage['po-lock:<requestId>'] + BroadcastChannel('priceoptima-locks').
// Спільне сховище — джерело істини; канал лише сповіщає інші вкладки про зміну власника.
import type { ISODateTime, UUID } from '@shared/types';
import type { ChannelLike } from '../channel';
import type { KeyValueStorage } from '../storage';

export const LOCK_KEY_PREFIX = 'po-lock:';
export const LOCKS_CHANNEL = 'priceoptima-locks';

export interface LockOwner {
  userId: UUID;
  userShortName: string;
  sessionId: UUID;
}

export interface LockRecord extends LockOwner {
  lockedAt: ISODateTime;
  expiresAt: ISODateTime;
}

export type LockEvent =
  | { type: 'changed'; requestId: UUID; lock: LockRecord | null }
  | { type: 'forced'; requestId: UUID; lock: LockRecord; fromSessionId: UUID };

export interface LockRegistryOptions {
  storage: KeyValueStorage;
  channel: ChannelLike | null;
  ttlMs: number;
  now?: () => number;
}

export type AcquireOutcome = { ok: true; lock: LockRecord } | { ok: false; lock: LockRecord };

export class LockRegistry {
  private readonly storage: KeyValueStorage;
  private readonly channel: ChannelLike | null;
  private readonly now: () => number;
  private ttlMs: number;
  private readonly listeners = new Set<(e: LockEvent) => void>();
  private readonly unsubscribeChannel: (() => void) | null;

  constructor(opts: LockRegistryOptions) {
    this.storage = opts.storage;
    this.channel = opts.channel;
    this.ttlMs = opts.ttlMs;
    this.now = opts.now ?? Date.now;
    this.unsubscribeChannel = this.channel?.subscribe((m) => this.onRemote(m)) ?? null;
  }

  setTtl(ms: number): void {
    this.ttlMs = ms;
  }

  /** Діюче (не прострочене) блокування. */
  get(requestId: UUID): LockRecord | null {
    const rec = this.read(requestId);
    return rec && !this.isExpired(rec) ? rec : null;
  }

  /** Усі діючі блокування: requestId → запис. */
  all(): Map<UUID, LockRecord> {
    const out = new Map<UUID, LockRecord>();
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (!key?.startsWith(LOCK_KEY_PREFIX)) continue;
      const id = key.slice(LOCK_KEY_PREFIX.length);
      const rec = this.get(id);
      if (rec) out.set(id, rec);
    }
    return out;
  }

  /** Зайняти або продовжити власне; чуже діюче блокування — відмова з інформацією про власника. */
  acquire(requestId: UUID, owner: LockOwner): AcquireOutcome {
    const current = this.read(requestId);
    const live = current && !this.isExpired(current) ? current : null;
    if (live && live.sessionId !== owner.sessionId) return { ok: false, lock: live };
    const record = this.write(requestId, owner, live?.lockedAt);
    if (!live) this.emit({ type: 'changed', requestId, lock: record });
    return { ok: true, lock: record };
  }

  /** Продовжити блокування цієї вкладки. null — його забрали або звільнили. Прострочене власне (ніхто не перехопив) відновлюється. */
  heartbeat(requestId: UUID, sessionId: UUID): LockRecord | null {
    const current = this.read(requestId);
    if (!current || current.sessionId !== sessionId) return null;
    const expired = this.isExpired(current);
    const record = this.write(requestId, current, current.lockedAt);
    if (expired) this.emit({ type: 'changed', requestId, lock: record });
    return record;
  }

  /** Чи тримає вкладка діюче блокування. */
  holds(requestId: UUID, sessionId: UUID): boolean {
    return this.get(requestId)?.sessionId === sessionId;
  }

  release(requestId: UUID, sessionId: UUID): boolean {
    const current = this.read(requestId);
    if (!current || current.sessionId !== sessionId) return false;
    this.storage.removeItem(LOCK_KEY_PREFIX + requestId);
    this.emit({ type: 'changed', requestId, lock: null });
    return true;
  }

  /** Примусово забрати (адміністратор). Попередній власник отримує подію 'forced'. */
  force(requestId: UUID, owner: LockOwner): LockRecord {
    const current = this.get(requestId);
    const record = this.write(requestId, owner);
    if (current && current.sessionId !== owner.sessionId) {
      this.emit({ type: 'forced', requestId, lock: record, fromSessionId: current.sessionId });
    }
    this.emit({ type: 'changed', requestId, lock: record });
    return record;
  }

  /** Звільнити всі блокування вкладки (вихід користувача). */
  releaseSession(sessionId: UUID): void {
    for (const [id, rec] of this.all()) if (rec.sessionId === sessionId) this.release(id, sessionId);
  }

  /** Скинути всі блокування (скидання демо-даних). */
  clearAll(): void {
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key?.startsWith(LOCK_KEY_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      this.storage.removeItem(key);
      this.emit({ type: 'changed', requestId: key.slice(LOCK_KEY_PREFIX.length), lock: null });
    }
  }

  subscribe(listener: (e: LockEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.unsubscribeChannel?.();
    this.listeners.clear();
  }

  // ── внутрішнє ───────────────────────────────────────────────────
  private read(requestId: UUID): LockRecord | null {
    const raw = this.storage.getItem(LOCK_KEY_PREFIX + requestId);
    if (!raw) return null;
    try {
      const rec = JSON.parse(raw) as LockRecord;
      return rec && typeof rec.sessionId === 'string' ? rec : null;
    } catch {
      return null;
    }
  }

  private write(requestId: UUID, owner: LockOwner, lockedAt?: ISODateTime): LockRecord {
    const now = this.now();
    const record: LockRecord = {
      userId: owner.userId,
      userShortName: owner.userShortName,
      sessionId: owner.sessionId,
      lockedAt: lockedAt ?? new Date(now).toISOString(),
      expiresAt: new Date(now + this.ttlMs).toISOString(),
    };
    this.storage.setItem(LOCK_KEY_PREFIX + requestId, JSON.stringify(record));
    return record;
  }

  private isExpired(rec: LockRecord): boolean {
    return Date.parse(rec.expiresAt) <= this.now();
  }

  private emit(event: LockEvent): void {
    for (const l of this.listeners) l(event);
    this.channel?.post(event);
  }

  private onRemote(message: unknown): void {
    const e = message as LockEvent | null;
    if (!e || (e.type !== 'changed' && e.type !== 'forced')) return;
    for (const l of this.listeners) l(e);
  }
}
