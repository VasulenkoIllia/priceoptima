// Мінімальний інтерфейс сховища (localStorage/sessionStorage) і пам'ятна реалізація для тестів.
import { newId } from '@/lib/ids';

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

export class MemoryStorage implements KeyValueStorage {
  private readonly map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

/** Сховище браузера або пам'ятне (SSR/тести/заблоковане сховище). */
export function browserStorage(kind: 'local' | 'session'): KeyValueStorage {
  try {
    const s = kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
    if (s) return s;
  } catch {
    // доступ до сховища заборонено налаштуваннями браузера
  }
  return new MemoryStorage();
}

const SESSION_KEY = 'po-session-id';

/**
 * Ідентифікатор вкладки (sessionStorage). Після перезавантаження сторінки лишається тим самим (вкладка може
 * повернути своє блокування), а дубльована вкладка отримує новий — браузер копіює sessionStorage при дублюванні.
 */
export function tabSessionId(storage: KeyValueStorage): string {
  const stored = storage.getItem(SESSION_KEY);
  if (stored && isReloadNavigation()) return stored;
  const id = newId();
  storage.setItem(SESSION_KEY, id);
  return id;
}

function isReloadNavigation(): boolean {
  try {
    const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return entry?.type === 'reload';
  } catch {
    return false;
  }
}
