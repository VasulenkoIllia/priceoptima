// Налаштування інтерфейсу браузера (localStorage): режим редактора, згорнуті блоки, бічні панелі. Щільність — фіксована «звичайна».
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { UUID } from '@shared/types';
import type { Density } from '@/theme';

export type EditorMode = 'sourcing' | 'comparison';

export interface UiPrefsState {
  /** Завжди 'normal' (перемикача щільності немає); лишається для сіток і теми. */
  density: Density;
  /** Режим вкладки «Позиції і підбір»: «Підбір» | «Порівняння». */
  editorMode: EditorMode;
  /** Згорнуті блоки постачальників (id блоку → true). */
  collapsedBlocks: Record<UUID, true>;
  /** Панель «Сценарії закупівлі» відкрита. */
  scenariosPanelOpen: boolean;
  /** Рядок нотаток у шапці редактора розгорнуто. */
  headerNotesOpen: boolean;
  siderCollapsed: boolean;

  setEditorMode(mode: EditorMode): void;
  setBlockCollapsed(blockId: UUID, collapsed: boolean): void;
  toggleBlockCollapsed(blockId: UUID): void;
  setScenariosPanelOpen(open: boolean): void;
  toggleScenariosPanel(): void;
  setHeaderNotesOpen(open: boolean): void;
  setSiderCollapsed(collapsed: boolean): void;
}

export const useUiPrefs = create<UiPrefsState>()(
  persist(
    (set) => ({
      density: 'normal',
      editorMode: 'sourcing',
      collapsedBlocks: {},
      scenariosPanelOpen: true,
      headerNotesOpen: false,
      siderCollapsed: false,

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
    }),
    {
      name: 'po-ui-prefs',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        editorMode: s.editorMode,
        collapsedBlocks: s.collapsedBlocks,
        scenariosPanelOpen: s.scenariosPanelOpen,
        headerNotesOpen: s.headerNotesOpen,
        siderCollapsed: s.siderCollapsed,
      }),
      // збережена раніше щільність («Компактно») більше не діє
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<UiPrefsState>), density: 'normal' }),
    },
  ),
);
