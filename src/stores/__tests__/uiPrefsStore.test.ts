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
