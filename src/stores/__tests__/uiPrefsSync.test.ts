// Налаштування інтерфейсу на сервері для користувача (правки замовника 25.09 п.1).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UiPrefsDto } from '@shared/types';
import { useUiPrefs } from '../uiPrefsStore';
import { flushUiPrefs, resetUiPrefsSyncForTests, startUiPrefsSync, UI_PREFS_SAVE_DELAY_MS, type SaveUiPrefs } from '../uiPrefsSync';

const initial = useUiPrefs.getState();

function saver() {
  return vi.fn<SaveUiPrefs>(() => Promise.resolve());
}

beforeEach(() => {
  vi.useFakeTimers();
  resetUiPrefsSyncForTests();
  useUiPrefs.setState({ ...initial, columnWidths: {}, importMaps: {}, prefsUserId: null, layoutEpoch: 0, siderCollapsed: false, editorMode: 'sourcing' }, true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('старт', () => {
  it('налаштування з сервера замінюють браузерні, таблиці будуються наново; одразу нічого не відправляємо', () => {
    useUiPrefs.getState().setColumnWidths({ 'markup:client': 200 });
    const save = saver();
    const stop = startUiPrefsSync('u1', { columnWidths: { 'markup:client': 400 }, siderCollapsed: true }, save);
    const s = useUiPrefs.getState();
    expect(s).toMatchObject({ columnWidths: { 'markup:client': 400 }, siderCollapsed: true, prefsUserId: 'u1', layoutEpoch: 1 });
    vi.advanceTimersByTime(5000);
    expect(save).not.toHaveBeenCalled();
    stop();
  });

  it('на сервері ще нічого немає — туди йдуть налаштування цього браузера (збережені до перенесення)', () => {
    useUiPrefs.getState().setColumnWidths({ 'sourcing:block:name': 320 });
    const save = saver();
    const stop = startUiPrefsSync('u1', null, save);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toMatchObject({ columnWidths: { 'sourcing:block:name': 320 }, editorMode: 'sourcing' });
    stop();
  });

  it('у браузері налаштування іншого користувача — не віддаємо їх новому, а беремо стандартні', () => {
    useUiPrefs.setState({ prefsUserId: 'u1', columnWidths: { 'markup:client': 500 }, siderCollapsed: true });
    const save = saver();
    const stop = startUiPrefsSync('u2', null, save);
    expect(useUiPrefs.getState()).toMatchObject({ prefsUserId: 'u2', columnWidths: {}, siderCollapsed: false });
    expect(save.mock.calls[0][0]).toMatchObject({ columnWidths: {}, siderCollapsed: false });
    stop();
  });

  it('повторний старт того самого користувача (перемонтування) не повертає старе з даних входу', () => {
    const save = saver();
    startUiPrefsSync('u1', { columnWidths: { 'markup:client': 400 } }, save)();
    useUiPrefs.getState().setColumnWidths({ 'markup:client': 450 });
    const stop = startUiPrefsSync('u1', { columnWidths: { 'markup:client': 400 } }, save);
    expect(useUiPrefs.getState().columnWidths['markup:client']).toBe(450);
    stop();
  });
});

describe('зміни', () => {
  it('кілька змін поспіль — одне збереження через секунду після останньої', () => {
    const save = saver();
    const stop = startUiPrefsSync('u1', {}, save);
    useUiPrefs.getState().setColumnWidths({ 'markup:client': 300 });
    vi.advanceTimersByTime(UI_PREFS_SAVE_DELAY_MS - 100);
    useUiPrefs.getState().setColumnWidths({ 'markup:method': 120 });
    vi.advanceTimersByTime(UI_PREFS_SAVE_DELAY_MS - 100);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].columnWidths).toEqual({ 'markup:client': 300, 'markup:method': 120 });
    stop();
  });

  it('згорнутий блок (лише цей браузер) на сервер не йде', () => {
    const save = saver();
    const stop = startUiPrefsSync('u1', {}, save);
    useUiPrefs.getState().setBlockCollapsed('b1', true);
    vi.advanceTimersByTime(5000);
    expect(save).not.toHaveBeenCalled();
    stop();
  });

  it('не вдалося зберегти — відправимо знову з наступною зміною', async () => {
    const save = vi.fn<SaveUiPrefs>().mockRejectedValueOnce(new Error('мережа')).mockResolvedValue(undefined);
    const stop = startUiPrefsSync('u1', {}, save);
    useUiPrefs.getState().setSiderCollapsed(true);
    await vi.advanceTimersByTimeAsync(UI_PREFS_SAVE_DELAY_MS);
    useUiPrefs.getState().setEditorMode('comparison');
    await vi.advanceTimersByTimeAsync(UI_PREFS_SAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0]).toMatchObject({ siderCollapsed: true, editorMode: 'comparison' });
    stop();
  });

  it('перед виходом незбережене відправляється одразу', async () => {
    const save = saver();
    const stop = startUiPrefsSync('u1', {}, save);
    useUiPrefs.getState().setColumnWidths({ 'registry:number': 140 });
    await flushUiPrefs();
    expect(save).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(save).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe('скинути вигляд таблиць', () => {
  it('ширина й порядок з сервера: таблиці будуються наново', () => {
    const stop = startUiPrefsSync('u1', { columnOrder: { markup: ['rrp', 'qty'] } }, saver());
    expect(useUiPrefs.getState()).toMatchObject({ columnOrder: { markup: ['rrp', 'qty'] }, layoutEpoch: 1 });
    stop();
  });

  it('ширини й порядок порожні, таблиці будуються наново, зміна йде на сервер', () => {
    useUiPrefs.getState().setColumnOrder('markup', ['rrp', 'qty']);
    const save = saver();
    const fromServer: UiPrefsDto = { columnWidths: { 'markup:client': 400 } };
    const stop = startUiPrefsSync('u1', fromServer, save);
    const epoch = useUiPrefs.getState().layoutEpoch;
    useUiPrefs.getState().resetColumnLayout();
    expect(useUiPrefs.getState()).toMatchObject({ columnWidths: {}, columnOrder: {}, layoutEpoch: epoch + 1 });
    vi.advanceTimersByTime(UI_PREFS_SAVE_DELAY_MS);
    expect(save.mock.calls.at(-1)?.[0]).toMatchObject({ columnWidths: {}, columnOrder: {} });
    stop();
  });
});
