// Єдина точка доступу до даних — REST API сервера.
import type { DataSource } from './DataSource';
import { HttpDataSource } from './http/HttpDataSource';

export const ds: DataSource = new HttpDataSource();

// Один екземпляр джерела даних на вкладку (ідентифікатор вкладки для блокувань) — при зміні модуля в dev повне перезавантаження.
import.meta.hot?.accept(() => window.location.reload());

export type { DataSource, LockAcquireResult, CallOptions } from './DataSource';
export { DataSourceError, errorMessage, isDataSourceError } from './errors';
export { qk } from './queryKeys';
