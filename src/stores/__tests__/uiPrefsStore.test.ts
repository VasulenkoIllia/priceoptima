// Щільність таблиць фіксована: збережена раніше «Компактно» не відновлюється, решта налаштувань — так.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'po-ui-prefs';

describe('uiPrefsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('збережена «Компактно» ігнорується: щільність «звичайна», інші налаштування відновлюються', async () => {
    localStorage.setItem(KEY, JSON.stringify({ state: { density: 'compact', siderCollapsed: true, editorMode: 'comparison' }, version: 1 }));
    const { useUiPrefs } = await import('../uiPrefsStore');
    expect(useUiPrefs.getState()).toMatchObject({ density: 'normal', siderCollapsed: true, editorMode: 'comparison' });

    useUiPrefs.getState().setSiderCollapsed(false);
    const saved = JSON.parse(localStorage.getItem(KEY)!) as { state: Record<string, unknown> };
    expect(saved.state).not.toHaveProperty('density');
    expect(saved.state.siderCollapsed).toBe(false);
  });
});

describe('uiPrefsStore: вибір колонок імпорту', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('старий окремий ключ переноситься в налаштування один раз', async () => {
    localStorage.setItem('po-request-import-maps', JSON.stringify({ 'назва|к-сть': { name: 0, unit: null, qty: 1, note: null } }));
    localStorage.setItem(KEY, JSON.stringify({ state: { siderCollapsed: true }, version: 2 }));
    const { useUiPrefs } = await import('../uiPrefsStore');
    expect(useUiPrefs.getState().importMaps).toEqual({ 'назва|к-сть': { name: 0, unit: null, qty: 1, note: null } });
    expect(localStorage.getItem('po-request-import-maps')).toBeNull();
  });

  it('пам\'ятаємо не більше 50 останніх', async () => {
    const { useUiPrefs, IMPORT_MAPS_LIMIT } = await import('../uiPrefsStore');
    for (let i = 0; i < IMPORT_MAPS_LIMIT + 5; i++) useUiPrefs.getState().setImportMap(`h${i}`, { name: 0, unit: null, qty: 1, note: null });
    const keys = Object.keys(useUiPrefs.getState().importMaps);
    expect(keys).toHaveLength(IMPORT_MAPS_LIMIT);
    expect(keys[0]).toBe('h5');
  });
});
