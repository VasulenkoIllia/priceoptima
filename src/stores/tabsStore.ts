// Відкриті вкладки застосунку (як у BAS / 1С): розділи й заявки відкриваються вкладками вгорі,
// перехід між ними не закриває попередню. Список живе в sessionStorage — переживає перезавантаження сторінки.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface AppTab {
  /** Ключ вкладки: розділ ('catalog') або заявка ('request:<id>'). */
  key: string;
  pathname: string;
  search: string;
  /** state навігації (напр. КП, яке треба виділити) — лише JSON-сумісне. */
  state: unknown;
  /** Назву задає сама сторінка (номер заявки); null — назва розділу за замовчуванням. */
  title: string | null;
  lastActiveAt: number;
}

export interface TabLocation {
  pathname: string;
  search: string;
  state?: unknown;
}

/** Більше вкладок не тримаємо: найдавніше відкрита неактивна закривається сама. */
export const MAX_TABS = 10;

const SECTION_TITLES: Record<string, string> = {
  requests: 'Заявки',
  catalog: 'Номенклатура',
  suppliers: 'Постачальники',
  clients: 'Клієнти',
  rates: 'Курси валют',
  settings: 'Налаштування',
};

export const REQUEST_TAB_PREFIX = 'request:';

/** /requests/<id>/kp → 'request:<id>'; /catalog → 'catalog'; / → 'requests'. */
export function tabKeyOf(pathname: string): string {
  const [section, id] = pathname.split('/').filter(Boolean);
  if (section === 'requests' && id) return `${REQUEST_TAB_PREFIX}${id}`;
  return section ?? 'requests';
}

export const isRequestTab = (key: string) => key.startsWith(REQUEST_TAB_PREFIX);

export function tabTitleOf(tab: Pick<AppTab, 'key' | 'title'>): string {
  if (tab.title) return tab.title;
  if (isRequestTab(tab.key)) return 'Заявка';
  return SECTION_TITLES[tab.key] ?? 'Сторінка';
}

export const tabPathOf = (tab: Pick<AppTab, 'pathname' | 'search'>) => `${tab.pathname}${tab.search}`;

interface TabsState {
  tabs: AppTab[];
  activeKey: string | null;
  /** Відкрито адресу: активуємо її вкладку (або додаємо нову) і запам'ятовуємо адресу в ній. */
  visit(location: TabLocation, now?: number): void;
  /** Закрити вкладку; повертає вкладку, яка стає активною (null — вкладок не лишилось або закрито неактивну). */
  close(key: string): AppTab | null;
  setTitle(key: string, title: string | null): void;
  reset(): void;
}

export const useTabs = create<TabsState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeKey: null,

      visit: (location, now = Date.now()) => {
        const key = tabKeyOf(location.pathname);
        const { tabs } = get();
        const existing = tabs.find((t) => t.key === key);
        let next: AppTab[];
        if (existing) {
          next = tabs.map((t) =>
            t.key === key ? { ...t, pathname: location.pathname, search: location.search, state: location.state ?? null, lastActiveAt: now } : t,
          );
        } else {
          next = [...tabs, { key, pathname: location.pathname, search: location.search, state: location.state ?? null, title: null, lastActiveAt: now }];
          while (next.length > MAX_TABS) {
            const oldest = next.filter((t) => t.key !== key).reduce((a, b) => (a.lastActiveAt <= b.lastActiveAt ? a : b));
            next = next.filter((t) => t !== oldest);
          }
        }
        set({ tabs: next, activeKey: key });
      },

      close: (key) => {
        const { tabs, activeKey } = get();
        const index = tabs.findIndex((t) => t.key === key);
        if (index < 0) return null;
        const rest = tabs.filter((t) => t.key !== key);
        if (key !== activeKey) {
          set({ tabs: rest });
          return null;
        }
        // як у браузері: активною стає сусідня праворуч, а якщо її немає — ліворуч
        const nextActive = rest[index] ?? rest[index - 1] ?? null;
        set({ tabs: rest, activeKey: nextActive?.key ?? null });
        return nextActive;
      },

      setTitle: (key, title) =>
        set((s) => (s.tabs.some((t) => t.key === key && t.title !== title) ? { tabs: s.tabs.map((t) => (t.key === key ? { ...t, title } : t)) } : s)),

      reset: () => set({ tabs: [], activeKey: null }),
    }),
    {
      name: 'po-app-tabs',
      version: 1,
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ tabs: s.tabs, activeKey: s.activeKey }),
    },
  ),
);
