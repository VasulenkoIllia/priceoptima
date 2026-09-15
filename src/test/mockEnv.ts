// Тестове оточення: кілька «вкладок» (MockDataSource) зі спільними localStorage, «IndexedDB» і каналом між вкладками.
import { createMemoryChannelHub } from '@/data/channel';
import { AUTH_USER_KEY, MockDataSource } from '@/data/mock/MockDataSource';
import { memoryPersistence } from '@/data/mock/persistence';
import { MemoryStorage } from '@/data/storage';

export const TEST_NOW = Date.parse('2026-09-11T09:00:00.000Z');

export interface TestEnv {
  clock: { t: number };
  now: () => Date;
  /** userId — «вкладка», де цей користувач уже увійшов (вхід у кожної вкладки свій, як у різних браузерах). */
  tab(label: string, userId?: string): MockDataSource;
  dispose(): void;
}

export function createTestEnv(): TestEnv {
  const clock = { t: TEST_NOW };
  const now = () => new Date(clock.t);
  const local = new MemoryStorage();
  const hub = createMemoryChannelHub();
  const persistence = memoryPersistence();
  const tabs: MockDataSource[] = [];
  return {
    clock,
    now,
    tab(label, userId) {
      const auth = new MemoryStorage();
      if (userId) auth.setItem(AUTH_USER_KEY, userId);
      const tab = new MockDataSource({
        persistence,
        channelFactory: hub,
        localStorage: local,
        sessionStorage: new MemoryStorage(),
        authStorage: auth,
        sessionId: `session-${label}`,
        latencyMs: [0, 0],
        now,
        overrides: null,
        logos: {},
        persistDebounceMs: 1,
        bindPageLifecycle: false,
      });
      tabs.push(tab);
      return tab;
    },
    dispose() {
      for (const t of tabs) t.dispose();
    },
  };
}
