// Налаштування інтерфейсу на сервері для користувача (правки замовника 25.09 п.1): ширина колонок, режими, вибір колонок
// імпорту однакові на всіх його комп'ютерах. Копія в браузері (uiPrefsStore) лишається — таблиця відкривається одразу.
// Діє останнє збереження: якщо той самий користувач змінює налаштування на двох комп'ютерах, виграє пізніша зміна.
import type { UiPrefsDto, UUID } from '@shared/types';
import { syncedPrefsOf, useUiPrefs } from './uiPrefsStore';

/** Скільки чекати після останньої зміни, перш ніж зберегти на сервері (кілька змін поспіль — одне збереження). */
export const UI_PREFS_SAVE_DELAY_MS = 1000;

export type SaveUiPrefs = (prefs: UiPrefsDto, options?: { keepalive?: boolean }) => Promise<void>;

/** Для кого вже взято налаштування з сервера в цьому завантаженні сторінки (дані входу далі не оновлюються). */
let loadedFor: UUID | null = null;
/** Відправити незбережене зараз (перед виходом із системи). */
let flushActive: () => Promise<void> = () => Promise.resolve();

/**
 * Почати синхронізацію для користувача. Уперше за завантаження сторінки: налаштування з сервера замінюють браузерні,
 * а якщо на сервері ще нічого немає — туди йдуть налаштування цього браузера. Далі кожна зміна — на сервер.
 * Повертає функцію зупинки (незбережене відправляє одразу).
 */
export function startUiPrefsSync(userId: UUID, fromServer: UiPrefsDto | null, save: SaveUiPrefs): () => void {
  const store = useUiPrefs;
  const current = () => JSON.stringify(syncedPrefsOf(store.getState()));
  let lastSent: string | null = current();

  if (loadedFor !== userId) {
    loadedFor = userId;
    store.getState().claimFor(userId);
    if (fromServer) store.getState().applyServerPrefs(fromServer);
    lastSent = fromServer ? current() : null;
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  const send = (keepalive = false): Promise<void> => {
    if (timer) clearTimeout(timer);
    timer = null;
    const json = current();
    if (json === lastSent) return Promise.resolve();
    lastSent = json;
    return save(syncedPrefsOf(store.getState()), { keepalive }).catch(() => {
      // не вдалося (мережа, перезапуск сервера) — відправимо з наступною зміною чи при закритті вкладки
      if (lastSent === json) lastSent = null;
    });
  };
  flushActive = () => send();

  // на сервері ще нічого немає — віддаємо налаштування цього браузера
  if (lastSent === null) void send();

  const unsubscribe = store.subscribe(() => {
    if (current() === lastSent) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void send(), UI_PREFS_SAVE_DELAY_MS);
  });
  const onPageHide = () => {
    if (timer || lastSent === null) void send(true);
  };
  window.addEventListener('pagehide', onPageHide);

  return () => {
    unsubscribe();
    window.removeEventListener('pagehide', onPageHide);
    flushActive = () => Promise.resolve();
    if (timer) void send();
  };
}

/** Зберегти на сервері незбережені зміни налаштувань (перед виходом із системи, поки сесія ще діє). */
export function flushUiPrefs(): Promise<void> {
  return flushActive();
}

/** Лише для тестів: наступний старт знову візьме налаштування з сервера. */
export function resetUiPrefsSyncForTests(): void {
  loadedFor = null;
}
