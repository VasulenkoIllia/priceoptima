// Перехід на продуктовий бекенд по модулях: що вже є на сервері — йде в REST, решта поки працює на демо-даних.
// Коли всі модулі переїдуть, демо-джерело й цей файл прибираємо.
import type { DataSource } from './DataSource';
import { HttpDataSource } from './http/HttpDataSource';
import { MockDataSource } from './mock/MockDataSource';

/** Збірка працює з сервером (VITE_SERVER=1) чи на демо-даних у браузері. */
export const SERVER_ENABLED = import.meta.env.VITE_SERVER === '1';

export function createDataSource(): DataSource {
  const mock = new MockDataSource();
  if (!SERVER_ENABLED) return mock;

  const http = new HttpDataSource({
    onLogin: (me) => mock.adoptDemoSession(me.user.login),
    onLogout: () => mock.logout(),
  });
  // методи, реалізовані на сервері, перекривають демо-джерело
  return new Proxy(mock, {
    get(target, prop, receiver) {
      const serverMethod = (http as unknown as Record<string | symbol, unknown>)[prop];
      if (typeof serverMethod === 'function') return (serverMethod as (...args: unknown[]) => unknown).bind(http);
      return Reflect.get(target, prop, receiver) as unknown;
    },
  }) as DataSource;
}
