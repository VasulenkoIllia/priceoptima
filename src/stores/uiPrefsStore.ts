// Налаштування інтерфейсу: режим редактора, згорнуті блоки, бічні панелі, ширина й порядок колонок, вибір колонок імпорту.
// Копія — у localStorage (таблиця відкривається одразу з потрібною шириною); поля з SYNCED_KEYS ще й на сервері
// для користувача — однакові на всіх його комп'ютерах (src/stores/uiPrefsSync.ts). Щільність — фіксована «звичайна».
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ImportColumnMapDto, UiPrefsDto, UUID } from '@shared/types';
import type { Density } from '@/theme';

export type EditorMode = 'sourcing' | 'comparison';

/** Скільки виборів колонок імпорту пам'ятаємо (найстаріші забуваються). */
export const IMPORT_MAPS_LIMIT = 50;
/** Довший підпис заголовка (дуже широкий файл) не запам'ятовуємо: сервер не прийняв би налаштування цілком. */
export const IMPORT_SIGNATURE_MAX = 500;
/** Межі ширини колонки, як на сервері (server/modules/users/users.schemas.ts). */
const COLUMN_WIDTH_MIN = 20;
const COLUMN_WIDTH_MAX = 4000;
/** Де вибір колонок імпорту лежав до 25.09.2026 (переноситься в налаштування один раз). */
const LEGACY_IMPORT_MAPS_KEY = 'po-request-import-maps';

export interface UiPrefsState {
  /** Завжди 'normal' (перемикача щільності немає); лишається для сіток і теми. */
  density: Density;
  /** Режим вкладки «Позиції і підбір»: «Підбір» | «Порівняння». */
  editorMode: EditorMode;
  /** Згорнуті блоки постачальників (id блоку → true); лише в цьому браузері — прив'язані до конкретних заявок. */
  collapsedBlocks: Record<UUID, true>;
  /** Панель «Сценарії закупівлі» відкрита. */
  scenariosPanelOpen: boolean;
  /** Рядок нотаток у шапці редактора розгорнуто. */
  headerNotesOpen: boolean;
  siderCollapsed: boolean;
  /** Ширина колонок, задана перетягуванням (ключ — див. src/lib/gridColumnLayout.ts), px. */
  columnWidths: Record<string, number>;
  /** Порядок колонок, заданий перетягуванням заголовків: ключ — сітка (чи «поля блоку»), значення — id колонок. */
  columnOrder: Record<string, string[]>;
  /** Вибір колонок імпорту з Excel за заголовком файлу. */
  importMaps: Record<string, ImportColumnMapDto>;
  /** Чиї це налаштування (id користувача); null — збережені до перенесення на сервер. */
  prefsUserId: UUID | null;
  /** Росте, коли ширину чи порядок замінено не перетягуванням у самій таблиці (з сервера, «скинути», порядок блоку):
   *  таблиці будують колонки наново. Не зберігається. */
  layoutEpoch: number;

  setEditorMode(mode: EditorMode): void;
  setBlockCollapsed(blockId: UUID, collapsed: boolean): void;
  toggleBlockCollapsed(blockId: UUID): void;
  setScenariosPanelOpen(open: boolean): void;
  toggleScenariosPanel(): void;
  setHeaderNotesOpen(open: boolean): void;
  setSiderCollapsed(collapsed: boolean): void;
  setColumnWidths(widths: Record<string, number>): void;
  /** Новий порядок колонок сітки; rebuild — таблицям перебудувати колонки (порядок поля блоку діє на всі блоки). */
  setColumnOrder(key: string, order: string[], rebuild?: boolean): void;
  /** Повернути стандартну ширину й порядок колонок у всіх таблицях. */
  resetColumnLayout(): void;
  setImportMap(signature: string, map: ImportColumnMapDto): void;
  /** Налаштування з сервера замінюють збережені в браузері (лише передані поля). */
  applyServerPrefs(prefs: UiPrefsDto): void;
  /** Налаштування тепер належать користувачу; чужі (іншого користувача в цьому браузері) — до стандартних. */
  claimFor(userId: UUID): void;
}

/** Поля, що зберігаються на сервері для користувача. */
export const SYNCED_KEYS = ['columnWidths', 'columnOrder', 'editorMode', 'siderCollapsed', 'scenariosPanelOpen', 'headerNotesOpen', 'importMaps'] as const;

const SYNCED_DEFAULTS: Required<UiPrefsDto> = {
  columnWidths: {},
  columnOrder: {},
  editorMode: 'sourcing',
  // «Сценарії закупівлі» відкривають кнопкою, коли треба (спершу — сама таблиця)
  scenariosPanelOpen: false,
  headerNotesOpen: false,
  siderCollapsed: false,
  importMaps: {},
};

/** Те, що йде на сервер. */
export function syncedPrefsOf(s: UiPrefsState): Required<UiPrefsDto> {
  return {
    columnWidths: s.columnWidths,
    columnOrder: s.columnOrder,
    editorMode: s.editorMode,
    siderCollapsed: s.siderCollapsed,
    scenariosPanelOpen: s.scenariosPanelOpen,
    headerNotesOpen: s.headerNotesOpen,
    importMaps: s.importMaps,
  };
}

/** Лише останні IMPORT_MAPS_LIMIT виборів (порядок ключів — порядок збереження). */
function latestImportMaps(maps: Record<string, ImportColumnMapDto>): Record<string, ImportColumnMapDto> {
  const keys = Object.keys(maps);
  if (keys.length <= IMPORT_MAPS_LIMIT) return maps;
  return Object.fromEntries(keys.slice(-IMPORT_MAPS_LIMIT).map((k) => [k, maps[k]!]));
}

function legacyImportMaps(): Record<string, ImportColumnMapDto> {
  try {
    const raw = localStorage.getItem(LEGACY_IMPORT_MAPS_KEY);
    if (!raw) return {};
    localStorage.removeItem(LEGACY_IMPORT_MAPS_KEY);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(Object.entries(parsed as Record<string, ImportColumnMapDto>).filter(([k]) => k.length <= IMPORT_SIGNATURE_MAX));
  } catch {
    return {};
  }
}

export const useUiPrefs = create<UiPrefsState>()(
  persist(
    (set) => ({
      density: 'normal',
      ...SYNCED_DEFAULTS,
      // вибір, збережений до 25.09 окремо (переноситься один раз, навіть якщо інших налаштувань у браузері ще немає)
      importMaps: legacyImportMaps(),
      collapsedBlocks: {},
      prefsUserId: null,
      layoutEpoch: 0,

      setEditorMode: (editorMode) => set({ editorMode }),
      setBlockCollapsed: (blockId, collapsed) =>
        set((s) => {
          const next = { ...s.collapsedBlocks };
          if (collapsed) next[blockId] = true;
          else delete next[blockId];
          return { collapsedBlocks: next };
        }),
      toggleBlockCollapsed: (blockId) =>
        set((s) => {
          const next = { ...s.collapsedBlocks };
          if (next[blockId]) delete next[blockId];
          else next[blockId] = true;
          return { collapsedBlocks: next };
        }),
      setScenariosPanelOpen: (scenariosPanelOpen) => set({ scenariosPanelOpen }),
      toggleScenariosPanel: () => set((s) => ({ scenariosPanelOpen: !s.scenariosPanelOpen })),
      setHeaderNotesOpen: (headerNotesOpen) => set({ headerNotesOpen }),
      setSiderCollapsed: (siderCollapsed) => set({ siderCollapsed }),
      setColumnWidths: (widths) =>
        set((s) => {
          const next = { ...s.columnWidths };
          for (const [key, width] of Object.entries(widths)) next[key] = Math.min(COLUMN_WIDTH_MAX, Math.max(COLUMN_WIDTH_MIN, Math.round(width)));
          return { columnWidths: next };
        }),
      setColumnOrder: (key, order, rebuild = false) =>
        set((s) => ({ columnOrder: { ...s.columnOrder, [key]: order }, ...(rebuild ? { layoutEpoch: s.layoutEpoch + 1 } : {}) })),
      resetColumnLayout: () => set((s) => ({ columnWidths: {}, columnOrder: {}, layoutEpoch: s.layoutEpoch + 1 })),
      setImportMap: (signature, map) =>
        set((s) => {
          if (signature.length > IMPORT_SIGNATURE_MAX) return {};
          const next = { ...s.importMaps };
          delete next[signature];
          next[signature] = map;
          return { importMaps: latestImportMaps(next) };
        }),
      applyServerPrefs: (prefs) =>
        set((s) => {
          const patch: Partial<UiPrefsState> = {};
          for (const key of SYNCED_KEYS) if (prefs[key] !== undefined) Object.assign(patch, { [key]: prefs[key] });
          const changed = (key: 'columnWidths' | 'columnOrder') =>
            patch[key] !== undefined && JSON.stringify(patch[key]) !== JSON.stringify(s[key]);
          if (changed('columnWidths') || changed('columnOrder')) patch.layoutEpoch = s.layoutEpoch + 1;
          return patch;
        }),
      claimFor: (userId) =>
        set((s) => {
          if (s.prefsUserId === userId) return {};
          // збережене до перенесення на сервер (prefsUserId = null) — віддаємо тому, хто увійшов першим
          if (s.prefsUserId === null) return { prefsUserId: userId };
          return { ...SYNCED_DEFAULTS, prefsUserId: userId, layoutEpoch: s.layoutEpoch + 1 };
        }),
    }),
    {
      name: 'po-ui-prefs',
      version: 3,
      storage: createJSONStorage(() => localStorage),
      // v2: «Сценарії» закриті за замовчуванням — один раз закриваємо й у тих, у кого вони були відкриті за старим замовчуванням
      // v3: вибір колонок імпорту переїхав сюди з окремого ключа (і разом з рештою — на сервер); переносить його
      // початковий стан і merge
      migrate: (persisted, version) =>
        (version < 2 ? { ...(persisted as object), scenariosPanelOpen: false } : persisted) as UiPrefsState,
      partialize: (s) => ({
        ...syncedPrefsOf(s),
        collapsedBlocks: s.collapsedBlocks,
        prefsUserId: s.prefsUserId,
      }),
      // збережена раніше щільність («Компактно») більше не діє
      merge: (persisted, current) => {
        const saved = persisted as Partial<UiPrefsState>;
        const importMaps = latestImportMaps({ ...current.importMaps, ...saved.importMaps });
        return { ...current, ...saved, importMaps, density: 'normal', layoutEpoch: 0 };
      },
    },
  ),
);
