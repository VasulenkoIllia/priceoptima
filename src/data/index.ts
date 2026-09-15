// Єдина точка доступу до даних. Зараз — mock у браузері; для REST достатньо замінити реалізацію тут.
import type { DataSource } from './DataSource';
import { MockDataSource } from './mock/MockDataSource';

export const ds: DataSource = new MockDataSource();

// Один екземпляр джерела даних на вкладку — при зміні модуля в dev повне перезавантаження.
import.meta.hot?.accept(() => window.location.reload());

export type { DataSource, DataSourceEvent, LockAcquireResult, CallOptions } from './DataSource';
export { DataSourceError, errorMessage, isDataSourceError } from './errors';
export { qk } from './queryKeys';
